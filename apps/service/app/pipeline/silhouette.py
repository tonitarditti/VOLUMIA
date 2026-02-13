from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover - optional dependency fallback
    cv2 = None

try:
    from scipy import ndimage as ndi  # type: ignore
except Exception:  # pragma: no cover - optional dependency fallback
    ndi = None


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


def _clip_bbox(bbox: tuple[int, int, int, int], width: int, height: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = bbox
    x0 = int(np.clip(x0, 0, max(0, width - 1)))
    y0 = int(np.clip(y0, 0, max(0, height - 1)))
    x1 = int(np.clip(x1, x0 + 1, width))
    y1 = int(np.clip(y1, y0 + 1, height))
    return x0, y0, x1, y1


def _fill_holes(mask_binary: np.ndarray) -> np.ndarray:
    binary = (mask_binary > 0).astype(np.uint8)
    if np.sum(binary) == 0:
        return np.zeros_like(mask_binary, dtype=np.uint8)

    if ndi is not None:
        filled = ndi.binary_fill_holes(binary > 0)
        return np.where(filled, 255, 0).astype(np.uint8)

    if cv2 is not None:
        inv = 1 - binary
        labels_count, labels, _, _ = cv2.connectedComponentsWithStats(inv, connectivity=8)
        if labels_count <= 1:
            return np.where(binary > 0, 255, 0).astype(np.uint8)
        border_labels = np.unique(
            np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
        )
        hole_mask = (inv > 0) & (~np.isin(labels, border_labels))
        binary[hole_mask] = 1

    return np.where(binary > 0, 255, 0).astype(np.uint8)


def _remove_tiny_islands(mask_binary: np.ndarray, min_area_ratio: float = 0.002) -> np.ndarray:
    binary = (mask_binary > 0).astype(np.uint8)
    if np.sum(binary) == 0:
        return np.zeros_like(mask_binary, dtype=np.uint8)

    h, w = binary.shape
    min_area = max(1, int(h * w * float(min_area_ratio)))

    if cv2 is not None:
        labels_count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
        cleaned = np.zeros_like(binary, dtype=np.uint8)
        for label_id in range(1, labels_count):
            area = int(stats[label_id, cv2.CC_STAT_AREA])
            if area >= min_area:
                cleaned[labels == label_id] = 1
        if np.sum(cleaned) == 0:
            cleaned = binary
        return np.where(cleaned > 0, 255, 0).astype(np.uint8)

    if ndi is not None:
        labels, num_labels = ndi.label(binary)
        if num_labels <= 1:
            return np.where(binary > 0, 255, 0).astype(np.uint8)
        areas = ndi.sum(binary, labels=labels, index=np.arange(1, num_labels + 1))
        cleaned = np.zeros_like(binary, dtype=np.uint8)
        for index, area in enumerate(areas, start=1):
            if int(area) >= min_area:
                cleaned[labels == index] = 1
        if np.sum(cleaned) == 0:
            cleaned = binary
        return np.where(cleaned > 0, 255, 0).astype(np.uint8)

    return np.where(binary > 0, 255, 0).astype(np.uint8)


def _postprocess_mask(mask_binary: np.ndarray) -> np.ndarray:
    if cv2 is not None:
        kernel_close = np.ones((7, 7), dtype=np.uint8)
        kernel_open = np.ones((3, 3), dtype=np.uint8)
        closed = cv2.morphologyEx(mask_binary, cv2.MORPH_CLOSE, kernel_close, iterations=1)
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel_open, iterations=1)
        processed = opened
    else:
        pil = Image.fromarray(mask_binary.astype(np.uint8), mode="L")
        pil = pil.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
        processed = np.where(np.asarray(pil, dtype=np.uint8) > 120, 255, 0).astype(np.uint8)

    processed = _fill_holes(processed)
    processed = _remove_tiny_islands(processed)
    return np.where(processed > 0, 255, 0).astype(np.uint8)


def _keep_largest_component(mask_binary: np.ndarray) -> np.ndarray:
    binary = (mask_binary > 0).astype(np.uint8)
    if np.sum(binary) == 0:
        return np.zeros_like(mask_binary, dtype=np.uint8)

    if cv2 is not None:
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return np.where(binary > 0, 255, 0).astype(np.uint8)
        largest = max(contours, key=cv2.contourArea)
        largest_mask = np.zeros_like(binary, dtype=np.uint8)
        cv2.drawContours(largest_mask, [largest], contourIdx=-1, color=1, thickness=cv2.FILLED)
        return np.where(largest_mask > 0, 255, 0).astype(np.uint8)

    if ndi is not None:
        labels, num_labels = ndi.label(binary)
        if num_labels <= 1:
            return np.where(binary > 0, 255, 0).astype(np.uint8)
        areas = ndi.sum(binary, labels=labels, index=np.arange(1, num_labels + 1))
        max_label = int(np.argmax(areas)) + 1
        return np.where(labels == max_label, 255, 0).astype(np.uint8)

    return np.where(binary > 0, 255, 0).astype(np.uint8)


def _grabcut_mask(image_rgb: np.ndarray, bbox_hint: tuple[int, int, int, int] | None = None) -> np.ndarray:
    h, w = image_rgb.shape[:2]
    if cv2 is None:
        raise RuntimeError("OpenCV not available for GrabCut.")

    if bbox_hint is None:
        x0, y0, x1, y1 = (
            int(w * 0.08),
            int(h * 0.08),
            int(w * 0.92),
            int(h * 0.92),
        )
    else:
        x0, y0, x1, y1 = _clip_bbox(bbox_hint, w, h)

    rect = (
        int(x0),
        int(y0),
        max(1, int(x1 - x0)),
        max(1, int(y1 - y0)),
    )

    image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    mask = np.zeros((h, w), dtype=np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(image_bgr, mask, rect, bgd_model, fgd_model, 4, cv2.GC_INIT_WITH_RECT)
    return np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)


def _threshold_fallback(image_rgb: np.ndarray) -> np.ndarray:
    gray = np.asarray(Image.fromarray(image_rgb, mode="RGB").convert("L"), dtype=np.uint8)
    if cv2 is not None:
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        adaptive = cv2.adaptiveThreshold(
            blur,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            31,
            2,
        )
        _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        edges = cv2.Canny(blur, 40, 130)
        merged = cv2.bitwise_or(adaptive, edges)
        merged = cv2.bitwise_or(merged, otsu)
    else:
        threshold = int(np.percentile(gray, 52))
        merged = np.where(gray > threshold, 255, 0).astype(np.uint8)

    candidates = [merged.astype(np.uint8), (255 - merged).astype(np.uint8)]
    target_fill = 0.35
    best = candidates[0]
    best_score = float("inf")
    for candidate in candidates:
        fill = float(np.mean(candidate > 0))
        penalty = 0.0 if 0.01 <= fill <= 0.98 else 1.0
        score = abs(fill - target_fill) + penalty
        if score < best_score:
            best = candidate
            best_score = score
    return best


def extract_mask_observation(
    image_rgb: np.ndarray,
    bbox_hint: tuple[int, int, int, int] | None = None,
) -> MaskObservation:
    try:
        raw_mask = _grabcut_mask(image_rgb, bbox_hint=bbox_hint)
    except Exception:
        raw_mask = _threshold_fallback(image_rgb)

    processed = _postprocess_mask(raw_mask)
    processed = _keep_largest_component(processed)
    binary = processed > 0
    area_ratio = float(np.mean(binary))
    bbox = _bbox(binary)
    valid = 0.01 <= area_ratio <= 0.98

    if not valid:
        fallback = _postprocess_mask(_threshold_fallback(image_rgb))
        fallback = _keep_largest_component(fallback)
        binary = fallback > 0
        area_ratio = float(np.mean(binary))
        bbox = _bbox(binary)
        valid = 0.005 <= area_ratio <= 0.98
        processed = fallback

    return MaskObservation(mask=processed, bbox=bbox, area_ratio=area_ratio, valid=valid)


def _extract_multi_object_masks_cv(
    image_rgb: np.ndarray,
    max_objects: int,
    min_area_ratio: float,
) -> list[MaskObservation]:
    if cv2 is None:
        return []

    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    adaptive = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        33,
        2,
    )
    edges = cv2.Canny(blur, 40, 120)
    merged = cv2.bitwise_or(adaptive, edges)

    kernel = np.ones((7, 7), dtype=np.uint8)
    closed = cv2.morphologyEx(merged, cv2.MORPH_CLOSE, kernel, iterations=2)
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, np.ones((3, 3), dtype=np.uint8), iterations=1)

    contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        contours, _ = cv2.findContours(adaptive, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    h, w = gray.shape
    total_pixels = float(max(1, h * w))

    observations: list[MaskObservation] = []
    sorted_contours = sorted(contours, key=cv2.contourArea, reverse=True)
    for contour in sorted_contours:
        area = float(cv2.contourArea(contour))
        if area <= 0:
            continue
        area_ratio = area / total_pixels
        if area_ratio < min_area_ratio:
            continue

        x, y, cw, ch = cv2.boundingRect(contour)
        bbox = _clip_bbox((int(x), int(y), int(x + cw), int(y + ch)), w, h)

        contour_mask = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(contour_mask, [contour], contourIdx=-1, color=255, thickness=cv2.FILLED)

        try:
            grabcut_mask = _grabcut_mask(image_rgb, bbox_hint=bbox)
            overlap = cv2.bitwise_and(grabcut_mask, contour_mask)
            contour_pixels = int(np.sum(contour_mask > 0))
            overlap_pixels = int(np.sum(overlap > 0))
            refined = overlap if overlap_pixels >= int(contour_pixels * 0.35) else contour_mask
        except Exception:
            refined = contour_mask

        processed = _postprocess_mask(refined)
        processed = _keep_largest_component(processed)
        binary = processed > 0
        final_ratio = float(np.mean(binary))
        if final_ratio < min_area_ratio:
            continue

        observations.append(
            MaskObservation(
                mask=processed,
                bbox=_bbox(binary),
                area_ratio=final_ratio,
                valid=0.01 <= final_ratio <= 0.98,
            )
        )
        if len(observations) >= max(1, max_objects):
            break

    return observations


def detect_object_masks(image_rgb: np.ndarray, max_objects: int = 4) -> list[MaskObservation]:
    observations = _extract_multi_object_masks_cv(
        image_rgb,
        max_objects=max_objects,
        min_area_ratio=0.02,
    )
    if observations:
        return observations

    fallback = extract_mask_observation(image_rgb)
    return [fallback]