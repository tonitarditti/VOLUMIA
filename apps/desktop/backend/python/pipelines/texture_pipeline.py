from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from threading import Event
from typing import Any

from config import (
    DEFAULT_TEXTURE_ATLAS_SIZE,
    DEFAULT_TEXTURE_TARGET_TRIANGLES,
    ENABLE_TEXTURE_MESH_ONLY_FALLBACK,
    ENABLE_XATLAS_UNWRAP,
    USE_INTERNAL_HUNYUAN_PIPELINE,
)
from core.job_manager import JobCancelledError
from utils.memory import cleanup_memory
from utils.mesh_texture import (
    build_final_texture_output,
    prepare_mesh_for_texturing,
    write_texture_metadata,
)


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


def _run_legacy_hunyuan(
    mesh_path: str,
    reference_images: list[str],
    output_dir: Path,
    preset: str,
    timeout_ms: int,
) -> dict[str, Any]:
    script_path = Path(__file__).resolve().parents[1] / "hunyuan_texgen.py"
    if not script_path.is_file():
        raise FileNotFoundError(f"Legacy texgen script not found: {script_path}")

    if not isinstance(reference_images, list) or not reference_images:
        raise ValueError("referenceImages must contain at least one image.")

    if not mesh_path:
        raise ValueError("meshPath is required.")

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


def _to_positive_int(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
    except Exception:
        return int(fallback)
    return parsed if parsed > 0 else int(fallback)


def _resolve_atlas_size(preset: str, payload_size: Any) -> int:
    preset_map = {
        "fast": 1024,
        "balanced": 2048,
        "high": 4096,
        "quality": 4096,
    }
    if payload_size is not None:
        return _to_positive_int(payload_size, DEFAULT_TEXTURE_ATLAS_SIZE)
    return _to_positive_int(DEFAULT_TEXTURE_ATLAS_SIZE, preset_map.get(preset.lower(), 2048))


def _resolve_bool(value: Any, fallback: bool) -> bool:
    if value is None:
        return fallback
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return fallback


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
    mesh_path = str(job_payload.get("meshPath") or "").strip()
    reference_images = list(job_payload.get("referenceImages") or [])
    preset = str(job_payload.get("preset") or "balanced")
    timeout_ms = int(job_payload.get("timeoutMs") or 0)
    target_triangles = _to_positive_int(
        job_payload.get("targetTriangleCount"),
        DEFAULT_TEXTURE_TARGET_TRIANGLES,
    )
    atlas_size = _resolve_atlas_size(
        preset=preset,
        payload_size=job_payload.get("textureAtlasSize"),
    )
    allow_mesh_only_fallback = _resolve_bool(
        job_payload.get("allowMeshOnlyFallback"),
        ENABLE_TEXTURE_MESH_ONLY_FALLBACK,
    )

    if not mesh_path:
        raise ValueError("meshPath is required.")
    source_mesh = Path(mesh_path).expanduser().resolve()
    if not source_mesh.is_file():
        raise FileNotFoundError(f"Mesh file not found: {source_mesh}")

    job_dir = output_service.get_job_output_dir(job_id)
    temp_dir = output_service.get_temp_job_dir(job_id)
    maps_dir = output_service.get_texture_job_dir(job_id)
    prepared_mesh_path = output_service.get_mesh_output_path(job_id, "prepared_mesh.glb")
    final_glb_path = output_service.get_export_output_path(job_id, "textured.glb")
    metadata_path = job_dir / "texture-metadata.json"

    if cancel_event.is_set():
        raise JobCancelledError("Cancelled before mesh cleanup.")

    job_manager.update_job(
        job_id,
        status="preprocessing",
        stage="cleaning_mesh",
        progress=16,
        message="Cleaning mesh, decimating and generating UVs.",
    )
    prepare_meta = prepare_mesh_for_texturing(
        mesh_path=str(source_mesh),
        prepared_mesh_path=str(prepared_mesh_path),
        target_triangles=target_triangles,
        atlas_size=atlas_size,
        prefer_xatlas=ENABLE_XATLAS_UNWRAP,
    )
    job_manager.append_log(
        job_id,
        "INFO",
        "mesh_prepared",
        "Mesh prepared for texturing.",
        {
            "inputFaceCount": prepare_meta.get("inputFaceCount"),
            "outputFaceCount": prepare_meta.get("outputFaceCount"),
            "decimationMethod": prepare_meta.get("decimationMethod"),
            "unwrapMethod": (prepare_meta.get("unwrap") or {}).get("method"),
        },
    )

    if cancel_event.is_set():
        raise JobCancelledError("Cancelled before texture generation.")

    hunyuan_result: dict[str, Any] | None = None
    hunyuan_error: str | None = None
    hunyuan_textured_path: str | None = None
    if reference_images:
        try:
            if USE_INTERNAL_HUNYUAN_PIPELINE:
                job_manager.update_job(
                    job_id,
                    status="loading_model",
                    stage="baking_texture",
                    progress=42,
                    message="Loading Hunyuan texture model.",
                )
                hunyuan_result = hunyuan_adapter.generate_texture(
                    mesh_path=str(prepared_mesh_path),
                    reference_images=reference_images,
                    output_glb_path=str(temp_dir / "hunyuan_textured.glb"),
                    timeout_ms=timeout_ms,
                    preset=preset,
                    repo_root=str(job_payload.get("repoRoot") or "").strip() or None,
                    progress_cb=lambda msg: job_manager.update_job(
                        job_id,
                        status="running",
                        stage="baking_texture",
                        progress=58,
                        message=msg,
                    ),
                    cancel_event=cancel_event,
                )
            else:
                job_manager.update_job(
                    job_id,
                    status="running",
                    stage="baking_texture",
                    progress=48,
                    message="Running legacy Hunyuan texture flow.",
                )
                hunyuan_result = _run_legacy_hunyuan(
                    mesh_path=str(prepared_mesh_path),
                    reference_images=reference_images,
                    output_dir=temp_dir,
                    preset=preset,
                    timeout_ms=timeout_ms,
                )
            hunyuan_textured_path = str((hunyuan_result or {}).get("texturedGlbPath") or "").strip() or None
        except Exception as exc:  # noqa: BLE001
            hunyuan_error = str(exc)
            job_manager.append_log(
                job_id,
                "WARNING",
                "texture_hunyuan_failed",
                "Hunyuan texture generation failed, using projection fallback.",
                {"error": hunyuan_error},
            )
    else:
        job_manager.append_log(
            job_id,
            "INFO",
            "texture_no_reference_images",
            "No reference images provided. Mesh-only fallback is allowed.",
        )

    if cancel_event.is_set():
        raise JobCancelledError("Cancelled before writing texture outputs.")

    job_manager.update_job(
        job_id,
        status="postprocessing",
        stage="baking_texture",
        progress=76,
        message="Baking texture atlas and exporting GLB.",
    )

    bake_error: str | None = None
    try:
        bake_result = build_final_texture_output(
            prepared_mesh_path=str(prepared_mesh_path),
            output_glb_path=str(final_glb_path),
            maps_dir=maps_dir,
            reference_images=reference_images,
            atlas_size=atlas_size,
            hunyuan_textured_glb_path=hunyuan_textured_path,
            allow_mesh_only_fallback=allow_mesh_only_fallback,
        )
    except Exception as exc:  # noqa: BLE001
        bake_error = str(exc)
        if not allow_mesh_only_fallback:
            raise
        shutil.copyfile(prepared_mesh_path, final_glb_path)
        bake_result = {
            "texturedGlbPath": str(final_glb_path),
            "textureStatus": "mesh_only",
            "textureMaps": None,
            "message": "Texture baking failed. Returned mesh-only output.",
        }
        job_manager.append_log(
            job_id,
            "WARNING",
            "texture_bake_failed",
            "Texture baking failed, mesh-only fallback used.",
            {"error": bake_error},
        )

    result = {
        "shapeGlbPath": str(source_mesh),
        "preparedMeshPath": str(prepared_mesh_path),
        "texturedGlbPath": str(bake_result.get("texturedGlbPath") or final_glb_path),
        "textureStatus": str(bake_result.get("textureStatus") or "ready"),
        "textureMaps": bake_result.get("textureMaps"),
        "atlasSize": atlas_size,
        "targetTriangles": target_triangles,
        "meshStats": {
            "inputFaceCount": prepare_meta.get("inputFaceCount"),
            "outputFaceCount": prepare_meta.get("outputFaceCount"),
            "inputVertexCount": prepare_meta.get("inputVertexCount"),
            "outputVertexCount": prepare_meta.get("outputVertexCount"),
        },
        "unwrap": prepare_meta.get("unwrap"),
        "hunyuan": hunyuan_result,
        "hunyuanError": hunyuan_error,
        "bakeError": bake_error,
    }
    write_texture_metadata(metadata_path, result)

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
    cleanup_memory()
    return result
