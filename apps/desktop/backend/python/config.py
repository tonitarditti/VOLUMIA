from __future__ import annotations

import os
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    return value in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


BASE_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = BASE_DIR / "runtime"
RUNTIME_LOGS_DIR = RUNTIME_DIR / "logs"
RUNTIME_TEMP_DIR = RUNTIME_DIR / "temp"
RUNTIME_JOBS_DIR = RUNTIME_DIR / "jobs"
RUNTIME_PROJECTS_DIR = RUNTIME_DIR / "projects"

COMFY_WORKFLOW_DIR = BASE_DIR.parent.parent / "electron" / "generation" / "comfyui-workflows"
COMFY_DEFAULT_WORKFLOW = "hunyuan_image_to_3d_textured.json"

BACKEND_VERSION = os.environ.get("VOLUMIA_BACKEND_VERSION", "unified-backend-v1")
HOST = os.environ.get("VOLUMIA_BACKEND_HOST", "127.0.0.1")
PORT = _env_int("VOLUMIA_BACKEND_PORT", 9360)

USE_UNIFIED_BACKEND = _env_bool("USE_UNIFIED_BACKEND", True)
USE_INTERNAL_HUNYUAN_PIPELINE = _env_bool("USE_INTERNAL_HUNYUAN_PIPELINE", False)
USE_COMFY_ADAPTER = _env_bool("USE_COMFY_ADAPTER", True)
ENABLE_MODEL_AUTO_UNLOAD = _env_bool("ENABLE_MODEL_AUTO_UNLOAD", False)
ENABLE_GPU_JOB_SERIALIZATION = _env_bool("ENABLE_GPU_JOB_SERIALIZATION", True)

COMFY_HOST = os.environ.get("VOLUMIA_COMFY_HOST", "127.0.0.1")
COMFY_PORT = _env_int("VOLUMIA_COMFY_PORT", 8188)
COMFY_BASE_URL = os.environ.get("VOLUMIA_COMFY_BASE_URL", f"http://{COMFY_HOST}:{COMFY_PORT}").rstrip("/")


def _resolve_default_comfy_dir() -> Path:
    candidates = [
        r"E:\AI\ComfyUI_VOL"
    ]
    for raw in candidates:
        candidate = Path(raw).expanduser().resolve()
        if (candidate / "main.py").is_file():
            return candidate
    return Path(candidates[0]).expanduser().resolve()


_env_comfy_dir = os.environ.get("VOLUMIA_COMFY_DIR", "").strip()
COMFY_DIR = (Path(_env_comfy_dir).expanduser().resolve() if _env_comfy_dir else _resolve_default_comfy_dir())
COMFY_PYTHON_EXE = os.environ.get("VOLUMIA_COMFY_PYTHON_EXE", "").strip()
COMFY_STARTUP_TIMEOUT_MS = _env_int("VOLUMIA_COMFY_STARTUP_TIMEOUT_MS", 120_000)
COMFY_WORKFLOW_TIMEOUT_MS = _env_int("VOLUMIA_COMFY_WORKFLOW_TIMEOUT_MS", 15 * 60 * 1000)

GPU_HEAVY_JOB_TYPES = {"reconstruct", "texture"}

DEFAULT_TEXTURE_TARGET_TRIANGLES = _env_int("VOLUMIA_TEXTURE_TARGET_TRIANGLES", 150_000)
DEFAULT_TEXTURE_ATLAS_SIZE = _env_int("VOLUMIA_TEXTURE_ATLAS_SIZE", 2048)
ENABLE_TEXTURE_MESH_ONLY_FALLBACK = _env_bool("VOLUMIA_TEXTURE_MESH_ONLY_FALLBACK", True)
ENABLE_XATLAS_UNWRAP = _env_bool("VOLUMIA_ENABLE_XATLAS_UNWRAP", True)
