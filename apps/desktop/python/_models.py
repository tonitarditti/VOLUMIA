import os

from _bootstrap import ensure_cache_dirs, ensure_packages
from _device import detect_device


def _log(message: str) -> None:
    print(message, flush=True)


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
    except Exception as error:
        raise RuntimeError(f"Could not import model runtime dependencies: {error}") from error

    _log("[MODEL] Downloading/Loading depth model: depth-anything/Depth-Anything-V2-Small-hf")
    if device_name == "cuda":
        _log(f"[MODEL] Device: cuda ({device_label})")
    else:
        _log("[MODEL] Device: cpu")

    try:
        return pipeline(
            "depth-estimation",
            model="depth-anything/Depth-Anything-V2-Small-hf",
            device=device,
        )
    except Exception as error:
        raise RuntimeError(f"Failed to load depth model: {error}") from error
