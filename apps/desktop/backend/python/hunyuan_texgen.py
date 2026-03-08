import argparse
import inspect
import json
import os
import re
import shutil
import sys
import time
import traceback
from pathlib import Path
from typing import Any, Callable, Dict, Optional


DEFAULT_MODEL_ID = "tencent/Hunyuan3D-2"
DEFAULT_MODEL_SUBFOLDER = "hunyuan3d-paint-v2-0-turbo"
DEFAULT_LOCAL_MODEL_ROOTS = [
    r"E:\AI\Hunyuan3D_models",
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


def prepend_module_roots(repo_root: Optional[str] = None) -> None:
    roots: list[str] = []
    if repo_root:
        roots.append(repo_root)
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

    candidates.extend(DEFAULT_LOCAL_MODEL_ROOTS)

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

    unique: list[str] = []
    seen = set()
    for item in candidates:
        normalized = item.strip()
        if not normalized:
            continue
        norm_case = os.path.normcase(os.path.abspath(normalized))
        if norm_case in seen:
            continue
        seen.add(norm_case)
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


def resolve_custom_pipeline_file(paint_pipeline_cls: type[Any]) -> Optional[Path]:
    module = sys.modules.get(paint_pipeline_cls.__module__)
    module_file = getattr(module, "__file__", None)
    if not module_file:
        return None
    texgen_dir = Path(module_file).resolve().parent
    custom_pipeline_file = texgen_dir / "hunyuanpaint" / "pipeline.py"
    if custom_pipeline_file.is_file():
        return custom_pipeline_file
    return None


def resolve_expected_unet_module_path(
    custom_pipeline_file: Optional[Path],
    model_subfolder_dir: Path,
) -> Optional[str]:
    if custom_pipeline_file and custom_pipeline_file.is_file():
        source = custom_pipeline_file.read_text(encoding="utf-8", errors="ignore")
        match = re.search(
            r"from\s+\.unet\.(?P<module>[A-Za-z_][A-Za-z0-9_]*)\s+import\s+UNet2p5DConditionModel",
            source,
        )
        if match:
            return f"unet.{match.group('module')}"
        if re.search(
            r"from\s+\.modules\s+import\s+UNet2p5DConditionModel",
            source,
        ):
            return "modules"

    if (model_subfolder_dir / "unet" / "unet_modules.py").is_file():
        return "unet.unet_modules"
    if (model_subfolder_dir / "unet" / "modules.py").is_file():
        return "unet.modules"
    if (model_subfolder_dir / "modules.py").is_file():
        return "modules"
    return None


def inspect_model_index_unet_module(
    model_subfolder_dir: Path,
    expected_unet_module: Optional[str],
) -> Dict[str, Any]:
    details: Dict[str, Any] = {
        "expected_unet_module": expected_unet_module or "unknown",
        "configured_unet_module": "unknown",
        "model_index_patched": "no",
    }

    model_index_path = model_subfolder_dir / "model_index.json"
    if not model_index_path.is_file():
        return details

    payload = json.loads(model_index_path.read_text(encoding="utf-8"))
    unet_entry = payload.get("unet")
    if (
        not isinstance(unet_entry, list)
        or len(unet_entry) < 2
        or not isinstance(unet_entry[0], str)
    ):
        return details

    details["configured_unet_module"] = unet_entry[0]
    return details


def resolve_unet_module_source_file(custom_pipeline_dir: Path) -> Optional[Path]:
    candidates = [
        custom_pipeline_dir / "modules.py",
        custom_pipeline_dir / "unet" / "modules.py",
        custom_pipeline_dir / "unet" / "unet_modules.py",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def prepare_custom_pipeline_override(
    custom_pipeline_file: Optional[Path],
    patch_details: Dict[str, Any],
    output_glb_path: str,
) -> Optional[Path]:
    if not custom_pipeline_file or not custom_pipeline_file.is_file():
        return None

    configured_unet_module = patch_details.get("configured_unet_module")
    expected_unet_module = patch_details.get("expected_unet_module")
    if (
        not isinstance(configured_unet_module, str)
        or not isinstance(expected_unet_module, str)
        or configured_unet_module == "unknown"
        or expected_unet_module == "unknown"
        or configured_unet_module == expected_unet_module
    ):
        return None
    if configured_unet_module != "modules":
        return None

    source_dir = custom_pipeline_file.parent
    source = custom_pipeline_file.read_text(encoding="utf-8", errors="ignore")
    rewritten = re.sub(
        r"from\s+\.(?:unet\.[A-Za-z_][A-Za-z0-9_]*|modules)\s+import\s+UNet2p5DConditionModel",
        "from .modules import UNet2p5DConditionModel",
        source,
        count=1,
    )
    if rewritten == source:
        return None

    runtime_root = Path(output_glb_path).resolve().parent / "_texgen_runtime"
    override_dir = runtime_root / "hunyuanpaint"
    if runtime_root.exists():
        shutil.rmtree(runtime_root, ignore_errors=True)
    override_dir.mkdir(parents=True, exist_ok=True)

    init_source = source_dir / "__init__.py"
    if init_source.is_file():
        shutil.copyfile(init_source, override_dir / "__init__.py")
    else:
        (override_dir / "__init__.py").write_text("", encoding="utf-8")
    (override_dir / "pipeline.py").write_text(rewritten, encoding="utf-8")

    module_source = resolve_unet_module_source_file(source_dir)
    if not module_source:
        return None

    unet_dir = override_dir / "unet"
    unet_dir.mkdir(parents=True, exist_ok=True)
    (unet_dir / "__init__.py").write_text("", encoding="utf-8")
    shutil.copyfile(module_source, override_dir / "modules.py")
    shutil.copyfile(module_source, unet_dir / "modules.py")
    (unet_dir / "unet_modules.py").write_text(
        "from .modules import *\n",
        encoding="utf-8",
    )

    patch_details["model_index_patched"] = "override"
    log_line(
        "custom pipeline override enabled for unet module mismatch: "
        f"{expected_unet_module} -> {configured_unet_module}"
    )
    return override_dir


def apply_multiview_custom_pipeline_override(
    custom_pipeline_override_dir: Optional[Path],
) -> Optional[Callable[[], None]]:
    if not custom_pipeline_override_dir:
        return None

    import hy3dgen.texgen.utils.multiview_utils as multiview_utils  # noqa: WPS433

    original_file = getattr(multiview_utils, "__file__", None)
    runtime_utils_dir = custom_pipeline_override_dir.parent / "utils"
    runtime_utils_dir.mkdir(parents=True, exist_ok=True)
    multiview_utils.__file__ = str((runtime_utils_dir / "multiview_utils.py").resolve())
    log_line(f"multiview custom pipeline path: {custom_pipeline_override_dir}")

    def restore() -> None:
        if original_file is not None:
            multiview_utils.__file__ = original_file
        log_line("multiview custom pipeline override disabled")

    return restore


def resolve_pipeline_unet_class_name(paint_pipeline: Any) -> str:
    try:
        multiview_pipeline = paint_pipeline.models["multiview_model"].pipeline
        unet = multiview_pipeline.unet
    except Exception as exc:  # noqa: BLE001
        return f"unavailable ({exc})"
    return f"{unet.__class__.__module__}.{unet.__class__.__name__}"


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


def run_texgen(
    image_path: str,
    mesh_path: str,
    output_glb_path: str,
    timeout_ms: int,
    repo_root: Optional[str],
) -> Dict[str, Any]:
    env_model_path = os.environ.get("HUNYUAN_TEXGEN_MODEL_PATH", "").strip()
    log_line(f"env model path: {env_model_path or '<empty>'}")
    if not env_model_path:
        os.environ["HUNYUAN_TEXGEN_MODEL_PATH"] = DEFAULT_LOCAL_MODEL_ROOTS[0]
        log_line(
            "env model path defaulted to "
            f"{os.environ['HUNYUAN_TEXGEN_MODEL_PATH']}"
        )

    prepend_module_roots(repo_root)

    if not os.environ.get("KMP_DUPLICATE_LIB_OK", "").strip():
        os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
        log_line("KMP_DUPLICATE_LIB_OK set to TRUE (workaround)")

    import torch  # noqa: WPS433
    import custom_rasterizer_kernel  # noqa: F401,WPS433
    from hy3dgen.texgen.differentiable_renderer import (  # noqa: F401,WPS433
        mesh_processor,
        mesh_render,
    )
    from hy3dgen.texgen import (  # noqa: WPS433
        Hunyuan3DPaintPipeline,
        Hunyuan3DTexGenConfig,
    )
    from PIL import Image  # noqa: WPS433
    import trimesh  # noqa: WPS433

    _ = Hunyuan3DTexGenConfig
    pipeline_class = (
        f"{Hunyuan3DPaintPipeline.__module__}.{Hunyuan3DPaintPipeline.__name__}"
    )
    log_line("paint pipeline import OK")
    log_line(f"paint pipeline class: {pipeline_class}")

    model_subfolder = resolve_model_subfolder()
    model_root = resolve_local_model_root(model_subfolder)
    log_line(f"resolved model path: {model_root}")

    model_subfolder_dir = (model_root / model_subfolder).resolve()
    custom_pipeline_file = resolve_custom_pipeline_file(Hunyuan3DPaintPipeline)
    expected_unet_module = resolve_expected_unet_module_path(
        custom_pipeline_file=custom_pipeline_file,
        model_subfolder_dir=model_subfolder_dir,
    )
    patch_details = inspect_model_index_unet_module(
        model_subfolder_dir=model_subfolder_dir,
        expected_unet_module=expected_unet_module,
    )

    if custom_pipeline_file:
        log_line(f"paint custom pipeline file: {custom_pipeline_file}")
    if expected_unet_module:
        log_line(f"expected unet module: {expected_unet_module}")

    custom_pipeline_override_dir = prepare_custom_pipeline_override(
        custom_pipeline_file=custom_pipeline_file,
        patch_details=patch_details,
        output_glb_path=output_glb_path,
    )
    restore_multiview_override = apply_multiview_custom_pipeline_override(
        custom_pipeline_override_dir=custom_pipeline_override_dir,
    )

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
        try:
            pipeline = Hunyuan3DPaintPipeline.from_pretrained(
                str(model_root),
                **loader_kwargs,
            )
        except TypeError:
            if not local_files_only_used:
                raise
            local_files_only_used = False
            log_line("local_files_only usado: no (unsupported by paint pipeline)")
            pipeline = Hunyuan3DPaintPipeline.from_pretrained(
                str(model_root),
                subfolder=model_subfolder,
            )
    finally:
        if restore_multiview_override:
            restore_multiview_override()

    log_line("paint pipeline init OK")
    resolved_unet_class = resolve_pipeline_unet_class_name(pipeline)
    log_line(f"unet class resolved: {resolved_unet_class}")

    if os.environ.get("HUNYUAN_TEXGEN_CPU_OFFLOAD", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        pipeline.enable_model_cpu_offload()

    log_line("mesh load started")
    mesh = trimesh.load(mesh_path, force="mesh")
    log_line("mesh load OK")

    log_line("image load started")
    image = Image.open(image_path).convert("RGBA")
    log_line("image load OK")

    log_line("texgen inference started")
    textured_mesh = pipeline(mesh, image=image)
    log_line("texgen inference finished")

    log_line("export started")
    export_result_mesh(textured_mesh, output_glb_path)
    log_line("export finished")

    return {
        "model_root": str(model_root),
        "model_subfolder": model_subfolder,
        "pipeline_class": pipeline_class,
        "local_files_only_used": "yes" if local_files_only_used else "no",
        "expected_unet_module": patch_details["expected_unet_module"],
        "configured_unet_module": patch_details["configured_unet_module"],
        "model_index_patched": patch_details["model_index_patched"],
        "resolved_unet_class": resolved_unet_class,
        "timeout_ms": timeout_ms,
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
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=0,
        help="Optional timeout metadata value provided by backend",
    )
    parser.add_argument(
        "--repo-root",
        default="",
        help="Optional local Hunyuan repo root path",
    )
    return parser.parse_args()


def build_result_payload(
    shape_glb_path: str,
    textured_glb_path: Optional[str],
    texture_status: str,
    error: Optional[str],
    timeout_ms: int,
) -> Dict[str, Any]:
    return {
        "texture_status": texture_status,
        "shape_glb_path": os.path.abspath(shape_glb_path),
        "textured_glb_path": os.path.abspath(textured_glb_path)
        if textured_glb_path
        else None,
        "error": error,
        "traceback": None,
        "duration_ms": None,
        "timeout_ms": timeout_ms,
        "model_root": None,
        "pipeline_class": None,
    }


def main() -> int:
    args = parse_args()
    output_paths = resolve_output_paths(args.output_dir)
    ensure_dir(output_paths["output_dir"])

    shape_glb_path = os.path.abspath(args.mesh)
    image_path = os.path.abspath(args.image)
    textured_glb_path = output_paths["textured_glb_path"]
    metadata_path = output_paths["metadata_path"]
    timeout_ms = max(0, int(args.timeout_ms))
    repo_root = args.repo_root.strip() if isinstance(args.repo_root, str) else ""

    result = build_result_payload(
        shape_glb_path=shape_glb_path,
        textured_glb_path=None,
        texture_status="failed",
        error=None,
        timeout_ms=timeout_ms,
    )

    started_at = time.perf_counter()
    exit_code = 1

    try:
        if not os.path.isfile(shape_glb_path):
            raise RuntimeError(f"Shape GLB not found: {shape_glb_path}")
        if not os.path.isfile(image_path):
            raise RuntimeError(f"Input image not found: {image_path}")

        details = run_texgen(
            image_path=image_path,
            mesh_path=shape_glb_path,
            output_glb_path=textured_glb_path,
            timeout_ms=timeout_ms,
            repo_root=repo_root or None,
        )

        if (
            not os.path.isfile(textured_glb_path)
            or os.path.getsize(textured_glb_path) <= 0
        ):
            raise RuntimeError(
                "Texgen completed without producing a valid textured GLB."
            )

        result.update(
            {
                "texture_status": "completed",
                "textured_glb_path": os.path.abspath(textured_glb_path),
                "error": None,
                "traceback": None,
                "model_root": details["model_root"],
                "pipeline_class": details["pipeline_class"],
                "model_subfolder": details["model_subfolder"],
                "local_files_only_used": details["local_files_only_used"],
                "expected_unet_module": details["expected_unet_module"],
                "configured_unet_module": details["configured_unet_module"],
                "model_index_patched": details["model_index_patched"],
                "resolved_unet_class": details["resolved_unet_class"],
            }
        )
        exit_code = 0
    except Exception as exc:  # noqa: BLE001
        result["texture_status"] = "failed"
        result["textured_glb_path"] = None
        result["error"] = str(exc)
        result["traceback"] = traceback.format_exc()
        if result.get("model_root") is None:
            result["model_root"] = os.environ.get("HUNYUAN_TEXGEN_MODEL_PATH", "").strip() or None
    finally:
        result["duration_ms"] = int((time.perf_counter() - started_at) * 1000)
        write_metadata(metadata_path, result)
        print(json.dumps(result, ensure_ascii=False))

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
