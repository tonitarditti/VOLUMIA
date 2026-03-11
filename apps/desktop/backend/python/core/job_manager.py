from __future__ import annotations

import json
import queue
import threading
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from config import ENABLE_MODEL_AUTO_UNLOAD, GPU_HEAVY_JOB_TYPES, RUNTIME_JOBS_DIR


JOB_STATUSES = {
    "queued",
    "starting",
    "loading_model",
    "preprocessing",
    "running",
    "postprocessing",
    "saving",
    "done",
    "failed",
    "cancelled",
}

JOB_STAGES = {
    "booting_backend",
    "starting_comfy",
    "preparing_inputs",
    "running_workflow",
    "building_multiview",
    "reconstructing_mesh",
    "cleaning_mesh",
    "baking_texture",
    "writing_files",
    "finalizing",
}

TERMINAL_JOB_STATUSES = {"done", "failed", "cancelled"}


class JobCancelledError(RuntimeError):
    pass


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_error(exc: Exception) -> dict[str, Any]:
    text = str(exc).strip() or exc.__class__.__name__
    lower = text.lower()

    if "out of memory" in lower and ("cuda" in lower or "cublas" in lower):
        return {
            "code": "CUDA_OUT_OF_MEMORY",
            "message": "No hay memoria suficiente para ejecutar esta tarea.",
            "retryable": True,
            "details": {"suggestedAction": "Cerrar otros jobs GPU o reiniciar backend."},
        }
    if isinstance(exc, FileNotFoundError):
        return {
            "code": "FILE_NOT_FOUND",
            "message": text,
            "retryable": False,
            "details": {},
        }
    if isinstance(exc, JobCancelledError):
        return {
            "code": "JOB_CANCELLED",
            "message": "El trabajo fue cancelado por el usuario.",
            "retryable": False,
            "details": {},
        }
    if "validation" in lower:
        return {
            "code": "INPUT_VALIDATION_FAILED",
            "message": text,
            "retryable": False,
            "details": {},
        }
    return {
        "code": "UNKNOWN_INTERNAL_ERROR",
        "message": text,
        "retryable": True,
        "details": {},
    }


@dataclass
class JobRecord:
    job_id: str
    type: str
    status: str
    stage: str
    progress: int
    message: str
    created_at: str
    project_id: str | None
    input_payload: dict[str, Any]
    started_at: str | None = None
    finished_at: str | None = None
    output: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    logs: list[dict[str, Any]] = field(default_factory=list)

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "jobId": self.job_id,
            "type": self.type,
            "status": self.status,
            "stage": self.stage,
            "progress": self.progress,
            "message": self.message,
            "createdAt": self.created_at,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "projectId": self.project_id,
            "input": self.input_payload,
            "output": self.output,
            "error": self.error,
            "logs": list(self.logs),
        }


@dataclass
class JobTask:
    job_id: str
    run_fn: Callable[[JobRecord, threading.Event], dict[str, Any] | None]
    gpu_heavy: bool
    model_hint: str | None = None


class JobManager:
    def __init__(self, gpu_manager: Any, model_manager: Any) -> None:
        self._gpu_manager = gpu_manager
        self._model_manager = model_manager
        self._lock = threading.Lock()
        self._jobs: dict[str, JobRecord] = {}
        self._cancel_events: dict[str, threading.Event] = {}
        self._queue: queue.Queue[JobTask] = queue.Queue()
        self._worker_shutdown = threading.Event()
        self._worker = threading.Thread(target=self._worker_loop, daemon=True, name="volumia-job-worker")
        self._worker.start()

    def create_job(self, job_type: str, project_id: str | None, input_payload: dict[str, Any]) -> JobRecord:
        job_id = str(uuid.uuid4())
        job = JobRecord(
            job_id=job_id,
            type=job_type,
            status="queued",
            stage="booting_backend",
            progress=0,
            message="Job queued.",
            created_at=utc_now_iso(),
            project_id=project_id,
            input_payload=input_payload,
        )
        cancel_event = threading.Event()
        with self._lock:
            self._jobs[job_id] = job
            self._cancel_events[job_id] = cancel_event
        self.append_log(job_id, "INFO", "job_created", "Job enqueued", {"type": job_type})
        self._persist_job(job)
        return job

    def enqueue(self, job_id: str, run_fn: Callable[[JobRecord, threading.Event], dict[str, Any] | None], gpu_heavy: bool, model_hint: str | None = None) -> None:
        self._queue.put(JobTask(job_id=job_id, run_fn=run_fn, gpu_heavy=gpu_heavy, model_hint=model_hint))

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return None if job is None else job.to_api_dict()

    def get_job_logs(self, job_id: str) -> list[dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return []
            return list(job.logs)

    def list_jobs(self) -> list[dict[str, Any]]:
        with self._lock:
            jobs = list(self._jobs.values())
        jobs.sort(key=lambda item: item.created_at, reverse=True)
        return [job.to_api_dict() for job in jobs]

    def cancel_job(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            cancel_event = self._cancel_events.get(job_id)
            if not job or not cancel_event:
                return False
            if job.status in TERMINAL_JOB_STATUSES:
                return False
            cancel_event.set()
            if job.status == "queued":
                job.status = "cancelled"
                job.stage = "finalizing"
                job.progress = max(job.progress, 1)
                job.message = "Job cancelled before start."
                job.finished_at = utc_now_iso()
                job.error = {
                    "code": "JOB_CANCELLED",
                    "message": "El trabajo fue cancelado por el usuario.",
                    "retryable": False,
                    "details": {},
                }
                self._persist_job(job)
        self.append_log(job_id, "INFO", "job_cancel_requested", "Cancellation requested")
        return True

    def update_job(self, job_id: str, **updates: Any) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            if "status" in updates and updates["status"] not in JOB_STATUSES:
                raise ValueError(f"Invalid status: {updates['status']}")
            if "stage" in updates and updates["stage"] not in JOB_STAGES:
                raise ValueError(f"Invalid stage: {updates['stage']}")
            for key, value in updates.items():
                if key == "progress":
                    value = int(max(0, min(100, int(value))))
                setattr(job, key, value)
            self._persist_job(job)

    def append_log(self, job_id: str, level: str, event: str, message: str, extra: dict[str, Any] | None = None) -> None:
        log_entry = {
            "timestamp": utc_now_iso(),
            "level": level,
            "jobId": job_id,
            "event": event,
            "message": message,
            "extra": extra or {},
        }
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.logs.append(log_entry)
            if len(job.logs) > 5000:
                job.logs = job.logs[-5000:]
            self._persist_job(job)

    def _worker_loop(self) -> None:
        while not self._worker_shutdown.is_set():
            try:
                task = self._queue.get(timeout=0.25)
            except queue.Empty:
                continue

            job, cancel_event = self._get_job_and_cancel(task.job_id)
            if not job or not cancel_event:
                continue
            if job.status == "cancelled" or cancel_event.is_set():
                continue

            acquired_gpu = False
            try:
                self.update_job(
                    job.job_id,
                    status="starting",
                    stage="booting_backend",
                    progress=max(1, job.progress),
                    started_at=utc_now_iso(),
                    message="Starting job worker.",
                )
                if task.gpu_heavy:
                    self.append_log(job.job_id, "INFO", "gpu_wait", "Waiting for GPU slot")
                    self._gpu_manager.acquire_for_job(job.job_id)
                    acquired_gpu = True
                    self.append_log(job.job_id, "INFO", "gpu_acquired", "GPU slot acquired")

                if cancel_event.is_set():
                    raise JobCancelledError("Cancelled before execution")

                output = task.run_fn(job, cancel_event) or {}

                if cancel_event.is_set():
                    raise JobCancelledError("Cancelled during execution")

                self.update_job(
                    job.job_id,
                    status="done",
                    stage="finalizing",
                    progress=100,
                    message="Job completed successfully.",
                    finished_at=utc_now_iso(),
                    output=output,
                    error=None,
                )
                self.append_log(job.job_id, "INFO", "job_done", "Job completed")
            except Exception as exc:  # noqa: BLE001
                normalized = normalize_error(exc if isinstance(exc, Exception) else RuntimeError("Unknown job failure"))
                stack = traceback.format_exc()
                status = "cancelled" if normalized["code"] == "JOB_CANCELLED" else "failed"
                self.update_job(
                    job.job_id,
                    status=status,
                    stage="finalizing",
                    finished_at=utc_now_iso(),
                    message=normalized["message"],
                    error={
                        **normalized,
                        "stackTrace": stack,
                    },
                )
                self.append_log(
                    job.job_id,
                    "ERROR",
                    "job_failed",
                    normalized["message"],
                    {"code": normalized["code"], "stackTrace": stack},
                )
            finally:
                if acquired_gpu:
                    self._gpu_manager.cleanup_after_job()
                    self._gpu_manager.release_for_job(job.job_id)
                    self.append_log(job.job_id, "INFO", "gpu_released", "GPU slot released")
                if ENABLE_MODEL_AUTO_UNLOAD and task.model_hint:
                    self._model_manager.unload(task.model_hint)

    def _get_job_and_cancel(self, job_id: str) -> tuple[JobRecord | None, threading.Event | None]:
        with self._lock:
            return self._jobs.get(job_id), self._cancel_events.get(job_id)

    def is_gpu_heavy_type(self, job_type: str) -> bool:
        return job_type in GPU_HEAVY_JOB_TYPES

    def shutdown(self) -> None:
        self._worker_shutdown.set()
        self._worker.join(timeout=4.0)

    def _persist_job(self, job: JobRecord) -> None:
        try:
            RUNTIME_JOBS_DIR.mkdir(parents=True, exist_ok=True)
            payload = job.to_api_dict()
            job_path = Path(RUNTIME_JOBS_DIR) / f"{job.job_id}.json"
            job_path.write_text(f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
        except Exception:
            # Persistence errors should never fail the live job execution path.
            return

