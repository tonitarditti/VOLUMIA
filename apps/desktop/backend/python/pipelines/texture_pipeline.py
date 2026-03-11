from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from threading import Event
from typing import Any

from config import USE_INTERNAL_HUNYUAN_PIPELINE
from core.job_manager import JobCancelledError


def _parse_json_line(stdout: str) -> dict[str, Any]:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    for line in reversed(lines):
        if not line.startswith("{"):
            continue
        try:
            payload = json.loads(line)
            if isinstance(payload, dict):
                return payload
        except json.JSONDecodeError:
            continue
    return {}


def _run_legacy_hunyuan(job_payload: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    script_path = Path(__file__).resolve().parents[1] / "hunyuan_texgen.py"
    if not script_path.is_file():
        raise FileNotFoundError(f"Legacy texgen script not found: {script_path}")

    reference_images = job_payload.get("referenceImages") or []
    if not isinstance(reference_images, list) or not reference_images:
        raise ValueError("referenceImages must contain at least one image.")

    mesh_path = str(job_payload.get("meshPath") or "").strip()
    if not mesh_path:
        raise ValueError("meshPath is required.")

    preset = str(job_payload.get("preset") or "balanced")
    timeout_ms = int(job_payload.get("timeoutMs") or 0)

    command = [
        sys.executable,
        str(script_path),
        "--image",
        str(reference_images[0]),
        "--mesh",
        mesh_path,
        "--output-dir",
        str(output_dir),
        "--preset",
        preset,
        "--timeout-ms",
        str(max(0, timeout_ms)),
    ]
    process = subprocess.run(command, capture_output=True, text=True, check=False)
    if process.returncode != 0:
        payload = _parse_json_line(process.stdout)
        if payload.get("error"):
            raise RuntimeError(str(payload["error"]))
        raise RuntimeError(process.stderr.strip() or "Legacy Hunyuan process failed.")

    payload = _parse_json_line(process.stdout)
    textured_path = payload.get("textured_glb_path")
    if not textured_path:
        textured_path = str(output_dir / "textured.glb")
    return {
        "shapeGlbPath": payload.get("shape_glb_path") or mesh_path,
        "texturedGlbPath": textured_path,
        "legacyMetadataPath": str(output_dir / "texture-metadata.json"),
        "details": payload,
    }


def run_texture_job(job_payload: dict[str, Any], app_state: Any, job_id: str, cancel_event: Event) -> dict[str, Any]:
    job_manager = app_state.job_manager
    output_service = app_state.output_service
    hunyuan_adapter = app_state.hunyuan_adapter

    if cancel_event.is_set():
        raise JobCancelledError("Cancelled before texture pipeline start.")

    job_manager.update_job(
        job_id,
        status="loading_model",
        stage="preparing_inputs",
        progress=7,
        message="Validating texture inputs.",
    )
    job_manager.append_log(job_id, "INFO", "texture_pipeline_start", "Texture pipeline started")

    project_id = str(job_payload.get("projectId") or "")
    output_dir = output_service.get_job_output_dir(job_id)

    if USE_INTERNAL_HUNYUAN_PIPELINE:
        job_manager.update_job(
            job_id,
            status="loading_model",
            stage="baking_texture",
            progress=18,
            message="Loading Hunyuan model.",
        )

        result = hunyuan_adapter.generate_texture(
            mesh_path=str(job_payload.get("meshPath") or ""),
            reference_images=list(job_payload.get("referenceImages") or []),
            output_glb_path=str(output_dir / "textured.glb"),
            timeout_ms=int(job_payload.get("timeoutMs") or 0),
            preset=str(job_payload.get("preset") or "balanced"),
            repo_root=str(job_payload.get("repoRoot") or "").strip() or None,
            progress_cb=lambda msg: job_manager.update_job(
                job_id,
                status="running",
                stage="baking_texture",
                progress=45,
                message=msg,
            ),
            cancel_event=cancel_event,
        )
    else:
        job_manager.update_job(
            job_id,
            status="running",
            stage="baking_texture",
            progress=20,
            message="Running legacy Hunyuan texture flow.",
        )
        result = _run_legacy_hunyuan(job_payload, output_dir)

    if cancel_event.is_set():
        raise JobCancelledError("Cancelled before writing texture outputs.")

    job_manager.update_job(
        job_id,
        status="saving",
        stage="writing_files",
        progress=88,
        message="Saving texture outputs.",
    )
    if project_id:
        output_service.register_output(project_id, job_id, result)

    job_manager.update_job(
        job_id,
        status="postprocessing",
        stage="finalizing",
        progress=96,
        message="Finalizing texture pipeline.",
    )
    job_manager.append_log(job_id, "INFO", "texture_pipeline_done", "Texture pipeline completed")
    return result

