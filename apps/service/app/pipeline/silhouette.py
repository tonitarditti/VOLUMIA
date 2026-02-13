from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover - optional dependency fallback
    cv2 = None


@dataclass(frozen=True)
class MaskObservation:
    mask: np.ndarray  # uint8 binary mask {0,255}
    bbox: tuple[int, int, int, int]
    area_ratio: float
    valid: bool


def _bbox(mask_binary: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(mask_binary)
    if len(xs) == 0 or len(ys) == 0:
        h, w = mask_binary.shape
        return 0, 0, w, h
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _postprocess_mask(mask_binary: np.ndarray) -> np.ndarray:
    if cv2 is not None:
        kernel = np.ones((7, 7), dtype=np.uint8)
        closed = cv2.morphologyEx(mask_binary, cv2.MORPH_CLOSE, kernel, iterations=1)
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel, iterations=1)
        return np.where(opened > 0, 255, 0).astype(np.uint8)

    pil = Image.fromarray(mask_binary.astype(np.uint8), mode="L")
    pil = pil.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(3))
    return np.where(np.asarray(pil, dtype=np.uint8) > 120, 255, 0).astype(np.uint8)


def _grabcut_mask(image_rgb: np.ndarray) -> np.ndarray:
    h, w = image_rgb.shape[:2]
    if cv2 is None:
        raise RuntimeError("OpenCV not available for GrabCut.")

    image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    mask = np.zeros((h, w), dtype=np.uint8)
    rect = (
        int(w * 0.08),
        int(h * 0.08),
        max(1, int(w * 0.84)),
        max(1, int(h * 0.84)),
    )
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(image_bgr, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
    return np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)


def _threshold_fallback(image_rgb: np.ndarray) -> np.ndarray:
    gray = np.asarray(Image.fromarray(image_rgb, mode="RGB").convert("L"), dtype=np.uint8)
    if cv2 is not None:
        _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    else:
        threshold = int(np.percentile(gray, 52))
        otsu = np.where(gray > threshold, 255, 0).astype(np.uint8)

    fg = otsu if np.mean(otsu > 0) < 0.5 else (255 - otsu)
    return fg.astype(np.uint8)


def extract_mask_observation(image_rgb: np.ndarray) -> MaskObservation:
    try:
        raw_mask = _grabcut_mask(image_rgb)
    except Exception:
        raw_mask = _threshold_fallback(image_rgb)

    processed = _postprocess_mask(raw_mask)
    binary = processed > 0
    area_ratio = float(np.mean(binary))
    bbox = _bbox(binary)
    valid = 0.02 <= area_ratio <= 0.95

    if not valid:
        fallback = _threshold_fallback(image_rgb)
        processed = _postprocess_mask(fallback)
        binary = processed > 0
        area_ratio = float(np.mean(binary))
        bbox = _bbox(binary)
        valid = 0.01 <= area_ratio <= 0.98

    return MaskObservation(mask=processed, bbox=bbox, area_ratio=area_ratio, valid=valid)
