import os

from _bootstrap import ensure_cache_dirs, ensure_packages


def _log(message: str) -> None:
    print(message, flush=True)


def get_depth_model(cache_dir: str):
    dirs = ensure_cache_dirs(cache_dir)
    models_dir = dirs["models"]
    os.environ["HF_HOME"] = models_dir
    os.environ["TRANSFORMERS_CACHE"] = models_dir
    os.environ["TORCH_HOME"] = models_dir

    _log(f"[MODEL] Using cache: {models_dir}")

    ensure_packages([
        "torch",
        "torchvision",
        "transformers",
        "accelerate",
        "safetensors",
        "huggingface_hub",
    ])

    try:
        import torch
        from transformers import pipeline
    except Exception as error:
        raise RuntimeError(f"Could not import model runtime dependencies: {error}") from error

    device = 0 if torch.cuda.is_available() else -1
    device_name = "cuda" if device == 0 else "cpu"
    _log("[MODEL] Downloading/Loading depth model: depth-anything/Depth-Anything-V2-Small-hf")
    _log(f"[MODEL] Device: {device_name}")

    try:
        return pipeline(
            "depth-estimation",
            model="depth-anything/Depth-Anything-V2-Small-hf",
            device=device,
        )
    except Exception as error:
        raise RuntimeError(f"Failed to load depth model: {error}") from error
