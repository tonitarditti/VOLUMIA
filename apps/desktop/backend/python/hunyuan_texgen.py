import argparse
import inspect
import json
import os
import shutil
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, Optional


DEFAULT_MODEL_ID = "tencent/Hunyuan3D-2"
DEFAULT_MODEL_SUBFOLDER = "hunyuan3d-paint-v2-0-turbo"
DEFAULT_LOCAL_MODEL_ROOTS = [
    r"E:\AI\Hunyuan3D-2",
]


def log_line(message: str) -> None:
    print(f"[hunyuan_texgen] {message}", flush=True)


def ensure_dir(dir_path: str) -> None:
    os.makedirs(dir_path, exist_ok=True)


def write_metadata(metadata_path: str, payload: Dict[str, Any]) -> None:
    ensure_dir(os.path.dirname(metadata_path))
    with open(metadata_path, "w", encoding="utf-8") as file:
        file.write(json.dumps(payload, indent=2, ensure_ascii=False))
        file.write("\n")


def resolve_output_paths(output_dir: str) -> Dict[str, str]:
    output_dir_abs = os.path.abspath(output_dir)
    return {
        "output_dir": output_dir_abs,
        "textured_glb_path": os.path.join(output_dir_abs, "textured.glb"),
        "metadata_path": os.path.join(output_dir_abs, "texture-metadata.json"),
    }


def prepend_module_roots() -> None:
    roots = []
    env_root = os.environ.get("HY3DGEN_ROOT", "").strip()
    if env_root:
        roots.append(env_root)
    roots.extend(DEFAULT_LOCAL_MODEL_ROOTS)
    for root in roots:
        if not root:
            continue
        root_abs = os.path.abspath(root)
        if os.path.isdir(root_abs) and root_abs not in sys.path:
            sys.path.insert(0, root_abs)
        texgen_abs = os.path.join(root_abs, "hy3dgen", "texgen")
        if os.path.isdir(texgen_abs) and texgen_abs not in sys.path:
            sys.path.insert(0, texgen_abs)


def resolve_model_subfolder() -> str:
    value = os.environ.get("HUNYUAN_TEXGEN_SUBFOLDER", "").strip()
    return value if value else DEFAULT_MODEL_SUBFOLDER


def resolve_path(raw_path: str) -> Path:
    return Path(raw_path).expanduser().resolve()


def build_model_root_candidates() -> list[str]:
    candidates: list[str] = []
    env_model = os.environ.get("HUNYUAN_TEXGEN_MODEL_PATH", "").strip()
    if env_model:
        candidates.append(env_model)

    hy3dgen_models = os.environ.get("HY3DGEN_MODELS", "").strip()
    if hy3dgen_models:
        candidates.append(str(Path(hy3dgen_models).expanduser() / DEFAULT_MODEL_ID))

    hf_snapshots = (
        Path.home()
        / ".cache"
        / "huggingface"
        / "hub"
        / "models--tencent--Hunyuan3D-2"
        / "snapshots"
    )
    if hf_snapshots.is_dir():
        for snapshot in sorted(hf_snapshots.iterdir(), reverse=True):
            if snapshot.is_dir():
                candidates.append(str(snapshot))

    candidates.extend(DEFAULT_LOCAL_MODEL_ROOTS)

    unique: list[str] = []
    seen = set()
    for item in candidates:
        normalized = item.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique.append(normalized)
    return unique


def resolve_local_model_root(model_subfolder: str) -> Path:
    checked_paths: list[str] = []
    for raw_candidate in build_model_root_candidates():
        candidate = resolve_path(raw_candidate)

        root_candidate = candidate
        if candidate.name in ("hunyuan3d-delight-v2-0", model_subfolder):
            root_candidate = candidate.parent.resolve()

        if not root_candidate.is_dir():
            checked_paths.append(f"{root_candidate} (not found)")
            continue

        delight_dir = (root_candidate / "hunyuan3d-delight-v2-0").resolve()
        paint_dir = (root_candidate / model_subfolder).resolve()
        missing: list[str] = []
        if not delight_dir.is_dir():
            missing.append(str(delight_dir))
        if not paint_dir.is_dir():
            missing.append(str(paint_dir))
        if not missing:
            return root_candidate

        checked_paths.append(
            f"{root_candidate} (missing: {', '.join(missing)})"
        )

    checked = " | ".join(checked_paths) if checked_paths else "no candidates"
    raise RuntimeError(
        "No local paint model root found. "
        "Set HUNYUAN_TEXGEN_MODEL_PATH to a folder containing "
        "'hunyuan3d-delight-v2-0' and the paint subfolder. "
        f"Checked: {checked}"
    )


def export_result_mesh(result_mesh: Any, output_glb_path: str) -> None:
    if hasattr(result_mesh, "export"):
        result_mesh.export(output_glb_path)
        return
    if isinstance(result_mesh, str) and os.path.isfile(result_mesh):
        if os.path.abspath(result_mesh) != os.path.abspath(output_glb_path):
            shutil.copyfile(result_mesh, output_glb_path)
        return
    raise RuntimeError(
        f"Unsupported texgen output type for export: {type(result_mesh)!r}"
    )


def run_texgen(image_path: str, mesh_path: str, output_glb_path: str) -> Dict[str, str]:
    prepend_module_roots()

    import torch  # noqa: WPS433

    from hy3dgen.texgen.differentiable_renderer import (  # noqa: F401,WPS433
        mesh_processor,
        mesh_render,
    )
    import custom_rasterizer_kernel  # noqa: F401,WPS433
    from hy3dgen.texgen import Hunyuan3DPaintPipeline  # noqa: WPS433
    from PIL import Image  # noqa: WPS433
    import trimesh  # noqa: WPS433
    log_line("paint pipeline import OK")

    model_subfolder = resolve_model_subfolder()
    model_path = resolve_local_model_root(model_subfolder)
    log_line(f"paint model path: {model_path}")

    from_pretrained_signature = inspect.signature(
        Hunyuan3DPaintPipeline.from_pretrained
    )
    supports_local_files_only = (
        "local_files_only" in from_pretrained_signature.parameters
    )
    local_files_only_used = supports_local_files_only
    log_line(
        "local_files_only usado: "
        + ("yes" if local_files_only_used else "no")
    )

    loader_kwargs: Dict[str, Any] = {"subfolder": model_subfolder}
    if local_files_only_used:
        loader_kwargs["local_files_only"] = True

    try:
        pipeline = Hunyuan3DPaintPipeline.from_pretrained(
            str(model_path),
            **loader_kwargs,
        )
    except TypeError:
        if not local_files_only_used:
            raise
        local_files_only_used = False
        log_line("local_files_only usado: no (unsupported by paint pipeline)")
        pipeline = Hunyuan3DPaintPipeline.from_pretrained(
            str(model_path),
            subfolder=model_subfolder,
        )

    log_line("paint pipeline init OK")
    if os.environ.get("HUNYUAN_TEXGEN_CPU_OFFLOAD", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        pipeline.enable_model_cpu_offload()

    log_line("texgen started")
    mesh = trimesh.load(mesh_path, force="mesh")
    image = Image.open(image_path).convert("RGBA")
    textured_mesh = pipeline(mesh, image=image)
    export_result_mesh(textured_mesh, output_glb_path)
    log_line("texgen completed")

    return {
        "model_path": str(model_path),
        "model_subfolder": model_subfolder,
        "local_files_only_used": "yes" if local_files_only_used else "no",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Texture a generated shape GLB using Hunyuan texgen.",
    )
    parser.add_argument("--image", required=True, help="Reference image path")
    parser.add_argument("--mesh", required=True, help="Input shape mesh GLB path")
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Output directory where textured.glb and metadata are written",
    )
    return parser.parse_args()


def build_result_payload(
    shape_glb_path: str,
    textured_glb_path: Optional[str],
    texture_status: str,
    error: Optional[str],
) -> Dict[str, Any]:
    return {
        "texture_status": texture_status,
        "shape_glb_path": os.path.abspath(shape_glb_path),
        "textured_glb_path": os.path.abspath(textured_glb_path)
        if textured_glb_path
        else None,
        "error": error,
    }


def main() -> int:
    args = parse_args()
    output_paths = resolve_output_paths(args.output_dir)
    ensure_dir(output_paths["output_dir"])
    shape_glb_path = os.path.abspath(args.mesh)
    image_path = os.path.abspath(args.image)
    textured_glb_path = output_paths["textured_glb_path"]
    metadata_path = output_paths["metadata_path"]

    result = build_result_payload(
        shape_glb_path=shape_glb_path,
        textured_glb_path=None,
        texture_status="failed",
        error=None,
    )

    try:
        if not os.path.isfile(shape_glb_path):
            raise RuntimeError(f"Shape GLB not found: {shape_glb_path}")
        if not os.path.isfile(image_path):
            raise RuntimeError(f"Input image not found: {image_path}")

        details = run_texgen(
            image_path=image_path,
            mesh_path=shape_glb_path,
            output_glb_path=textured_glb_path,
        )

        if (
            not os.path.isfile(textured_glb_path)
            or os.path.getsize(textured_glb_path) <= 0
        ):
            raise RuntimeError(
                "Texgen completed without producing a valid textured GLB."
            )

        result = build_result_payload(
            shape_glb_path=shape_glb_path,
            textured_glb_path=textured_glb_path,
            texture_status="completed",
            error=None,
        )
        result["model_path"] = details["model_path"]
        result["model_subfolder"] = details["model_subfolder"]
        result["local_files_only_used"] = details["local_files_only_used"]
        write_metadata(metadata_path, result)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001
        result["texture_status"] = "failed"
        result["textured_glb_path"] = None
        result["error"] = str(exc)
        result["traceback"] = traceback.format_exc()
        write_metadata(metadata_path, result)
        print(json.dumps(result, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
