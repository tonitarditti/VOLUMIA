from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from pipelines.reconstruct_pipeline import run_reconstruct_job
from pipelines.texture_pipeline import run_texture_job


router = APIRouter()


class TextureJobRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str | None = Field(default=None, alias="projectId")
    mesh_path: str = Field(alias="meshPath")
    reference_images: list[str] = Field(alias="referenceImages")
    preset: str = "balanced"
    timeout_ms: int | None = Field(default=None, alias="timeoutMs")
    repo_root: str | None = Field(default=None, alias="repoRoot")
    target_triangle_count: int | None = Field(default=None, alias="targetTriangleCount")
    texture_atlas_size: int | None = Field(default=None, alias="textureAtlasSize")
    allow_mesh_only_fallback: bool | None = Field(default=None, alias="allowMeshOnlyFallback")


class ReconstructJobRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str | None = Field(default=None, alias="projectId")
    source_images: list[str] = Field(alias="sourceImages")
    workflow_id: str | None = Field(default=None, alias="workflowId")
    preset: str = "balanced"
    multiview_enabled: bool | None = Field(default=None, alias="multiviewEnabled")
    multiview_preset: str | None = Field(default=None, alias="multiviewPreset")


def _enqueue_texture(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    app_state = request.app.state.app_state
    job_manager = app_state.job_manager
    job = job_manager.create_job("texture", payload.get("projectId"), payload)
    job_manager.enqueue(
        job_id=job.job_id,
        run_fn=lambda _job, cancel_event: run_texture_job(payload, app_state, _job.job_id, cancel_event),
        gpu_heavy=True,
        model_hint="hunyuan_texgen",
    )
    return {"jobId": job.job_id, "status": job.status}


def _enqueue_reconstruct(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    app_state = request.app.state.app_state
    job_manager = app_state.job_manager
    job = job_manager.create_job("reconstruct", payload.get("projectId"), payload)
    job_manager.enqueue(
        job_id=job.job_id,
        run_fn=lambda _job, cancel_event: run_reconstruct_job(payload, app_state, _job.job_id, cancel_event),
        gpu_heavy=True,
        model_hint="reconstruct_engine",
    )
    return {"jobId": job.job_id, "status": job.status}


@router.post("/jobs/texture")
def post_texture_job(request: Request, body: TextureJobRequest) -> dict[str, Any]:
    payload = body.model_dump(by_alias=True)
    return _enqueue_texture(request, payload)


@router.post("/jobs/reconstruct")
def post_reconstruct_job(request: Request, body: ReconstructJobRequest) -> dict[str, Any]:
    payload = body.model_dump(by_alias=True)
    return _enqueue_reconstruct(request, payload)


@router.post("/jobs/cancel/{job_id}")
def cancel_job(request: Request, job_id: str) -> dict[str, Any]:
    app_state = request.app.state.app_state
    cancelled = app_state.job_manager.cancel_job(job_id)
    if not cancelled:
        job = app_state.job_manager.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found.")
    job = app_state.job_manager.get_job(job_id)
    return {
        "jobId": job_id,
        "cancelRequested": cancelled,
        "status": job["status"] if job else "unknown",
    }


@router.get("/jobs/{job_id}")
def get_job(request: Request, job_id: str) -> dict[str, Any]:
    app_state = request.app.state.app_state
    job = app_state.job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@router.get("/jobs/{job_id}/logs")
def get_job_logs(request: Request, job_id: str) -> dict[str, Any]:
    app_state = request.app.state.app_state
    job = app_state.job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    logs = app_state.job_manager.get_job_logs(job_id)
    return {"jobId": job_id, "logs": logs}


@router.get("/jobs")
def list_jobs(request: Request) -> dict[str, Any]:
    app_state = request.app.state.app_state
    return {"jobs": app_state.job_manager.list_jobs()}
