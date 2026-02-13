from __future__ import annotations

import json
import uuid
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageDraw

from .models import (
    CaptureImageInput,
    DetectedObjectResult,
    GenerationArtifacts,
    GenerationComponent,
    GenerationMaterial,
    GenerationRequest,
    GenerationResult,
    MaterialMapSet,
    StatsSummary,
)
from .pipeline import (
    apply_uv_placeholder,
    build_component_recipes,
    choose_capture_by_slot,
    choose_material_captures,
    conservative_component_meshes,
    detect_object_masks,
    debug_enabled,
    debug_output_dir,
    estimate_object_dimensions,
    extract_mask_observation,
    extract_material_texture_set,
    fallback_component_meshes,
    infer_material_category,
    load_capture_images,
    recipe_to_component_meshes,
    save_debug_image,
)
from .presets import PRESET_MAP, PresetDefinition, resolve_auto_preset

MATERIALS_SCHEMA_VERSION = "volumia.materials.v1"
MAX_CAPTURE_SIDE = 1024
HIGH_TEXTURE_SIZE = 1024
LOW_TEXTURE_SIZE = 512

_MIDAS_RUNTIME: dict[str, object] | None = None
_MIDAS_LOAD_FAILED = False


def _safe_name(value: str) -> str:
    keep = [char if char.isalnum() or char in ("-", "_") else "_" for char in value.strip()]
    normalized = "".join(keep).strip("_")
    return normalized or "Object"


def _resolve_preset(request: GenerationRequest) -> str:
    hints = [item.fileName for item in request.images]
    if request.objectType.startswith("studio:") and request.studioBasePreset:
        return request.studioBasePreset
    return resolve_auto_preset(request.objectType, request.reconstructionMode, hints)


def _ensure_captures(request: GenerationRequest) -> list:
    captures = load_capture_images(request.images, max_side=MAX_CAPTURE_SIDE)
    if captures:
        return captures
    synthetic = CaptureImageInput(slotId="front", fileName=f"{request.objectName}_synthetic_front.png")
    return load_capture_images([synthetic], max_side=MAX_CAPTURE_SIDE)


def _normalize(values: np.ndarray) -> np.ndarray:
    minimum = float(np.min(values))
    maximum = float(np.max(values))
    span = maximum - minimum
    if span <= 1e-6:
        return np.zeros_like(values, dtype=np.float32)
    return (values.astype(np.float32) - minimum) / span


def _load_midas_runtime() -> dict[str, object] | None:
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
        _MIDAS_RUNTIME = {
            "torch": torch,
            "device": device,
            "model": model,
            "transform": transforms.small_transform,
        }
        return _MIDAS_RUNTIME
    except Exception as error:
        print(f"[pipeline] MiDaS unavailable, using gradient fallback depth: {error}")
        _MIDAS_LOAD_FAILED = True
        return None


def _estimate_depth_map(image_rgb: np.ndarray) -> tuple[np.ndarray, str]:
    runtime = _load_midas_runtime()
    if runtime is not None:
        try:
            torch = runtime["torch"]
            input_batch = runtime["transform"](image_rgb).to(runtime["device"])
            with torch.no_grad():
                prediction = runtime["model"](input_batch)
                prediction = torch.nn.functional.interpolate(
                    prediction.unsqueeze(1),
                    size=image_rgb.shape[:2],
                    mode="bicubic",
                    align_corners=False,
                ).squeeze(1)
            return _normalize(prediction.squeeze(0).cpu().numpy()), "midas-small"
        except Exception as error:
            print(f"[pipeline] MiDaS inference failed, using gradient fallback depth: {error}")

    gray = np.asarray(Image.fromarray(image_rgb, mode="RGB").convert("L"), dtype=np.float32) / 255.0
    grad_y, grad_x = np.gradient(gray)
    depth = _normalize((1.0 - gray) * 0.7 + np.sqrt(grad_x * grad_x + grad_y * grad_y) * 0.3)
    return depth, "gradient-fallback"


def _write_collada_placeholder(path: Path, object_name: str, quality: str, components: list[str]) -> None:
    xml = f"""<?xml version=\"1.0\" encoding=\"utf-8\"?>
<COLLADA xmlns=\"http://www.collada.org/2005/11/COLLADASchema\" version=\"1.4.1\">
  <asset>
    <contributor><authoring_tool>VOLUMIA Structured Exporter</authoring_tool></contributor>
    <unit name=\"centimeter\" meter=\"0.01\"/>
    <up_axis>Y_UP</up_axis>
  </asset>
  <library_visual_scenes>
    <visual_scene id=\"Scene\" name=\"Scene\">
      <!-- Object: {object_name} | Quality: {quality} | Components: {", ".join(components)} -->
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url=\"#Scene\"/></scene>
</COLLADA>
"""
    path.write_text(xml, encoding="utf-8")


def _write_preview(path: Path, object_name: str, quality: str, dimensions: tuple[float, float, float], depth_source: str) -> None:
    image = Image.new("RGB", (1024, 768), color=(236, 233, 227))
    draw = ImageDraw.Draw(image)
    draw.rectangle((64, 64, 960, 704), outline=(161, 134, 111), width=3)
    draw.text((96, 104), "VOLUMIA PREVIEW", fill=(48, 44, 38))
    draw.text((96, 164), f"Object: {object_name}", fill=(48, 44, 38))
    draw.text((96, 220), f"Quality: {quality.upper()}", fill=(110, 104, 96))
    draw.text(
        (96, 276),
        f"Approx size (m): {dimensions[0]:.2f}w x {dimensions[1]:.2f}h x {dimensions[2]:.2f}d",
        fill=(110, 104, 96),
    )
    draw.text((96, 332), f"Depth estimator: {depth_source}", fill=(110, 104, 96))
    draw.text((96, 388), "Precision in Form. Intelligence in Material.", fill=(161, 134, 111))
    image.save(path)


def _save_scene_glb(path: Path, scene: trimesh.Scene) -> None:
    path.write_bytes(scene.export(file_type="glb"))


def _depth_cues(depth_map: np.ndarray, mask: np.ndarray) -> tuple[float, float]:
    focus = depth_map[mask > 0]
    if focus.size == 0:
        focus = depth_map.reshape(-1)
    return float(np.mean(focus)), float(np.std(focus))


def _clip_bbox(bbox: tuple[int, int, int, int], width: int, height: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = bbox
    x0 = int(np.clip(x0, 0, max(0, width - 1)))
    y0 = int(np.clip(y0, 0, max(0, height - 1)))
    x1 = int(np.clip(x1, x0 + 1, width))
    y1 = int(np.clip(y1, y0 + 1, height))
    return x0, y0, x1, y1


def _expand_bbox(
    bbox: tuple[int, int, int, int],
    width: int,
    height: int,
    pad_ratio: float = 0.05,
) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = _clip_bbox(bbox, width, height)
    bw = max(1, x1 - x0)
    bh = max(1, y1 - y0)
    pad_x = int(max(2, bw * pad_ratio))
    pad_y = int(max(2, bh * pad_ratio))
    return _clip_bbox((x0 - pad_x, y0 - pad_y, x1 + pad_x, y1 + pad_y), width, height)


def _scale_bbox_to_shape(
    bbox: tuple[int, int, int, int],
    src_shape: tuple[int, int],
    dst_shape: tuple[int, int],
) -> tuple[int, int, int, int]:
    src_h, src_w = src_shape
    dst_h, dst_w = dst_shape
    sx = float(dst_w) / max(1.0, float(src_w))
    sy = float(dst_h) / max(1.0, float(src_h))
    x0, y0, x1, y1 = bbox
    scaled = (
        int(round(x0 * sx)),
        int(round(y0 * sy)),
        int(round(x1 * sx)),
        int(round(y1 * sy)),
    )
    return _clip_bbox(scaled, dst_w, dst_h)


def _crop_image(image_rgb: np.ndarray, bbox: tuple[int, int, int, int]) -> np.ndarray:
    h, w = image_rgb.shape[:2]
    x0, y0, x1, y1 = _clip_bbox(bbox, w, h)
    return image_rgb[y0:y1, x0:x1].copy()


def _masked_projection_source(image_rgb: np.ndarray, mask: np.ndarray, size: int) -> np.ndarray:
    if image_rgb.size == 0:
        return np.zeros((size, size, 3), dtype=np.uint8)

    mask_bool = mask > 0
    if mask_bool.shape[:2] != image_rgb.shape[:2]:
        mask_bool = np.ones(image_rgb.shape[:2], dtype=bool)

    if np.any(mask_bool):
        visible_pixels = image_rgb[mask_bool]
        dominant = np.median(visible_pixels, axis=0).astype(np.uint8)
    else:
        dominant = np.array([128, 120, 108], dtype=np.uint8)

    base = np.full_like(image_rgb, dominant, dtype=np.uint8)
    base[mask_bool] = image_rgb[mask_bool]
    resized = np.asarray(
        Image.fromarray(base, mode="RGB").resize((size, size), Image.Resampling.LANCZOS),
        dtype=np.uint8,
    )
    return resized


def _projected_texture_source(
    front_image: np.ndarray,
    front_mask: np.ndarray,
    side_image: np.ndarray | None,
    side_mask: np.ndarray | None,
    size: int,
) -> np.ndarray:
    front_source = _masked_projection_source(front_image, front_mask, size=size)
    if side_image is None:
        return front_source

    side_source = _masked_projection_source(
        side_image,
        side_mask if side_mask is not None else np.ones(side_image.shape[:2], dtype=np.uint8) * 255,
        size=size,
    )
    blend = front_source.astype(np.float32)
    right_slice = slice(int(size * 0.6), size)
    blend[:, right_slice, :] = (
        front_source[:, right_slice, :].astype(np.float32) * 0.55 + side_source[:, right_slice, :].astype(np.float32) * 0.45
    )
    return np.clip(blend, 0.0, 255.0).astype(np.uint8)


def _mesh_extents_m(mesh: trimesh.Trimesh) -> tuple[float, float, float]:
    bounds = mesh.bounds
    extents = bounds[1] - bounds[0]
    return float(extents[0]), float(extents[1]), float(extents[2])


def _component_present(
    preset_id: str,
    component_name: str,
    required: bool,
    heuristics: dict[str, object],
    request: GenerationRequest,
) -> bool:
    if required:
        return True
    if component_name == "OBJ_Drawers":
        return bool(heuristics.get("drawer_hint", False))
    if component_name in {"OBJ_Hardware", "OBJ_Cable"}:
        return False
    if component_name in {"OBJ_Base", "OBJ_Folds"}:
        return preset_id in {"decor", "divider", "rug-curtain"}
    if component_name == "OBJ_Details":
        return request.complexity != "low"
    return False


def _map_url(base_url: str, generation_id: str, relative: str) -> str:
    clean_base = base_url.rstrip("/")
    return f"{clean_base}/generated/{generation_id}/{relative}"


def _save_texture_set(
    texture_set,
    material_name: str,
    texture_dir: Path,
    include_optional: bool = True,
) -> dict[str, str | None]:
    base_name = f"{material_name}_BaseColor.png"
    normal_name = f"{material_name}_Normal.png"
    rough_name = f"{material_name}_Roughness.png"

    texture_set.base_color.save(texture_dir / base_name)
    texture_set.normal.save(texture_dir / normal_name)
    texture_set.roughness.save(texture_dir / rough_name)

    ao_name: str | None = None
    metal_name: str | None = None
    if include_optional and texture_set.ao is not None:
        ao_name = f"{material_name}_AO.png"
        texture_set.ao.save(texture_dir / ao_name)
    if include_optional and texture_set.metalness is not None:
        metal_name = f"{material_name}_Metalness.png"
        texture_set.metalness.save(texture_dir / metal_name)

    return {
        "baseColor": base_name,
        "normal": normal_name,
        "roughness": rough_name,
        "ao": ao_name,
        "metalness": metal_name,
    }


def _material_sources(captures: list) -> list:
    return choose_material_captures(captures)


def _capture_keyword_category(text: str) -> str:
    normalized = text.lower()
    if any(token in normalized for token in ("fabric", "textile", "cloth", "leather", "weave", "rug", "curtain")):
        return "fabric"
    if any(token in normalized for token in ("wood", "oak", "walnut", "ash", "teak")):
        return "wood"
    if any(token in normalized for token in ("metal", "steel", "iron", "brass", "aluminum", "aluminium", "chrome")):
        return "metal"
    if any(token in normalized for token in ("stone", "marble", "granite", "concrete", "terrazzo")):
        return "stone"
    if any(token in normalized for token in ("glass", "crystal")):
        return "glass"
    if any(token in normalized for token in ("emissive", "light", "lamp")):
        return "emissive"
    return "generic"


def _build_material_capture_mapping(request: GenerationRequest, captures: list, preset: PresetDefinition) -> dict[str, object]:
    if not captures:
        return {}

    request_hint_by_slot = {
        item.slotId: f"{item.fileName} {item.userHint or ''}".strip().lower() for item in request.images
    }
    capture_items = []
    for index, capture in enumerate(captures):
        hint_text = request_hint_by_slot.get(capture.slot_id, capture.file_name.lower())
        category = _capture_keyword_category(f"{capture.file_name} {hint_text}")
        capture_items.append({"index": index, "capture": capture, "category": category})

    assigned_indices: set[int] = set()
    mapping: dict[str, object] = {}
    for material in preset.materials:
        target_category = infer_material_category(material.name)
        candidate = None
        if target_category != "generic":
            for item in capture_items:
                if item["index"] in assigned_indices:
                    continue
                if item["category"] == target_category:
                    candidate = item
                    break
        if candidate is None:
            for item in capture_items:
                if item["index"] not in assigned_indices:
                    candidate = item
                    break
        if candidate is None:
            continue
        assigned_indices.add(int(candidate["index"]))
        mapping[material.name] = candidate["capture"]
    return mapping


def _save_generation_debug(
    generation_id: str,
    front_image: np.ndarray,
    side_image: np.ndarray,
    front_mask: np.ndarray,
    side_mask: np.ndarray | None,
    front_depth: np.ndarray,
    side_depth: np.ndarray | None,
    material_captures: list,
) -> str | None:
    if not debug_enabled():
        return None

    debug_dir = debug_output_dir(generation_id)
    save_debug_image(debug_dir / "front_input.png", front_image)
    save_debug_image(debug_dir / "front_mask.png", front_mask)
    save_debug_image(debug_dir / "front_depth.png", (_normalize(front_depth) * 255.0).astype(np.uint8))
    save_debug_image(debug_dir / "side_input.png", side_image)

    if side_mask is not None:
        save_debug_image(debug_dir / "side_mask.png", side_mask)
    if side_depth is not None:
        save_debug_image(debug_dir / "side_depth.png", (_normalize(side_depth) * 255.0).astype(np.uint8))

    for index, capture in enumerate(material_captures, start=1):
        save_debug_image(debug_dir / f"material_input_{index}_{capture.slot_id}.png", capture.image)

    print(f"[pipeline] Debug artifacts saved to: {debug_dir}")
    return str(debug_dir)


def _build_generation_context(
    request: GenerationRequest,
    generation_id: str,
    preset_id: str,
    dimensions: tuple[float, float, float],
    heuristics: dict[str, object],
    scale_stats: dict[str, float | str],
    front_mask_valid: bool,
    side_mask_valid: bool,
    depth_source_front: str,
    depth_source_side: str,
    debug_path: str | None,
    generation_mode_used: str,
    conservative_mode: bool,
) -> dict[str, object]:
    return {
        "schema": MATERIALS_SCHEMA_VERSION,
        "generationId": generation_id,
        "pipeline": {
            "geometry": "quick-conservative-v1" if conservative_mode else "quick-aggressive-v1",
            "materials": "pbr-extract-v1",
            "depthSourceFront": depth_source_front,
            "depthSourceSide": depth_source_side,
            "generationMode": generation_mode_used,
        },
        "object": {
            "preset": preset_id,
            "mode": request.reconstructionMode,
            "units": "cm",
            "pivotMode": request.pivotMode,
            "scale": {
                "dimension": request.scaleDimension,
                "valueCm": float(request.scaleValueCm),
            },
            "dimensionsMeters": {
                "width": round(dimensions[0], 5),
                "height": round(dimensions[1], 5),
                "depth": round(dimensions[2], 5),
            },
        },
        "quality": {
            "complexity": request.complexity,
            "includeLightweight": request.includeLightweight,
            "conservative": conservative_mode,
        },
        "captureDiagnostics": {
            "frontMaskValid": front_mask_valid,
            "sideMaskValid": side_mask_valid,
            "heuristics": heuristics,
            "scaleStats": scale_stats,
        },
        "debug": {
            "enabled": debug_path is not None,
            "path": debug_path,
        },
    }


def _build_components_metadata(
    preset: PresetDefinition,
    request: GenerationRequest,
    heuristics: dict[str, object],
    component_presence: dict[str, bool] | None = None,
) -> list[GenerationComponent]:
    components: list[GenerationComponent] = []
    for index, component in enumerate(preset.components, start=1):
        if component_presence is not None:
            present = bool(component_presence.get(component.name, False))
        else:
            present = _component_present(
                preset.id,
                component.name,
                component.required,
                heuristics,
                request,
            )
        components.append(
            GenerationComponent(
                name=component.name,
                order=index,
                present=present,
                materialSlots=list(component.material_slots),
            )
        )
    return components


def _object_request_from_bbox(
    request: GenerationRequest,
    captures: list,
    front_shape: tuple[int, int],
    bbox: tuple[int, int, int, int],
    object_index: int,
    temp_root: Path,
) -> GenerationRequest:
    temp_root.mkdir(parents=True, exist_ok=True)
    object_dir = temp_root / f"object_{object_index + 1:02d}"
    object_dir.mkdir(parents=True, exist_ok=True)

    src_h, src_w = front_shape
    padded_bbox = _expand_bbox(bbox, src_w, src_h, pad_ratio=0.06)

    remapped_images: list[CaptureImageInput] = []
    for capture in captures:
        capture_h, capture_w = capture.image.shape[:2]
        if capture.slot_id.startswith("material_"):
            cropped = capture.image
        else:
            scaled_bbox = _scale_bbox_to_shape(padded_bbox, (src_h, src_w), (capture_h, capture_w))
            cropped = _crop_image(capture.image, scaled_bbox)
        target_name = f"{capture.slot_id}_{object_index + 1:02d}.png"
        target_path = object_dir / target_name
        Image.fromarray(cropped, mode="RGB").save(target_path)
        remapped_images.append(
            CaptureImageInput(
                slotId=capture.slot_id,
                fileName=target_name,
                filePath=str(target_path),
                userHint=None,
            )
        )

    object_name = f"{_safe_name(request.objectName)}_obj_{object_index + 1}"
    return request.model_copy(
        update={
            "objectName": object_name,
            "images": remapped_images,
            "detectMultipleObjects": False,
        }
    )


def _to_detected_object(
    result: GenerationResult,
    object_id: str,
    bbox: tuple[int, int, int, int],
) -> DetectedObjectResult:
    return DetectedObjectResult(
        id=object_id,
        bbox=bbox,
        generationId=result.generationId,
        objectName=result.objectName,
        resolvedPreset=result.resolvedPreset,
        components=result.components,
        materials=result.materials,
        stats=result.stats,
        width_cm=result.width_cm,
        height_cm=result.height_cm,
        depth_cm=result.depth_cm,
        scale_axis_used=result.scale_axis_used,
        artifacts=result.artifacts,
        suggestedExportName=result.suggestedExportName,
    )


def generate_stub_assets(request: GenerationRequest, generated_root: Path, base_url: str) -> GenerationResult:
    resolved_preset = _resolve_preset(request)
    preset = PRESET_MAP.get(resolved_preset, PRESET_MAP["decor"])
    captures = _ensure_captures(request)
    front_capture = choose_capture_by_slot(captures, "front") or captures[0]

    if request.detectMultipleObjects:
        candidate_masks = [obs for obs in detect_object_masks(front_capture.image, max_objects=4) if obs.valid]
        if len(candidate_masks) > 1:
            group_id = uuid.uuid4().hex[:12]
            temp_root = generated_root / "tmp_multi" / group_id
            front_shape = front_capture.image.shape[:2]
            object_results: list[tuple[GenerationResult, tuple[int, int, int, int], str]] = []

            for index, obs in enumerate(candidate_masks):
                object_id = f"obj_{index + 1}"
                object_request = _object_request_from_bbox(
                    request,
                    captures=captures,
                    front_shape=front_shape,
                    bbox=obs.bbox,
                    object_index=index,
                    temp_root=temp_root,
                )
                object_result = generate_stub_assets(
                    object_request.model_copy(update={"detectMultipleObjects": False}),
                    generated_root=generated_root,
                    base_url=base_url,
                )
                object_result = object_result.model_copy(
                    update={
                        "objectId": object_id,
                        "objectBoundingBox": obs.bbox,
                        "multiObjectGroupId": group_id,
                        "multiObjectEnabled": True,
                    }
                )
                object_results.append((object_result, obs.bbox, object_id))

            primary_result = object_results[0][0]
            detected_objects = [_to_detected_object(result=item[0], object_id=item[2], bbox=item[1]) for item in object_results]
            notes = list(primary_result.notes or [])
            notes.append(f"Detected {len(detected_objects)} objects from front image.")
            return primary_result.model_copy(
                update={
                    "detectedObjects": detected_objects,
                    "multiObjectGroupId": group_id,
                    "multiObjectEnabled": True,
                    "notes": notes,
                }
            )

    generation_id = uuid.uuid4().hex[:12]
    object_name = _safe_name(request.objectName)

    generation_dir = generated_root / generation_id
    high_dir = generation_dir / "HIGH"
    low_dir = generation_dir / "LOW"
    high_textures_dir = high_dir / "textures"
    low_textures_dir = low_dir / "textures"
    for directory in (generation_dir, high_dir, low_dir, high_textures_dir, low_textures_dir):
        directory.mkdir(parents=True, exist_ok=True)

    side_capture = choose_capture_by_slot(captures, "side")
    front_image = front_capture.image
    side_image = side_capture.image if side_capture is not None else front_image
    side_available = side_capture is not None
    conservative_mode = request.generationMode != "aggressive"

    front_mask_obs = extract_mask_observation(front_image)
    side_mask_obs = extract_mask_observation(side_image) if side_capture is not None else None

    dimensions, heuristics, scale_stats = estimate_object_dimensions(
        request,
        front_mask=front_mask_obs,
        side_mask=side_mask_obs,
    )

    if conservative_mode and not (side_mask_obs is not None and side_mask_obs.valid):
        front_w_px = max(1.0, float(front_mask_obs.bbox[2] - front_mask_obs.bbox[0]))
        front_h_px = max(1.0, float(front_mask_obs.bbox[3] - front_mask_obs.bbox[1]))
        if request.scaleDimension == "depth":
            depth_cm = float(request.scaleValueCm)
            width_cm = max(1.0, depth_cm / 0.35)
            cm_per_pixel = width_cm / front_w_px
            height_cm = front_h_px * cm_per_pixel
            scale_axis_used = "depth"
        else:
            axis_px = front_w_px if request.scaleDimension == "width" else front_h_px
            cm_per_pixel = float(request.scaleValueCm) / max(axis_px, 1e-6)
            width_cm = front_w_px * cm_per_pixel
            height_cm = front_h_px * cm_per_pixel
            depth_cm = width_cm * 0.35
            scale_axis_used = request.scaleDimension
        dimensions = (width_cm / 100.0, height_cm / 100.0, depth_cm / 100.0)
        scale_stats = {
            "width_cm": float(width_cm),
            "height_cm": float(height_cm),
            "depth_cm": float(depth_cm),
            "scale_axis_used": scale_axis_used,
            "cm_per_pixel": float(cm_per_pixel),
            "depth_source": "conservative_proxy",
        }
        heuristics["depth_ratio"] = float(np.clip(depth_cm / max(width_cm, 1e-6), 0.2, 1.4))
        heuristics["conservative_proxy"] = True

    front_depth, front_depth_source = _estimate_depth_map(front_image)
    side_depth, side_depth_source = _estimate_depth_map(side_image) if side_capture is not None else (front_depth, "shared-front")
    front_depth_mean, front_depth_std = _depth_cues(front_depth, front_mask_obs.mask)
    side_depth_mean, _ = _depth_cues(side_depth, side_mask_obs.mask if side_mask_obs is not None else front_mask_obs.mask)

    heuristics["depth_ratio"] = float(
        np.clip(
            float(heuristics.get("depth_ratio", 0.6))
            * float(np.clip(0.86 + front_depth_std * 1.1 + side_depth_mean * 0.14, 0.78, 1.42)),
            0.25,
            1.35,
        )
    )
    heuristics["back_profile"] = float(
        np.clip(
            float(heuristics.get("back_profile", 0.35)) * float(np.clip(0.88 + front_depth_mean * 0.28, 0.75, 1.3)),
            0.18,
            0.62,
        )
    )

    notes: list[str] = []
    failed_front_mask = not front_mask_obs.valid
    if failed_front_mask:
        print("[pipeline] Front silhouette extraction failed. Using fallback component primitives.")
        notes.append("Front silhouette extraction failed; fallback geometry used.")

    if failed_front_mask:
        high_geometry = fallback_component_meshes(
            preset,
            dimensions,
            quality="high",
            heuristics=heuristics,
            scale_axis=request.scaleDimension,
            pivot_mode=request.pivotMode,
        )
        low_geometry = fallback_component_meshes(
            preset,
            dimensions,
            quality="low",
            heuristics=heuristics,
            scale_axis=request.scaleDimension,
            pivot_mode=request.pivotMode,
        )
    elif conservative_mode:
        high_geometry = conservative_component_meshes(
            preset,
            dimensions,
            quality="high",
            front_mask=front_mask_obs,
            heuristics=heuristics,
            scale_axis=request.scaleDimension,
            pivot_mode=request.pivotMode,
        )
        low_geometry = conservative_component_meshes(
            preset,
            dimensions,
            quality="low",
            front_mask=front_mask_obs,
            heuristics=heuristics,
            scale_axis=request.scaleDimension,
            pivot_mode=request.pivotMode,
        )
    else:
        high_recipes = build_component_recipes(
            preset.id,
            [component.name for component in preset.components],
            quality="high",
            heuristics=heuristics,
        )
        low_recipes = build_component_recipes(
            preset.id,
            [component.name for component in preset.components],
            quality="low",
            heuristics=heuristics,
        )
        high_geometry = recipe_to_component_meshes(
            preset,
            dimensions,
            quality="high",
            complexity=request.complexity,
            recipes=high_recipes,
            heuristics=heuristics,
            scale_axis=request.scaleDimension,
            pivot_mode=request.pivotMode,
        )
        low_geometry = recipe_to_component_meshes(
            preset,
            dimensions,
            quality="low",
            complexity=request.complexity,
            recipes=low_recipes,
            heuristics=heuristics,
            scale_axis=request.scaleDimension,
            pivot_mode=request.pivotMode,
        )

    apply_uv_placeholder(high_geometry.scene, high_geometry.component_meshes)
    apply_uv_placeholder(low_geometry.scene, low_geometry.component_meshes)

    high_dimensions_m = _mesh_extents_m(high_geometry.merged)
    final_scale_stats = dict(scale_stats)
    final_scale_stats["width_cm"] = high_dimensions_m[0] * 100.0
    final_scale_stats["height_cm"] = high_dimensions_m[1] * 100.0
    final_scale_stats["depth_cm"] = high_dimensions_m[2] * 100.0
    axis_used = str(final_scale_stats.get("scale_axis_used", request.scaleDimension))
    if axis_used not in {"width", "height", "depth"}:
        axis_used = request.scaleDimension

    high_glb_path = high_dir / "model_high.glb"
    low_glb_path = low_dir / "model_low.glb"
    _save_scene_glb(high_glb_path, high_geometry.scene)
    _save_scene_glb(low_glb_path, low_geometry.scene)

    component_names = [component.name for component in preset.components]
    high_dae_path = high_dir / "model_high.dae"
    low_dae_path = low_dir / "model_low.dae"
    _write_collada_placeholder(high_dae_path, object_name, "high", component_names)
    _write_collada_placeholder(low_dae_path, object_name, "low", component_names)

    preview_high_path = generation_dir / "preview_high.png"
    preview_low_path = generation_dir / "preview_low.png"
    _write_preview(preview_high_path, object_name, "high", high_dimensions_m, front_depth_source)
    _write_preview(preview_low_path, object_name, "low", high_dimensions_m, front_depth_source)

    material_captures = _material_sources(captures)
    material_capture_map = _build_material_capture_mapping(request, material_captures, preset)
    projection_high = _projected_texture_source(
        front_image=front_image,
        front_mask=front_mask_obs.mask,
        side_image=side_image if side_available else None,
        side_mask=side_mask_obs.mask if side_mask_obs is not None else None,
        size=HIGH_TEXTURE_SIZE,
    )
    projection_low = _projected_texture_source(
        front_image=front_image,
        front_mask=front_mask_obs.mask,
        side_image=side_image if side_available else None,
        side_mask=side_mask_obs.mask if side_mask_obs is not None else None,
        size=LOW_TEXTURE_SIZE,
    )
    generated_materials: list[GenerationMaterial] = []
    for index, material_template in enumerate(preset.materials):
        source_capture = material_capture_map.get(material_template.name)
        if source_capture is None and index < len(material_captures):
            source_capture = material_captures[index]

        if source_capture is not None:
            high_textures = extract_material_texture_set(
                source_capture.image,
                material_name=material_template.name,
                texture_size=HIGH_TEXTURE_SIZE,
                roughness_hint=material_template.roughness,
                normal_strength=material_template.normal_strength,
            )
            low_textures = extract_material_texture_set(
                source_capture.image,
                material_name=material_template.name,
                texture_size=LOW_TEXTURE_SIZE,
                roughness_hint=material_template.roughness,
                normal_strength=material_template.normal_strength,
            )
        else:
            high_textures = extract_material_texture_set(
                projection_high,
                material_name=material_template.name,
                texture_size=HIGH_TEXTURE_SIZE,
                roughness_hint=material_template.roughness,
                normal_strength=material_template.normal_strength,
            )
            low_textures = extract_material_texture_set(
                projection_low,
                material_name=material_template.name,
                texture_size=LOW_TEXTURE_SIZE,
                roughness_hint=material_template.roughness,
                normal_strength=material_template.normal_strength,
            )

        high_names = _save_texture_set(high_textures, material_template.name, high_textures_dir, include_optional=True)
        low_names = _save_texture_set(low_textures, material_template.name, low_textures_dir, include_optional=True)

        generated_materials.append(
            GenerationMaterial(
                name=material_template.name,
                roughnessDefault=float(
                    np.clip(
                        (high_textures.roughness_default + low_textures.roughness_default + material_template.roughness) / 3.0,
                        0.2,
                        0.9,
                    )
                ),
                normalStrengthDefault=material_template.normal_strength,
                mapsHigh=MaterialMapSet(
                    baseColor=_map_url(base_url, generation_id, f"HIGH/textures/{high_names['baseColor']}"),
                    normal=_map_url(base_url, generation_id, f"HIGH/textures/{high_names['normal']}"),
                    roughness=_map_url(base_url, generation_id, f"HIGH/textures/{high_names['roughness']}"),
                    ao=(
                        _map_url(base_url, generation_id, f"HIGH/textures/{high_names['ao']}")
                        if high_names["ao"] is not None
                        else None
                    ),
                    metalness=(
                        _map_url(base_url, generation_id, f"HIGH/textures/{high_names['metalness']}")
                        if high_names["metalness"] is not None
                        else None
                    ),
                ),
                mapsLow=MaterialMapSet(
                    baseColor=_map_url(base_url, generation_id, f"LOW/textures/{low_names['baseColor']}"),
                    normal=_map_url(base_url, generation_id, f"LOW/textures/{low_names['normal']}"),
                    roughness=_map_url(base_url, generation_id, f"LOW/textures/{low_names['roughness']}"),
                    ao=(
                        _map_url(base_url, generation_id, f"LOW/textures/{low_names['ao']}")
                        if low_names["ao"] is not None
                        else None
                    ),
                    metalness=(
                        _map_url(base_url, generation_id, f"LOW/textures/{low_names['metalness']}")
                        if low_names["metalness"] is not None
                        else None
                    ),
                ),
            )
        )

    debug_path = _save_generation_debug(
        generation_id,
        front_image,
        side_image,
        front_mask_obs.mask,
        side_mask_obs.mask if side_mask_obs is not None else None,
        front_depth,
        side_depth if side_capture is not None else None,
        material_captures,
    )

    component_presence = {name: len(mesh.faces) > 0 for name, mesh in high_geometry.component_meshes.items()}
    components = _build_components_metadata(preset, request, heuristics, component_presence=component_presence)
    high_stats = StatsSummary(
        faces=int(len(high_geometry.merged.faces)),
        materials=len(generated_materials),
        components=len(components),
    )
    low_stats = StatsSummary(
        faces=int(len(low_geometry.merged.faces)),
        materials=len(generated_materials),
        components=len(components),
    )

    result = GenerationResult(
        generationId=generation_id,
        objectId="obj_1",
        objectBoundingBox=(0, 0, int(front_image.shape[1]), int(front_image.shape[0])),
        objectName=object_name,
        resolvedPreset=resolved_preset,
        components=components,
        materials=generated_materials,
        stats={"high": high_stats, "low": low_stats},
        width_cm=float(final_scale_stats["width_cm"]),
        height_cm=float(final_scale_stats["height_cm"]),
        depth_cm=float(final_scale_stats["depth_cm"]),
        scale_axis_used=axis_used,
        generationModeUsed=request.generationMode,
        conservativeMode=conservative_mode,
        multiObjectEnabled=bool(request.detectMultipleObjects),
        notes=notes,
        artifacts=GenerationArtifacts(
            highGlb=_map_url(base_url, generation_id, f"HIGH/{high_glb_path.name}"),
            lowGlb=_map_url(base_url, generation_id, f"LOW/{low_glb_path.name}"),
            highDae=_map_url(base_url, generation_id, f"HIGH/{high_dae_path.name}"),
            lowDae=_map_url(base_url, generation_id, f"LOW/{low_dae_path.name}"),
            previewHigh=_map_url(base_url, generation_id, preview_high_path.name),
            previewLow=_map_url(base_url, generation_id, preview_low_path.name),
        ),
        suggestedExportName=f"{object_name}_SketchUp_Package.zip",
    )

    context_payload = _build_generation_context(
        request,
        generation_id,
        resolved_preset,
        high_dimensions_m,
        heuristics,
        final_scale_stats,
        front_mask_obs.valid,
        side_mask_obs.valid if side_mask_obs is not None else False,
        front_depth_source,
        side_depth_source,
        debug_path,
        generation_mode_used=request.generationMode,
        conservative_mode=conservative_mode,
    )

    (generation_dir / "generation_context.json").write_text(json.dumps(context_payload, indent=2), encoding="utf-8")
    (generation_dir / "generation_result.json").write_text(result.model_dump_json(indent=2), encoding="utf-8")

    materials_snapshot = {
        "schema": MATERIALS_SCHEMA_VERSION,
        "object": {
            "name": object_name,
            "generationId": generation_id,
            "preset": resolved_preset,
            "mode": request.reconstructionMode,
            "generationMode": request.generationMode,
            "units": "cm",
            "scale": {"dimension": request.scaleDimension, "valueCm": float(request.scaleValueCm)},
            "pivotMode": request.pivotMode,
            "dimensionsMeters": {
                "width": round(high_dimensions_m[0], 5),
                "height": round(high_dimensions_m[1], 5),
                "depth": round(high_dimensions_m[2], 5),
            },
            "qualityTargets": {
                "highFaces": high_stats.faces,
                "lowFaces": low_stats.faces,
            },
        },
        "components": [
            {
                "name": component.name,
                "order": component.order,
                "present": component.present,
                "materialSlots": component.materialSlots,
            }
            for component in components
        ],
        "materials": [
            {
                "name": material.name,
                "defaults": {
                    "roughness": material.roughnessDefault,
                    "normalStrength": material.normalStrengthDefault,
                },
                "maps": {
                    "high": material.mapsHigh.model_dump(),
                    "low": material.mapsLow.model_dump(),
                },
            }
            for material in generated_materials
        ],
    }
    (generation_dir / "materials.schema.snapshot.json").write_text(
        json.dumps(materials_snapshot, indent=2),
        encoding="utf-8",
    )

    return result
