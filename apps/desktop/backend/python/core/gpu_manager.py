from __future__ import annotations

import threading
from typing import Any

from config import ENABLE_GPU_JOB_SERIALIZATION
from utils.memory import cleanup_memory


class GPUManager:
    def __init__(self) -> None:
        # RTX 3060 12GB target profile: force 1 heavy job at a time.
        self._semaphore = threading.Semaphore(1)
        self._active_job_id: str | None = None
        self._lock = threading.Lock()

    def acquire_for_job(self, job_id: str) -> None:
        if ENABLE_GPU_JOB_SERIALIZATION:
            self._semaphore.acquire()
        with self._lock:
            self._active_job_id = job_id

    def release_for_job(self, job_id: str) -> None:
        with self._lock:
            if self._active_job_id == job_id:
                self._active_job_id = None
        if ENABLE_GPU_JOB_SERIALIZATION:
            self._semaphore.release()

    def active_job_id(self) -> str | None:
        with self._lock:
            return self._active_job_id

    def get_resources(self) -> dict[str, Any]:
        resources: dict[str, Any] = {
            "gpuHeavyConcurrency": 1,
            "serializationEnabled": ENABLE_GPU_JOB_SERIALIZATION,
            "activeGpuJobId": self.active_job_id(),
            "cudaAvailable": False,
        }
        try:
            import torch  # noqa: WPS433

            if not torch.cuda.is_available():
                return resources

            device_index = torch.cuda.current_device()
            device_name = torch.cuda.get_device_name(device_index)
            total_memory_mb = int(torch.cuda.get_device_properties(device_index).total_memory / (1024 * 1024))
            allocated_mb = int(torch.cuda.memory_allocated(device_index) / (1024 * 1024))
            reserved_mb = int(torch.cuda.memory_reserved(device_index) / (1024 * 1024))

            resources.update(
                {
                    "cudaAvailable": True,
                    "deviceIndex": device_index,
                    "deviceName": device_name,
                    "totalVramMb": total_memory_mb,
                    "allocatedVramMb": allocated_mb,
                    "reservedVramMb": reserved_mb,
                }
            )
        except Exception as error:
            resources["cudaError"] = str(error)
        return resources

    def cleanup_after_job(self) -> None:
        cleanup_memory()

