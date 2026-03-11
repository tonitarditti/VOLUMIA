from __future__ import annotations

import inspect
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

try:
    _RESAMPLE_LANCZOS = Image.Resampling.LANCZOS  # Pillow >= 9
except Exception:  # pragma: no cover - older Pillow fallback
    _RESAMPLE_LANCZOS = Image.LANCZOS


def _require_trimesh() -> Any:
    try:
        import trimesh  # noqa: WPS433
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("trimesh is required for mesh texture processing.") from exc
    return trimesh


def _to_trimesh_mesh(raw: Any, trimesh_module: Any) -> Any:
    if isinstance(raw, trimesh_module.Trimesh):
        return raw
    if isinstance(raw, trimesh_module.Scene):
        try:
            dumped = raw.dump(concatenate=True)
            if isinstance(dumped, trimesh_module.Trimesh):
                return dumped
        except Exception:
            pass
        meshes = []
        for geometry in raw.geometry.values():
            if isinstance(geometry, trimesh_module.Trimesh):
                meshes.append(geometry)
        if not meshes:
            raise RuntimeError("Input scene does not contain mesh geometry.")
        return trimesh_module.util.concatenate(meshes)
    raise RuntimeError(f"Unsupported mesh payload: {type(raw)!r}")


def load_mesh(mesh_path: str) -> Any:
    trimesh_module = _require_trimesh()
    loaded = trimesh_module.load(mesh_path, force="scene", process=False)
    mesh = _to_trimesh_mesh(loaded, trimesh_module)
    mesh.process(validate=False)
    return mesh


def cleanup_mesh(mesh: Any) -> Any:
    cleaned = mesh.copy()
    try:
        cleaned.remove_infinite_values()
    except Exception:
        pass
    try:
        cleaned.remove_unreferenced_vertices()
    except Exception:
        pass
    try:
        cleaned.remove_duplicate_faces()
    except Exception:
        pass
    try:
        cleaned.remove_degenerate_faces()
    except Exception:
        pass
    try:
        cleaned.merge_vertices()
    except Exception:
        pass
    try:
        cleaned.fix_normals()
    except Exception:
        pass
    return cleaned


def _decimate_with_pymeshlab(mesh: Any, target_faces: int) -> tuple[Any, str] | None:
    try:
        import pymeshlab  # noqa: WPS433
    except Exception:
        return None

    source_faces = int(len(mesh.faces))
    if source_faces <= target_faces:
        return mesh.copy(), "already_below_target"

    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    faces = np.asarray(mesh.faces, dtype=np.int32)
    ms = pymeshlab.MeshSet()
    ms.add_mesh(pymeshlab.Mesh(vertex_matrix=vertices, face_matrix=faces), "mesh")

    target_perc = max(0.001, min(0.999, float(target_faces) / float(source_faces)))
    attempts = (
        {
            "targetfacenum": int(target_faces),
            "preservenormal": True,
            "preservetopology": True,
            "preserveboundary": True,
        },
        {
            "targetperc": float(target_perc),
            "preservenormal": True,
            "preservetopology": True,
            "preserveboundary": True,
        },
        {"targetperc": float(target_perc)},
    )
    filters = (
        "meshing_decimation_quadric_edge_collapse",
        "simplification_quadric_edge_collapse_decimation",
    )

    last_error: Exception | None = None
    applied = False
    for filter_name in filters:
        for params in attempts:
            try:
                ms.apply_filter(filter_name, **params)
                applied = True
                break
            except Exception as exc:  # noqa: BLE001
                last_error = exc
        if applied:
            break

    if not applied:
        if last_error is not None:
            raise RuntimeError(f"PyMeshLab decimation failed: {last_error}") from last_error
        return None

    current = ms.current_mesh()
    out_vertices = np.asarray(current.vertex_matrix(), dtype=np.float64)
    out_faces = np.asarray(current.face_matrix(), dtype=np.int64)
    trimesh_module = _require_trimesh()
    decimated = trimesh_module.Trimesh(vertices=out_vertices, faces=out_faces, process=False)
    return decimated, "pymeshlab"


def decimate_mesh(mesh: Any, target_faces: int) -> tuple[Any, str]:
    source_faces = int(len(mesh.faces))
    if source_faces <= target_faces:
        return mesh.copy(), "already_below_target"

    try:
        pymeshlab_result = _decimate_with_pymeshlab(mesh, target_faces)
        if pymeshlab_result is not None:
            return pymeshlab_result
    except Exception:
        # Fall back to trimesh simplification path.
        pass

    if hasattr(mesh, "simplify_quadric_decimation"):
        try:
            simplified = mesh.simplify_quadric_decimation(int(target_faces))
            if simplified is not None and int(len(simplified.faces)) > 0:
                return simplified, "trimesh_quadric"
        except Exception:
            pass

    return mesh.copy(), "not_available"


def _planar_uv(vertices: np.ndarray) -> np.ndarray:
    mins = vertices.min(axis=0)
    maxs = vertices.max(axis=0)
    spans = np.maximum(maxs - mins, 1e-8)
    uv = np.zeros((vertices.shape[0], 2), dtype=np.float32)
    uv[:, 0] = (vertices[:, 0] - mins[0]) / spans[0]
    uv[:, 1] = (vertices[:, 2] - mins[2]) / spans[2]
    return uv


def _xatlas_unwrap(vertices: np.ndarray, faces: np.ndarray, atlas_size: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    import xatlas  # noqa: WPS433

    # Preferred API
    if hasattr(xatlas, "Atlas"):
        atlas = xatlas.Atlas()
        atlas.add_mesh(vertices.astype(np.float32), faces.astype(np.uint32))
        chart_options = xatlas.ChartOptions() if hasattr(xatlas, "ChartOptions") else None
        pack_options = xatlas.PackOptions() if hasattr(xatlas, "PackOptions") else None
        if pack_options is not None and hasattr(pack_options, "resolution"):
            pack_options.resolution = int(atlas_size)
        if chart_options is not None or pack_options is not None:
            atlas.generate(chart_options=chart_options, pack_options=pack_options)
        else:
            atlas.generate()
        unwrap = atlas[0]
        vmapping = np.asarray(unwrap[0], dtype=np.int64)
        indices = np.asarray(unwrap[1], dtype=np.int64).reshape((-1, 3))
        uvs = np.asarray(unwrap[2], dtype=np.float32)
        return vmapping, indices, uvs

    # Legacy helper API
    vmapping, indices, uvs = xatlas.parametrize(  # type: ignore[attr-defined]
        vertices.astype(np.float32),
        faces.astype(np.uint32),
    )
    return (
        np.asarray(vmapping, dtype=np.int64),
        np.asarray(indices, dtype=np.int64).reshape((-1, 3)),
        np.asarray(uvs, dtype=np.float32),
    )


def unwrap_uv(mesh: Any, atlas_size: int, prefer_xatlas: bool = True) -> tuple[Any, dict[str, Any]]:
    trimesh_module = _require_trimesh()
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    faces = np.asarray(mesh.faces, dtype=np.int64)

    unwrap_meta: dict[str, Any] = {
        "method": "planar_fallback",
        "xatlasEnabled": bool(prefer_xatlas),
        "atlasSize": int(atlas_size),
        "error": None,
    }

    if prefer_xatlas:
        try:
            vmapping, indices, uvs = _xatlas_unwrap(vertices, faces, int(atlas_size))
            remapped_vertices = vertices[vmapping]
            remapped_faces = indices
            result_mesh = trimesh_module.Trimesh(
                vertices=remapped_vertices,
                faces=remapped_faces,
                process=False,
            )
            result_mesh.visual = trimesh_module.visual.texture.TextureVisuals(uv=uvs)
            unwrap_meta["method"] = "xatlas"
            return result_mesh, unwrap_meta
        except Exception as exc:  # noqa: BLE001
            unwrap_meta["error"] = str(exc)

    uv = _planar_uv(vertices)
    fallback = mesh.copy()
    fallback.visual = trimesh_module.visual.texture.TextureVisuals(uv=uv)
    return fallback, unwrap_meta


def _to_image(value: Any) -> Image.Image | None:
    if value is None:
        return None
    if isinstance(value, Image.Image):
        return value.convert("RGB")
    if isinstance(value, np.ndarray):
        arr = value
        if arr.dtype != np.uint8:
            arr = np.clip(arr, 0, 255).astype(np.uint8)
        if arr.ndim == 2:
            return Image.fromarray(arr, mode="L").convert("RGB")
        if arr.ndim == 3 and arr.shape[2] in (3, 4):
            mode = "RGBA" if arr.shape[2] == 4 else "RGB"
            return Image.fromarray(arr, mode=mode).convert("RGB")
    texture_image = getattr(value, "image", None)
    if texture_image is not None and texture_image is not value:
        return _to_image(texture_image)
    return None


def extract_albedo_image_from_glb(glb_path: str) -> Image.Image | None:
    path = Path(glb_path).expanduser().resolve()
    if not path.is_file():
        return None
    trimesh_module = _require_trimesh()
    loaded = trimesh_module.load(str(path), force="scene", process=False)
    scene = loaded if isinstance(loaded, trimesh_module.Scene) else trimesh_module.Scene(loaded)
    for geometry in scene.geometry.values():
        visual = getattr(geometry, "visual", None)
        if visual is None:
            continue
        material = getattr(visual, "material", None)
        if material is None:
            continue
        for attr in ("baseColorTexture", "image", "diffuseTexture"):
            image = _to_image(getattr(material, attr, None))
            if image is not None:
                return image
    return None


def _resolve_albedo_source(reference_images: list[str], preferred_albedo: Image.Image | None) -> Image.Image:
    if preferred_albedo is not None:
        return preferred_albedo.convert("RGB")
    for raw in reference_images:
        candidate = Path(raw).expanduser().resolve()
        if not candidate.is_file():
            continue
        try:
            return Image.open(candidate).convert("RGB")
        except Exception:
            continue
    # Neutral fallback texture
    return Image.new("RGB", (1024, 1024), color=(180, 180, 180))


def bake_texture_maps(
    output_dir: Path,
    atlas_size: int,
    reference_images: list[str],
    preferred_albedo: Image.Image | None,
) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    atlas = int(max(256, atlas_size))

    albedo_source = _resolve_albedo_source(reference_images, preferred_albedo)
    albedo = albedo_source.resize((atlas, atlas), _RESAMPLE_LANCZOS)
    normal = Image.new("RGB", (atlas, atlas), color=(128, 128, 255))
    # glTF metallic-roughness texture: G=roughness, B=metallic
    metallic_roughness = Image.new("RGB", (atlas, atlas), color=(0, 190, 0))

    albedo_path = output_dir / "albedo.png"
    normal_path = output_dir / "normal.png"
    roughness_path = output_dir / "roughness_metallic.png"

    albedo.save(albedo_path, format="PNG")
    normal.save(normal_path, format="PNG")
    metallic_roughness.save(roughness_path, format="PNG")

    return {
        "albedo": str(albedo_path.resolve()),
        "normal": str(normal_path.resolve()),
        "roughness": str(roughness_path.resolve()),
    }


def _build_pbr_material(trimesh_module: Any, albedo: Image.Image, normal: Image.Image, roughness: Image.Image) -> Any:
    material_cls = trimesh_module.visual.material.PBRMaterial
    signature = inspect.signature(material_cls.__init__)
    kwargs: dict[str, Any] = {"name": "VolumiaMaterial"}
    if "baseColorTexture" in signature.parameters:
        kwargs["baseColorTexture"] = albedo
    if "normalTexture" in signature.parameters:
        kwargs["normalTexture"] = normal
    if "metallicRoughnessTexture" in signature.parameters:
        kwargs["metallicRoughnessTexture"] = roughness
    if "metallicFactor" in signature.parameters:
        kwargs["metallicFactor"] = 0.0
    if "roughnessFactor" in signature.parameters:
        kwargs["roughnessFactor"] = 0.74
    material = material_cls(**kwargs)
    for attr, value in (
        ("normalTexture", normal),
        ("metallicRoughnessTexture", roughness),
        ("metallicFactor", 0.0),
        ("roughnessFactor", 0.74),
    ):
        if hasattr(material, attr):
            setattr(material, attr, value)
    return material


def export_textured_glb(mesh: Any, map_paths: dict[str, str], output_glb_path: str) -> str:
    trimesh_module = _require_trimesh()
    albedo = Image.open(map_paths["albedo"]).convert("RGB")
    normal = Image.open(map_paths["normal"]).convert("RGB")
    roughness = Image.open(map_paths["roughness"]).convert("RGB")

    uv = getattr(getattr(mesh, "visual", None), "uv", None)
    if uv is None:
        uv = _planar_uv(np.asarray(mesh.vertices, dtype=np.float64))

    textured = mesh.copy()
    material = _build_pbr_material(trimesh_module, albedo, normal, roughness)
    textured.visual = trimesh_module.visual.texture.TextureVisuals(
        uv=np.asarray(uv, dtype=np.float32),
        image=albedo,
        material=material,
    )

    output_path = Path(output_glb_path).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    scene = trimesh_module.Scene(textured)
    scene.export(str(output_path))
    return str(output_path)


def prepare_mesh_for_texturing(
    mesh_path: str,
    prepared_mesh_path: str,
    target_triangles: int,
    atlas_size: int,
    prefer_xatlas: bool = True,
) -> dict[str, Any]:
    source = load_mesh(mesh_path)
    cleaned = cleanup_mesh(source)
    decimated, decimation_method = decimate_mesh(cleaned, int(target_triangles))
    unwrapped, unwrap_meta = unwrap_uv(decimated, int(atlas_size), prefer_xatlas=prefer_xatlas)
    unwrapped = cleanup_mesh(unwrapped)

    prepared_path = Path(prepared_mesh_path).expanduser().resolve()
    prepared_path.parent.mkdir(parents=True, exist_ok=True)
    unwrapped.export(str(prepared_path))

    return {
        "preparedMeshPath": str(prepared_path),
        "inputFaceCount": int(len(source.faces)),
        "outputFaceCount": int(len(unwrapped.faces)),
        "inputVertexCount": int(len(source.vertices)),
        "outputVertexCount": int(len(unwrapped.vertices)),
        "decimationMethod": decimation_method,
        "unwrap": unwrap_meta,
    }


def build_final_texture_output(
    prepared_mesh_path: str,
    output_glb_path: str,
    maps_dir: Path,
    reference_images: list[str],
    atlas_size: int,
    hunyuan_textured_glb_path: str | None,
    allow_mesh_only_fallback: bool,
) -> dict[str, Any]:
    prepared = Path(prepared_mesh_path).expanduser().resolve()
    if not prepared.is_file():
        raise FileNotFoundError(f"Prepared mesh not found: {prepared}")

    preferred_albedo = None
    if hunyuan_textured_glb_path:
        preferred_albedo = extract_albedo_image_from_glb(hunyuan_textured_glb_path)

    # If there is no valid image source and mesh-only fallback is enabled, keep mesh output.
    has_reference = any(Path(item).expanduser().resolve().is_file() for item in reference_images)
    has_hunyuan_texture = preferred_albedo is not None
    if not has_reference and not has_hunyuan_texture and allow_mesh_only_fallback:
        output_path = Path(output_glb_path).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(prepared.read_bytes())
        return {
            "texturedGlbPath": str(output_path),
            "textureStatus": "mesh_only",
            "textureMaps": None,
            "message": "Texture sources unavailable. Returned mesh-only GLB.",
        }

    maps = bake_texture_maps(
        output_dir=maps_dir,
        atlas_size=int(atlas_size),
        reference_images=reference_images,
        preferred_albedo=preferred_albedo,
    )

    mesh = load_mesh(str(prepared))
    textured_path = export_textured_glb(
        mesh=mesh,
        map_paths=maps,
        output_glb_path=output_glb_path,
    )
    return {
        "texturedGlbPath": textured_path,
        "textureStatus": "ready",
        "textureMaps": maps,
    }


def write_texture_metadata(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
