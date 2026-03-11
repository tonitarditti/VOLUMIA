from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import RUNTIME_JOBS_DIR, RUNTIME_PROJECTS_DIR


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class OutputService:
    def __init__(self) -> None:
        self._jobs_dir = Path(RUNTIME_JOBS_DIR)
        self._projects_dir = Path(RUNTIME_PROJECTS_DIR)
        self._jobs_dir.mkdir(parents=True, exist_ok=True)
        self._projects_dir.mkdir(parents=True, exist_ok=True)

    def get_job_output_dir(self, job_id: str) -> Path:
        output_dir = self._jobs_dir / job_id
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir

    def register_output(self, project_id: str, job_id: str, output: dict[str, Any]) -> dict[str, Any]:
        record = {
            "projectId": project_id,
            "jobId": job_id,
            "createdAt": _utc_now_iso(),
            "output": output,
        }
        project_file = self._projects_dir / f"{project_id}.json"
        payload = {"projectId": project_id, "outputs": []}
        if project_file.exists():
            try:
                payload = json.loads(project_file.read_text(encoding="utf-8"))
            except Exception:
                payload = {"projectId": project_id, "outputs": []}
        if not isinstance(payload, dict):
            payload = {"projectId": project_id, "outputs": []}
        outputs = payload.get("outputs")
        if not isinstance(outputs, list):
            outputs = []
        outputs.append(record)
        payload["outputs"] = outputs
        project_file.write_text(f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
        return record

    def list_project_outputs(self, project_id: str) -> list[dict[str, Any]]:
        project_file = self._projects_dir / f"{project_id}.json"
        if not project_file.exists():
            return []
        try:
            payload = json.loads(project_file.read_text(encoding="utf-8"))
        except Exception:
            return []
        outputs = payload.get("outputs") if isinstance(payload, dict) else None
        if not isinstance(outputs, list):
            return []
        return outputs

