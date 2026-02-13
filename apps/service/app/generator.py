from __future__ import annotations

from pathlib import Path

from .models import GenerationRequest, GenerationResult
from .structured_pipeline import generate_structured_assets


def generate_stub_assets(request: GenerationRequest, generated_root: Path, base_url: str) -> GenerationResult:
    return generate_structured_assets(request, generated_root, base_url)
