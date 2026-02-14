import os


def _emit(device: str, device_index: int, name: str) -> None:
    print(f'[VOLUMIA_DEVICE] device={device} index={device_index} name="{name}"', flush=True)
    print(f"[VOLUMIA_DEVICE] device={device}", flush=True)


def detect_device() -> dict:
    try:
        import torch
    except Exception:
        info = {"device": "cpu", "device_index": -1, "name": "CPU (torch missing)"}
        print("[WARNING] CUDA not available, falling back to CPU", flush=True)
        _emit(info["device"], info["device_index"], info["name"])
        return info

    force = os.environ.get("VOLUMIA_FORCE_DEVICE", "").lower().strip()
    if force == "cuda":
        if torch.cuda.is_available():
            idx = 0
            name = torch.cuda.get_device_name(idx)
            info = {"device": "cuda", "device_index": idx, "name": name}
            _emit(info["device"], info["device_index"], info["name"])
            return info
        print("[WARNING] CUDA not available, falling back to CPU", flush=True)
        info = {"device": "cpu", "device_index": -1, "name": "CPU (forced cuda unavailable)"}
        _emit(info["device"], info["device_index"], info["name"])
        return info

    if force == "cpu":
        info = {"device": "cpu", "device_index": -1, "name": "CPU (forced)"}
        _emit(info["device"], info["device_index"], info["name"])
        return info

    if torch.cuda.is_available():
        idx = 0
        name = torch.cuda.get_device_name(idx)
        info = {"device": "cuda", "device_index": idx, "name": name}
        _emit(info["device"], info["device_index"], info["name"])
        return info

    print("[WARNING] CUDA not available, falling back to CPU", flush=True)
    info = {"device": "cpu", "device_index": -1, "name": "CPU"}
    _emit(info["device"], info["device_index"], info["name"])
    return info
