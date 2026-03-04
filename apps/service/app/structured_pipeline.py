from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFilter

from .models import CaptureImageInput, GenerationArtifacts, GenerationComponent, GenerationMaterial, GenerationRequest, GenerationResult, MaterialMapSet, StatsSummary
from .presets import PRESET_MAP, PresetDefinition, resolve_auto_preset

MATERIALS_SCHEMA_VERSION = "volumia.materials.v1"

_MIDAS_RUNTIME: dict[str, object] | None = None
_MIDAS_LOAD_FAILED = False


@dataclass(frozen=True)
class ViewObs:
    image: Image.Image
    depth: np.ndarray
    mask: np.ndarray
    bbox: tuple[int, int, int, int]
    depth_source: str


def _safe_name(value: str) -> str:
    keep = [c if c.isalnum() or c in ("-", "_") else "_" for c in value.strip()]
    normalized = "".join(keep).strip("_")
    return normalized or "Object"


def _synthetic_image(seed_text: str, size: int = 896) -> Image.Image:
    seed = int.from_bytes(seed_text.encode("utf-8", "ignore"), "little") % (2**32)
    rng = np.random.default_rng(seed)
    arr = rng.uniform(0.35, 0.72, size=(size, size, 3)).astype(np.float32)
    yy, xx = np.mgrid[0:size, 0:size]
    cx, cy = size * (0.45 + 0.1 * rng.random()), size * (0.45 + 0.1 * rng.random())
    rx, ry = size * (0.25 + 0.06 * rng.random()), size * (0.28 + 0.06 * rng.random())
    mask = (((xx - cx) / max(rx, 1.0)) ** 2 + ((yy - cy) / max(ry, 1.0)) ** 2) <= 1.0
    arr[mask] = np.clip(arr[mask] * np.array([1.08, 0.98, 0.9], dtype=np.float32), 0.0, 1.0)
    arr = np.clip(arr + rng.normal(0, 0.03, size=arr.shape).astype(np.float32), 0.0, 1.0)
    return Image.fromarray((arr * 255).astype(np.uint8), mode="RGB")


def _open_capture(img: CaptureImageInput | None, max_size: int = 896) -> Image.Image:
    if img is None:
        return _synthetic_image("missing", max_size)
    for candidate in [Path(img.filePath)] if img.filePath else []:
        try:
            if candidate.exists() and candidate.is_file():
                im = Image.open(candidate).convert("RGB")
                im.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                return im
        except Exception:
            pass
    for candidate in [Path(img.fileName)]:
        try:
            if candidate.exists() and candidate.is_file():
                im = Image.open(candidate).convert("RGB")
                im.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                return im
        except Exception:
            pass
    return _synthetic_image(f"{img.slotId}:{img.fileName}", max_size)


def _normalize(values: np.ndarray) -> np.ndarray:
    arr = values.astype(np.float32)
    span = float(arr.max() - arr.min())
    if span <= 1e-6:
        return np.zeros_like(arr, dtype=np.float32)
    return (arr - float(arr.min())) / span


def _get_midas() -> dict[str, object] | None:
    global _MIDAS_RUNTIME, _MIDAS_LOAD_FAILED
    if _MIDAS_RUNTIME is not None:
        return _MIDAS_RUNTIME
    if _MIDAS_LOAD_FAILED:
        return None
    try:
        import torch

        model = torch.hub.load("intel-isl/MiDaS", "MiDaS_small", trust_repo=True)
        transforms = torch.hub.load("intel-isl/MiDaS", "transforms", trust_repo=True)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model.to(device)
        model.eval()
        _MIDAS_RUNTIME = {"torch": torch, "model": model, "transform": transforms.small_transform, "device": device}
        return _MIDAS_RUNTIME
    except Exception as error:
        print(f"[generator] MiDaS unavailable, using fallback depth: {error}")
        _MIDAS_LOAD_FAILED = True
        return None


def _depth(image: Image.Image) -> tuple[np.ndarray, str]:
    runtime = _get_midas()
    if runtime is not None:
        try:
            torch = runtime["torch"]
            rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
            input_batch = runtime["transform"](rgb).to(runtime["device"])
            with torch.no_grad():
                pred = runtime["model"](input_batch)
                pred = torch.nn.functional.interpolate(pred.unsqueeze(1), size=rgb.shape[:2], mode="bicubic", align_corners=False).squeeze(1)
            return _normalize(pred.squeeze(0).cpu().numpy()), "midas-small"
        except Exception as error:
            print(f"[generator] MiDaS failed, fallback depth: {error}")
    gray = np.asarray(image.convert("L"), dtype=np.float32) / 255.0
    gy, gx = np.gradient(gray)
    return _normalize((1.0 - gray) * 0.68 + np.sqrt(gx * gx + gy * gy) * 0.32), "gradient-fallback"


def _otsu(gray_u8: np.ndarray) -> int:
    hist = np.bincount(gray_u8.reshape(-1), minlength=256).astype(np.float64)
    total = gray_u8.size
    total_sum = float(np.dot(np.arange(256, dtype=np.float64), hist))
    best, best_var, w0, s0 = 127, -1.0, 0.0, 0.0
    for t in range(256):
        w0 += hist[t]
        if w0 <= 0:
            continue
        w1 = total - w0
        if w1 <= 0:
            break
        s0 += t * hist[t]
        m0, m1 = s0 / w0, (total_sum - s0) / w1
        between = w0 * w1 * (m0 - m1) ** 2
        if between > best_var:
            best_var = between
            best = t
    return int(best)


def _bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        h, w = mask.shape
        return 0, 0, w, h
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _silhouette(image: Image.Image, depth: np.ndarray) -> np.ndarray:
    gray = np.asarray(image.convert("L"), dtype=np.uint8)
    t = _otsu(gray)
    dark = gray <= t
    light = ~dark
    mask = dark if dark.mean() < light.mean() else light
    if mask.mean() < 0.02 or mask.mean() > 0.95:
        mask = depth >= float(np.quantile(depth, 0.58))
    m = Image.fromarray(mask.astype(np.uint8) * 255, mode="L")
    m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(3))
    out = np.asarray(m, dtype=np.uint8) > 120
    return out if out.mean() >= 0.02 else np.ones_like(out, dtype=bool)


def _analyze(image: Image.Image) -> ViewObs:
    d, source = _depth(image)
    m = _silhouette(image, d)
    return ViewObs(image=image, depth=d, mask=m, bbox=_bbox(m), depth_source=source)


def _dimensions(request: GenerationRequest, front: ViewObs, side: ViewObs) -> tuple[float, float, float]:
    fh, fw = front.mask.shape
    sh, sw = side.mask.shape
    fx0, fy0, fx1, fy1 = front.bbox
    sx0, sy0, sx1, sy1 = side.bbox
    wr = max(0.08, (fx1 - fx0) / max(fw, 1)) / max(0.08, (fy1 - fy0) / max(fh, 1))
    dr = max(0.06, (sx1 - sx0) / max(sw, 1)) / max(0.08, (sy1 - sy0) / max(sh, 1))
    wr = float(np.clip(wr, 0.22, 3.8))
    dr = float(np.clip(dr, 0.12, 2.8))
    focus = front.depth[front.mask]
    dr *= float(np.clip(0.85 + (float(np.std(focus)) if focus.size > 0 else 0.16) * 0.9, 0.74, 1.42))
    s = max(0.12, float(request.scaleValueCm) / 100.0)
    if request.scaleDimension == "width":
        w, h, d = s, s / max(wr, 0.12), (s / max(wr, 0.12)) * dr
    elif request.scaleDimension == "depth":
        d, h, w = s, s / max(dr, 0.08), (s / max(dr, 0.08)) * wr
    else:
        h, w, d = s, s * wr, s * dr
    return float(np.clip(w, 0.12, 5.0)), float(np.clip(h, 0.12, 5.0)), float(np.clip(d, 0.1, 4.0))


def _qprofile(quality: str, complexity: str) -> tuple[int, int]:
    if quality == "low":
        return 0, 8
    if complexity == "high":
        return 2, 20
    if complexity == "low":
        return 1, 12
    return 1, 16


def _budget(quality: str, complexity: str) -> int:
    return {"high": {"low": 4200, "medium": 7600, "high": 12000}, "low": {"low": 1200, "medium": 2200, "high": 3200}}[quality][complexity]


def _box(dim: tuple[float, float, float], b: tuple[float, float, float, float, float, float], sub: int) -> trimesh.Trimesh:
    w, h, d = dim
    x0, x1, y0, y1, z0, z1 = b
    ext = (max(0.01, (x1 - x0) * w), max(0.01, (y1 - y0) * h), max(0.01, (z1 - z0) * d))
    center = (((x0 + x1) - 1.0) * 0.5 * w, ((y0 + y1) * 0.5) * h, ((z0 + z1) - 1.0) * 0.5 * d)
    m = trimesh.creation.box(extents=ext)
    m.apply_translation(center)
    for _ in range(max(0, sub)):
        m = m.subdivide()
    return m


def _vcyl(radius: float, height: float, sections: int, center: tuple[float, float, float]) -> trimesh.Trimesh:
    m = trimesh.creation.cylinder(radius=max(0.004, radius), height=max(0.01, height), sections=max(8, sections))
    m.apply_transform(trimesh.geometry.align_vectors(np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0])))
    m.apply_translation(center)
    return m


def _vcone(radius: float, height: float, sections: int, center: tuple[float, float, float]) -> trimesh.Trimesh:
    m = trimesh.creation.cone(radius=max(0.004, radius), height=max(0.01, height), sections=max(8, sections))
    m.apply_transform(trimesh.geometry.align_vectors(np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0])))
    m.apply_translation(center)
    return m


def _concat(meshes: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    valid = [m for m in meshes if m is not None and len(m.faces) > 0]
    return trimesh.util.concatenate(valid) if valid else trimesh.creation.box(extents=(0.02, 0.02, 0.02))


def _component_meshes(preset: PresetDefinition, dim: tuple[float, float, float], sub: int, sec: int, depth_factor: float) -> dict[str, trimesh.Trimesh]:
    w, h, d = dim
    if preset.id == "chair-stool":
        seat_d = float(np.clip(0.62 + (depth_factor - 0.5) * 0.18, 0.52, 0.74))
        legs = [_vcyl(min(w, d) * 0.045, h * 0.36, sec, p) for p in [(-0.34 * w, h * 0.18, -0.31 * d), (0.34 * w, h * 0.18, -0.31 * d), (-0.34 * w, h * 0.18, 0.31 * d), (0.34 * w, h * 0.18, 0.31 * d)]]
        return {"OBJ_Seat": _box(dim, (0.17, 0.83, 0.4, 0.56, 0.18, seat_d), sub), "OBJ_Backrest": _box(dim, (0.2, 0.8, 0.56, 0.95, 0.08, 0.2), sub), "OBJ_Legs": _concat(legs), "OBJ_Frame": _box(dim, (0.15, 0.85, 0.34, 0.41, 0.15, 0.85), 0), "OBJ_Hardware": _box(dim, (0.44, 0.56, 0.56, 0.6, 0.12, 0.16), 0)}
    if preset.id == "table-desk":
        legs = [_vcyl(min(w, d) * 0.04, h * 0.8, sec, p) for p in [(-0.4 * w, h * 0.4, -0.33 * d), (0.4 * w, h * 0.4, -0.33 * d), (-0.4 * w, h * 0.4, 0.33 * d), (0.4 * w, h * 0.4, 0.33 * d)]]
        return {"OBJ_Top": _box(dim, (0.06, 0.94, 0.72, 0.84, 0.1, 0.9), sub), "OBJ_Legs": _concat(legs), "OBJ_Frame": _box(dim, (0.1, 0.9, 0.44, 0.5, 0.14, 0.86), 0), "OBJ_Drawers": _box(dim, (0.2, 0.8, 0.56, 0.76, 0.16, 0.32), 0), "OBJ_Hardware": _box(dim, (0.46, 0.54, 0.62, 0.68, 0.1, 0.14), 0)}
    if preset.id == "sofa-textile":
        legs = [_vcyl(min(w, d) * 0.03, h * 0.1, sec, p) for p in [(-0.36 * w, h * 0.05, -0.34 * d), (0.36 * w, h * 0.05, -0.34 * d), (-0.36 * w, h * 0.05, 0.34 * d), (0.36 * w, h * 0.05, 0.34 * d)]]
        return {"OBJ_Frame": _box(dim, (0.08, 0.92, 0.14, 0.5, 0.12, 0.9), sub), "OBJ_Cushions_Seat": _box(dim, (0.12, 0.88, 0.45, 0.68, 0.2, 0.84), sub), "OBJ_Cushions_Back": _box(dim, (0.12, 0.88, 0.63, 0.9, 0.08, 0.25), sub), "OBJ_Arms": _box(dim, (0.08, 0.22, 0.42, 0.76, 0.16, 0.9), sub), "OBJ_Legs": _concat(legs), "OBJ_Hardware": _box(dim, (0.44, 0.56, 0.12, 0.17, 0.42, 0.58), 0)}
    if preset.id == "lighting":
        r = min(w, d) * 0.14
        return {"OBJ_Shade": _vcone(r * 1.4, h * 0.34, sec, (0.0, h * 0.82, 0.0)), "OBJ_Body": _vcyl(r * 0.4, h * 0.7, sec, (0.0, h * 0.45, 0.0)), "OBJ_Cable": _vcyl(r * 0.12, h * 0.3, 10, (0.0, h * 0.15, 0.0)), "OBJ_Bulb": _box(dim, (0.44, 0.56, 0.6, 0.72, 0.44, 0.56), sub), "OBJ_Hardware": _vcyl(r * 0.5, h * 0.06, 12, (0.0, h * 0.05, 0.0))}
    if preset.id == "rug-curtain":
        return {"OBJ_Main": _box(dim, (0.05, 0.95, 0.0, 0.05, 0.05, 0.95), sub), "OBJ_Folds": _box(dim, (0.2, 0.82, 0.02, 0.08, 0.1, 0.9), 0)}
    return {"OBJ_Main": _box(dim, (0.12, 0.88, 0.14, 0.9, 0.18, 0.82), sub), "OBJ_Base": _box(dim, (0.2, 0.8, 0.04, 0.14, 0.2, 0.8), 0), "OBJ_Details": _box(dim, (0.25, 0.75, 0.42, 0.7, 0.24, 0.76), 0)}


def _structured_scene(preset: PresetDefinition, dim: tuple[float, float, float], quality: str, complexity: str, depth_factor: float) -> tuple[trimesh.Scene, trimesh.Trimesh]:
    budget = _budget(quality, complexity)
    sub, sec = _qprofile(quality, complexity)
    best_scene, best_mesh = None, None
    for _ in range(3):
        mesh_map = _component_meshes(preset, dim, sub, sec, depth_factor)
        ordered = []
        for idx, comp in enumerate(preset.components):
            mesh = mesh_map.get(comp.name) or _box(dim, (0.2, 0.8, 0.12 + idx * 0.1, 0.2 + idx * 0.1, 0.2, 0.8), sub)
            mesh.metadata = {"componentName": comp.name}
            ordered.append((comp.name, mesh))
        scene = trimesh.Scene()
        for n, m in ordered:
            scene.add_geometry(m, geom_name=n, node_name=n)
        merged = _concat([m for _, m in ordered])
        best_scene, best_mesh = scene, merged
        if len(merged.faces) <= budget:
            break
        sub, sec = max(0, sub - 1), max(8, sec - 4)
    return best_scene, best_mesh


def _tile_edges(array: np.ndarray, blend_px: int) -> np.ndarray:
    arr = array.astype(np.float32).copy()
    h, w = arr.shape[:2]
    blend = max(2, min(blend_px, min(h, w) // 3))
    for i in range(blend):
        a = (i + 1) / (blend + 1)
        tb = arr[i, ...] * (1.0 - a) + arr[h - 1 - i, ...] * a
        arr[i, ...], arr[h - 1 - i, ...] = tb, tb
        lr = arr[:, i, ...] * (1.0 - a) + arr[:, w - 1 - i, ...] * a
        arr[:, i, ...], arr[:, w - 1 - i, ...] = lr, lr
    return np.clip(arr, 0.0, 255.0).astype(np.uint8)


def _box_blur(values: np.ndarray, radius: int) -> np.ndarray:
    out = np.zeros_like(values, dtype=np.float32)
    count = 0
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            out += np.roll(np.roll(values, dy, axis=0), dx, axis=1)
            count += 1
    return out / max(count, 1)


def _basecolor(source: Image.Image, size: int) -> Image.Image:
    rgb = np.asarray(source.convert("RGB").resize((size, size), Image.Resampling.LANCZOS), dtype=np.float32)
    means = rgb.reshape(-1, 3).mean(axis=0) + 1e-6
    bal = np.clip(float(means.mean()) / means, 0.7, 1.38)
    rgb *= bal[None, None, :]
    rgb *= 152.0 / max(1.0, float(rgb.mean()))
    return Image.fromarray(_tile_edges(np.clip(rgb, 0.0, 255.0).astype(np.uint8), max(8, size // 48)), mode="RGB")


def _normal(source: Image.Image, size: int, strength_hint: float) -> Image.Image:
    gray = np.asarray(source.convert("L").resize((size, size), Image.Resampling.BICUBIC), dtype=np.float32) / 255.0
    gx = (-np.roll(np.roll(gray, 1, 0), 1, 1) - 2.0 * np.roll(gray, 1, 1) - np.roll(np.roll(gray, -1, 0), 1, 1) + np.roll(np.roll(gray, 1, 0), -1, 1) + 2.0 * np.roll(gray, -1, 1) + np.roll(np.roll(gray, -1, 0), -1, 1))
    gy = (-np.roll(np.roll(gray, 1, 0), 1, 1) - 2.0 * np.roll(gray, 1, 0) - np.roll(np.roll(gray, 1, 0), -1, 1) + np.roll(np.roll(gray, -1, 0), 1, 1) + 2.0 * np.roll(gray, -1, 0) + np.roll(np.roll(gray, -1, 0), -1, 1))
    s = 2.0 + float(np.clip(strength_hint, 0.0, 1.0)) * 5.0
    nx, ny, nz = -gx * s, -gy * s, np.ones_like(gx, dtype=np.float32)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
    n = np.stack((nx / ln, ny / ln, nz / ln), axis=-1)
    return Image.fromarray(_tile_edges((((n * 0.5) + 0.5) * 255.0).astype(np.uint8), max(8, size // 56)), mode="RGB")


def _roughness(source: Image.Image, size: int, rough_hint: float) -> tuple[Image.Image, float]:
    lum = np.asarray(source.convert("L").resize((size, size), Image.Resampling.BICUBIC), dtype=np.float32) / 255.0
    mean = _box_blur(lum, 2)
    var = _box_blur((lum - mean) ** 2, 2)
    rv = np.clip(float(np.clip(rough_hint, 0.05, 0.95)) * 0.55 + _normalize(var) * 0.45, 0.04, 0.98)
    u8 = _tile_edges((rv * 255.0).astype(np.uint8), max(8, size // 56))
    return Image.fromarray(u8, mode="L"), float(np.mean(rv))


def _slot(images: list[CaptureImageInput], slot_id: str) -> CaptureImageInput | None:
    for im in images:
        if im.slotId == slot_id:
            return im
    return None


def _material_sources(images: list[CaptureImageInput], fallback: Image.Image) -> list[Image.Image]:
    sorted_images = sorted(images, key=lambda it: (0 if it.slotId.startswith("material_") else 1, 0 if it.slotId.startswith("detail_") else 1, it.slotId))
    mats = [_open_capture(im) for im in sorted_images if im.slotId.startswith("material_") or im.slotId.startswith("detail_")]
    return mats or [fallback]


def _write_collada(path: Path, object_name: str, quality: str, components: list[str]) -> None:
    xml = f"""<?xml version=\"1.0\" encoding=\"utf-8\"?>
<COLLADA xmlns=\"http://www.collada.org/2005/11/COLLADASchema\" version=\"1.4.1\">
  <asset><contributor><authoring_tool>VOLUMIA Structured Exporter</authoring_tool></contributor><unit name=\"centimeter\" meter=\"0.01\"/><up_axis>Y_UP</up_axis></asset>
  <library_visual_scenes><visual_scene id=\"Scene\" name=\"Scene\"><!-- Object: {object_name} | Quality: {quality} | Components: {", ".join(components)} --></visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url=\"#Scene\"/></scene>
</COLLADA>
"""
    path.write_text(xml, encoding="utf-8")


def _write_preview(path: Path, object_name: str, quality: str, dim: tuple[float, float, float], depth_source: str) -> None:
    image = Image.new("RGB", (1024, 768), color=(236, 233, 227))
    draw = ImageDraw.Draw(image)
    draw.rectangle((70, 70, 954, 698), outline=(161, 134, 111), width=3)
    draw.text((104, 120), "VOLUMIA PREVIEW", fill=(46, 43, 39))
    draw.text((104, 180), f"Object: {object_name}", fill=(46, 43, 39))
    draw.text((104, 240), f"Quality: {quality.upper()}", fill=(111, 106, 98))
    draw.text((104, 300), f"Approx size (m): {dim[0]:.2f}w x {dim[1]:.2f}h x {dim[2]:.2f}d", fill=(111, 106, 98))
    draw.text((104, 360), f"Depth estimator: {depth_source}", fill=(111, 106, 98))
    draw.text((104, 420), "Precision in Form. Intelligence in Material.", fill=(161, 134, 111))
    image.save(path)


def _resolve_preset(request: GenerationRequest) -> str:
    hints = [img.fileName for img in request.images]
    if request.objectType.startswith("studio:") and request.studioBasePreset:
        return request.studioBasePreset
    return resolve_auto_preset(request.objectType, request.reconstructionMode, hints)


def generate_structured_assets(request: GenerationRequest, generated_root: Path, base_url: str) -> GenerationResult:
    resolved = _resolve_preset(request)
    preset: PresetDefinition = PRESET_MAP.get(resolved, PRESET_MAP["decor"])
    gid = uuid.uuid4().hex[:12]
    safe_name = _safe_name(request.objectName)
    gdir = generated_root / gid
    high_dir, low_dir = gdir / "HIGH", gdir / "LOW"
    high_tex, low_tex = high_dir / "textures", low_dir / "textures"
    for d in (high_dir, low_dir, high_tex, low_tex):
        d.mkdir(parents=True, exist_ok=True)

    front_capture = _slot(request.images, "front") or (request.images[0] if request.images else None)
    side_capture = _slot(request.images, "side") or front_capture
    front_image, side_image = _open_capture(front_capture), _open_capture(side_capture)
    front_obs, side_obs = _analyze(front_image), _analyze(side_image)
    dim = _dimensions(request, front_obs, side_obs)
    focus = front_obs.depth[front_obs.mask]
    depth_factor = float(np.mean(focus)) if focus.size > 0 else float(np.mean(front_obs.depth))

    high_scene, high_mesh = _structured_scene(preset, dim, "high", request.complexity, depth_factor)
    low_scene, low_mesh = _structured_scene(preset, dim, "low", request.complexity, depth_factor)

    high_glb, low_glb = high_dir / "model_high.glb", low_dir / "model_low.glb"
    high_glb.write_bytes(high_scene.export(file_type="glb"))
    low_glb.write_bytes(low_scene.export(file_type="glb"))

    comp_names = [c.name for c in preset.components]
    high_dae, low_dae = high_dir / "model_high.dae", low_dir / "model_low.dae"
    _write_collada(high_dae, safe_name, "high", comp_names)
    _write_collada(low_dae, safe_name, "low", comp_names)

    prev_h, prev_l = gdir / "preview_high.png", gdir / "preview_low.png"
    _write_preview(prev_h, safe_name, "high", dim, front_obs.depth_source)
    _write_preview(prev_l, safe_name, "low", dim, front_obs.depth_source)

    sources = _material_sources(request.images, front_image)
    generated_materials: list[GenerationMaterial] = []
    for idx, mat in enumerate(preset.materials):
        source = sources[idx % len(sources)]
        hs, ls = 1024, 512
        h_base, h_norm, h_rough = high_tex / f"{mat.name}_BaseColor.png", high_tex / f"{mat.name}_Normal.png", high_tex / f"{mat.name}_Roughness.png"
        l_base, l_norm, l_rough = low_tex / f"{mat.name}_BaseColor.png", low_tex / f"{mat.name}_Normal.png", low_tex / f"{mat.name}_Roughness.png"

        _basecolor(source, hs).save(h_base)
        _normal(source, hs, mat.normal_strength).save(h_norm)
        h_rough_img, h_avg = _roughness(source, hs, mat.roughness)
        h_rough_img.save(h_rough)

        _basecolor(source, ls).save(l_base)
        _normal(source, ls, mat.normal_strength).save(l_norm)
        l_rough_img, l_avg = _roughness(source, ls, mat.roughness)
        l_rough_img.save(l_rough)

        rough_default = float(np.clip((h_avg + l_avg + mat.roughness) / 3.0, 0.04, 0.98))
        generated_materials.append(
            GenerationMaterial(
                name=mat.name,
                roughnessDefault=rough_default,
                normalStrengthDefault=mat.normal_strength,
                mapsHigh=MaterialMapSet(baseColor=f"{base_url}/generated/{gid}/HIGH/textures/{h_base.name}", normal=f"{base_url}/generated/{gid}/HIGH/textures/{h_norm.name}", roughness=f"{base_url}/generated/{gid}/HIGH/textures/{h_rough.name}"),
                mapsLow=MaterialMapSet(baseColor=f"{base_url}/generated/{gid}/LOW/textures/{l_base.name}", normal=f"{base_url}/generated/{gid}/LOW/textures/{l_norm.name}", roughness=f"{base_url}/generated/{gid}/LOW/textures/{l_rough.name}"),
            )
        )

    components = [GenerationComponent(name=c.name, order=i, present=True if c.required else not c.name.endswith("Hardware"), materialSlots=list(c.material_slots)) for i, c in enumerate(preset.components, start=1)]

    stats_high = StatsSummary(faces=int(len(high_mesh.faces)), materials=len(generated_materials), components=len(components))
    stats_low = StatsSummary(faces=int(len(low_mesh.faces)), materials=len(generated_materials), components=len(components))

    result = GenerationResult(
        generationId=gid,
        objectName=safe_name,
        resolvedPreset=resolved,
        components=components,
        materials=generated_materials,
        stats={"high": stats_high, "low": stats_low},
        artifacts=GenerationArtifacts(
            highGlb=f"{base_url}/generated/{gid}/HIGH/{high_glb.name}",
            lowGlb=f"{base_url}/generated/{gid}/LOW/{low_glb.name}",
            highDae=f"{base_url}/generated/{gid}/HIGH/{high_dae.name}",
            lowDae=f"{base_url}/generated/{gid}/LOW/{low_dae.name}",
            previewHigh=f"{base_url}/generated/{gid}/{prev_h.name}",
            previewLow=f"{base_url}/generated/{gid}/{prev_l.name}",
        ),
        suggestedExportName=f"{safe_name}_SketchUp_Package.zip",
    )

    (gdir / "generation_result.json").write_text(result.model_dump_json(indent=2), encoding="utf-8")
    materials_schema = {
        "schema": MATERIALS_SCHEMA_VERSION,
        "pipeline": {"geometry": "depth-structured-v1", "depthSource": front_obs.depth_source, "notes": "MiDaS_small attempted first; falls back to gradient depth when unavailable."},
        "object": {"name": safe_name, "generationId": gid, "preset": resolved, "dimensionsMeters": {"width": round(dim[0], 4), "height": round(dim[1], 4), "depth": round(dim[2], 4)}, "qualityTargets": {"highFaces": stats_high.faces, "lowFaces": stats_low.faces}},
        "components": [{"name": c.name, "order": c.order, "materialSlots": c.materialSlots} for c in components],
        "materials": [{"name": m.name, "defaults": {"roughness": m.roughnessDefault, "normalStrength": m.normalStrengthDefault}, "maps": {"high": m.mapsHigh.model_dump(), "low": m.mapsLow.model_dump()}} for m in generated_materials],
    }
    (gdir / "materials.schema.snapshot.json").write_text(json.dumps(materials_schema, indent=2), encoding="utf-8")
    return result
