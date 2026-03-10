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
from contextlib import nullcontext
from types import MethodType
from typing import Any, Callable, Dict, Optional


DEFAULT_MODEL_ID = "tencent/Hunyuan3D-2"
DEFAULT_MODEL_SUBFOLDER = "hunyuan3d-paint-v2-0-turbo"
DEFAULT_RENDER_SIZE = 2048
DEFAULT_TEXTURE_SIZE = 2048
DEFAULT_VIEWS = 12
DEFAULT_STEPS = 20
DEFAULT_LOCAL_MODEL_ROOTS = [
    r"E:\AI\Hunyuan3D_models",
    r"E:\AI\Hunyuan3D-2",
]
PRESET_CONFIGS: Dict[str, Dict[str, int]] = {
    "fast": {
        "texture_size": 1024,
        "render_size": 1024,
        "views": 8,
        "steps": 15,
    },
    "balanced": {
        "texture_size": 2048,
        "render_size": 2048,
        "views": 12,
        "steps": 20,
    },
    "high": {
        "texture_size": 4096,
        "render_size": 4096,
        "views": 20,
        "steps": 30,
    },
}


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


def parse_positive_int_env(name: str, fallback: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return fallback
    try:
        parsed = int(raw)
    except ValueError:
        return fallback
    return parsed if parsed > 0 else fallback


def normalize_preset(raw_preset: str) -> str:
    normalized = raw_preset.strip().lower()
    if normalized == "quality":
        return "high"
    if normalized not in PRESET_CONFIGS:
        return "balanced"
    return normalized


def resolve_texgen_runtime_config(raw_preset: str) -> Dict[str, int | str]:
    preset = normalize_preset(raw_preset)
    base = PRESET_CONFIGS[preset]
    render_size = parse_positive_int_env(
        "HUNYUAN_TEXGEN_RENDER_SIZE",
        int(base["render_size"]),
    )
    texture_size = parse_positive_int_env(
        "HUNYUAN_TEXGEN_TEXTURE_SIZE",
        int(base["texture_size"]),
    )
    views = parse_positive_int_env(
        "HUNYUAN_TEXGEN_VIEWS",
        int(base["views"]),
    )
    steps = parse_positive_int_env(
        "HUNYUAN_TEXGEN_STEPS",
        int(base["steps"]),
    )
    return {
        "preset": preset,
        "render_size": render_size,
        "texture_size": texture_size,
        "views": views,
        "steps": steps,
    }


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


def apply_texgen_sizes(paint_pipeline: Any, render_size: int, texture_size: int) -> None:
    if hasattr(paint_pipeline, "config"):
        if hasattr(paint_pipeline.config, "render_size"):
            paint_pipeline.config.render_size = render_size
        if hasattr(paint_pipeline.config, "texture_size"):
            paint_pipeline.config.texture_size = texture_size

    renderer = getattr(paint_pipeline, "render", None)
    if renderer is None:
        return

    if hasattr(renderer, "set_default_render_resolution"):
        renderer.set_default_render_resolution(render_size)
    if hasattr(renderer, "set_default_texture_resolution"):
        renderer.set_default_texture_resolution(texture_size)

    if hasattr(renderer, "default_resolution") and hasattr(
        renderer,
        "bake_unreliable_kernel_size",
    ):
        default_resolution = renderer.default_resolution
        if isinstance(default_resolution, tuple):
            max_dim = max(int(default_resolution[0]), int(default_resolution[1]))
        else:
            max_dim = int(default_resolution)
        renderer.bake_unreliable_kernel_size = max(1, int((2 / 512) * max_dim))


def build_camera_rig(view_count: int) -> tuple[list[int], list[int], list[float]]:
    views = max(1, int(view_count))
    if views <= 12:
        step = 360.0 / float(views)
        azims = [int(round((index * step) % 360)) for index in range(views)]
        elevs = [0 for _ in range(views)]
        weights = [1.0 if index == 0 else 0.7 for index in range(views)]
        return elevs, azims, weights

    horizon_count = min(12, views)
    remaining = max(0, views - horizon_count)
    top_count = remaining // 2
    bottom_count = remaining - top_count

    horizon_step = 360.0 / float(horizon_count)
    horizon_azims = [
        int(round((index * horizon_step) % 360)) for index in range(horizon_count)
    ]

    top_step = 360.0 / float(max(1, top_count))
    top_azims = [int(round((index * top_step) % 360)) for index in range(top_count)]

    bottom_step = 360.0 / float(max(1, bottom_count))
    bottom_azims = [
        int(round((index * bottom_step) % 360)) for index in range(bottom_count)
    ]

    elevs = [0 for _ in horizon_azims]
    elevs.extend([90 for _ in top_azims])
    elevs.extend([-90 for _ in bottom_azims])

    azims = horizon_azims + top_azims + bottom_azims
    weights = [1.0 if index == 0 else 0.7 for index in range(len(horizon_azims))]
    weights.extend([0.25 for _ in top_azims])
    weights.extend([0.25 for _ in bottom_azims])
    return elevs, azims, weights


def apply_texgen_views(paint_pipeline: Any, view_count: int) -> None:
    if not hasattr(paint_pipeline, "config"):
        return
    camera_elevs, camera_azims, camera_weights = build_camera_rig(view_count)
    paint_pipeline.config.candidate_camera_elevs = camera_elevs
    paint_pipeline.config.candidate_camera_azims = camera_azims
    paint_pipeline.config.candidate_view_weights = camera_weights


def patch_pipeline_steps(target_pipeline: Any, steps: int, label: str) -> bool:
    if target_pipeline is None:
        return False

    pipeline_cls = target_pipeline.__class__
    original_call = getattr(pipeline_cls, "__call__", None)
    if not callable(original_call):
        return False

    if getattr(pipeline_cls, "_volumia_steps_patched", False):
        setattr(pipeline_cls, "_volumia_num_inference_steps", int(steps))
        return True

    setattr(pipeline_cls, "_volumia_num_inference_steps", int(steps))

    def patched_call(self: Any, *args: Any, **kwargs: Any) -> Any:
        forced_steps = int(
            getattr(self.__class__, "_volumia_num_inference_steps", int(steps))
        )
        kwargs["num_inference_steps"] = forced_steps
        return original_call(self, *args, **kwargs)

    setattr(pipeline_cls, "__call__", patched_call)
    setattr(pipeline_cls, "_volumia_steps_patched", True)
    log_line(f"patched num_inference_steps for {label}: {steps}")
    return True


def apply_texgen_steps(paint_pipeline: Any, steps: int) -> Dict[str, bool]:
    delight_pipeline = getattr(
        paint_pipeline.models.get("delight_model"),
        "pipeline",
        None,
    )
    multiview_pipeline = getattr(
        paint_pipeline.models.get("multiview_model"),
        "pipeline",
        None,
    )
    return {
        "delight": patch_pipeline_steps(
            delight_pipeline,
            steps,
            "delight pipeline",
        ),
        "multiview": patch_pipeline_steps(
            multiview_pipeline,
            steps,
            "multiview pipeline",
        ),
    }


def enable_xformers_if_available(paint_pipeline: Any) -> Dict[str, str]:
    statuses: Dict[str, str] = {}
    for model_name in ("delight_model", "multiview_model"):
        model = paint_pipeline.models.get(model_name)
        pipeline_obj = getattr(model, "pipeline", None)
        if pipeline_obj is None:
            statuses[model_name] = "pipeline-missing"
            continue
        method = getattr(pipeline_obj, "enable_xformers_memory_efficient_attention", None)
        if not callable(method):
            statuses[model_name] = "not-supported"
            continue
        try:
            method()
            statuses[model_name] = "enabled"
        except Exception as exc:  # noqa: BLE001
            statuses[model_name] = f"failed:{exc}"
    return statuses


def cast_renderer_value(value: Any, torch_module: Any) -> Any:
    if torch_module.is_tensor(value):
        if value.is_floating_point():
            return value.float()
        integer_dtypes = tuple(
            dtype
            for dtype in (
                getattr(torch_module, "int8", None),
                getattr(torch_module, "int16", None),
                getattr(torch_module, "uint8", None),
                getattr(torch_module, "uint16", None),
                getattr(torch_module, "uint32", None),
            )
            if dtype is not None
        )
        if value.dtype in integer_dtypes:
            return value.to(dtype=torch_module.int64)
        return value
    if isinstance(value, list):
        return [cast_renderer_value(item, torch_module) for item in value]
    if isinstance(value, tuple):
        return tuple(cast_renderer_value(item, torch_module) for item in value)
    if isinstance(value, dict):
        return {
            key: cast_renderer_value(item, torch_module)
            for key, item in value.items()
        }
    return value


def get_disabled_autocast_context(torch_module: Any) -> Any:
    if not torch_module.cuda.is_available():
        return nullcontext()
    amp_module = getattr(torch_module, "amp", None)
    if amp_module is not None and hasattr(amp_module, "autocast"):
        return amp_module.autocast("cuda", enabled=False)
    return torch_module.cuda.amp.autocast(enabled=False)


def force_renderer_state_float32(renderer: Any, torch_module: Any) -> None:
    for attr_name in (
        "vtx_pos",
        "vtx_uv",
        "tex",
        "camera_proj_mat",
        "vtx_normal",
        "vtx_normals",
    ):
        if not hasattr(renderer, attr_name):
            continue
        attr_value = getattr(renderer, attr_name)
        if torch_module.is_tensor(attr_value) and attr_value.is_floating_point():
            setattr(renderer, attr_name, attr_value.float())


def patch_renderer_method_float32(
    renderer: Any,
    method_name: str,
    torch_module: Any,
) -> bool:
    original_method = getattr(renderer, method_name, None)
    if not callable(original_method):
        return False

    marker_name = f"_volumia_fp32_patch_{method_name}"
    if getattr(renderer, marker_name, False):
        return True

    def patched(self: Any, *args: Any, **kwargs: Any) -> Any:
        cast_args = tuple(cast_renderer_value(arg, torch_module) for arg in args)
        cast_kwargs = {
            key: cast_renderer_value(value, torch_module)
            for key, value in kwargs.items()
        }
        guard = get_disabled_autocast_context(torch_module)
        with guard:
            result = original_method(*cast_args, **cast_kwargs)
        force_renderer_state_float32(self, torch_module)
        return cast_renderer_value(result, torch_module)

    setattr(renderer, method_name, MethodType(patched, renderer))
    setattr(renderer, marker_name, True)
    return True


def enforce_renderer_float32_runtime(
    paint_pipeline: Any,
    torch_module: Any,
) -> Dict[str, str]:
    renderer = getattr(paint_pipeline, "render", None)
    if renderer is None:
        return {"renderer": "missing"}

    force_renderer_state_float32(renderer, torch_module)
    patched = {
        "load_mesh": patch_renderer_method_float32(
            renderer,
            "load_mesh",
            torch_module,
        ),
        "_render": patch_renderer_method_float32(
            renderer,
            "_render",
            torch_module,
        ),
        "raster_rasterize": patch_renderer_method_float32(
            renderer,
            "raster_rasterize",
            torch_module,
        ),
        "raster_interpolate": patch_renderer_method_float32(
            renderer,
            "raster_interpolate",
            torch_module,
        ),
        "render": patch_renderer_method_float32(
            renderer,
            "render",
            torch_module,
        ),
        "render_normal": patch_renderer_method_float32(
            renderer,
            "render_normal",
            torch_module,
        ),
        "render_position": patch_renderer_method_float32(
            renderer,
            "render_position",
            torch_module,
        ),
        "back_project": patch_renderer_method_float32(
            renderer,
            "back_project",
            torch_module,
        ),
    }
    force_renderer_state_float32(renderer, torch_module)
    return {
        "renderer": "patched",
        **{name: ("ok" if status else "missing") for name, status in patched.items()},
    }


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
    preset: str,
    repo_root: Optional[str],
) -> Dict[str, Any]:
    log_line("texgen started")
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
    runtime_config = resolve_texgen_runtime_config(preset)
    resolved_preset = str(runtime_config["preset"])
    log_line("paint pipeline import OK")
    log_line(f"paint pipeline class: {pipeline_class}")
    log_line(
        "texgen preset resolved: "
        f"{resolved_preset} "
        f"(render_size={runtime_config['render_size']} "
        f"texture_size={runtime_config['texture_size']} "
        f"views={runtime_config['views']} steps={runtime_config['steps']})"
    )

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
    render_size = int(runtime_config["render_size"])
    texture_size = int(runtime_config["texture_size"])
    views = int(runtime_config["views"])
    steps = int(runtime_config["steps"])
    apply_texgen_sizes(pipeline, render_size, texture_size)
    apply_texgen_views(pipeline, views)
    step_patch_status = apply_texgen_steps(pipeline, steps)
    xformers_status = enable_xformers_if_available(pipeline)
    renderer_fp32_status = enforce_renderer_float32_runtime(
        pipeline,
        torch,
    )
    log_line(
        "texgen runtime configured: "
        f"render_size={render_size} texture_size={texture_size} "
        f"views={views} steps={steps} merge_method={getattr(pipeline.config, 'merge_method', 'unknown')}"
    )
    log_line(
        "xformers status: "
        + ", ".join(f"{name}={status}" for name, status in xformers_status.items())
    )
    log_line(
        "step override status: "
        + ", ".join(
            f"{name}={'ok' if status else 'skipped'}"
            for name, status in step_patch_status.items()
        )
    )
    log_line(
        "renderer fp32 status: "
        + ", ".join(f"{name}={status}" for name, status in renderer_fp32_status.items())
    )

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
    use_amp = False
    log_line("amp autocast: disabled for stability (forcing float32 for renderer)")
    autocast_context = get_disabled_autocast_context(torch)
    with torch.inference_mode(), autocast_context:
        textured_mesh = pipeline(mesh, image=image)
    log_line("texgen inference finished")

    log_line("export started")
    export_result_mesh(textured_mesh, output_glb_path)
    log_line("export finished")
    log_line("texgen completed")

    return {
        "model_root": str(model_root),
        "model_subfolder": model_subfolder,
        "preset": resolved_preset,
        "pipeline_class": pipeline_class,
        "local_files_only_used": "yes" if local_files_only_used else "no",
        "expected_unet_module": patch_details["expected_unet_module"],
        "configured_unet_module": patch_details["configured_unet_module"],
        "model_index_patched": patch_details["model_index_patched"],
        "resolved_unet_class": resolved_unet_class,
        "render_size": render_size,
        "texture_size": texture_size,
        "views": views,
        "steps": steps,
        "amp_enabled": use_amp,
        "xformers_status": xformers_status,
        "step_patch_status": step_patch_status,
        "renderer_fp32_status": renderer_fp32_status,
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
    parser.add_argument(
        "--preset",
        default="balanced",
        help="Texgen preset: fast | balanced | high",
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
    requested_preset = args.preset.strip() if isinstance(args.preset, str) else "balanced"

    result = build_result_payload(
        shape_glb_path=shape_glb_path,
        textured_glb_path=None,
        texture_status="failed",
        error=None,
        timeout_ms=timeout_ms,
    )
    initial_runtime_config = resolve_texgen_runtime_config(requested_preset)
    result.update(
        {
            "preset": initial_runtime_config["preset"],
            "render_size": initial_runtime_config["render_size"],
            "texture_size": initial_runtime_config["texture_size"],
            "views": initial_runtime_config["views"],
            "steps": initial_runtime_config["steps"],
        }
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
            preset=requested_preset,
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
                "preset": details["preset"],
                "local_files_only_used": details["local_files_only_used"],
                "expected_unet_module": details["expected_unet_module"],
                "configured_unet_module": details["configured_unet_module"],
                "model_index_patched": details["model_index_patched"],
                "resolved_unet_class": details["resolved_unet_class"],
                "render_size": details["render_size"],
                "texture_size": details["texture_size"],
                "views": details["views"],
                "steps": details["steps"],
                "amp_enabled": details["amp_enabled"],
                "xformers_status": details["xformers_status"],
                "step_patch_status": details["step_patch_status"],
                "renderer_fp32_status": details["renderer_fp32_status"],
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
