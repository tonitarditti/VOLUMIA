#!/usr/bin/env python3
import argparse
import importlib
import inspect
import json
import os
import sys
import traceback
import types
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple


def emit(stage: str, percent: int, message: str) -> None:
    print(json.dumps({"stage": stage, "percent": percent, "message": message}), flush=True)


def cleanup_degenerate(mesh):
    """Compatibility cleanup for trimesh versions without remove_degenerate_faces()."""
    # Always use nondegenerate_faces() for trimesh 4.x compatibility.
    try:
        mask = mesh.nondegenerate_faces()
        if mask is not None:
            mesh.update_faces(mask)
    except Exception:
        pass  # optional cleanup

    # Remove unreferenced vertices (this exists on trimesh 4.x)
    try:
        mesh.remove_unreferenced_vertices()
    except Exception:
        pass


def ensure_output_path(path: str) -> str:
    absolute_path = os.path.abspath(path)
    parent = os.path.dirname(absolute_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    return absolute_path


def build_dependency_install_command(missing_packages: List[str]) -> str:
    ordered = sorted(set(missing_packages), key=lambda item: item.lower())
    return "pip install -U " + " ".join(ordered)


def resolve_triposr_repo_root() -> Optional[str]:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    user_home = os.path.expanduser("~")
    env_root = (os.environ.get("VOLUMIA_TRIPOSR_ROOT") or "").strip()
    candidates = [
        env_root,
        os.path.join(script_dir, "..", "TripoSR"),
        os.path.join(os.getcwd(), "tools", "TripoSR"),
        os.path.join(user_home, "TripoSR"),
        r"C:\Users\Usuario\TripoSR",
    ]
    for candidate in candidates:
        if not candidate:
            continue
        absolute = os.path.abspath(candidate)
        marker = os.path.join(absolute, "tsr", "system.py")
        if os.path.exists(marker):
            return absolute
    return None


def import_triposr_runtime() -> Tuple[Any, str]:
    repo_root = resolve_triposr_repo_root()
    if repo_root:
        normalized_root = os.path.normcase(os.path.abspath(repo_root))
        current_paths = {os.path.normcase(os.path.abspath(item)) for item in sys.path if isinstance(item, str)}
        if normalized_root not in current_paths:
            sys.path.insert(0, os.path.abspath(repo_root))
    try:
        from tsr.system import TSR  # type: ignore
    except Exception as error:
        install_cmd = build_dependency_install_command(["einops", "omegaconf", "pillow", "PyMCubes"])
        raise RuntimeError(
            "TripoSR not available. Missing tsr runtime. "
            "Use conda env 'volumia' and install deps with: "
            f"{install_cmd} ; pip install git+https://github.com/VAST-AI-Research/TripoSR.git"
        ) from error

    if repo_root:
        return TSR, f"repo:{os.path.abspath(repo_root)}"

    tsr_module = sys.modules.get("tsr")
    tsr_source = getattr(tsr_module, "__file__", "")
    source_text = tsr_source if isinstance(tsr_source, str) and tsr_source else "python-path"
    return TSR, f"python:{source_text}"


def resolve_device(requested: str) -> str:
    if requested == "cpu":
        return "cpu"

    try:
        import torch  # type: ignore

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def install_torchmcubes_compat_shim() -> None:
    try:
        import torchmcubes  # type: ignore  # noqa: F401

        return
    except Exception:
        pass

    try:
        import mcubes  # type: ignore
        import numpy as np  # type: ignore
        import torch  # type: ignore
    except Exception as error:
        raise RuntimeError(
            "PyMCubes is required when torchmcubes is unavailable. Install with: pip install PyMCubes"
        ) from error

    shim_module = types.ModuleType("torchmcubes")

    def marching_cubes(volume: Any, level: Any):  # type: ignore[no-untyped-def]
        if not torch.is_tensor(volume):
            raise TypeError("torchmcubes shim expected a torch.Tensor volume")

        volume_np = volume.detach().float().cpu().numpy()
        iso_level = float(level.detach().item()) if torch.is_tensor(level) else float(level)
        vertices_np, faces_np = mcubes.marching_cubes(volume_np, iso_level)

        vertices_arr = np.asarray(vertices_np, dtype=np.float32)
        faces_arr = np.asarray(faces_np, dtype=np.int64)
        vertex_dtype = volume.dtype if getattr(volume, "is_floating_point", lambda: False)() else torch.float32

        vertices = torch.from_numpy(vertices_arr).to(device=volume.device, dtype=vertex_dtype)
        faces = torch.from_numpy(faces_arr).to(device=volume.device, dtype=torch.int64)
        return vertices, faces

    shim_module.marching_cubes = marching_cubes  # type: ignore[attr-defined]
    sys.modules["torchmcubes"] = shim_module


PRESET_CONFIG: Dict[str, Dict[str, int]] = {
    "fast": {
        "steps": 20,
        "resolution": 256,
        "input_size": 512,
        "chunk_size": 16384,
        "smooth_iterations": 5,
        "refine_passes": 1,
        "simplify_target": 180000,
    },
    "balanced": {
        "steps": 40,
        "resolution": 384,
        "input_size": 768,
        "chunk_size": 8192,
        "smooth_iterations": 10,
        "refine_passes": 2,
        "simplify_target": 200000,
    },
    "quality": {
        "steps": 60,
        "resolution": 512,
        "input_size": 1024,
        "chunk_size": 4096,
        "smooth_iterations": 20,
        "refine_passes": 3,
        "simplify_target": 220000,
    },
    "hard_surface_quick": {
        "steps": 18,
        "resolution": 224,
        "input_size": 512,
        "chunk_size": 16384,
        "smooth_iterations": 1,
        "refine_passes": 1,
        "simplify_target": 160000,
    },
    "organic_quick": {
        "steps": 20,
        "resolution": 224,
        "input_size": 512,
        "chunk_size": 16384,
        "smooth_iterations": 6,
        "refine_passes": 2,
        "simplify_target": 220000,
    },
    "hard_surface": {
        "steps": 58,
        "resolution": 512,
        "input_size": 1024,
        "chunk_size": 4096,
        "smooth_iterations": 3,
        "refine_passes": 1,
        "simplify_target": 160000,
    },
    "organic": {
        "steps": 64,
        "resolution": 512,
        "input_size": 1024,
        "chunk_size": 4096,
        "smooth_iterations": 18,
        "refine_passes": 4,
        "simplify_target": 260000,
    },
}

STEP_PARAM_NAMES = (
    "steps",
    "num_steps",
    "n_steps",
    "sampling_steps",
    "num_inference_steps",
)
RESOLUTION_PARAM_NAMES = (
    "resolution",
    "mc_resolution",
    "mesh_resolution",
    "grid_resolution",
)


def preflight_runtime_dependencies() -> None:
    print(f"[PREFLIGHT] PYTHON={sys.executable}", flush=True)
    requirements = [
        ("torch", "torch"),
        ("PIL", "pillow"),
        ("trimesh", "trimesh"),
        ("mcubes", "PyMCubes"),
        ("einops", "einops"),
        ("omegaconf", "omegaconf"),
    ]
    missing: list[tuple[str, str]] = []
    for module_name, package_name in requirements:
        try:
            importlib.import_module(module_name)
        except Exception:
            missing.append((module_name, package_name))

    if missing:
        missing_text = ", ".join(f"{module_name} ({package_name})" for module_name, package_name in missing)
        print(f"[PREFLIGHT] MISSING={missing_text}", flush=True)
        install_cmd = build_dependency_install_command([package_name for _, package_name in missing])
        raise RuntimeError(
            f"Missing dependencies: {missing_text}. "
            "Activate conda env 'volumia' and run: "
            f"{install_cmd}"
        )

    print("[PREFLIGHT] MISSING=none", flush=True)


def pick_supported_kwarg(func: Any, names: tuple[str, ...], value: Any) -> Dict[str, Any]:
    try:
        signature = inspect.signature(func)
    except Exception:
        return {}

    for name in names:
        if name in signature.parameters:
            return {name: value}
    return {}


def mesh_from_output(mesh_or_scene: Any, trimesh: Any) -> Any:
    if isinstance(mesh_or_scene, trimesh.Trimesh):
        return mesh_or_scene

    if isinstance(mesh_or_scene, trimesh.Scene):
        geometries = [g for g in mesh_or_scene.geometry.values() if isinstance(g, trimesh.Trimesh)]
        if not geometries:
            raise RuntimeError("TripoSR returned an empty scene.")
        return trimesh.util.concatenate(geometries)

    raise RuntimeError(f"Unsupported mesh output type: {type(mesh_or_scene)!r}")


def maybe_simplify(mesh: Any, target_faces: int) -> Any:
    if len(mesh.faces) <= int(target_faces):
        return mesh
    if not hasattr(mesh, "simplify_quadratic_decimation"):
        return mesh
    try:
        simplified = mesh.simplify_quadratic_decimation(int(target_faces))
        if simplified is not None and len(simplified.faces) > 0:
            return simplified
    except Exception:
        pass
    return mesh


def detect_up_axis(mesh: Any) -> int:
    requested = os.environ.get("VOLUMIA_UP_AXIS", "").strip().lower()
    if requested == "z":
        return 2
    if requested == "y":
        return 1

    extents = getattr(mesh, "extents", None)
    if extents is None or len(extents) < 3:
        return 1
    return 2 if float(extents[2]) > float(extents[1]) * 1.15 else 1


def create_base_cap(mesh: Any, axis: int, trimesh: Any) -> Optional[Any]:
    bounds = getattr(mesh, "bounds", None)
    if bounds is None:
        return None

    mins = bounds[0]
    maxs = bounds[1]
    extents = [float(maxs[i] - mins[i]) for i in range(3)]
    if extents[axis] <= 0.0:
        return None
    for i in range(3):
        if i != axis and extents[i] <= 0.0:
            return None

    thickness = max(extents[axis] * 0.01, 1e-4)
    cap_extents = extents[:]
    cap_extents[axis] = thickness

    center = [(float(mins[i]) + float(maxs[i])) * 0.5 for i in range(3)]
    center[axis] = float(mins[axis]) + thickness * 0.5
    transform = trimesh.transformations.translation_matrix(center)
    return trimesh.creation.box(extents=cap_extents, transform=transform)


def close_base_if_needed(mesh: Any, trimesh: Any) -> tuple[Any, str]:
    has_open_boundary = not bool(getattr(mesh, "is_watertight", False))
    if not has_open_boundary:
        return mesh, "Mesh already watertight; base closing skipped."

    axis = detect_up_axis(mesh)
    axis_name = "Y" if axis == 1 else "Z"
    base_cap = create_base_cap(mesh, axis, trimesh)
    if base_cap is None:
        return mesh, "Base closing skipped: could not build cap from mesh bounds."

    # Boolean union can be brittle across environments; safe concatenate keeps runtime predictable.
    combined = trimesh.util.concatenate([mesh, base_cap])
    return combined, f"Base cap added on min{axis_name} using safe mesh concatenate."


def validate_glb(out_glb: str, trimesh: Any) -> None:
    min_valid_glb_bytes = int(os.environ.get("VOLUMIA_MIN_VALID_GLB_BYTES", str(100 * 1024)))
    if not os.path.exists(out_glb):
        raise RuntimeError("GLB was not created.")

    size = os.path.getsize(out_glb)
    if size < min_valid_glb_bytes:
        raise RuntimeError(f"Generated GLB is too small (< {min_valid_glb_bytes} bytes): {size} bytes")

    try:
        loaded = trimesh.load(out_glb, file_type="glb", force="scene")
    except Exception as error:
        raise RuntimeError(f"Generated GLB failed to load: {error}") from error
    if loaded is None:
        raise RuntimeError("Generated GLB is invalid: load returned no scene.")


def export_glb_with_fallback(mesh: Any, out_glb: str, trimesh: Any) -> tuple[bool, str]:
    try:
        mesh.export(out_glb)
        validate_glb(out_glb, trimesh)
        return False, "Primary GLB export validated."
    except Exception as export_error:
        raise RuntimeError(f"Primary GLB export failed: {export_error}") from export_error


def _get_lanczos_resample(pil_image_module: Any) -> Any:
    if hasattr(pil_image_module, "Resampling"):
        return pil_image_module.Resampling.LANCZOS
    return pil_image_module.LANCZOS


def _load_rembg_result_as_rgba(result: Any, pil_image_module: Any) -> Any:
    if isinstance(result, bytes):
        return pil_image_module.open(BytesIO(result)).convert("RGBA")
    if hasattr(result, "read"):
        return pil_image_module.open(result).convert("RGBA")
    if hasattr(result, "mode") and hasattr(result, "size"):
        return result.convert("RGBA")
    raise RuntimeError("Unsupported rembg output type")


def preprocess_image_for_inference(
    image_path: str,
    out_glb: str,
    preset: str,
    pil_image_module: Any,
) -> str:
    emit("preprocess", 5, "Loading image")
    original_image = pil_image_module.open(image_path).convert("RGB")
    working_rgba = original_image.convert("RGBA")

    emit("bg_remove", 15, "Removing background")
    try:
        from rembg import remove as rembg_remove  # type: ignore

        source_buffer = BytesIO()
        original_image.save(source_buffer, format="PNG")
        rembg_result = rembg_remove(source_buffer.getvalue())
        working_rgba = _load_rembg_result_as_rgba(rembg_result, pil_image_module)
        emit("bg_remove", 20, "Background removal complete")
    except Exception as error:
        working_rgba = original_image.convert("RGBA")
        emit("bg_remove", 20, f"Background removal unavailable, using original image ({error.__class__.__name__})")

    emit("crop", 25, "Cropping subject")
    cropped_rgba = working_rgba
    try:
        alpha = working_rgba.getchannel("A")
        alpha_extrema = alpha.getextrema()
        has_alpha_mask = bool(alpha_extrema) and alpha_extrema[0] < 255
        if has_alpha_mask:
            bbox = alpha.getbbox()
            if bbox:
                left, top, right, bottom = bbox
                width, height = working_rgba.size
                pad_x = max(1, int((right - left) * 0.12))
                pad_y = max(1, int((bottom - top) * 0.12))
                crop_box = (
                    max(0, left - pad_x),
                    max(0, top - pad_y),
                    min(width, right + pad_x),
                    min(height, bottom + pad_y),
                )
                cropped_rgba = working_rgba.crop(crop_box)
                emit("crop", 30, f"Cropped to subject bounds ({cropped_rgba.width}x{cropped_rgba.height})")
            else:
                emit("crop", 30, "Subject mask empty; crop skipped")
        else:
            emit("crop", 30, "No alpha mask detected; crop skipped")
    except Exception as error:
        cropped_rgba = working_rgba
        emit("crop", 30, f"Crop failed; using uncropped image ({error.__class__.__name__})")

    emit("normalize", 35, "Resizing and padding")
    target_size = int(PRESET_CONFIG[preset]["input_size"])
    target_size = max(64, target_size)

    resample = _get_lanczos_resample(pil_image_module)
    source_width, source_height = cropped_rgba.size
    if source_width <= 0 or source_height <= 0:
        source_width, source_height = original_image.size
        cropped_rgba = original_image.convert("RGBA")

    scale = min(target_size / float(source_width), target_size / float(source_height))
    resized_w = max(1, int(round(source_width * scale)))
    resized_h = max(1, int(round(source_height * scale)))
    resized_rgba = cropped_rgba.resize((resized_w, resized_h), resample=resample)

    neutral_bg = (242, 240, 234)
    normalized = pil_image_module.new("RGB", (target_size, target_size), neutral_bg)
    paste_x = (target_size - resized_w) // 2
    paste_y = (target_size - resized_h) // 2
    normalized.paste(resized_rgba, (paste_x, paste_y), resized_rgba)

    preprocessed_path = os.path.join(os.path.dirname(out_glb), "preprocessed.png")
    normalized.save(preprocessed_path, format="PNG")
    emit("normalize", 40, f"Preprocessed image ready: {preprocessed_path}")
    return preprocessed_path


def run_triposr(image_path: str, out_glb: str, preset: str, requested_device: str) -> None:
    if not os.path.exists(image_path):
        raise RuntimeError(f"Input image not found: {image_path}")

    preflight_runtime_dependencies()

    try:
        import torch  # type: ignore
        from PIL import Image  # type: ignore
        import trimesh  # type: ignore
        import trimesh.smoothing as smoothing  # type: ignore
        try:
            import mcubes  # type: ignore  # noqa: F401
        except Exception as error:
            raise RuntimeError("Missing dependency: PyMCubes (mcubes). Install: pip install PyMCubes") from error
        install_torchmcubes_compat_shim()
        TSR, triposr_source = import_triposr_runtime()
    except RuntimeError:
        raise
    except Exception as error:
        install_cmd = build_dependency_install_command(["einops", "omegaconf", "pillow", "PyMCubes"])
        raise RuntimeError(
            "TripoSR dependencies are not installed. "
            "Activate conda env 'volumia' and run: "
            f"{install_cmd} ; pip install git+https://github.com/VAST-AI-Research/TripoSR.git"
        ) from error

    try:
        preprocessed_image_path = preprocess_image_for_inference(image_path, out_glb, preset, Image)
    except Exception as error:
        preprocessed_image_path = image_path
        emit("preprocess", 40, f"Preprocess failed; using original image ({error.__class__.__name__})")

    image = Image.open(preprocessed_image_path).convert("RGB")

    device = resolve_device(requested_device)
    preset_config = PRESET_CONFIG[preset]
    emit("infer", 42, f"TripoSR available ({triposr_source})")
    print(f"[TRIPOSR] available source={triposr_source}", flush=True)

    emit("infer", 45, f"Loading TripoSR model on {device}")
    model = TSR.from_pretrained(
        "stabilityai/TripoSR",
        config_name="config.yaml",
        weight_name="model.ckpt",
    )
    model.to(device)

    if hasattr(model, "renderer") and hasattr(model.renderer, "set_chunk_size"):
        model.renderer.set_chunk_size(preset_config["chunk_size"])

    infer_kwargs = pick_supported_kwarg(model.__call__, STEP_PARAM_NAMES, preset_config["steps"])
    extract_kwargs = pick_supported_kwarg(model.extract_mesh, RESOLUTION_PARAM_NAMES, preset_config["resolution"])
    if not extract_kwargs:
        extract_kwargs = {"resolution": preset_config["resolution"]}
    supports_vertex_color = False
    try:
        extract_signature = inspect.signature(model.extract_mesh)
        supports_vertex_color = "has_vertex_color" in extract_signature.parameters
    except Exception:
        supports_vertex_color = False

    emit(
        "infer",
        70,
        (
            f"Running local reconstruction "
            f"(preset={preset}, steps={preset_config['steps']}, res={preset_config['resolution']})"
        ),
    )
    with torch.no_grad():
        try:
            scene_codes = model([image], device=device, **infer_kwargs)
        except TypeError:
            scene_codes = model([image], device=device)

        extract_call_kwargs = dict(extract_kwargs)
        if supports_vertex_color:
            extract_call_kwargs["has_vertex_color"] = False
        try:
            meshes = model.extract_mesh(scene_codes, **extract_call_kwargs)
        except TypeError:
            fallback_kwargs = {"resolution": preset_config["resolution"]}
            if supports_vertex_color:
                fallback_kwargs["has_vertex_color"] = False
            try:
                meshes = model.extract_mesh(scene_codes, **fallback_kwargs)
            except TypeError:
                if supports_vertex_color:
                    meshes = model.extract_mesh(scene_codes, has_vertex_color=False)
                else:
                    meshes = model.extract_mesh(scene_codes)

    if not meshes:
        raise RuntimeError("TripoSR did not return any mesh.")

    mesh = mesh_from_output(meshes[0], trimesh)

    is_hard_surface_profile = preset.startswith("hard_surface")
    emit("mesh_cleanup", 80, "Cleaning and smoothing mesh")
    cleanup_degenerate(mesh)
    mesh.rezero()
    mesh.fix_normals()
    processed = mesh.process(validate=True)
    if isinstance(processed, trimesh.Trimesh):
        mesh = processed

    if is_hard_surface_profile:
        # Hard-surface profile: keep cleanup + normals, avoid rounding edges with aggressive smoothing.
        hard_iterations = min(1, int(preset_config["smooth_iterations"]))
        if hard_iterations > 0:
            smoothing.filter_laplacian(mesh, lamb=0.2, iterations=hard_iterations)
        cleanup_degenerate(mesh)
        mesh.fix_normals()
        mesh.process(validate=True)
        emit("mesh_cleanup", 83, "postprocess: hard-surface profile applied")
    else:
        smoothing.filter_laplacian(mesh, lamb=0.5, iterations=preset_config["smooth_iterations"])
        for _ in range(max(0, preset_config["refine_passes"] - 1)):
            cleanup_degenerate(mesh)
            mesh.fix_normals()
            mesh.process(validate=True)

    mesh = maybe_simplify(mesh, preset_config["simplify_target"])

    emit("base_close", 88, "Checking mesh boundaries")
    mesh, base_message = close_base_if_needed(mesh, trimesh)
    cleanup_degenerate(mesh)
    mesh.fix_normals()
    mesh.process(validate=True)
    emit("base_close", 91, base_message)

    emit("export", 94, "Exporting GLB")
    used_fallback, export_message = export_glb_with_fallback(mesh, out_glb, trimesh)
    emit("export", 98, export_message)
    if used_fallback:
        emit("export", 99, "Fallback export completed.")

    emit("done", 100, "Generation complete")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Local VOLUMIA TripoSR runner")
    parser.add_argument("--out_glb", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument(
        "--preset",
        choices=["fast", "balanced", "quality", "hard_surface", "organic", "hard_surface_quick", "organic_quick"],
        default="balanced",
    )
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cuda")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    out_glb = ensure_output_path(args.out_glb)

    try:
        run_triposr(args.image, out_glb, args.preset, args.device)
        return 0
    except Exception as error:
        emit("error", 0, str(error))
        print("[local_generator] generation failed", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
