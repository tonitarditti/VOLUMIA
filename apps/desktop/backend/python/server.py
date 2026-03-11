from __future__ import annotations

from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from adapters.comfy_adapter import ComfyAdapter
from adapters.hunyuan_adapter import HunyuanAdapter
from api.routes_health import router as health_router
from api.routes_jobs import router as jobs_router
from api.routes_projects import router as projects_router
from config import BACKEND_VERSION, HOST, PORT, RUNTIME_DIR, RUNTIME_JOBS_DIR, RUNTIME_LOGS_DIR, RUNTIME_PROJECTS_DIR, RUNTIME_TEMP_DIR
from core.app_state import AppState
from core.gpu_manager import GPUManager
from core.job_manager import JobManager
from core.model_manager import ModelManager
from core.process_registry import ProcessRegistry
from services.output_service import OutputService


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_runtime_dirs() -> None:
    for directory in (RUNTIME_DIR, RUNTIME_LOGS_DIR, RUNTIME_TEMP_DIR, RUNTIME_JOBS_DIR, RUNTIME_PROJECTS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def create_app() -> FastAPI:
    _ensure_runtime_dirs()
    app = FastAPI(
        title="VOLUMIA Unified Backend",
        version=BACKEND_VERSION,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    process_registry = ProcessRegistry()
    gpu_manager = GPUManager()
    model_manager = ModelManager()
    output_service = OutputService()
    comfy_adapter = ComfyAdapter(process_registry=process_registry)
    hunyuan_adapter = HunyuanAdapter(model_manager=model_manager, gpu_manager=gpu_manager)
    job_manager = JobManager(gpu_manager=gpu_manager, model_manager=model_manager)

    app.state.app_state = AppState(
        job_manager=job_manager,
        model_manager=model_manager,
        gpu_manager=gpu_manager,
        comfy_adapter=comfy_adapter,
        hunyuan_adapter=hunyuan_adapter,
        process_registry=process_registry,
        output_service=output_service,
        started_at=_utc_now_iso(),
        backend_version=BACKEND_VERSION,
    )

    app.include_router(health_router)
    app.include_router(jobs_router)
    app.include_router(projects_router)

    @app.on_event("shutdown")
    def _on_shutdown() -> None:
        state = app.state.app_state
        state.job_manager.shutdown()
        state.process_registry.terminate_all()

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)
