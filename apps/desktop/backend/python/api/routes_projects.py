from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field


router = APIRouter()


class RegisterOutputRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(alias="projectId")
    job_id: str = Field(alias="jobId")
    output: dict[str, Any]


@router.post("/projects/register-output")
def register_output(request: Request, body: RegisterOutputRequest) -> dict[str, Any]:
    app_state = request.app.state.app_state
    record = app_state.output_service.register_output(
        project_id=body.project_id,
        job_id=body.job_id,
        output=body.output,
    )
    return {"ok": True, "record": record}


@router.get("/projects/{project_id}/outputs")
def list_project_outputs(request: Request, project_id: str) -> dict[str, Any]:
    app_state = request.app.state.app_state
    outputs = app_state.output_service.list_project_outputs(project_id)
    return {"projectId": project_id, "outputs": outputs}
