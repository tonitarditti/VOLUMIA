from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import (
    RUNTIME_EXPORTS_DIR,
    RUNTIME_JOBS_DIR,
    RUNTIME_MESHES_DIR,
    RUNTIME_PROJECTS_DIR,
    RUNTIME_TEMP_DIR,
    RUNTIME_TEXTURES_DIR,
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class OutputService:
    def __init__(self) -> None:
        self._jobs_dir = Path(RUNTIME_JOBS_DIR)
        self._projects_dir = Path(RUNTIME_PROJECTS_DIR)
        self._temp_dir = Path(RUNTIME_TEMP_DIR)
        self._textures_dir = Path(RUNTIME_TEXTURES_DIR)
        self._meshes_dir = Path(RUNTIME_MESHES_DIR)
        self._exports_dir = Path(RUNTIME_EXPORTS_DIR)
        self._jobs_dir.mkdir(parents=True, exist_ok=True)
        self._projects_dir.mkdir(parents=True, exist_ok=True)
        self._temp_dir.mkdir(parents=True, exist_ok=True)
        self._textures_dir.mkdir(parents=True, exist_ok=True)
        self._meshes_dir.mkdir(parents=True, exist_ok=True)
        self._exports_dir.mkdir(parents=True, exist_ok=True)

    def get_job_output_dir(self, job_id: str) -> Path:
        output_dir = self._jobs_dir / job_id
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir

    def get_temp_job_dir(self, job_id: str) -> Path:
        output_dir = self._temp_dir / job_id
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir

    def get_texture_job_dir(self, job_id: str) -> Path:
        output_dir = self._textures_dir / job_id
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir

    def get_mesh_output_path(self, job_id: str, filename: str = "prepared_mesh.glb") -> Path:
        output_dir = self._meshes_dir / job_id
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir / filename

    def get_export_output_path(self, job_id: str, filename: str = "export.glb") -> Path:
        output_dir = self._exports_dir / job_id
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir / filename

    def copy_to_exports(self, source_path: str, job_id: str, filename: str = "export.glb") -> str:
        source = Path(source_path).expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(f"Export source not found: {source}")
        destination = self.get_export_output_path(job_id, filename)
        shutil.copyfile(source, destination)
        return str(destination)

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
