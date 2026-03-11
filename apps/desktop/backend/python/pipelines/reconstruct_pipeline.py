from __future__ import annotations

from threading import Event
from typing import Any

from core.job_manager import JobCancelledError


def run_reconstruct_job(job_payload: dict[str, Any], app_state: Any, job_id: str, cancel_event: Event) -> dict[str, Any]:
    job_manager = app_state.job_manager
    output_service = app_state.output_service
    comfy_adapter = app_state.comfy_adapter

    if cancel_event.is_set():
        raise JobCancelledError("Cancelled before reconstruct pipeline start.")

    source_images = list(job_payload.get("sourceImages") or [])
    if not source_images:
        raise ValueError("sourceImages must contain at least one image.")
    image_path = str(source_images[0])
    project_id = str(job_payload.get("projectId") or "")

    job_manager.update_job(
        job_id,
        status="starting",
        stage="starting_comfy",
        progress=5,
        message="Checking ComfyUI backend.",
    )
    comfy_adapter.ensure_server()

    if cancel_event.is_set():
        raise JobCancelledError("Cancelled before workflow submission.")

    job_manager.update_job(
        job_id,
        status="preprocessing",
        stage="preparing_inputs",
        progress=10,
        message="Preparing reconstruct workflow inputs.",
    )

    result = comfy_adapter.execute_workflow(
        image_path=image_path,
        workflow_name=str(job_payload.get("workflowId") or "").strip() or None,
        project_id=project_id or None,
        preset=str(job_payload.get("preset") or "balanced"),
        progress_cb=lambda progress, message: job_manager.update_job(
            job_id,
            status="running",
            stage="running_workflow",
            progress=max(12, min(90, int(progress))),
            message=message,
        ),
        cancel_event=cancel_event,
    )

    if cancel_event.is_set():
        raise JobCancelledError("Cancelled before output registration.")

    output_payload = {
        "promptId": result.get("promptId"),
        "workflowName": result.get("workflowName"),
        **(result.get("output") or {}),
    }
    if project_id:
        output_service.register_output(project_id, job_id, output_payload)

    job_manager.update_job(
        job_id,
        status="saving",
        stage="writing_files",
        progress=95,
        message="Saving reconstruct outputs.",
    )
    return output_payload

