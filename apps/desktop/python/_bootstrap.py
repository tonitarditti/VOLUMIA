import importlib
import os
import subprocess
import sys
from typing import List


def _log(message: str) -> None:
    print(message, flush=True)


def get_cache_root() -> str:
    cache_root = os.environ.get("VOLUMIA_CACHE_DIR", "").strip()
    if not cache_root:
        raise RuntimeError("VOLUMIA_CACHE_DIR is required")
    return os.path.abspath(cache_root)


def ensure_cache_dirs(cache_root: str) -> dict:
    paths = {
        "root": cache_root,
        "pip": os.path.join(cache_root, "pip"),
        "models": os.path.join(cache_root, "models"),
        "tmp": os.path.join(cache_root, "tmp"),
    }
    for folder in paths.values():
        os.makedirs(folder, exist_ok=True)
    return paths


def _module_name(package_name: str) -> str:
    mapping = {
        "opencv-python": "cv2",
        "pillow": "PIL",
    }
    return mapping.get(package_name, package_name.replace("-", "_"))


def _run_pip(args: List[str], env: dict) -> None:
    process = subprocess.run(
        [sys.executable, "-m", "pip", *args],
        capture_output=True,
        text=True,
        env=env,
    )
    if process.stdout.strip():
        _log(process.stdout.strip())
    if process.returncode != 0:
        if process.stderr.strip():
            print(process.stderr.strip(), file=sys.stderr, flush=True)
        raise RuntimeError(f"pip command failed: {' '.join(args)}")
    if process.stderr.strip():
        _log(process.stderr.strip())


def ensure_packages(required: List[str]) -> None:
    cache_root = get_cache_root()
    dirs = ensure_cache_dirs(cache_root)

    missing: List[str] = []
    for package_name in required:
        module_name = _module_name(package_name)
        try:
            importlib.import_module(module_name)
        except Exception:
            missing.append(package_name)

    if not missing:
        _log("[BOOT] missing packages: none")
        return

    _log(f"[BOOT] missing packages: {', '.join(missing)}")
    _log("[BOOT] installing ...")
    pip_env = dict(os.environ)
    pip_env["PIP_CACHE_DIR"] = dirs["pip"]

    _run_pip(["install", "--upgrade", "pip"], pip_env)
    _run_pip(["install", *missing], pip_env)
    _log("[BOOT] install OK")
