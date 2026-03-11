from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AppState:
    job_manager: object
    model_manager: object
    gpu_manager: object
    comfy_adapter: object
    hunyuan_adapter: object
    process_registry: object
    output_service: object
    started_at: str
    backend_version: str

