from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel


router = APIRouter()


class ComfyConfigPatch(BaseModel):
    host: str | None = None
    port: int | None = None
    baseUrl: str | None = None
    comfyDir: str | None = None
    pythonExeOverride: str | None = None
    startupTimeoutMs: int | None = None


@router.get("/health")
def get_health(request: Request) -> dict[str, object]:
    app_state = request.app.state.app_state
    return {
        "ok": True,
        "service": "volumia-unified-backend",
        "version": app_state.backend_version,
        "startedAt": app_state.started_at,
    }


@router.get("/system/resources")
def get_system_resources(request: Request) -> dict[str, object]:
    app_state = request.app.state.app_state
    return app_state.gpu_manager.get_resources()


@router.get("/system/models")
def get_system_models(request: Request) -> dict[str, object]:
    app_state = request.app.state.app_state
    return {
        "models": app_state.model_manager.get_models(),
    }


@router.get("/system/processes")
def get_system_processes(request: Request) -> dict[str, object]:
    app_state = request.app.state.app_state
    return {"processes": app_state.process_registry.list_active()}


@router.get("/system/comfy")
def get_system_comfy(request: Request) -> dict[str, object]:
    app_state = request.app.state.app_state
    return app_state.comfy_adapter.status()


@router.post("/system/comfy/start")
def post_system_comfy_start(request: Request) -> dict[str, object]:
    app_state = request.app.state.app_state
    return app_state.comfy_adapter.ensure_server()


@router.post("/system/comfy/stop")
def post_system_comfy_stop(request: Request) -> dict[str, object]:
    app_state = request.app.state.app_state
    return app_state.comfy_adapter.stop_server()


@router.get("/system/comfy/config")
def get_system_comfy_config(request: Request) -> dict[str, object]:
    app_state = request.app.state.app_state
    return app_state.comfy_adapter.get_config()


@router.post("/system/comfy/config")
def post_system_comfy_config(request: Request, body: ComfyConfigPatch) -> dict[str, object]:
    app_state = request.app.state.app_state
    return app_state.comfy_adapter.patch_config(body.model_dump(exclude_none=True))
