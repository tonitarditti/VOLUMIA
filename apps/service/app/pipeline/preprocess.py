from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from ..models import CaptureImageInput


@dataclass(frozen=True)
class LoadedCapture:
    slot_id: str
    file_name: str
    source_path: str | None
    image: np.ndarray  # RGB uint8 processing image (normalized max side)
    original_image: np.ndarray  # RGB uint8 original resolution image


def debug_enabled() -> bool:
    flag = os.getenv("VOLUMIA_PIPELINE_DEBUG")
    if flag is not None:
        return flag.strip() in {"1", "true", "yes", "on"}
    return os.getenv("NODE_ENV", "").lower() == "development"


def debug_output_dir(generation_id: str) -> Path:
    path = Path(tempfile.gettempdir()) / "volumia-pipeline-debug" / generation_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_debug_image(path: Path, image: np.ndarray) -> None:
    arr = np.asarray(image)
    if arr.dtype != np.uint8:
        arr = np.clip(arr, 0, 255).astype(np.uint8)
    if arr.ndim == 2:
        mode = "L"
    else:
        mode = "RGB"
    Image.fromarray(arr, mode=mode).save(path)


def _safe_open_image(image_input: CaptureImageInput, max_side: int) -> tuple[np.ndarray, np.ndarray]:
    candidates: list[Path] = []
    if image_input.filePath:
        candidates.append(Path(image_input.filePath))
    candidates.append(Path(image_input.fileName))

    for candidate in candidates:
        try:
            if not candidate.exists() or not candidate.is_file():
                continue
            with Image.open(candidate) as source:
                original = source.convert("RGB")
                original_np = np.asarray(original, dtype=np.uint8)
                process_image = original.copy()
                process_image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
                process_np = np.asarray(process_image, dtype=np.uint8)
                return process_np, original_np
        except Exception:
            continue

    synthetic = _synthetic_image(f"{image_input.slotId}:{image_input.fileName}", max_side)
    return synthetic, synthetic.copy()


def _synthetic_image(seed_text: str, size: int) -> np.ndarray:
    seed = int.from_bytes(seed_text.encode("utf-8", "ignore"), "little") % (2**32)
    rng = np.random.default_rng(seed)
    image = rng.uniform(0.32, 0.74, size=(size, size, 3)).astype(np.float32)

    yy, xx = np.mgrid[0:size, 0:size]
    cx = size * (0.42 + 0.12 * rng.random())
    cy = size * (0.42 + 0.12 * rng.random())
    rx = size * (0.24 + 0.08 * rng.random())
    ry = size * (0.27 + 0.08 * rng.random())
    mask = (((xx - cx) / max(rx, 1.0)) ** 2 + ((yy - cy) / max(ry, 1.0)) ** 2) <= 1.0
    image[mask] = np.clip(image[mask] * np.array([1.12, 1.0, 0.88], dtype=np.float32), 0.0, 1.0)
    image += rng.normal(0, 0.03, size=image.shape).astype(np.float32)
    return (np.clip(image, 0.0, 1.0) * 255.0).astype(np.uint8)


def load_capture_images(images: list[CaptureImageInput], max_side: int = 1024) -> list[LoadedCapture]:
    loaded: list[LoadedCapture] = []
    for image_input in images:
        process_image, original_image = _safe_open_image(image_input, max_side=max_side)
        loaded.append(
            LoadedCapture(
                slot_id=image_input.slotId,
                file_name=image_input.fileName,
                source_path=image_input.filePath,
                image=process_image,
                original_image=original_image,
            )
        )
    return loaded


def choose_capture_by_slot(captures: list[LoadedCapture], slot_id: str) -> LoadedCapture | None:
    for capture in captures:
        if capture.slot_id == slot_id:
            return capture
    return None


def choose_material_captures(captures: list[LoadedCapture]) -> list[LoadedCapture]:
    priority_sorted = sorted(
        captures,
        key=lambda item: (
            0 if item.slot_id.startswith("material_") else 1,
            0 if item.slot_id.startswith("detail_") else 1,
            item.slot_id,
        ),
    )
    return [item for item in priority_sorted if item.slot_id.startswith("material_") or item.slot_id.startswith("detail_")]
