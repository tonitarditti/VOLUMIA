#!/usr/bin/env python3
import argparse
import importlib
import json
import os
import subprocess
import sys
import time
import traceback
from dataclasses import dataclass
from typing import Dict, List, Sequence, Tuple

from _bootstrap import ensure_cache_dirs, ensure_packages, get_cache_root
from _device import detect_device
from _models import get_depth_model

print("VOLUMIA PYTHON PATH:", sys.executable)

FURNITURE_CLASSES = ("table", "chair", "sofa", "cabinet", "desk")
MAX_OBJECTS = 5
MIN_COMPONENT_AREA_RATIO = 0.05
PLANE_MIN_COVERAGE = 0.20
FACE_TARGETS = {
    "fast": (8000, 15000),
    "balanced": (15000, 30000),
    "high": (30000, 60000),
}
MIN_VERTS = 1500
MIN_FACES = 3000
MIN_BYTES_ABSOLUTE = 40 * 1024
SOFT_WARN_BYTES = 200 * 1024
BROKEN_MIN_VERTS = 500
BROKEN_MIN_FACES = 800


@dataclass
class FurnitureDetection:
    category: str
    score: float
    x1: int
    y1: int
    x2: int
    y2: int


@dataclass
class ObjectCandidate:
    label: str
    confidence: float
    bbox: Tuple[int, int, int, int]
    mask: "np.ndarray"
    source: str


def log(message: str) -> None:
    print(message, flush=True)


def log_error(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def emit_progress(stage: str, percent: int, message: str, device: str | None = None) -> None:
    payload = {
        "stage": stage,
        "percent": max(0, min(100, int(percent))),
        "message": message,
    }
    if device in {"cuda", "cpu"}:
        payload["device"] = device
    print(json.dumps(payload), flush=True)


def log_cuda_check() -> None:
    try:
        import torch

        print("[CUDA CHECK] available=", torch.cuda.is_available(), flush=True)
        print("[CUDA CHECK] count=", torch.cuda.device_count(), flush=True)
        if torch.cuda.is_available():
            print("[CUDA CHECK] name=", torch.cuda.get_device_name(0), flush=True)
    except Exception as error:
        print("[CUDA CHECK] available= False", flush=True)
        print("[CUDA CHECK] count= 0", flush=True)
        print(f"[CUDA CHECK] error= {error}", flush=True)


def _map_detection_label(label: str) -> str:
    label_normalized = label.strip().lower()
    if label_normalized in {"dining table", "table"} or "table" in label_normalized:
        return "table"
    if "chair" in label_normalized:
        return "chair"
    if label_normalized in {"couch", "sofa"} or "sofa" in label_normalized:
        return "sofa"
    if label_normalized in {"cabinet", "cupboard", "bookcase", "wardrobe"} or "cabinet" in label_normalized:
        return "cabinet"
    if "desk" in label_normalized:
        return "desk"
    return ""


def _box_iou(a: FurnitureDetection, b: FurnitureDetection) -> float:
    inter_x1 = max(a.x1, b.x1)
    inter_y1 = max(a.y1, b.y1)
    inter_x2 = min(a.x2, b.x2)
    inter_y2 = min(a.y2, b.y2)
    if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
        return 0.0
    inter = float((inter_x2 - inter_x1) * (inter_y2 - inter_y1))
    area_a = float(max(a.x2 - a.x1, 1) * max(a.y2 - a.y1, 1))
    area_b = float(max(b.x2 - b.x1, 1) * max(b.y2 - b.y1, 1))
    union = max(area_a + area_b - inter, 1e-6)
    return inter / union


def _nms_by_category(detections: Sequence[FurnitureDetection], iou_threshold: float = 0.35) -> List[FurnitureDetection]:
    grouped: Dict[str, List[FurnitureDetection]] = {category: [] for category in FURNITURE_CLASSES}
    for detection in detections:
        grouped[detection.category].append(detection)

    selected: List[FurnitureDetection] = []
    for category in FURNITURE_CLASSES:
        candidates = sorted(grouped[category], key=lambda item: item.score, reverse=True)
        kept: List[FurnitureDetection] = []
        while candidates:
            current = candidates.pop(0)
            kept.append(current)
            candidates = [other for other in candidates if _box_iou(current, other) < iou_threshold]
        selected.extend(kept)
    return selected


def detect_furniture_objects(image) -> List[FurnitureDetection]:
    _ensure_runtime_package("timm", required=True)

    from transformers import pipeline

    width, height = image.size
    detector = pipeline("object-detection", model="facebook/detr-resnet-50")
    raw_predictions = detector(image)

    detections: List[FurnitureDetection] = []
    for prediction in raw_predictions:
        category = _map_detection_label(str(prediction.get("label", "")))
        if not category:
            continue

        score = float(prediction.get("score", 0.0))
        threshold = 0.4 if category == "table" else 0.45
        if score < threshold:
            continue

        box = prediction.get("box") or {}
        x1 = int(max(0, min(width - 1, float(box.get("xmin", 0)))))
        y1 = int(max(0, min(height - 1, float(box.get("ymin", 0)))))
        x2 = int(max(0, min(width - 1, float(box.get("xmax", 0)))))
        y2 = int(max(0, min(height - 1, float(box.get("ymax", 0)))))
        if x2 <= x1 or y2 <= y1:
            continue

        detections.append(
            FurnitureDetection(
                category=category,
                score=score,
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
            )
        )

    return _nms_by_category(detections)


def log_detection_counts(detections: Sequence[FurnitureDetection]) -> None:
    counts = {category: 0 for category in FURNITURE_CLASSES}
    for detection in detections:
        counts[detection.category] += 1
    log(
        "[DETECT] "
        f"tables={counts['table']} "
        f"chairs={counts['chair']} "
        f"sofas={counts['sofa']} "
        f"cabinets={counts['cabinet']} "
        f"desks={counts['desk']}"
    )


def _ensure_runtime_package(package_name: str, module_name: str = "", required: bool = False) -> bool:
    module = module_name or package_name.replace("-", "_")
    try:
        importlib.import_module(module)
        return True
    except Exception:
        pass

    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", package_name])
        log(f"[BOOT] installed package: {package_name}")
        importlib.invalidate_caches()
        importlib.import_module(module)
        return True
    except Exception as error:
        if required:
            raise RuntimeError(f"Missing required package '{package_name}': {error}") from error
        log(f"[BOOT] warning: optional package '{package_name}' unavailable: {error}")
        return False


def _bbox_from_mask(mask) -> Tuple[int, int, int, int] | None:
    ys, xs = np.where(mask > 0)
    if xs.size == 0 or ys.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _bbox_iou(box_a: Tuple[int, int, int, int], box_b: Tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
        return 0.0
    inter = float((inter_x2 - inter_x1) * (inter_y2 - inter_y1))
    area_a = float(max(ax2 - ax1, 1) * max(ay2 - ay1, 1))
    area_b = float(max(bx2 - bx1, 1) * max(by2 - by1, 1))
    union = max(area_a + area_b - inter, 1e-6)
    return inter / union


def _mask_from_bbox(shape: Tuple[int, int], bbox: Tuple[int, int, int, int]):
    h, w = shape
    x1, y1, x2, y2 = bbox
    x1 = int(max(0, min(w - 1, x1)))
    y1 = int(max(0, min(h - 1, y1)))
    x2 = int(max(0, min(w, x2)))
    y2 = int(max(0, min(h, y2)))
    mask = np.zeros((h, w), dtype=np.uint8)
    if x2 > x1 and y2 > y1:
        mask[y1:y2, x1:x2] = 1
    return mask


def _largest_connected_component(mask_crop):
    import cv2

    mask_uint8 = (mask_crop > 0).astype(np.uint8)
    if int(np.count_nonzero(mask_uint8)) == 0:
        return mask_uint8

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask_uint8, connectivity=8)
    if num_labels <= 1:
        return mask_uint8

    areas = stats[1:, cv2.CC_STAT_AREA].astype(np.int64)
    largest_area = int(areas.max()) if areas.size else 0
    min_area = int(max(1, round(largest_area * MIN_COMPONENT_AREA_RATIO)))
    candidate_labels = [label for label in range(1, num_labels) if int(stats[label, cv2.CC_STAT_AREA]) >= min_area]
    if not candidate_labels:
        return mask_uint8
    dominant_label = max(candidate_labels, key=lambda label: int(stats[label, cv2.CC_STAT_AREA]))
    return (labels == dominant_label).astype(np.uint8)


def _run_ultralytics_segmentation(rgb, max_objects: int):
    import cv2

    if not _ensure_runtime_package("ultralytics", required=False):
        return []

    try:
        from ultralytics import YOLO
    except Exception as error:
        log(f"[SEG] warning: ultralytics import failed: {error}")
        return []

    h, w = rgb.shape[:2]
    min_area = max(64, int(h * w * 0.005))
    try:
        model = YOLO("yolov8n-seg.pt")
        results = model(rgb, verbose=False)
        if not results:
            return []
        result = results[0]
        if result.masks is None or result.boxes is None:
            return []

        masks_np = result.masks.data.detach().cpu().numpy()
        boxes_np = result.boxes.xyxy.detach().cpu().numpy()
        scores_np = result.boxes.conf.detach().cpu().numpy()

        candidates = []
        for index in range(min(len(masks_np), max_objects * 4)):
            mask = (masks_np[index] > 0.5).astype(np.uint8)
            if mask.shape != (h, w):
                mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
                mask = (mask > 0).astype(np.uint8)
            area = int(np.count_nonzero(mask))
            if area < min_area:
                continue

            x1, y1, x2, y2 = boxes_np[index]
            bbox = (
                int(max(0, min(w - 1, x1))),
                int(max(0, min(h - 1, y1))),
                int(max(1, min(w, x2))),
                int(max(1, min(h, y2))),
            )
            candidates.append((mask, bbox, float(scores_np[index]), area))

        candidates.sort(key=lambda item: item[3], reverse=True)
        return candidates[:max_objects]
    except Exception as error:
        log(f"[SEG] warning: ultralytics segmentation unavailable: {error}")
        return []


def _fallback_contour_segments(rgb, max_objects: int):
    import cv2

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    edges = cv2.Canny(blur, 40, 120)
    merged = cv2.bitwise_or(thresh, edges)
    merged = cv2.morphologyEx(merged, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)

    contours, _ = cv2.findContours(merged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = gray.shape
    min_area = max(64, int(h * w * 0.01))

    results = []
    for contour in sorted(contours, key=cv2.contourArea, reverse=True):
        area = int(cv2.contourArea(contour))
        if area < min_area:
            continue
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(mask, [contour], -1, 1, -1)
        bbox = _bbox_from_mask(mask)
        if bbox is None:
            continue
        results.append((mask, bbox, 0.25, area))
        if len(results) >= max_objects:
            break
    return results


def build_object_candidates(image, rgb, detections: Sequence[FurnitureDetection], max_objects: int = MAX_OBJECTS) -> List[ObjectCandidate]:
    h, w = rgb.shape[:2]
    segmentation_candidates = _run_ultralytics_segmentation(rgb, max(max_objects, 8))
    objects: List[ObjectCandidate] = []

    if detections:
        ordered_detections = sorted(detections, key=lambda item: item.score, reverse=True)
        for det in ordered_detections:
            det_bbox = (
                int(max(0, min(w - 1, det.x1))),
                int(max(0, min(h - 1, det.y1))),
                int(max(1, min(w, det.x2 + 1))),
                int(max(1, min(h, det.y2 + 1))),
            )

            best_mask = None
            best_score = 0.0
            for seg_mask, seg_bbox, _, _ in segmentation_candidates:
                iou = _bbox_iou(det_bbox, seg_bbox)
                if iou > best_score:
                    best_score = iou
                    best_mask = seg_mask

            if best_mask is None or best_score < 0.08:
                mask = _mask_from_bbox((h, w), det_bbox)
                source = "detr-box"
            else:
                mask = best_mask.copy()
                source = "detr+seg"

            bbox = _bbox_from_mask(mask) or det_bbox
            objects.append(
                ObjectCandidate(
                    label=det.category,
                    confidence=float(det.score),
                    bbox=bbox,
                    mask=mask,
                    source=source,
                )
            )
            if len(objects) >= max_objects:
                break

    if not objects:
        if not segmentation_candidates:
            segmentation_candidates = _fallback_contour_segments(rgb, max_objects=max_objects)

        for seg_mask, seg_bbox, seg_score, _ in segmentation_candidates:
            objects.append(
                ObjectCandidate(
                    label="segment",
                    confidence=float(seg_score),
                    bbox=seg_bbox,
                    mask=seg_mask.copy(),
                    source="segment-fallback",
                )
            )
            if len(objects) >= max_objects:
                break

    if not objects:
        objects = [
            ObjectCandidate(
                label="full-image",
                confidence=0.0,
                bbox=(0, 0, w, h),
                mask=np.ones((h, w), dtype=np.uint8),
                source="full-image-fallback",
            )
        ]

    for index, obj in enumerate(objects, start=1):
        x1, y1, x2, y2 = obj.bbox
        area = int(np.count_nonzero(obj.mask))
        log(
            f"[OBJECT] id=object_{index:03d} source={obj.source} label={obj.label} "
            f"bbox=({x1},{y1},{x2},{y2}) area={area} conf={obj.confidence:.3f}"
        )
    return objects


def _quality_profile(quality: str) -> Dict[str, float]:
    if quality == "fast":
        return {"step": 4.0, "max_side": 320.0, "smooth": 0.0, "depth_jump": 0.12}
    if quality == "high":
        return {"step": 1.0, "max_side": 768.0, "smooth": 0.9, "depth_jump": 0.2}
    return {"step": 2.0, "max_side": 512.0, "smooth": 0.5, "depth_jump": 0.16}


def _estimate_faces_for_step(height: int, width: int, step: int) -> int:
    grid_h = int(np.ceil(max(height - 1, 1) / max(step, 1))) + 1
    grid_w = int(np.ceil(max(width - 1, 1) / max(step, 1))) + 1
    return max(0, (grid_h - 1) * (grid_w - 1) * 2)


def _face_target_range(quality: str) -> Tuple[int, int]:
    return FACE_TARGETS.get(quality, FACE_TARGETS["balanced"])


def _compute_depth_jump(sampled_depth, valid_mask, fallback: float) -> float:
    valid_depths = sampled_depth[valid_mask]
    if valid_depths.size < 16:
        return float(fallback)
    p5, p95 = np.percentile(valid_depths.astype(np.float64), [5, 95])
    dynamic_jump = float((p95 - p5) * 0.08)
    if not np.isfinite(dynamic_jump) or dynamic_jump <= 0:
        return float(fallback)
    return float(np.clip(dynamic_jump, 0.005, 0.25))


def _fit_dominant_plane(vertices, quality: str):
    if vertices.shape[0] < 128:
        return None

    rng = np.random.default_rng(42)
    z_values = vertices[:, 2]
    z_span = float(np.percentile(z_values, 95) - np.percentile(z_values, 5))
    if quality == "fast":
        threshold = max(0.003, z_span * 0.015)
        max_trials = 120
    else:
        threshold = max(0.002, z_span * 0.01)
        max_trials = 80

    best_inliers = None
    best_count = 0
    best_normal = None
    best_d = 0.0

    for _ in range(max_trials):
        sample_idx = rng.choice(vertices.shape[0], size=3, replace=False)
        p0, p1, p2 = vertices[sample_idx]
        normal = np.cross(p1 - p0, p2 - p0)
        norm = float(np.linalg.norm(normal))
        if norm < 1e-9:
            continue
        normal = normal / norm
        d = -float(np.dot(normal, p0))
        distances = np.abs(vertices @ normal + d)
        inliers = distances <= threshold
        inlier_count = int(np.count_nonzero(inliers))
        if inlier_count > best_count:
            best_count = inlier_count
            best_inliers = inliers
            best_normal = normal
            best_d = d

    if best_inliers is None:
        return None

    coverage = float(best_count) / float(max(vertices.shape[0], 1))
    if coverage < PLANE_MIN_COVERAGE:
        return None
    return best_normal, best_d, best_inliers, threshold, coverage


def _planarize_vertices(vertices, faces, quality: str):
    if quality == "high":
        return vertices
    if vertices.shape[0] < 128 or faces.shape[0] < 64:
        return vertices

    plane = _fit_dominant_plane(vertices, quality)
    if plane is None:
        return vertices

    normal, d, inliers, threshold, coverage = plane
    degree = np.zeros(vertices.shape[0], dtype=np.int32)
    np.add.at(degree, faces.reshape(-1), 1)
    boundary = degree < 6
    inliers = inliers & (~boundary)
    if int(np.count_nonzero(inliers)) < 64:
        return vertices

    distance = vertices @ normal + d
    projected = vertices - distance[:, None] * normal[None, :]
    strength = 0.95 if quality == "fast" else 0.55
    output = vertices.copy()
    output[inliers] = output[inliers] * (1.0 - strength) + projected[inliers] * strength
    log(
        f"[PLANAR] coverage={coverage:.2f} inliers={int(np.count_nonzero(inliers))} "
        f"threshold={threshold:.5f} strength={strength:.2f}"
    )
    return output


def _weld_vertices(vertices, faces, uvs, tolerance: float):
    if vertices.shape[0] == 0 or faces.shape[0] == 0:
        return vertices, faces, uvs

    tol = max(float(tolerance), 1e-8)
    quantized = np.round(vertices / tol).astype(np.int64)
    _, inverse = np.unique(quantized, axis=0, return_inverse=True)
    vertex_count = int(inverse.max()) + 1 if inverse.size else 0
    if vertex_count <= 0:
        return vertices, faces, uvs

    accum_vertices = np.zeros((vertex_count, 3), dtype=np.float64)
    counts = np.bincount(inverse, minlength=vertex_count).astype(np.float64)
    np.add.at(accum_vertices, inverse, vertices)
    welded_vertices = accum_vertices / np.clip(counts[:, None], 1.0, None)

    welded_uvs = None
    if uvs is not None and uvs.shape[0] == vertices.shape[0]:
        accum_uv = np.zeros((vertex_count, 2), dtype=np.float64)
        np.add.at(accum_uv, inverse, uvs)
        welded_uvs = accum_uv / np.clip(counts[:, None], 1.0, None)

    welded_faces = inverse[faces]
    valid = (
        (welded_faces[:, 0] != welded_faces[:, 1])
        & (welded_faces[:, 1] != welded_faces[:, 2])
        & (welded_faces[:, 0] != welded_faces[:, 2])
    )
    welded_faces = welded_faces[valid]
    if welded_faces.shape[0] == 0:
        return welded_vertices, welded_faces, welded_uvs

    used = np.unique(welded_faces.reshape(-1))
    remap = np.full(welded_vertices.shape[0], -1, dtype=np.int64)
    remap[used] = np.arange(used.shape[0], dtype=np.int64)
    welded_faces = remap[welded_faces]
    welded_vertices = welded_vertices[used]
    if welded_uvs is not None:
        welded_uvs = welded_uvs[used]

    return welded_vertices, welded_faces.astype(np.int64), welded_uvs


def _keep_largest_mesh_component(vertices, faces, uvs):
    if vertices.shape[0] == 0 or faces.shape[0] == 0:
        return vertices, faces, uvs

    vertex_count = vertices.shape[0]
    parent = np.arange(vertex_count, dtype=np.int64)
    rank = np.zeros(vertex_count, dtype=np.int8)

    def find_root(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return int(index)

    def union(a: int, b: int) -> None:
        ra = find_root(a)
        rb = find_root(b)
        if ra == rb:
            return
        if rank[ra] < rank[rb]:
            parent[ra] = rb
        elif rank[ra] > rank[rb]:
            parent[rb] = ra
        else:
            parent[rb] = ra
            rank[ra] += 1

    for tri in faces:
        a, b, c = int(tri[0]), int(tri[1]), int(tri[2])
        union(a, b)
        union(b, c)

    roots = np.fromiter((find_root(i) for i in range(vertex_count)), dtype=np.int64, count=vertex_count)
    counts = np.bincount(roots, minlength=vertex_count)
    largest_root = int(np.argmax(counts))
    keep_faces = roots[faces[:, 0]] == largest_root
    faces_kept = faces[keep_faces]
    if faces_kept.shape[0] == 0:
        return vertices, faces, uvs

    used = np.unique(faces_kept.reshape(-1))
    remap = np.full(vertex_count, -1, dtype=np.int64)
    remap[used] = np.arange(used.shape[0], dtype=np.int64)
    faces_kept = remap[faces_kept]
    vertices_kept = vertices[used]
    uvs_kept = uvs[used] if (uvs is not None and uvs.shape[0] == vertices.shape[0]) else uvs
    return vertices_kept, faces_kept.astype(np.int64), uvs_kept


def _resize_crop_triplet(depth_crop, rgb_crop, mask_crop, max_side: int):
    import cv2

    h, w = depth_crop.shape[:2]
    if max(h, w) <= max_side:
        return depth_crop, rgb_crop, mask_crop

    scale = float(max_side) / float(max(h, w))
    new_w = max(2, int(round(w * scale)))
    new_h = max(2, int(round(h * scale)))
    depth_rs = cv2.resize(depth_crop, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    rgb_rs = cv2.resize(rgb_crop, (new_w, new_h), interpolation=cv2.INTER_AREA)
    mask_rs = cv2.resize(mask_crop.astype(np.uint8), (new_w, new_h), interpolation=cv2.INTER_NEAREST)
    return depth_rs, rgb_rs, (mask_rs > 0).astype(np.uint8)


def build_textured_grid_mesh(depth_crop, rgb_crop, mask_crop, bbox_full: Tuple[int, int, int, int], full_shape: Tuple[int, int], quality: str):
    import cv2
    import trimesh
    from PIL import Image

    if depth_crop.size == 0 or rgb_crop.size == 0 or mask_crop.size == 0:
        raise RuntimeError("empty crop")

    depth_h, depth_w = depth_crop.shape[:2]
    rgb_h, rgb_w = rgb_crop.shape[:2]
    if (rgb_h, rgb_w) != (depth_h, depth_w):
        rgb_crop = cv2.resize(rgb_crop, (depth_w, depth_h), interpolation=cv2.INTER_AREA)
    if mask_crop.shape[:2] != (depth_h, depth_w):
        mask_crop = cv2.resize(mask_crop.astype(np.uint8), (depth_w, depth_h), interpolation=cv2.INTER_NEAREST)
        mask_crop = (mask_crop > 0).astype(np.uint8)

    profile = _quality_profile(quality)
    depth_proc = depth_crop.astype(np.float32)
    if min(depth_proc.shape[:2]) >= 5:
        depth_proc = cv2.medianBlur(depth_proc.astype(np.float32), 5)
    depth_proc = cv2.bilateralFilter(depth_proc, 7, 50, 50)
    if profile["smooth"] > 0:
        depth_proc = cv2.GaussianBlur(depth_proc, (0, 0), sigmaX=profile["smooth"])

    depth_proc, rgb_proc, mask_proc = _resize_crop_triplet(
        depth_proc,
        rgb_crop,
        mask_crop,
        int(profile["max_side"]),
    )
    h, w = depth_proc.shape[:2]
    if h < 3 or w < 3:
        raise RuntimeError("crop too small")

    _, target_max_faces = _face_target_range(quality)
    step = int(profile["step"])
    while _estimate_faces_for_step(h, w, step) > target_max_faces and step < max(h, w):
        step += 1

    ys = np.arange(0, h, step, dtype=np.int32)
    xs = np.arange(0, w, step, dtype=np.int32)
    if ys.size == 0 or ys[-1] != (h - 1):
        ys = np.append(ys, h - 1)
    if xs.size == 0 or xs[-1] != (w - 1):
        xs = np.append(xs, w - 1)

    uu, vv = np.meshgrid(xs, ys)
    vv = np.clip(vv, 0, h - 1)
    uu = np.clip(uu, 0, w - 1)

    sampled_depth = depth_proc[vv, uu].astype(np.float32)
    sampled_mask = mask_proc[vv, uu] > 0
    valid_depth = np.isfinite(sampled_depth) & (sampled_depth > 1e-6)
    valid = sampled_mask & valid_depth
    if int(np.count_nonzero(valid)) < 9:
        raise RuntimeError("not enough valid depth samples")
    depth_jump = _compute_depth_jump(sampled_depth, valid, profile["depth_jump"])

    full_h, full_w = full_shape
    x1, y1, x2, y2 = bbox_full
    crop_h = max(y2 - y1, 1)
    crop_w = max(x2 - x1, 1)

    global_u = x1 + (uu.astype(np.float64) / max(w - 1, 1)) * max(crop_w - 1, 1)
    global_v = y1 + (vv.astype(np.float64) / max(h - 1, 1)) * max(crop_h - 1, 1)
    z = np.where(valid_depth, sampled_depth, 0.0).astype(np.float64)

    focal = 0.9 * max(full_w, full_h)
    cx = full_w * 0.5
    cy = full_h * 0.5
    x = (global_u - cx) * z / max(focal, 1e-6)
    y = -(global_v - cy) * z / max(focal, 1e-6)

    grid_h, grid_w = sampled_depth.shape
    vertices = np.stack([x, y, z], axis=-1).reshape(-1, 3).astype(np.float64)
    uvs = np.stack(
        [
            (uu.astype(np.float64) / max(w - 1, 1)),
            (1.0 - (vv.astype(np.float64) / max(h - 1, 1))),
        ],
        axis=-1,
    ).reshape(-1, 2)

    faces: List[List[int]] = []
    for row in range(grid_h - 1):
        for col in range(grid_w - 1):
            if not (valid[row, col] and valid[row, col + 1] and valid[row + 1, col] and valid[row + 1, col + 1]):
                continue

            d00 = float(sampled_depth[row, col])
            d01 = float(sampled_depth[row, col + 1])
            d10 = float(sampled_depth[row + 1, col])
            d11 = float(sampled_depth[row + 1, col + 1])
            if (
                abs(d00 - d01) > depth_jump
                or abs(d00 - d10) > depth_jump
                or abs(d11 - d01) > depth_jump
                or abs(d11 - d10) > depth_jump
            ):
                continue

            v0 = row * grid_w + col
            v1 = v0 + 1
            v2 = v0 + grid_w
            v3 = v2 + 1
            faces.append([v0, v1, v2])
            faces.append([v1, v3, v2])

    faces_np = np.asarray(faces, dtype=np.int64)
    if faces_np.shape[0] < 4:
        raise RuntimeError("insufficient faces after filtering")

    vertices = _planarize_vertices(vertices, faces_np, quality)

    vertices_before = int(vertices.shape[0])
    faces_before = int(faces_np.shape[0])
    weld_tolerance = {"fast": 0.0012, "balanced": 0.0010, "high": 0.0008}[quality]
    vertices, faces_np, uvs = _weld_vertices(vertices, faces_np, uvs, tolerance=weld_tolerance)
    vertices, faces_np, uvs = _keep_largest_mesh_component(vertices, faces_np, uvs)
    log(f"[CLEAN] vertices_before={vertices_before} faces_before={faces_before}")
    log(f"[CLEAN] vertices_after={int(vertices.shape[0])} faces_after={int(faces_np.shape[0])}")

    if faces_np.shape[0] < 4:
        raise RuntimeError("insufficient faces after cleanup")

    visual = None
    try:
        texture_image = Image.fromarray(rgb_proc.astype(np.uint8), mode="RGB")
        material = trimesh.visual.material.SimpleMaterial(image=texture_image)
        visual = trimesh.visual.texture.TextureVisuals(uv=uvs, image=texture_image, material=material)
    except Exception as texture_error:
        log(f"[TEXTURE] warning: fallback to no-texture material: {texture_error}")

    mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces_np,
        visual=visual,
        process=False,
    )
    if visual is None:
        fallback_color = np.tile(np.array([190, 190, 190, 255], dtype=np.uint8), (len(mesh.vertices), 1))
        mesh.visual.vertex_colors = fallback_color
    mesh.remove_unreferenced_vertices()
    _ = mesh.vertex_normals
    return mesh


def build_multi_object_textured_scene(rgb, depth, objects: Sequence[ObjectCandidate], quality: str):
    import trimesh

    h, w = rgb.shape[:2]
    scene = trimesh.Scene()
    metadata_objects = []
    total_triangles = 0

    for index, obj in enumerate(objects, start=1):
        started = time.perf_counter()
        x1, y1, x2, y2 = obj.bbox
        pad_x = max(2, int((x2 - x1) * 0.06))
        pad_y = max(2, int((y2 - y1) * 0.06))
        x1p = max(0, x1 - pad_x)
        y1p = max(0, y1 - pad_y)
        x2p = min(w, x2 + pad_x)
        y2p = min(h, y2 + pad_y)

        rgb_crop = rgb[y1p:y2p, x1p:x2p]
        depth_crop = depth[y1p:y2p, x1p:x2p]
        mask_crop = obj.mask[y1p:y2p, x1p:x2p]
        mask_crop = _largest_connected_component(mask_crop)
        print(
            f"[OBJECT {index:03d}] rgb_crop={rgb_crop.shape} depth_crop={depth_crop.shape} mask_crop={mask_crop.shape}",
            flush=True,
        )

        try:
            mesh = build_textured_grid_mesh(
                depth_crop=depth_crop,
                rgb_crop=rgb_crop,
                mask_crop=mask_crop,
                bbox_full=(x1p, y1p, x2p, y2p),
                full_shape=(h, w),
                quality=quality,
            )
        except Exception as error:
            log(f"[OBJECT] skip object_{index:03d}: {error}")
            continue

        name = f"object_{index:03d}"
        scene.add_geometry(mesh, node_name=name, geom_name=name)
        triangles = int(len(mesh.faces))
        total_triangles += triangles
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        metadata_objects.append(
            {
                "id": name,
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "confidence": float(obj.confidence),
                "label": obj.label,
                "area": int(np.count_nonzero(obj.mask)),
                "source": obj.source,
                "triangles": triangles,
                "processing_ms": elapsed_ms,
            }
        )

    if len(scene.geometry) == 0:
        log("[OBJECT] warning: all object meshes failed; attempting full-image fallback mesh")
        fallback_mask = np.ones((h, w), dtype=np.uint8)
        fallback_object = ObjectCandidate(
            label="full-image-fallback",
            confidence=0.0,
            bbox=(0, 0, w, h),
            mask=fallback_mask,
            source="emergency-fallback",
        )
        try:
            mesh = build_textured_grid_mesh(
                depth_crop=depth,
                rgb_crop=rgb,
                mask_crop=fallback_object.mask,
                bbox_full=fallback_object.bbox,
                full_shape=(h, w),
                quality=quality,
            )
            name = "object_001"
            scene.add_geometry(mesh, node_name=name, geom_name=name)
            triangles = int(len(mesh.faces))
            total_triangles += triangles
            metadata_objects.append(
                {
                    "id": name,
                    "bbox": [0, 0, w, h],
                    "confidence": 0.0,
                    "label": fallback_object.label,
                    "area": int(np.count_nonzero(fallback_object.mask)),
                    "source": fallback_object.source,
                    "triangles": triangles,
                    "processing_ms": 0,
                }
            )
        except Exception as fallback_error:
            log(f"[OBJECT] fallback mesh failed: {fallback_error}")

    return scene, metadata_objects, total_triangles


def export_scene_with_metadata(scene, out_path: str, metadata_objects: Sequence[dict], total_triangles: int):
    if len(scene.geometry) == 0:
        raise RuntimeError("No mesh primitives to export")

    total_vertices = 0
    total_faces = 0
    for geometry in scene.geometry.values():
        if hasattr(geometry, "vertices"):
            total_vertices += int(len(geometry.vertices))
        if hasattr(geometry, "faces"):
            total_faces += int(len(geometry.faces))

    scene.export(out_path, file_type="glb")
    glb_size = os.path.getsize(out_path) if os.path.exists(out_path) else 0
    metadata_path = os.path.join(os.path.dirname(out_path), "latest.json")
    metadata_payload = {
        "objects": list(metadata_objects),
        "multi_view_mode": {
            "enabled": False,
            "hook": "reserved_for_future_multi_view_fusion",
        },
        "note": (
            "Single-view reconstruction: visible surfaces preserve input appearance; "
            "occluded geometry is depth-based approximation."
        ),
    }
    with open(metadata_path, "w", encoding="utf-8") as handle:
        json.dump(metadata_payload, handle, ensure_ascii=False, indent=2)

    return glb_size, metadata_path, int(total_triangles), total_vertices, total_faces


def region_mean_color(rgb, x1: int, y1: int, x2: int, y2: int):
    h, w = rgb.shape[:2]
    x1 = int(max(0, min(w - 1, x1)))
    y1 = int(max(0, min(h - 1, y1)))
    x2 = int(max(0, min(w, x2)))
    y2 = int(max(0, min(h, y2)))
    if x2 <= x1 or y2 <= y1:
        return np.array([150.0, 150.0, 150.0], dtype=np.float64)

    region = rgb[y1:y2, x1:x2]
    if region.size == 0:
        return np.array([150.0, 150.0, 150.0], dtype=np.float64)
    return np.mean(region.reshape(-1, 3), axis=0, dtype=np.float64)


def ellipse_mean_color(rgb, cx: float, cy: float, rx: float, ry: float, angle: float):
    import cv2

    h, w = rgb.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.ellipse(
        mask,
        (int(round(cx)), int(round(cy))),
        (max(int(round(rx)), 1), max(int(round(ry)), 1)),
        float(angle),
        0,
        360,
        255,
        -1,
    )
    pixels = rgb[mask > 0]
    if pixels.size == 0:
        return region_mean_color(
            rgb,
            int(cx - rx),
            int(cy - ry),
            int(cx + rx),
            int(cy + ry),
        )
    return np.mean(pixels, axis=0, dtype=np.float64)


def apply_mesh_color(mesh, rgb_color, alpha: int = 255) -> None:
    color = np.array(
        [
            int(np.clip(rgb_color[0], 0, 255)),
            int(np.clip(rgb_color[1], 0, 255)),
            int(np.clip(rgb_color[2], 0, 255)),
            int(np.clip(alpha, 0, 255)),
        ],
        dtype=np.uint8,
    )
    mesh.visual.vertex_colors = np.tile(color, (len(mesh.vertices), 1))


def _ellipse_residual(points, cx: float, cy: float, rx: float, ry: float, angle_deg: float):
    angle_rad = np.deg2rad(angle_deg)
    cos_a = np.cos(angle_rad)
    sin_a = np.sin(angle_rad)
    x = points[:, 0] - cx
    y = points[:, 1] - cy
    xr = cos_a * x + sin_a * y
    yr = -sin_a * x + cos_a * y
    nx = xr / max(rx, 1e-4)
    ny = yr / max(ry, 1e-4)
    return np.abs((nx * nx + ny * ny) - 1.0)


def fit_ellipse_ransac(points) -> Tuple[float, float, float, float, float] | None:
    import cv2

    if points.shape[0] < 10:
        return None

    rng = np.random.default_rng(42)
    best_inliers = None
    best_score = (-1, -1.0)
    max_trials = 140

    for _ in range(max_trials):
        sample_indices = rng.choice(points.shape[0], size=8, replace=False)
        sample = points[sample_indices].astype(np.float32).reshape(-1, 1, 2)
        try:
            (cx, cy), (major, minor), angle = cv2.fitEllipse(sample)
        except Exception:
            continue

        rx = max(float(major), float(minor)) * 0.5
        ry = min(float(major), float(minor)) * 0.5
        if rx < 2.0 or ry < 2.0 or rx / max(ry, 1e-6) > 6.0:
            continue

        residuals = _ellipse_residual(points, cx, cy, rx, ry, angle)
        inliers = residuals < 0.24
        inlier_count = int(np.count_nonzero(inliers))
        if inlier_count < 12:
            continue
        mean_error = float(np.mean(residuals[inliers]))
        score = (inlier_count, -mean_error)
        if score > best_score:
            best_score = score
            best_inliers = inliers

    if best_inliers is None:
        return None

    inlier_points = points[best_inliers].astype(np.float32).reshape(-1, 1, 2)
    try:
        (cx, cy), (major, minor), angle = cv2.fitEllipse(inlier_points)
    except Exception:
        return None

    rx = max(float(major), float(minor)) * 0.5
    ry = min(float(major), float(minor)) * 0.5
    return float(cx), float(cy), float(rx), float(ry), float(angle)


def estimate_table_ellipse(gray, detection: FurnitureDetection) -> Tuple[float, float, float, float, float]:
    import cv2

    h, w = gray.shape
    x1 = int(max(0, min(w - 1, detection.x1)))
    y1 = int(max(0, min(h - 1, detection.y1)))
    x2 = int(max(0, min(w - 1, detection.x2)))
    y2 = int(max(0, min(h - 1, detection.y2)))
    if x2 <= x1 or y2 <= y1:
        cx = (detection.x1 + detection.x2) * 0.5
        cy = (detection.y1 + detection.y2) * 0.4
        return float(cx), float(cy), 20.0, 12.0, 0.0

    roi = gray[y1 : y2 + 1, x1 : x2 + 1]
    if roi.size > 0:
        blurred = cv2.GaussianBlur(roi, (5, 5), 0)
        edges = cv2.Canny(blurred, 40, 130)
        top_h = max(1, int(edges.shape[0] * 0.72))
        top_edges = edges[:top_h, :]

        ys, xs = np.where(top_edges > 0)
        if xs.size >= 20:
            points = np.column_stack((xs + x1, ys + y1)).astype(np.float64)
            fitted = fit_ellipse_ransac(points)
            if fitted is not None:
                return fitted

        contours, _ = cv2.findContours(top_edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)
        for contour in contours[:10]:
            if len(contour) < 5:
                continue
            contour = contour.astype(np.float32)
            contour[:, 0, 0] += x1
            contour[:, 0, 1] += y1
            try:
                (cx, cy), (major, minor), angle = cv2.fitEllipse(contour)
            except Exception:
                continue
            rx = max(float(major), float(minor)) * 0.5
            ry = min(float(major), float(minor)) * 0.5
            if rx > 2.0 and ry > 2.0:
                return float(cx), float(cy), float(rx), float(ry), float(angle)

    cx = (x1 + x2) * 0.5
    cy = y1 + (y2 - y1) * 0.38
    rx = max((x2 - x1) * 0.32, 8.0)
    ry = max((y2 - y1) * 0.16, 5.0)
    return float(cx), float(cy), float(rx), float(ry), 0.0


def detect_table_leg_offsets(gray, detection: FurnitureDetection, ellipse: Tuple[float, float, float, float, float]) -> List[float]:
    import cv2

    cx, cy, rx, ry, _ = ellipse
    h, w = gray.shape
    x1 = int(max(0, min(w - 1, detection.x1)))
    x2 = int(max(0, min(w - 1, detection.x2)))
    y1 = int(max(0, min(h - 1, cy + ry * 0.1)))
    y2 = int(max(0, min(h - 1, detection.y2)))
    if x2 <= x1 or y2 <= y1:
        return []

    roi = gray[y1 : y2 + 1, x1 : x2 + 1]
    edges = cv2.Canny(roi, 45, 130)
    min_line = max(12, int((y2 - y1) * 0.28))
    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180,
        threshold=20,
        minLineLength=min_line,
        maxLineGap=10,
    )
    if lines is None:
        return []

    x_values: List[float] = []
    for candidate in lines:
        x_start, y_start, x_end, y_end = candidate[0]
        dx = float(x_end - x_start)
        dy = float(y_end - y_start)
        if abs(dy) < abs(dx) * 1.2:
            continue
        if np.hypot(dx, dy) < min_line:
            continue
        x_mid = (x_start + x_end) * 0.5 + x1
        x_values.append(float(x_mid))

    if not x_values:
        return []

    x_values.sort()
    cluster_threshold = max(6.0, rx * 0.14)
    clusters: List[List[float]] = [[x_values[0]]]
    for value in x_values[1:]:
        if abs(value - clusters[-1][-1]) <= cluster_threshold:
            clusters[-1].append(value)
        else:
            clusters.append([value])

    means = [float(np.mean(cluster)) for cluster in clusters]
    offsets = [
        float(np.clip((value - cx) / max(rx, 1.0), -0.9, 0.9))
        for value in means
    ]
    offsets.sort()
    if len(offsets) > 4:
        step = max(1, len(offsets) // 4)
        offsets = offsets[::step][:4]
    return offsets


def make_tube_from_polyline(points, radius: float, quality: str):
    import trimesh

    sections = {"fast": 12, "balanced": 16, "high": 22}[quality]
    pieces = []
    for index in range(len(points) - 1):
        p0 = points[index]
        p1 = points[index + 1]
        segment = p1 - p0
        length = float(np.linalg.norm(segment))
        if length < 1e-6:
            continue
        direction = segment / length
        tube = trimesh.creation.cylinder(radius=radius, height=length, sections=sections)
        transform = trimesh.geometry.align_vectors([0, 0, 1], direction)
        if transform is None:
            transform = np.eye(4)
        transform[:3, 3] = (p0 + p1) * 0.5
        tube.apply_transform(transform)
        pieces.append(tube)

    if not pieces:
        return trimesh.creation.icosphere(subdivisions=1, radius=radius)
    return trimesh.util.concatenate(pieces)


def to_world_xy(px: float, py: float, width: int, height: int, pixel_to_meter: float):
    wx = (px - width * 0.5) * pixel_to_meter
    wy = (height * 0.58 - py) * pixel_to_meter * 0.75
    return float(wx), float(wy)


def build_furniture_scene(rgb, detections: Sequence[FurnitureDetection], quality: str):
    import cv2
    import trimesh

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    pixel_to_meter = 1.25 / max(w, h)

    scene = trimesh.Scene()
    for index, detection in enumerate(detections, start=1):
        if detection.category == "table":
            cx, cy, rx, ry, angle = estimate_table_ellipse(gray, detection)
            center_x, center_y = to_world_xy(cx, cy, w, h, pixel_to_meter)

            radius = max(0.12, ((rx + ry) * 0.5) * pixel_to_meter)
            table_height = float(np.clip((detection.y2 - detection.y1) * pixel_to_meter * 0.45 + 0.3, 0.35, 0.82))
            thickness = float(np.clip((detection.y2 - detection.y1) * pixel_to_meter * 0.09, 0.02, 0.06))
            top_color = ellipse_mean_color(rgb, cx, cy, rx, ry, angle)

            top_mesh = trimesh.creation.cylinder(radius=radius, height=thickness, sections={"fast": 32, "balanced": 48, "high": 72}[quality])
            ellipse_ratio = float(np.clip(ry / max(rx, 1.0), 0.5, 1.0))
            top_mesh.apply_scale([1.0, ellipse_ratio, 1.0])
            top_rotation = trimesh.transformations.rotation_matrix(np.deg2rad(angle), [0, 0, 1])
            top_mesh.apply_transform(top_rotation)
            top_mesh.apply_translation([center_x, center_y, table_height - thickness * 0.5])
            apply_mesh_color(top_mesh, top_color)

            leg_offsets = detect_table_leg_offsets(gray, detection, (cx, cy, rx, ry, angle))
            if len(leg_offsets) < 2:
                leg_offsets = [-0.62, -0.22, 0.22, 0.62]

            legs = []
            leg_radius = max(0.008, radius * 0.08)
            for leg_index, offset in enumerate(leg_offsets):
                side = -1.0 if leg_index % 2 == 0 else 1.0
                leg_x = center_x + radius * offset * 0.92
                leg_y = center_y + side * radius * 0.42
                p0 = np.array([leg_x, leg_y, table_height - thickness * 0.95], dtype=np.float64)
                p1 = np.array([leg_x, leg_y, 0.02], dtype=np.float64)
                legs.append(make_tube_from_polyline(np.vstack([p0, p1]), leg_radius, quality))

            legs_mesh = trimesh.util.concatenate(legs)
            apply_mesh_color(legs_mesh, np.clip(top_color * 0.65, 0, 255))

            top_name = f"table_{index}_top"
            legs_name = f"table_{index}_legs"
            scene.add_geometry(top_mesh, node_name=top_name, geom_name=top_name)
            scene.add_geometry(legs_mesh, node_name=legs_name, geom_name=legs_name)
            log(
                f"[DETECT] table_{index}: score={detection.score:.2f} "
                f"ellipse_rx={rx:.1f}px ellipse_ry={ry:.1f}px legs={len(leg_offsets)}"
            )
            continue

        width_m = max(0.12, (detection.x2 - detection.x1) * pixel_to_meter * 0.95)
        height_scale = {"chair": 0.95, "sofa": 0.8, "cabinet": 1.2, "desk": 0.9}
        depth_scale = {"chair": 0.7, "sofa": 1.25, "cabinet": 0.65, "desk": 0.85}
        height_m = max(0.2, (detection.y2 - detection.y1) * pixel_to_meter * height_scale.get(detection.category, 0.9))
        depth_m = max(0.12, width_m * depth_scale.get(detection.category, 0.8))
        center_px_x = (detection.x1 + detection.x2) * 0.5
        center_px_y = (detection.y1 + detection.y2) * 0.5
        center_x, center_y = to_world_xy(center_px_x, center_px_y, w, h, pixel_to_meter)

        mesh = trimesh.creation.box(extents=[width_m, depth_m, height_m])
        mesh.apply_translation([center_x, center_y, height_m * 0.5])
        color = region_mean_color(rgb, detection.x1, detection.y1, detection.x2 + 1, detection.y2 + 1)
        apply_mesh_color(mesh, color)
        name = f"{detection.category}_{index}"
        scene.add_geometry(mesh, node_name=name, geom_name=name)
        log(f"[DETECT] {name}: score={detection.score:.2f} primitive=box")

    return scene


def export_scene_glb(scene, out_path: str):
    scene.export(out_path, file_type="glb")
    size = os.path.getsize(out_path) if os.path.exists(out_path) else 0
    vertices = 0
    faces = 0
    for geometry in scene.geometry.values():
        if hasattr(geometry, "vertices"):
            vertices += int(len(geometry.vertices))
        if hasattr(geometry, "faces"):
            faces += int(len(geometry.faces))
    return vertices, faces, int(size)


def robust_normalize(depth):
    finite = np.isfinite(depth)
    if not np.any(finite):
        raise RuntimeError("Depth map has no finite values")

    depth_valid = depth[finite]
    p2 = float(np.percentile(depth_valid, 2))
    p98 = float(np.percentile(depth_valid, 98))
    dmin = float(np.min(depth_valid))
    dmax = float(np.max(depth_valid))

    if abs(p98 - p2) < 1e-6:
        p2, p98 = dmin, dmax

    denom = max(p98 - p2, 1e-6)
    normalized = np.clip((depth - p2) / denom, 0.0, 1.0)
    return normalized.astype(np.float32), dmin, dmax, p2, p98


def depth_to_numpy(result):
    if isinstance(result, dict):
        predicted_depth = result.get("predicted_depth")
        if predicted_depth is not None and hasattr(predicted_depth, "detach"):
            depth = predicted_depth.detach().cpu().numpy()
            if depth.ndim == 3:
                depth = depth[0]
            return depth.astype(np.float32)

        depth_image = result.get("depth")
        if depth_image is not None:
            return np.asarray(depth_image, dtype=np.float32)

    if hasattr(result, "detach"):
        depth = result.detach().cpu().numpy()
        if depth.ndim == 3:
            depth = depth[0]
        return depth.astype(np.float32)

    raise RuntimeError("Depth model produced unsupported output format")


def create_point_cloud(depth, rgb, quality: str):
    if quality == "fast":
        step = 4
    elif quality == "balanced":
        step = 2
    else:
        step = 1

    h, w = depth.shape[:2]
    rh, rw = rgb.shape[:2]
    if (rh, rw) != (h, w):
        import cv2
        rgb = cv2.resize(rgb, (w, h), interpolation=cv2.INTER_AREA)

    ys = np.arange(0, h, step, dtype=np.int32)
    xs = np.arange(0, w, step, dtype=np.int32)
    uu, vv = np.meshgrid(xs, ys)
    vv = np.clip(vv, 0, h - 1)
    uu = np.clip(uu, 0, w - 1)

    print(f"[POINT CLOUD] depth={depth.shape} rgb={rgb.shape}", flush=True)
    print(f"[POINT CLOUD] max vv={vv.max()} uu={uu.max()}", flush=True)

    sampled_depth = depth[vv, uu]
    z = 0.3 + (1.0 - sampled_depth) * 2.2

    focal = 0.9 * max(w, h)
    cx = w * 0.5
    cy = h * 0.5

    x = (uu - cx) / focal * z
    y = -(vv - cy) / focal * z

    points = np.stack([x, y, z], axis=-1).reshape(-1, 3).astype(np.float64)
    colors = (rgb[vv, uu] / 255.0).reshape(-1, 3).astype(np.float64)
    return points, colors, float(focal), float(cx), float(cy)


def reconstruct_mesh(points, colors, quality: str):
    import open3d as o3d

    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points)
    pcd.colors = o3d.utility.Vector3dVector(colors)

    voxel = {"fast": 0.02, "balanced": 0.015, "high": 0.01}[quality]
    if voxel > 0:
        pcd = pcd.voxel_down_sample(voxel)

    pcd.estimate_normals(search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=voxel * 8, max_nn=40))
    pcd.orient_normals_consistent_tangent_plane(10)

    poisson_depth = {"fast": 7, "balanced": 9, "high": 11}[quality]
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd,
        depth=poisson_depth,
        scale=1.05,
        linear_fit=True,
    )

    density_array = np.asarray(densities)
    min_density_quantile = {"fast": 0.04, "balanced": 0.03, "high": 0.02}[quality]
    threshold = float(np.quantile(density_array, min_density_quantile))
    vertices_to_remove = density_array < threshold

    mesh.remove_vertices_by_mask(vertices_to_remove)
    mesh.remove_duplicated_vertices()
    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_non_manifold_edges()
    mesh.compute_vertex_normals()

    return mesh


def colorize_mesh_vertices(mesh, rgb, focal: float, cx: float, cy: float) -> None:
    import open3d as o3d

    vertices = np.asarray(mesh.vertices)
    if vertices.size == 0:
        return

    z = np.clip(vertices[:, 2], 1e-4, None)
    u = np.round(vertices[:, 0] * focal / z + cx).astype(np.int32)
    v = np.round(-vertices[:, 1] * focal / z + cy).astype(np.int32)

    h, w = rgb.shape[:2]
    valid = (u >= 0) & (u < w) & (v >= 0) & (v < h)

    default_color = np.mean(rgb.reshape(-1, 3), axis=0, dtype=np.float64) / 255.0
    vertex_colors = np.tile(default_color, (vertices.shape[0], 1))
    vertex_colors[valid] = rgb[v[valid], u[valid]] / 255.0

    mesh.vertex_colors = o3d.utility.Vector3dVector(vertex_colors)


def export_glb(mesh, out_path: str):
    import trimesh

    vertices = np.asarray(mesh.vertices)
    faces = np.asarray(mesh.triangles)
    colors = np.asarray(mesh.vertex_colors)

    if vertices.size == 0 or faces.size == 0:
        raise RuntimeError("Mesh reconstruction produced no geometry")

    if colors.size == 0:
        colors = np.full((vertices.shape[0], 3), 0.7, dtype=np.float64)

    vertex_colors = np.clip(colors * 255.0, 0, 255).astype(np.uint8)
    glb_mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        vertex_colors=vertex_colors,
        process=False,
    )
    glb_mesh.export(out_path, file_type="glb")

    size = os.path.getsize(out_path) if os.path.exists(out_path) else 0
    return int(vertices.shape[0]), int(faces.shape[0]), int(size)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Image to 3D depth meshing MVP")
    parser.add_argument("--in", dest="in_path", required=True, help="Input image path")
    parser.add_argument("--out", dest="out_path", required=True, help="Output GLB path")
    parser.add_argument("--quality", choices=["fast", "balanced", "high"], default="balanced")
    parser.add_argument("--models-dir", default="", help="Optional cache directory for model weights")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    in_path = os.path.abspath(args.in_path)
    out_path = os.path.abspath(args.out_path)
    out_dir = os.path.dirname(out_path)
    os.makedirs(out_dir, exist_ok=True)

    if not os.path.exists(in_path):
        log_error(f"Input image does not exist: {in_path}")
        return 1

    try:
        cache_root = get_cache_root()
    except Exception as error:
        log_error(str(error))
        return 1

    cache_dirs = ensure_cache_dirs(cache_root)
    models_dir = os.path.abspath(args.models_dir.strip() or cache_dirs["models"])
    os.makedirs(models_dir, exist_ok=True)
    os.environ["HF_HOME"] = models_dir
    os.environ["TRANSFORMERS_CACHE"] = models_dir
    os.environ["TORCH_HOME"] = models_dir
    os.environ["PIP_CACHE_DIR"] = cache_dirs["pip"]

    emit_progress("preprocess", 5, "Bootstrap de dependencias")
    try:
        ensure_packages([
            "numpy",
            "pillow",
            "opencv-python",
            "trimesh",
            "open3d",
            "pygltflib",
            "torch",
            "torchvision",
            "transformers",
            "timm",
            "accelerate",
            "safetensors",
            "huggingface_hub",
        ])
    except Exception as error:
        log_error(f"[BOOT] failed: {error}")
        return 1

    global np
    global Image
    import numpy as np
    from PIL import Image

    log(f"in: {in_path}")
    log(f"out: {out_path}")
    log(f"quality: {args.quality}")
    log(f"cache_root: {cache_root}")
    log(f"models_dir: {models_dir}")
    log_cuda_check()
    device_info = detect_device()
    runtime_device = str(device_info.get("device", "cpu"))
    emit_progress("infer", 10, "Inicializando", device=runtime_device)

    try:
        image = Image.open(in_path).convert("RGB")
        rgb = np.asarray(image, dtype=np.uint8)
        _ensure_runtime_package("ultralytics", required=False)

        emit_progress("detect", 20, "Detectando muebles")
        try:
            detections = detect_furniture_objects(image)
        except Exception as detect_error:
            log(f"[DETECT] detector unavailable: {detect_error}")
            detections = []
        log_detection_counts(detections)
        objects = build_object_candidates(image, rgb, detections, max_objects=MAX_OBJECTS)

        emit_progress("infer", 25, "Cargando modelo de profundidad", device=runtime_device)
        depth_model = get_depth_model(cache_root)

        emit_progress("infer", 55, "Ejecutando inferencia de profundidad", device=runtime_device)
        depth_result = depth_model(image)
        depth_raw = depth_to_numpy(depth_result)

        depth, dmin, dmax, p2, p98 = robust_normalize(depth_raw)
        log(f"depth stats: min={dmin:.6f} max={dmax:.6f} p2={p2:.6f} p98={p98:.6f}")
        if depth.shape[:2] != rgb.shape[:2]:
            import cv2

            depth = cv2.resize(depth, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_LINEAR)
        print(f"[SHAPE] rgb={rgb.shape} depth={depth.shape}", flush=True)

        emit_progress("mesh", 78, "Reconstruyendo mallas por objeto")
        scene, metadata_objects, total_triangles = build_multi_object_textured_scene(
            rgb=rgb,
            depth=depth,
            objects=objects,
            quality=args.quality,
        )

        emit_progress("export", 92, "Exportando GLB")
        glb_size, metadata_path, total_triangles, total_vertices, total_faces = export_scene_with_metadata(
            scene=scene,
            out_path=out_path,
            metadata_objects=metadata_objects,
            total_triangles=total_triangles,
        )
        detail_low = total_vertices < MIN_VERTS or total_faces < MIN_FACES
        if detail_low:
            log(
                f"[RETRY] reason=low_detail attempt=1 verts={total_vertices} "
                f"faces={total_faces} -> increasing density"
            )
            retry_quality = "high"
            emit_progress("mesh", 86, "Reintentando con mayor densidad")
            scene, metadata_objects, total_triangles = build_multi_object_textured_scene(
                rgb=rgb,
                depth=depth,
                objects=objects,
                quality=retry_quality,
            )
            emit_progress("export", 95, "Reexportando GLB")
            glb_size, metadata_path, total_triangles, total_vertices, total_faces = export_scene_with_metadata(
                scene=scene,
                out_path=out_path,
                metadata_objects=metadata_objects,
                total_triangles=total_triangles,
            )

        if glb_size < SOFT_WARN_BYTES:
            log(f"[WARN] GLB under 200KB ({glb_size} bytes). This is OK if geometry thresholds are met.")

        log(f"[EXPORT] vertices={total_vertices} faces={total_faces} glb_bytes={glb_size} out={out_path}")
        log(f"[META] metadata={metadata_path}")
        log(f"OUT_SIZE_BYTES={glb_size}")

        if not os.path.exists(out_path):
            log_error(f"GLB not created: {out_path}")
            return 1

        if (
            glb_size < MIN_BYTES_ABSOLUTE
            or total_vertices < BROKEN_MIN_VERTS
            or total_faces < BROKEN_MIN_FACES
        ):
            log_error(
                f"Broken GLB export after retry: vertices={total_vertices} "
                f"faces={total_faces} glb_bytes={glb_size} out={out_path}"
            )
            return 1

        emit_progress("done", 100, "Modelo 3D listo")
        return 0
    except Exception as error:
        log_error(f"image_to_3d failed: {error}")
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
