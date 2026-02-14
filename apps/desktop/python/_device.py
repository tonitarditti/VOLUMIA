def _emit(device: str, device_index: int, name: str) -> None:
    print(f'[VOLUMIA_DEVICE] device={device} index={device_index} name="{name}"', flush=True)


def detect_device() -> dict:
    try:
        import torch
    except Exception:
        info = {"device": "cpu", "device_index": -1, "name": "CPU (torch missing)"}
        _emit(info["device"], info["device_index"], info["name"])
        return info

    if torch.cuda.is_available():
        idx = 0
        name = torch.cuda.get_device_name(idx)
        info = {"device": "cuda", "device_index": idx, "name": name}
        _emit(info["device"], info["device_index"], info["name"])
        return info

    info = {"device": "cpu", "device_index": -1, "name": "CPU"}
    _emit(info["device"], info["device_index"], info["name"])
    return info
