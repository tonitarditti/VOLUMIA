from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Any


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ModelManager:
    def __init__(self) -> None:
        self._lock = Lock()
        self._loaded_models: dict[str, dict[str, Any]] = {}

    def mark_loaded(
        self,
        model_name: str,
        device: str,
        dtype: str,
        ram_estimate_mb: int | None = None,
        vram_estimate_mb: int | None = None,
    ) -> None:
        with self._lock:
            self._loaded_models[model_name] = {
                "loaded": True,
                "lastUsedAt": _utc_now_iso(),
                "device": device,
                "dtype": dtype,
                "ramEstimateMb": ram_estimate_mb,
                "vramEstimateMb": vram_estimate_mb,
            }

    def mark_used(self, model_name: str) -> None:
        with self._lock:
            model = self._loaded_models.get(model_name)
            if not model:
                return
            model["lastUsedAt"] = _utc_now_iso()

    def unload(self, model_name: str) -> None:
        with self._lock:
            model = self._loaded_models.get(model_name)
            if not model:
                return
            model["loaded"] = False
            model["lastUsedAt"] = _utc_now_iso()

    def get_models(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            # Copy for thread safety and stable API response.
            return {key: dict(value) for key, value in self._loaded_models.items()}

