from __future__ import annotations

import os
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


BASE_DIR = Path(__file__).resolve().parent

RUNTIME_DIR = Path(os.environ.get("VOLUMIA_RUNTIME_DIR", r"F:\VOLUMIA_RUNTIME")).expanduser().resolve()
RUNTIME_USERDATA_DIR = RUNTIME_DIR / "userData"
RUNTIME_SESSION_DIR = RUNTIME_DIR / "sessionData"
RUNTIME_BACKEND_DIR = RUNTIME_DIR / "backend"
RUNTIME_LOGS_DIR = RUNTIME_DIR / "logs"
RUNTIME_CRASH_DIR = RUNTIME_DIR / "crashDumps"

RUNTIME_PROJECTS_DIR = RUNTIME_USERDATA_DIR / "projects"
RUNTIME_CONFIG_DIR = RUNTIME_USERDATA_DIR / "config"
RUNTIME_STATE_DIR = RUNTIME_USERDATA_DIR / "state"

RUNTIME_JOBS_DIR = RUNTIME_BACKEND_DIR / "jobs"
RUNTIME_TEMP_DIR = RUNTIME_BACKEND_DIR / "temp"
RUNTIME_TEXTURES_DIR = RUNTIME_BACKEND_DIR / "textures"
RUNTIME_MESHES_DIR = RUNTIME_BACKEND_DIR / "meshes"
RUNTIME_EXPORTS_DIR = RUNTIME_BACKEND_DIR / "exports"

RUNTIME_SESSION_CACHE_DIR = RUNTIME_SESSION_DIR / "cache"
RUNTIME_SESSION_COOKIES_DIR = RUNTIME_SESSION_DIR / "cookies"
RUNTIME_SESSION_GPU_CACHE_DIR = RUNTIME_SESSION_DIR / "gpu-cache"

COMFY_WORKFLOW_DIR = BASE_DIR.parent.parent / "electron" / "generation" / "comfyui-workflows"
COMFY_DEFAULT_WORKFLOW = "hunyuan_image_to_3d_textured.json"

BACKEND_VERSION = os.environ.get("VOLUMIA_BACKEND_VERSION", "unified-backend-v1")
HOST = os.environ.get("VOLUMIA_BACKEND_HOST", "127.0.0.1")
PORT = _env_int("VOLUMIA_BACKEND_PORT", 9360)

USE_UNIFIED_BACKEND = _env_bool("USE_UNIFIED_BACKEND", True)
USE_INTERNAL_HUNYUAN_PIPELINE = _env_bool("USE_INTERNAL_HUNYUAN_PIPELINE", True)
USE_COMFY_ADAPTER = _env_bool("USE_COMFY_ADAPTER", True)
ENABLE_MODEL_AUTO_UNLOAD = _env_bool("ENABLE_MODEL_AUTO_UNLOAD", False)
ENABLE_GPU_JOB_SERIALIZATION = _env_bool("ENABLE_GPU_JOB_SERIALIZATION", True)

COMFY_HOST = os.environ.get("VOLUMIA_COMFY_HOST", "127.0.0.1")
COMFY_PORT = _env_int("VOLUMIA_COMFY_PORT", 8188)
COMFY_BASE_URL = os.environ.get("VOLUMIA_COMFY_BASE_URL", f"http://{COMFY_HOST}:{COMFY_PORT}").rstrip("/")


def _resolve_default_comfy_dir() -> Path:
    candidates = [
        r"E:\AI\ComfyUI_VOL",
    ]
    for raw in candidates:
        candidate = Path(raw).expanduser().resolve()
        if (candidate / "main.py").is_file():
            return candidate
    raise FileNotFoundError(
        "ComfyUI directory not found. Set VOLUMIA_COMFY_DIR to a valid folder containing main.py."
    )


_env_comfy_dir = os.environ.get("VOLUMIA_COMFY_DIR", "").strip()
COMFY_DIR = Path(_env_comfy_dir).expanduser().resolve() if _env_comfy_dir else _resolve_default_comfy_dir()

DEFAULT_COMFY_PYTHON_EXE = Path(r"F:\MINICONDA\envs\volumia\python.exe")
COMFY_PYTHON_EXE = Path(
    os.environ.get("VOLUMIA_COMFY_PYTHON_EXE", str(DEFAULT_COMFY_PYTHON_EXE)).strip()
).expanduser().resolve()

COMFY_STARTUP_TIMEOUT_MS = _env_int("VOLUMIA_COMFY_STARTUP_TIMEOUT_MS", 120_000)
COMFY_WORKFLOW_TIMEOUT_MS = _env_int("VOLUMIA_COMFY_WORKFLOW_TIMEOUT_MS", 15 * 60 * 1000)

GPU_HEAVY_JOB_TYPES = {"reconstruct", "texture"}

DEFAULT_TEXTURE_TARGET_TRIANGLES = _env_int("VOLUMIA_TEXTURE_TARGET_TRIANGLES", 150_000)
DEFAULT_TEXTURE_ATLAS_SIZE = _env_int("VOLUMIA_TEXTURE_ATLAS_SIZE", 2048)
ENABLE_TEXTURE_MESH_ONLY_FALLBACK = _env_bool("VOLUMIA_TEXTURE_MESH_ONLY_FALLBACK", True)
ENABLE_XATLAS_UNWRAP = _env_bool("VOLUMIA_ENABLE_XATLAS_UNWRAP", True)

ALL_RUNTIME_DIRS = (
    RUNTIME_DIR,
    RUNTIME_USERDATA_DIR,
    RUNTIME_CONFIG_DIR,
    RUNTIME_STATE_DIR,
    RUNTIME_PROJECTS_DIR,
    RUNTIME_SESSION_DIR,
    RUNTIME_SESSION_CACHE_DIR,
    RUNTIME_SESSION_COOKIES_DIR,
    RUNTIME_SESSION_GPU_CACHE_DIR,
    RUNTIME_BACKEND_DIR,
    RUNTIME_JOBS_DIR,
    RUNTIME_TEMP_DIR,
    RUNTIME_TEXTURES_DIR,
    RUNTIME_MESHES_DIR,
    RUNTIME_EXPORTS_DIR,
    RUNTIME_LOGS_DIR,
    RUNTIME_CRASH_DIR,
)


def runtime_paths_payload() -> dict[str, str]:
    return {
        "runtimeRoot": str(RUNTIME_DIR),
        "userData": str(RUNTIME_USERDATA_DIR),
        "userConfig": str(RUNTIME_CONFIG_DIR),
        "userState": str(RUNTIME_STATE_DIR),
        "projects": str(RUNTIME_PROJECTS_DIR),
        "sessionData": str(RUNTIME_SESSION_DIR),
        "sessionCache": str(RUNTIME_SESSION_CACHE_DIR),
        "sessionCookies": str(RUNTIME_SESSION_COOKIES_DIR),
        "sessionGpuCache": str(RUNTIME_SESSION_GPU_CACHE_DIR),
        "backendRoot": str(RUNTIME_BACKEND_DIR),
        "jobs": str(RUNTIME_JOBS_DIR),
        "temp": str(RUNTIME_TEMP_DIR),
        "textures": str(RUNTIME_TEXTURES_DIR),
        "meshes": str(RUNTIME_MESHES_DIR),
        "exports": str(RUNTIME_EXPORTS_DIR),
        "logs": str(RUNTIME_LOGS_DIR),
        "crashDumps": str(RUNTIME_CRASH_DIR),
    }
