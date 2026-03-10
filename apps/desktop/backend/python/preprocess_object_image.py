import argparse
import json
import os
import time
import traceback
from pathlib import Path
from typing import Any, Dict, Iterable, Optional, Tuple

import cv2
import numpy as np
from PIL import Image


DEFAULT_MODEL_TYPE = "vit_h"
DEFAULT_FLOOR_MARGIN_PX = 4
DEFAULT_PADDING_RATIO = 0.04
DEFAULT_MIN_MASK_AREA_RATIO = 0.002
DEFAULT_MAX_MASK_AREA_RATIO = 0.97
DEFAULT_SAM_CHECKPOINT_CANDIDATES = [
    r"E:\AI\ComfyUI_VOL\models\sam\sam_vit_h_4b8939.pth",
]


def log_line(message: str) -> None:
    print(f"[preprocess_object_image] {message}", flush=True)


def ensure_parent_dir(file_path: Path) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)


def read_image_rgb(input_path: Path) -> np.ndarray:
    with Image.open(input_path) as image:
        return np.array(image.convert("RGB"), dtype=np.uint8)


def resolve_sam_checkpoint(cli_value: str) -> Path:
    candidates: list[str] = []
    if cli_value.strip():
        candidates.append(cli_value.strip())

    for env_name in (
        "VOLUMIA_SAM_CHECKPOINT",
        "SAM_CHECKPOINT_PATH",
        "HUNYUAN_SAM_CHECKPOINT",
    ):
        env_value = os.environ.get(env_name, "").strip()
        if env_value:
            candidates.append(env_value)

    candidates.extend(DEFAULT_SAM_CHECKPOINT_CANDIDATES)
    for raw in candidates:
        candidate = Path(raw).expanduser().resolve()
        if candidate.is_file():
            return candidate

    checked = " | ".join(candidates) if candidates else "no candidates"
    raise RuntimeError(
        "SAM checkpoint not found. Set VOLUMIA_SAM_CHECKPOINT "
        f"or pass --sam-checkpoint. Checked: {checked}"
    )


def infer_model_type(
    requested_model_type: str,
    checkpoint_path: Path,
) -> str:
    normalized = requested_model_type.strip().lower()
    if normalized in ("vit_h", "vit_l", "vit_b"):
        return normalized

    filename = checkpoint_path.name.lower()
    if "vit_l" in filename:
        return "vit_l"
    if "vit_b" in filename:
        return "vit_b"
    return DEFAULT_MODEL_TYPE


def generate_masks(
    image_rgb: np.ndarray,
    checkpoint_path: Path,
    model_type: str,
) -> Tuple[list[dict[str, Any]], str, str]:
    import torch
    from segment_anything import SamAutomaticMaskGenerator, sam_model_registry

    device = "cuda" if torch.cuda.is_available() else "cpu"
    sam = sam_model_registry[model_type](checkpoint=str(checkpoint_path))
    sam.to(device=device)
    generator = SamAutomaticMaskGenerator(
        sam,
        points_per_side=32,
        pred_iou_thresh=0.86,
        stability_score_thresh=0.92,
        crop_n_layers=1,
        crop_n_points_downscale_factor=2,
        min_mask_region_area=128,
    )
    masks = generator.generate(image_rgb)
    return masks, device, torch.__version__


def normalize_bbox(raw_bbox: Iterable[float], width: int, height: int) -> Tuple[int, int, int, int]:
    values = list(raw_bbox)
    if len(values) < 4:
        return 0, 0, width - 1, height - 1
    x = max(0, int(round(values[0])))
    y = max(0, int(round(values[1])))
    w = max(1, int(round(values[2])))
    h = max(1, int(round(values[3])))
    x1 = min(width - 1, x + w - 1)
    y1 = min(height - 1, y + h - 1)
    return x, y, x1, y1


def border_touch_ratio(mask: np.ndarray) -> float:
    if mask.ndim != 2:
        return 1.0
    h, w = mask.shape
    if h < 2 or w < 2:
        return 1.0
    perimeter = (2 * h) + (2 * w) - 4
    if perimeter <= 0:
        return 1.0
    touches = (
        int(mask[0, :].sum())
        + int(mask[h - 1, :].sum())
        + int(mask[:, 0].sum())
        + int(mask[:, w - 1].sum())
    )
    return float(touches) / float(perimeter)


def select_largest_object_mask(
    masks: list[dict[str, Any]],
    image_width: int,
    image_height: int,
    min_area_ratio: float,
    max_area_ratio: float,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    if not masks:
        raise RuntimeError("SAM returned no masks.")

    image_area = float(image_width * image_height)
    scored: list[Tuple[float, np.ndarray, Dict[str, Any]]] = []

    for item in masks:
        raw_segmentation = item.get("segmentation")
        if raw_segmentation is None:
            continue
        mask = np.asarray(raw_segmentation, dtype=bool)
        if mask.shape != (image_height, image_width):
            continue

        area = float(item.get("area") or int(mask.sum()))
        if area <= 0:
            continue
        area_ratio = area / image_area
        if area_ratio < min_area_ratio or area_ratio > max_area_ratio:
            continue

        x0, y0, x1, y1 = normalize_bbox(
            item.get("bbox", [0, 0, image_width, image_height]),
            image_width,
            image_height,
        )
        bbox_area = float(max(1, (x1 - x0 + 1) * (y1 - y0 + 1)))
        fill_ratio = area / bbox_area
        touch_ratio = border_touch_ratio(mask)
        score = area * (1.0 - min(0.9, touch_ratio)) * (0.5 + (0.5 * fill_ratio))
        meta = {
            "area": int(area),
            "area_ratio": area_ratio,
            "bbox": [x0, y0, x1, y1],
            "touch_ratio": touch_ratio,
            "fill_ratio": fill_ratio,
            "score": score,
        }
        scored.append((score, mask, meta))

    if not scored:
        sorted_by_area = sorted(
            (
                (
                    float(item.get("area") or np.asarray(item.get("segmentation"), dtype=bool).sum()),
                    np.asarray(item.get("segmentation"), dtype=bool),
                )
                for item in masks
                if item.get("segmentation") is not None
            ),
            key=lambda pair: pair[0],
            reverse=True,
        )
        if not sorted_by_area:
            raise RuntimeError("No valid SAM masks with segmentation arrays.")
        fallback_mask = sorted_by_area[0][1]
        y_coords, x_coords = np.where(fallback_mask)
        if len(x_coords) == 0 or len(y_coords) == 0:
            raise RuntimeError("Fallback SAM mask is empty.")
        bbox = [
            int(x_coords.min()),
            int(y_coords.min()),
            int(x_coords.max()),
            int(y_coords.max()),
        ]
        return fallback_mask, {
            "area": int(sorted_by_area[0][0]),
            "area_ratio": float(sorted_by_area[0][0]) / image_area,
            "bbox": bbox,
            "touch_ratio": border_touch_ratio(fallback_mask),
            "fill_ratio": 1.0,
            "score": float(sorted_by_area[0][0]),
            "fallback_selection": True,
        }

    scored.sort(key=lambda item: item[0], reverse=True)
    _, selected_mask, selected_meta = scored[0]
    return selected_mask, selected_meta


def keep_largest_connected_component(mask: np.ndarray) -> Tuple[np.ndarray, int]:
    mask_u8 = mask.astype(np.uint8)
    labels_count, labels, stats, _ = cv2.connectedComponentsWithStats(mask_u8, connectivity=8)
    if labels_count <= 1:
        return mask, int(mask.sum())

    component_areas = stats[1:, cv2.CC_STAT_AREA]
    largest_offset = int(np.argmax(component_areas))
    selected_label = largest_offset + 1
    cleaned = labels == selected_label
    return cleaned, int(component_areas[largest_offset])


def remove_floor_region(mask: np.ndarray, bbox: Tuple[int, int, int, int], margin_px: int) -> Tuple[np.ndarray, int]:
    floor_cut_y = min(mask.shape[0] - 1, int(bbox[3] + max(0, margin_px)))
    trimmed = mask.copy()
    if floor_cut_y < mask.shape[0] - 1:
        trimmed[floor_cut_y + 1 :, :] = False
    return trimmed, floor_cut_y


def build_masked_rgba(
    image_rgb: np.ndarray,
    mask: np.ndarray,
) -> np.ndarray:
    rgba = np.zeros((image_rgb.shape[0], image_rgb.shape[1], 4), dtype=np.uint8)
    rgba[:, :, :3] = image_rgb
    rgba[:, :, 3] = np.where(mask, 255, 0).astype(np.uint8)
    rgba[~mask, :3] = 0
    return rgba


def crop_tight_rgba(
    image_rgba: np.ndarray,
    mask: np.ndarray,
    padding_ratio: float,
) -> Tuple[np.ndarray, Dict[str, int]]:
    y_coords, x_coords = np.where(mask)
    if len(x_coords) == 0 or len(y_coords) == 0:
        raise RuntimeError("Mask became empty before crop.")

    x_min = int(x_coords.min())
    x_max = int(x_coords.max())
    y_min = int(y_coords.min())
    y_max = int(y_coords.max())

    width = x_max - x_min + 1
    height = y_max - y_min + 1
    pad_x = max(2, int(round(width * max(0.0, padding_ratio))))
    pad_y = max(2, int(round(height * max(0.0, padding_ratio))))

    x0 = max(0, x_min - pad_x)
    y0 = max(0, y_min - pad_y)
    x1 = min(image_rgba.shape[1] - 1, x_max + pad_x)
    y1 = min(image_rgba.shape[0] - 1, y_max + pad_y)

    cropped = image_rgba[y0 : y1 + 1, x0 : x1 + 1, :]
    crop_meta = {
        "x0": x0,
        "y0": y0,
        "x1": x1,
        "y1": y1,
        "width": int(cropped.shape[1]),
        "height": int(cropped.shape[0]),
    }
    return cropped, crop_meta


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Preprocess input image for Hunyuan shape reconstruction.",
    )
    parser.add_argument("--input", required=True, help="Input image path")
    parser.add_argument("--output", required=True, help="Output PNG path")
    parser.add_argument("--metadata", required=True, help="Metadata JSON path")
    parser.add_argument(
        "--sam-checkpoint",
        default="",
        help="Optional SAM checkpoint file path",
    )
    parser.add_argument(
        "--sam-model-type",
        default=DEFAULT_MODEL_TYPE,
        help="SAM model type: vit_h | vit_l | vit_b",
    )
    parser.add_argument(
        "--floor-margin-px",
        type=int,
        default=DEFAULT_FLOOR_MARGIN_PX,
        help="Pixels below object bbox preserved before floor cut",
    )
    parser.add_argument(
        "--padding-ratio",
        type=float,
        default=DEFAULT_PADDING_RATIO,
        help="Relative padding around cropped object",
    )
    parser.add_argument(
        "--min-mask-area-ratio",
        type=float,
        default=DEFAULT_MIN_MASK_AREA_RATIO,
        help="Lower bound ratio for candidate mask area",
    )
    parser.add_argument(
        "--max-mask-area-ratio",
        type=float,
        default=DEFAULT_MAX_MASK_AREA_RATIO,
        help="Upper bound ratio for candidate mask area",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    started_at = time.perf_counter()

    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    metadata_path = Path(args.metadata).expanduser().resolve()

    result: Dict[str, Any] = {
        "preprocess_status": "failed",
        "input_image_path": str(input_path),
        "output_image_path": str(output_path),
        "error": None,
        "traceback": None,
        "duration_ms": None,
        "sam_model_type": None,
        "sam_checkpoint": None,
        "device": None,
        "torch_version": None,
        "mask_count": 0,
        "selected_mask_area": None,
        "selected_mask_area_ratio": None,
        "selected_bbox": None,
        "floor_cut_y": None,
        "crop_box": None,
    }

    exit_code = 1
    try:
        if not input_path.is_file():
            raise RuntimeError(f"Input image not found: {input_path}")

        image_rgb = read_image_rgb(input_path)
        height, width = image_rgb.shape[:2]
        log_line(f"image load OK: {input_path} ({width}x{height})")

        checkpoint_path = resolve_sam_checkpoint(args.sam_checkpoint)
        model_type = infer_model_type(args.sam_model_type, checkpoint_path)
        log_line(f"sam checkpoint: {checkpoint_path}")
        log_line(f"sam model type: {model_type}")

        masks, device, torch_version = generate_masks(
            image_rgb=image_rgb,
            checkpoint_path=checkpoint_path,
            model_type=model_type,
        )
        result["mask_count"] = len(masks)
        result["sam_checkpoint"] = str(checkpoint_path)
        result["sam_model_type"] = model_type
        result["device"] = device
        result["torch_version"] = torch_version
        log_line(f"sam generate OK: masks={len(masks)} device={device}")

        selected_mask, selected_meta = select_largest_object_mask(
            masks=masks,
            image_width=width,
            image_height=height,
            min_area_ratio=max(0.0, float(args.min_mask_area_ratio)),
            max_area_ratio=min(1.0, float(args.max_mask_area_ratio)),
        )
        bbox_values = selected_meta.get("bbox", [0, 0, width - 1, height - 1])
        bbox = (
            int(bbox_values[0]),
            int(bbox_values[1]),
            int(bbox_values[2]),
            int(bbox_values[3]),
        )

        floor_trimmed_mask, floor_cut_y = remove_floor_region(
            selected_mask,
            bbox=bbox,
            margin_px=max(0, int(args.floor_margin_px)),
        )
        refined_mask, component_area = keep_largest_connected_component(floor_trimmed_mask)
        if component_area <= 0:
            raise RuntimeError("Mask empty after floor removal and component cleanup.")

        result["selected_mask_area"] = int(component_area)
        result["selected_mask_area_ratio"] = float(component_area) / float(width * height)
        result["selected_bbox"] = [bbox[0], bbox[1], bbox[2], bbox[3]]
        result["floor_cut_y"] = int(floor_cut_y)

        rgba = build_masked_rgba(image_rgb=image_rgb, mask=refined_mask)
        cropped_rgba, crop_meta = crop_tight_rgba(
            image_rgba=rgba,
            mask=refined_mask,
            padding_ratio=float(args.padding_ratio),
        )
        result["crop_box"] = crop_meta

        ensure_parent_dir(output_path)
        Image.fromarray(cropped_rgba, mode="RGBA").save(output_path, format="PNG")
        log_line(f"preprocessed image saved: {output_path}")

        result["preprocess_status"] = "completed"
        result["error"] = None
        result["traceback"] = None
        exit_code = 0
    except Exception as exc:  # noqa: BLE001
        result["preprocess_status"] = "failed"
        result["error"] = str(exc)
        result["traceback"] = traceback.format_exc()
        log_line(f"failed: {exc}")
    finally:
        result["duration_ms"] = int((time.perf_counter() - started_at) * 1000)
        ensure_parent_dir(metadata_path)
        metadata_path.write_text(
            f"{json.dumps(result, indent=2, ensure_ascii=False)}\n",
            encoding="utf-8",
        )
        print(json.dumps(result, ensure_ascii=False))

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
