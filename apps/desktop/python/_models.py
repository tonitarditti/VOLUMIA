import os
import subprocess
import sys
from importlib import metadata

from _bootstrap import ensure_cache_dirs, ensure_packages
from _device import detect_device


def _log(message: str) -> None:
    print(message, flush=True)


def _package_version(name: str) -> str:
    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return "not installed"
    except Exception as error:
        return f"unknown ({error})"


def _repair_transformers_import() -> None:
    _log(f"[MODEL] torch version: {_package_version('torch')}")
    _log(f"[MODEL] transformers version: {_package_version('transformers')}")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--force-reinstall",
            "transformers==4.41.2",
            "accelerate==0.31.0",
        ],
        check=True,
    )


def get_depth_model(cache_dir: str):
    dirs = ensure_cache_dirs(cache_dir)
    models_dir = dirs["models"]
    os.environ["HF_HOME"] = models_dir
    os.environ["TRANSFORMERS_CACHE"] = models_dir
    os.environ["TORCH_HOME"] = models_dir

    _log(f"[MODEL] Using cache: {models_dir}")

    try:
        ensure_packages([
            "torch",
            "torchvision",
            "transformers",
            "accelerate",
            "safetensors",
            "huggingface_hub",
        ])
    except Exception:
        detect_device()
        raise

    device_info = detect_device()
    device = int(device_info["device_index"])
    device_name = str(device_info["device"])
    device_label = str(device_info["name"])

    try:
        from transformers import pipeline
    except ImportError as error:
        if "TransformGetItemToIndex" not in str(error):
            raise RuntimeError(f"Could not import model runtime dependencies: {error}") from error

        _log("[MODEL] transformers import failed with TransformGetItemToIndex; attempting repair")
        repair_error = None
        try:
            _repair_transformers_import()
        except Exception as install_error:
            repair_error = install_error

        try:
            from transformers import pipeline
        except Exception as retry_error:
            message = (
                "Could not import transformers after automatic repair.\n"
                'Run: python -m pip install --force-reinstall "transformers==4.41.2" "accelerate==0.31.0"\n'
                "Then restart the app."
            )
            if repair_error is not None:
                message = f"{message}\nAutomatic reinstall error: {repair_error}"
            raise RuntimeError(message) from retry_error
    except Exception as error:
        raise RuntimeError(f"Could not import model runtime dependencies: {error}") from error

    _log("[MODEL] Downloading/Loading depth model: depth-anything/Depth-Anything-V2-Small-hf")
    if device_name == "cuda":
        _log(f"[MODEL] Device: cuda ({device_label})")
    else:
        _log("[MODEL] Device: cpu")

    try:
        depth_pipeline = pipeline(
            "depth-estimation",
            model="depth-anything/Depth-Anything-V2-Small-hf",
            device=device,
        )
        if hasattr(depth_pipeline, "model") and hasattr(depth_pipeline.model, "to"):
            depth_pipeline.model.to(device_name)
        return depth_pipeline
    except Exception as error:
        raise RuntimeError(f"Failed to load depth model: {error}") from error
