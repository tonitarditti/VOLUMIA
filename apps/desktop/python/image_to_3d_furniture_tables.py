#!/usr/bin/env python3
import argparse
import json
import math
import os
import sys
import traceback
from dataclasses import dataclass
from typing import List, Sequence

import cv2
import numpy as np
import trimesh

print("VOLUMIA PYTHON PATH:", sys.executable)


@dataclass
class TopDetection:
    cx: float
    cy: float
    rx: float
    ry: float
    angle: float
    material: str
    brightness: float
    texture: float


def emit_progress(stage: str, percent: int, message: str) -> None:
    print(json.dumps({"stage": stage, "percent": percent, "message": message}), flush=True)


def log(message: str) -> None:
    print(message, flush=True)


def log_error(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Parametric furniture reconstructor for coffee tables")
    parser.add_argument("--in", dest="in_path", required=True)
    parser.add_argument("--out", dest="out_path", required=True)
    parser.add_argument("--quality", choices=["fast", "balanced", "high"], default="balanced")
    return parser.parse_args()


def detect_tabletops(gray: np.ndarray) -> List[TopDetection]:
    h, w = gray.shape
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 130)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    min_area = float(h * w) * 0.002
    min_radius = min(h, w) * 0.06
    for contour in contours:
        if len(contour) < 5:
            continue
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        (cx, cy), (major, minor), angle = cv2.fitEllipse(contour)
        if major <= 0 or minor <= 0:
            continue
        ratio = max(major, minor) / max(min(major, minor), 1e-6)
        radius = max(major, minor) * 0.5
        if radius < min_radius or ratio > 1.65:
            continue
        score = area / ratio
        candidates.append((score, cx, cy, major * 0.5, minor * 0.5, angle))

    candidates.sort(key=lambda item: item[0], reverse=True)

    selected: List[TopDetection] = []
    for _, cx, cy, rx, ry, angle in candidates:
        keep = True
        for prev in selected:
            distance = math.hypot(cx - prev.cx, cy - prev.cy)
            if distance < 0.62 * (max(rx, ry) + max(prev.rx, prev.ry)):
                keep = False
                break
        if not keep:
            continue

        material, brightness, texture = classify_top_material(gray, cx, cy, rx, ry, angle)
        selected.append(
            TopDetection(
                cx=float(cx),
                cy=float(cy),
                rx=float(rx),
                ry=float(ry),
                angle=float(angle),
                material=material,
                brightness=brightness,
                texture=texture,
            )
        )
        if len(selected) == 2:
            break

    if selected:
        return selected

    fallback_rx = min(h, w) * 0.18
    fallback_ry = fallback_rx * 0.92
    material, brightness, texture = classify_top_material(gray, w * 0.5, h * 0.45, fallback_rx, fallback_ry, 0)
    return [
        TopDetection(
            cx=float(w * 0.5),
            cy=float(h * 0.45),
            rx=float(fallback_rx),
            ry=float(fallback_ry),
            angle=0.0,
            material=material,
            brightness=brightness,
            texture=texture,
        )
    ]


def classify_top_material(gray: np.ndarray, cx: float, cy: float, rx: float, ry: float, angle: float):
    mask = np.zeros_like(gray, dtype=np.uint8)
    cv2.ellipse(mask, (int(cx), int(cy)), (max(int(rx), 1), max(int(ry), 1)), angle, 0, 360, 255, -1)
    pixels = gray[mask > 0]
    if pixels.size == 0:
        return "wood", 0.0, 0.0

    brightness = float(np.mean(pixels))
    lap = cv2.Laplacian(gray, cv2.CV_32F)
    texture = float(np.std(lap[mask > 0]))
    if brightness > 165.0 and texture < 14.0:
        return "glass", brightness, texture
    return "wood", brightness, texture


def detect_leg_offsets(gray: np.ndarray, top: TopDetection) -> List[float]:
    h, w = gray.shape
    x1 = max(int(top.cx - top.rx * 1.25), 0)
    x2 = min(int(top.cx + top.rx * 1.25), w - 1)
    y1 = max(int(top.cy + top.ry * 0.05), 0)
    y2 = min(int(top.cy + top.ry * 2.5), h - 1)

    if x2 <= x1 or y2 <= y1:
        return []

    roi = gray[y1 : y2 + 1, x1 : x2 + 1]
    edges = cv2.Canny(roi, 40, 120)
    min_line = max(14, int(top.ry * 0.32))
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=26, minLineLength=min_line, maxLineGap=10)

    if lines is None:
        return []

    x_values: List[float] = []
    for candidate in lines:
        x_start, y_start, x_end, y_end = candidate[0]
        dx = float(x_end - x_start)
        dy = float(y_end - y_start)
        if abs(dy) < abs(dx):
            continue
        length = math.hypot(dx, dy)
        if length < min_line:
            continue
        x_mid = (x_start + x_end) * 0.5 + x1
        x_values.append(float(x_mid))

    if not x_values:
        return []

    x_values.sort()
    cluster_threshold = max(8.0, top.rx * 0.2)
    clusters: List[List[float]] = [[x_values[0]]]
    for value in x_values[1:]:
        if abs(value - clusters[-1][-1]) <= cluster_threshold:
            clusters[-1].append(value)
        else:
            clusters.append([value])

    means = [float(np.mean(cluster)) for cluster in clusters]
    means.sort(key=lambda value: abs(value - top.cx))
    means = means[:3]
    means.sort()

    offsets = [float(np.clip((value - top.cx) / max(top.rx, 1.0), -0.95, 0.95)) for value in means]
    if len(offsets) < 2:
        return []
    return offsets


def build_leg_angles(offsets: Sequence[float], table_index: int) -> List[float]:
    if offsets:
        return [(-math.pi * 0.5) + offset * 0.6 for offset in offsets]

    phase = table_index * 0.08
    return [(-2.25 + phase), (-1.55 + phase), (-0.9 + phase)]


def mesh_color_rgba(material: str) -> np.ndarray:
    if material == "glass":
        return np.array([230, 235, 236, 180], dtype=np.uint8)
    if material == "metal":
        return np.array([156, 122, 86, 255], dtype=np.uint8)
    return np.array([140, 103, 72, 255], dtype=np.uint8)


def apply_mesh_color(mesh: trimesh.Trimesh, material: str) -> None:
    rgba = np.tile(mesh_color_rgba(material), (len(mesh.vertices), 1))
    mesh.visual.vertex_colors = rgba


def make_top_mesh(center_xy: np.ndarray, radius: float, thickness: float, table_height: float, quality: str, material: str) -> trimesh.Trimesh:
    sections = {"fast": 40, "balanced": 64, "high": 96}[quality]
    mesh = trimesh.creation.cylinder(radius=radius, height=thickness, sections=sections)
    mesh.apply_translation([float(center_xy[0]), float(center_xy[1]), table_height - thickness * 0.5])
    apply_mesh_color(mesh, material)
    return mesh


def make_tube_from_polyline(points: np.ndarray, radius: float, quality: str) -> trimesh.Trimesh:
    sections = {"fast": 14, "balanced": 18, "high": 24}[quality]
    pieces: List[trimesh.Trimesh] = []

    for i in range(len(points) - 1):
        p0 = points[i]
        p1 = points[i + 1]
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

    for point in points:
        cap = trimesh.creation.icosphere(subdivisions=1, radius=radius * 1.05)
        cap.apply_translation(point)
        pieces.append(cap)

    if not pieces:
        return trimesh.creation.icosphere(subdivisions=1, radius=radius * 0.8)

    return trimesh.util.concatenate(pieces)


def make_legs_mesh(center_xy: np.ndarray, radius: float, table_height: float, quality: str, leg_offsets: Sequence[float], table_index: int) -> trimesh.Trimesh:
    tube_radius = 0.012
    angles = build_leg_angles(leg_offsets, table_index)
    legs = []
    top_z = table_height * 0.985
    for angle in angles:
        p0 = np.array([center_xy[0] + radius * 0.55 * math.cos(angle), center_xy[1] + radius * 0.55 * math.sin(angle), top_z], dtype=np.float64)
        p1 = np.array([center_xy[0] + radius * 0.44 * math.cos(angle + 0.18), center_xy[1] + radius * 0.44 * math.sin(angle + 0.18), table_height * 0.56], dtype=np.float64)
        p2 = np.array([center_xy[0] + radius * 0.3 * math.cos(angle - 0.12), center_xy[1] + radius * 0.3 * math.sin(angle - 0.12), 0.01], dtype=np.float64)
        legs.append(make_tube_from_polyline(np.vstack([p0, p1, p2]), tube_radius, quality))

    mesh = trimesh.util.concatenate(legs)
    apply_mesh_color(mesh, "metal")
    return mesh


def to_world_xy(cx: float, cy: float, width: int, height: int, pixel_to_meter: float) -> np.ndarray:
    wx = (cx - width * 0.5) * pixel_to_meter
    wy = (height * 0.58 - cy) * pixel_to_meter
    return np.array([wx, wy], dtype=np.float64)


def build_scene(gray: np.ndarray, detections: Sequence[TopDetection], quality: str) -> trimesh.Scene:
    h, w = gray.shape
    max_radius_px = max(max(det.rx, det.ry) for det in detections)
    pixel_to_meter = 0.45 / max(max_radius_px, 1.0)

    scene = trimesh.Scene()
    detections_sorted = sorted(detections, key=lambda det: max(det.rx, det.ry), reverse=True)
    for index, detection in enumerate(detections_sorted, start=1):
        radius_px = max(detection.rx, detection.ry)
        radius = max(0.18, radius_px * pixel_to_meter)
        table_height = 0.35 if index == 1 else 0.31
        thickness = 0.015 if detection.material == "glass" else 0.035

        center_xy = to_world_xy(detection.cx, detection.cy, w, h, pixel_to_meter)
        leg_offsets = detect_leg_offsets(gray, detection)

        top_mesh = make_top_mesh(center_xy, radius, thickness, table_height, quality, detection.material)
        legs_mesh = make_legs_mesh(center_xy, radius, table_height - thickness, quality, leg_offsets, index - 1)

        top_name = f"top_{index}"
        legs_name = f"legs_{index}"
        scene.add_geometry(top_mesh, node_name=top_name, geom_name=top_name)
        scene.add_geometry(legs_mesh, node_name=legs_name, geom_name=legs_name)

        log(
            f"table {index}: radius={radius:.4f}m thickness={thickness:.4f}m material={detection.material} "
            f"legs={len(build_leg_angles(leg_offsets, index - 1))}"
        )
        log(
            f"{top_name}: vertices={len(top_mesh.vertices)} faces={len(top_mesh.faces)} | "
            f"{legs_name}: vertices={len(legs_mesh.vertices)} faces={len(legs_mesh.faces)}"
        )

    return scene


def main() -> int:
    args = parse_args()
    in_path = os.path.abspath(args.in_path)
    out_path = os.path.abspath(args.out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    if not os.path.exists(in_path):
        log_error(f"input image missing: {in_path}")
        return 1

    emit_progress("preprocess", 10, "Loading image")
    image = cv2.imread(in_path, cv2.IMREAD_COLOR)
    if image is None:
        log_error(f"failed to load image: {in_path}")
        return 1
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    try:
        emit_progress("detect", 30, "Detecting table tops and legs")
        detections = detect_tabletops(gray)
        log(f"in: {in_path}")
        log(f"out: {out_path}")
        log(f"quality: {args.quality}")
        log(f"detected ellipses count: {len(detections)}")
        for i, det in enumerate(detections, start=1):
            log(
                f"ellipse_{i}: center=({det.cx:.1f},{det.cy:.1f}) rx={det.rx:.2f} ry={det.ry:.2f} "
                f"material={det.material} brightness={det.brightness:.2f} texture={det.texture:.2f}"
            )

        emit_progress("mesh", 70, "Building parametric mesh")
        scene = build_scene(gray, detections, args.quality)

        emit_progress("export", 90, "Exporting GLB")
        scene.export(out_path, file_type="glb")

        if not os.path.exists(out_path):
            log_error(f"glb missing: {out_path}")
            return 1

        glb_size = os.path.getsize(out_path)
        log(f"final file size: {glb_size} bytes")
        if glb_size <= 2000:
            log_error(f"glb too small: {glb_size} bytes")
            return 1

        emit_progress("done", 100, "Furniture reconstruction completed")
        return 0
    except Exception as error:
        log_error(f"furniture reconstruction failed: {error}")
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
