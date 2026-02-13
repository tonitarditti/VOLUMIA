from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .exporter import create_export_package
from .generator import generate_stub_assets
from .models import (
    AnalyzeImageResult,
    AnalyzeImagesRequest,
    AnalyzeImagesResponse,
    ExportRequest,
    ExportResponse,
    GenerationRequest,
    GenerationResult,
)
from .presets import resolve_auto_preset

APP_ROOT = Path(__file__).resolve().parent.parent
GENERATED_ROOT = APP_ROOT / "generated"
GENERATED_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="VOLUMIA Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/generated", StaticFiles(directory=GENERATED_ROOT), name="generated")


def _slot_status_from_name(file_name: str) -> tuple[str, str]:
    lower = file_name.lower()
    if any(word in lower for word in ["dark", "night"]):
        return "Too dark", "Increase exposure or add a brighter reference."
    if any(word in lower for word in ["reflect", "gloss", "mirror"]):
        return "Reflections", "Try one matte-angle image to stabilize surfaces."
    if any(word in lower for word in ["low", "blur", "noisy"]):
        return "Low detail", "Add one more detail close-up for this area."
    return "Ready", "Good capture quality."


def _load_generation_result(generation_id: str) -> GenerationResult:
    result_file = GENERATED_ROOT / generation_id / "generation_result.json"
    if not result_file.exists():
        raise HTTPException(status_code=404, detail="Generation not found")

    data = json.loads(result_file.read_text(encoding="utf-8"))
    return GenerationResult.model_validate(data)


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "ok": True,
        "service": "volumia-fastapi-stub",
        "generatedRoot": str(GENERATED_ROOT),
    }


@app.post("/analyze-images", response_model=AnalyzeImagesResponse)
def analyze_images(payload: AnalyzeImagesRequest) -> AnalyzeImagesResponse:
    hints = [item.fileName for item in payload.images]
    preset = resolve_auto_preset(payload.objectType, payload.reconstructionMode, hints)

    slot_results = []
    for image in payload.images:
        status, note = _slot_status_from_name(image.fileName)
        slot_results.append(AnalyzeImageResult(slotId=image.slotId, status=status, note=note))

    notes = []
    received_slots = {image.slotId for image in payload.images}
    if "front" not in received_slots:
        notes.append("Front image recommended for best scale consistency.")
    if "side" not in received_slots:
        notes.append("Side image recommended for depth estimation.")
    if len(payload.images) < 3:
        notes.append("Add more references for improved component separation.")

    return AnalyzeImagesResponse(recommendedPreset=preset, slotResults=slot_results, notes=notes)


@app.post("/generate-model", response_model=GenerationResult)
def generate_model(payload: GenerationRequest, request: Request) -> GenerationResult:
    base_url = str(request.base_url).rstrip("/")
    return generate_stub_assets(payload, GENERATED_ROOT, base_url)


@app.post("/export-package", response_model=ExportResponse)
def export_package(payload: ExportRequest) -> ExportResponse:
    generation_result = _load_generation_result(payload.generationId)
    generation_dir = GENERATED_ROOT / payload.generationId
    try:
        zip_path, file_name = create_export_package(generation_dir, generation_result, payload.options)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return ExportResponse(
        ok=True,
        zipPath=str(zip_path),
        fileName=file_name,
        message="SketchUp package generated successfully.",
    )
