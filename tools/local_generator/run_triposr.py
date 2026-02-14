#!/usr/bin/env python3
import argparse
import inspect
import json
import os
import shutil
import sys
import traceback
from typing import Any, Dict, Optional


def emit(stage: str, percent: int, message: str) -> None:
    print(json.dumps({"stage": stage, "percent": percent, "message": message}), flush=True)


def ensure_output_path(path: str) -> str:
    absolute_path = os.path.abspath(path)
    parent = os.path.dirname(absolute_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    return absolute_path


def resolve_device(requested: str) -> str:
    if requested == "cpu":
        return "cpu"

    try:
        import torch  # type: ignore

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


PRESET_CONFIG: Dict[str, Dict[str, int]] = {
    "fast": {
        "steps": 20,
        "resolution": 256,
        "chunk_size": 16384,
        "smooth_iterations": 5,
        "refine_passes": 1,
    },
    "balanced": {
        "steps": 40,
        "resolution": 384,
        "chunk_size": 8192,
        "smooth_iterations": 10,
        "refine_passes": 2,
    },
    "quality": {
        "steps": 60,
        "resolution": 512,
        "chunk_size": 4096,
        "smooth_iterations": 20,
        "refine_passes": 3,
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


def maybe_simplify(mesh: Any) -> Any:
    if len(mesh.faces) <= 200_000:
        return mesh
    if not hasattr(mesh, "simplify_quadratic_decimation"):
        return mesh
    try:
        simplified = mesh.simplify_quadratic_decimation(200_000)
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


def resolve_template_glb() -> Optional[str]:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(script_dir, "..", "..", "apps", "desktop", "assets", "templates", "box.glb"),
        os.path.join(os.getcwd(), "apps", "desktop", "assets", "templates", "box.glb"),
    ]
    for candidate in candidates:
        absolute = os.path.abspath(candidate)
        if os.path.exists(absolute):
            return absolute
    return None


def validate_glb(out_glb: str, trimesh: Any) -> None:
    if not os.path.exists(out_glb):
        raise RuntimeError("GLB was not created.")

    size = os.path.getsize(out_glb)
    if size < 10_000:
        raise RuntimeError(f"Generated GLB is too small: {size} bytes")

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
        template_glb = resolve_template_glb()
        if not template_glb:
            raise RuntimeError(
                f"Primary GLB export failed and template fallback was not found: {export_error}"
            ) from export_error

        shutil.copyfile(template_glb, out_glb)
        validate_glb(out_glb, trimesh)
        return True, f"Primary export failed; fallback template used: {template_glb}"


def run_triposr(image_path: str, out_glb: str, preset: str, requested_device: str) -> None:
    emit("preprocess", 10, "Loading image")

    if not os.path.exists(image_path):
        raise RuntimeError(f"Input image not found: {image_path}")

    try:
        import torch  # type: ignore
        from PIL import Image  # type: ignore
        import trimesh  # type: ignore
        import trimesh.smoothing as smoothing  # type: ignore
        from tsr.system import TSR  # type: ignore
        from tsr.utils import remove_background, resize_foreground  # type: ignore
    except Exception as error:
        raise RuntimeError(
            "TripoSR dependencies are not installed. Install torch, pillow and triposr runtime first."
        ) from error

    image = Image.open(image_path).convert("RGB")
    image = remove_background(image)
    image = resize_foreground(image, 0.85)

    device = resolve_device(requested_device)
    preset_config = PRESET_CONFIG[preset]

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

        try:
            meshes = model.extract_mesh(scene_codes, **extract_kwargs)
        except TypeError:
            try:
                meshes = model.extract_mesh(scene_codes, resolution=preset_config["resolution"])
            except TypeError:
                meshes = model.extract_mesh(scene_codes)

    if not meshes:
        raise RuntimeError("TripoSR did not return any mesh.")

    mesh = mesh_from_output(meshes[0], trimesh)

    emit("mesh_cleanup", 80, "Cleaning and smoothing mesh")
    mesh.remove_degenerate_faces()
    mesh.remove_unreferenced_vertices()
    mesh.rezero()
    mesh.fix_normals()
    processed = mesh.process(validate=True)
    if isinstance(processed, trimesh.Trimesh):
        mesh = processed

    smoothing.filter_laplacian(mesh, lamb=0.5, iterations=preset_config["smooth_iterations"])
    for _ in range(max(0, preset_config["refine_passes"] - 1)):
        mesh.remove_degenerate_faces()
        mesh.remove_unreferenced_vertices()
        mesh.fix_normals()
        mesh.process(validate=True)

    mesh = maybe_simplify(mesh)

    emit("base_close", 88, "Checking mesh boundaries")
    mesh, base_message = close_base_if_needed(mesh, trimesh)
    mesh.remove_degenerate_faces()
    mesh.remove_unreferenced_vertices()
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
    parser.add_argument("--preset", choices=["fast", "balanced", "quality"], default="balanced")
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
