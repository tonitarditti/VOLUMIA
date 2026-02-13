from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import trimesh

from ..models import GenerationRequest
from ..presets import PresetDefinition
from .silhouette import MaskObservation

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover - optional dependency fallback
    cv2 = None


@dataclass(frozen=True)
class GeometryBuildResult:
    scene: trimesh.Scene
    merged: trimesh.Trimesh
    component_meshes: dict[str, trimesh.Trimesh]


def _safe_bbox_width_height(mask_obs: MaskObservation) -> tuple[float, float]:
    x0, y0, x1, y1 = mask_obs.bbox
    width = max(1.0, float(x1 - x0))
    height = max(1.0, float(y1 - y0))
    return width, height


def _profile_width(mask: np.ndarray) -> np.ndarray:
    binary = mask > 0
    return np.sum(binary, axis=1).astype(np.float32)


def _band_mean(values: np.ndarray, start_ratio: float, end_ratio: float) -> float:
    if values.size == 0:
        return 0.0
    length = values.size
    start = int(np.clip(length * start_ratio, 0, length - 1))
    end = int(np.clip(length * end_ratio, start + 1, length))
    band = values[start:end]
    if band.size == 0:
        return float(np.mean(values))
    return float(np.mean(band))


def _lathe_profile_from_mask(mask_obs: MaskObservation) -> list[tuple[float, float]] | None:
    x0, y0, x1, y1 = mask_obs.bbox
    binary = mask_obs.mask > 0
    crop = binary[y0:y1, x0:x1]
    if crop.size == 0 or crop.shape[0] < 8:
        return None

    row_widths = np.sum(crop, axis=1).astype(np.float32)
    max_width = float(np.max(row_widths)) if row_widths.size > 0 else 0.0
    if max_width < 3.0:
        return None

    smooth = row_widths.copy()
    if smooth.size >= 5:
        kernel = np.array([1, 2, 3, 2, 1], dtype=np.float32)
        kernel /= float(np.sum(kernel))
        smooth = np.convolve(smooth, kernel, mode="same")

    sample_count = 9
    y_positions = np.linspace(0.0, float(smooth.size - 1), sample_count)
    indices = np.arange(smooth.size, dtype=np.float32)
    profile: list[tuple[float, float]] = []
    for pos in y_positions:
        width_at_y = float(np.interp(pos, indices, smooth))
        radius_ratio = float(np.clip(width_at_y / max(max_width, 1e-6), 0.08, 1.0))
        height_ratio = float(np.clip(pos / max(float(smooth.size - 1), 1.0), 0.0, 1.0))
        profile.append((radius_ratio, height_ratio))
    return profile


def _mask_crop(mask_obs: MaskObservation) -> np.ndarray:
    x0, y0, x1, y1 = mask_obs.bbox
    binary = mask_obs.mask > 0
    crop = binary[y0:y1, x0:x1]
    return np.where(crop, 255, 0).astype(np.uint8)


def _mask_contour_metrics(mask_obs: MaskObservation) -> tuple[float, float, float]:
    crop = _mask_crop(mask_obs)
    area = float(np.sum(crop > 0))
    if area <= 1.0:
        return 0.0, 0.0, 0.0

    if cv2 is not None:
        contours, _ = cv2.findContours(crop, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            contour = max(contours, key=cv2.contourArea)
            contour_area = float(cv2.contourArea(contour))
            perimeter = float(cv2.arcLength(contour, True))
            circularity = 0.0 if perimeter <= 1e-6 else float((4.0 * np.pi * contour_area) / (perimeter * perimeter))
            return contour_area, perimeter, float(np.clip(circularity, 0.0, 2.0))

    # Fallback perimeter estimate using morphological boundary.
    binary = crop > 0
    shifts = [
        np.roll(binary, 1, axis=0),
        np.roll(binary, -1, axis=0),
        np.roll(binary, 1, axis=1),
        np.roll(binary, -1, axis=1),
    ]
    boundary = binary & ~(shifts[0] & shifts[1] & shifts[2] & shifts[3])
    perimeter = float(np.sum(boundary))
    circularity = 0.0 if perimeter <= 1e-6 else float((4.0 * np.pi * area) / (perimeter * perimeter))
    return area, perimeter, float(np.clip(circularity, 0.0, 2.0))


def _table_support_mode(mask_obs: MaskObservation, circularity: float) -> tuple[str, int, int]:
    crop = _mask_crop(mask_obs)
    if crop.size == 0:
        return "four_legs", 0, 0

    h, w = crop.shape
    lower = crop[int(h * 0.6) :, :]
    if lower.size == 0:
        return "four_legs", 0, 0

    component_count = 0
    thin_vertical_count = 0

    if cv2 is not None:
        contours, _ = cv2.findContours((lower > 0).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        min_area = max(6, int(lower.shape[0] * lower.shape[1] * 0.001))
        for contour in contours:
            area = int(cv2.contourArea(contour))
            if area < min_area:
                continue
            x, y, width, height = cv2.boundingRect(contour)
            _ = x, y
            width = max(1, int(width))
            height = max(1, int(height))
            component_count += 1
            is_thin_vertical = (width / height) <= 0.55 and height >= int(lower.shape[0] * 0.3)
            if is_thin_vertical:
                thin_vertical_count += 1
    else:
        # Coarse fallback based on lower-mask occupancy profile.
        cols = np.sum(lower > 0, axis=0)
        active = cols > max(1, int(lower.shape[0] * 0.1))
        transitions = np.diff(active.astype(np.int8), prepend=0, append=0)
        starts = np.where(transitions == 1)[0]
        ends = np.where(transitions == -1)[0]
        component_count = int(min(len(starts), len(ends)))
        for start, end in zip(starts, ends):
            span = max(1, end - start)
            if span <= int(w * 0.16):
                thin_vertical_count += 1

    lower_fill = float(np.mean(lower > 0))
    support_mode = "four_legs"
    if component_count >= 4 and thin_vertical_count >= 4:
        support_mode = "four_legs"
    elif component_count <= 2 or lower_fill > 0.3:
        support_mode = "continuous_frame"

    if circularity > 0.75 and thin_vertical_count < 4:
        support_mode = "continuous_frame"

    return support_mode, component_count, thin_vertical_count


def estimate_object_dimensions(
    request: GenerationRequest,
    front_mask: MaskObservation,
    side_mask: MaskObservation | None,
) -> tuple[tuple[float, float, float], dict[str, object], dict[str, float | str]]:
    front_w_px, front_h_px = _safe_bbox_width_height(front_mask)
    width_px = max(1.0, front_w_px)
    height_px = max(1.0, front_h_px)

    side_available = side_mask is not None and side_mask.valid
    depth_source = "inferred_0.6_width"
    if side_available:
        side_w_px, side_h_px = _safe_bbox_width_height(side_mask)
        _ = side_h_px
        depth_px = max(1.0, side_w_px)
        depth_source = "side_bbox"
    else:
        depth_px = max(1.0, width_px * 0.6)

    scale_axis_used = request.scaleDimension
    if request.scaleDimension == "depth" and not side_available:
        # Requested depth scaling without side view falls back to width.
        scale_axis_used = "width"

    axis_pixel = {
        "width": width_px,
        "height": height_px,
        "depth": depth_px,
    }[scale_axis_used]
    cm_per_pixel = max(float(request.scaleValueCm), 0.001) / max(axis_pixel, 1e-6)

    width_cm = width_px * cm_per_pixel
    height_cm = height_px * cm_per_pixel
    depth_cm = depth_px * cm_per_pixel

    width_m = width_cm / 100.0
    height_m = height_cm / 100.0
    depth_m = depth_cm / 100.0

    rows = _profile_width(front_mask.mask)
    h = len(rows)
    seat_band_start = int(h * 0.45)
    seat_band_end = int(h * 0.7)
    seat_slice = rows[seat_band_start:seat_band_end] if seat_band_end > seat_band_start else rows
    seat_height_ratio = 0.45
    if seat_slice.size > 0:
        peak_idx = int(np.argmax(seat_slice))
        seat_height_ratio = float(np.clip((seat_band_start + peak_idx) / max(h, 1), 0.3, 0.62))

    top_slice = rows[: max(1, int(h * 0.25))]
    mid_slice = rows[int(h * 0.4) : int(h * 0.65)]
    bottom_slice = rows[max(0, int(h * 0.75)) :]
    drawer_hint = bool(mid_slice.mean() > (top_slice.mean() * 1.08 if top_slice.size else 0.0))
    near_top = _band_mean(rows, 0.08, 0.16)
    below_top = _band_mean(rows, 0.2, 0.34)
    drawer_hint = drawer_hint or bool(below_top > near_top * 1.06)

    back_profile = float(np.clip((top_slice.mean() / max(rows.mean(), 1e-5)) if top_slice.size else 0.35, 0.18, 0.62))
    peak_width = float(np.max(rows)) if rows.size > 0 else 1.0
    top_width_ratio = float(np.clip(_band_mean(rows, 0.0, 0.22) / max(peak_width, 1e-6), 0.12, 1.0))
    mid_width_ratio = float(np.clip(_band_mean(rows, 0.42, 0.64) / max(peak_width, 1e-6), 0.12, 1.0))
    bottom_width_ratio = float(np.clip(np.mean(bottom_slice) / max(peak_width, 1e-6), 0.12, 1.0)) if bottom_slice.size > 0 else mid_width_ratio

    bbox_area = max(1.0, (front_mask.bbox[2] - front_mask.bbox[0]) * (front_mask.bbox[3] - front_mask.bbox[1]))
    silhouette_pixels = float(np.sum(front_mask.mask > 0))
    silhouette_fill = float(np.clip(silhouette_pixels / bbox_area, 0.05, 1.0))
    lathe_profile = _lathe_profile_from_mask(front_mask)
    contour_area, contour_perimeter, circularity = _mask_contour_metrics(front_mask)
    is_round_top = bool(circularity > 0.75)
    support_mode, lower_components, lower_thin_components = _table_support_mode(front_mask, circularity=circularity)

    heuristics = {
        "depth_ratio": float(np.clip(depth_px / max(width_px, 1.0), 0.25, 1.35)),
        "seat_height_ratio": seat_height_ratio,
        "drawer_hint": drawer_hint,
        "back_profile": back_profile,
        "top_width_ratio": top_width_ratio,
        "mid_width_ratio": mid_width_ratio,
        "bottom_width_ratio": bottom_width_ratio,
        "silhouette_fill": silhouette_fill,
        "lathe_profile": lathe_profile,
        "table_top_shape": "round" if is_round_top else "rect",
        "table_circularity": float(circularity),
        "table_support_mode": support_mode,
        "table_lower_components": int(lower_components),
        "table_lower_thin_components": int(lower_thin_components),
        "table_contour_area_px2": float(contour_area),
        "table_contour_perimeter_px": float(contour_perimeter),
    }
    scale_stats = {
        "width_cm": float(width_cm),
        "height_cm": float(height_cm),
        "depth_cm": float(depth_cm),
        "scale_axis_used": scale_axis_used,
        "cm_per_pixel": float(cm_per_pixel),
        "depth_source": depth_source,
    }
    return (float(width_m), float(height_m), float(depth_m)), heuristics, scale_stats


def _bounds_to_box(
    dimensions: tuple[float, float, float],
    bounds: tuple[float, float, float, float, float, float],
    subdivisions: int,
) -> trimesh.Trimesh:
    width, height, depth = dimensions
    x0, x1, y0, y1, z0, z1 = bounds
    extents = (
        max(0.005, (x1 - x0) * width),
        max(0.005, (y1 - y0) * height),
        max(0.005, (z1 - z0) * depth),
    )
    center = (
        ((x0 + x1) - 1.0) * 0.5 * width,
        ((y0 + y1) * 0.5) * height,
        ((z0 + z1) - 1.0) * 0.5 * depth,
    )
    mesh = trimesh.creation.box(extents=extents)
    mesh.apply_translation(center)
    for _ in range(max(0, subdivisions)):
        mesh = mesh.subdivide()
    return mesh


def _cylinder(
    dimensions: tuple[float, float, float],
    radius_ratio: float,
    height_ratio: float,
    center_ratio: tuple[float, float, float],
    sections: int,
) -> trimesh.Trimesh:
    width, height, depth = dimensions
    radius = max(0.003, min(width, depth) * radius_ratio)
    mesh = trimesh.creation.cylinder(radius=radius, height=max(0.005, height * height_ratio), sections=max(6, sections))
    align = trimesh.geometry.align_vectors(np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0]))
    mesh.apply_transform(align)
    mesh.apply_translation((center_ratio[0] * width, center_ratio[1] * height, center_ratio[2] * depth))
    return mesh


def _cone(
    dimensions: tuple[float, float, float],
    radius_ratio: float,
    height_ratio: float,
    center_ratio: tuple[float, float, float],
    sections: int,
) -> trimesh.Trimesh:
    width, height, depth = dimensions
    radius = max(0.003, min(width, depth) * radius_ratio)
    mesh = trimesh.creation.cone(radius=radius, height=max(0.005, height * height_ratio), sections=max(6, sections))
    align = trimesh.geometry.align_vectors(np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0]))
    mesh.apply_transform(align)
    mesh.apply_translation((center_ratio[0] * width, center_ratio[1] * height, center_ratio[2] * depth))
    return mesh


def _truncated_cone(
    dimensions: tuple[float, float, float],
    base_radius_ratio: float,
    top_radius_ratio: float,
    height_ratio: float,
    center_ratio: tuple[float, float, float],
    sections: int,
) -> trimesh.Trimesh:
    width, height, depth = dimensions
    base_radius = max(0.003, min(width, depth) * base_radius_ratio)
    top_radius = max(0.002, min(width, depth) * top_radius_ratio)
    mesh = trimesh.creation.cylinder(radius=base_radius, height=max(0.005, height * height_ratio), sections=max(6, sections))

    scale_xy = float(np.clip(top_radius / max(base_radius, 1e-6), 0.08, 3.0))
    z_coords = mesh.vertices[:, 2]
    top_mask = z_coords > 0
    mesh.vertices[top_mask, 0] *= scale_xy
    mesh.vertices[top_mask, 1] *= scale_xy

    align = trimesh.geometry.align_vectors(np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0]))
    mesh.apply_transform(align)
    mesh.apply_translation((center_ratio[0] * width, center_ratio[1] * height, center_ratio[2] * depth))
    return mesh


def _sphere(
    dimensions: tuple[float, float, float],
    radius_ratio: float,
    center_ratio: tuple[float, float, float],
    subdivisions: int,
) -> trimesh.Trimesh:
    width, height, depth = dimensions
    radius = max(0.003, min(width, depth) * radius_ratio)
    mesh = trimesh.creation.icosphere(subdivisions=max(0, subdivisions), radius=radius)
    mesh.apply_translation((center_ratio[0] * width, center_ratio[1] * height, center_ratio[2] * depth))
    return mesh


def _lathe(
    dimensions: tuple[float, float, float],
    profile: list[tuple[float, float]],
    sections: int,
) -> trimesh.Trimesh:
    width, height, depth = dimensions
    radial = min(width, depth) * 0.5
    polyline = np.array([[max(0.005, radial * p[0]), height * p[1]] for p in profile], dtype=np.float64)
    try:
        mesh = trimesh.creation.revolve(polyline, sections=max(10, sections))
    except Exception:
        mesh = trimesh.creation.box(extents=(width * 0.4, height * 0.75, depth * 0.4))
    align = trimesh.geometry.align_vectors(np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0]))
    mesh.apply_transform(align)
    mesh.apply_translation((0.0, height * 0.5, 0.0))
    return mesh


def _concat(meshes: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    valid = [mesh for mesh in meshes if mesh is not None and len(mesh.faces) > 0]
    if not valid:
        return trimesh.creation.box(extents=(0.01, 0.01, 0.01))
    return trimesh.util.concatenate(valid)


def _empty_mesh() -> trimesh.Trimesh:
    return trimesh.Trimesh(
        vertices=np.zeros((0, 3), dtype=np.float64),
        faces=np.zeros((0, 3), dtype=np.int64),
        process=False,
    )


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return float(np.clip(value, min_value, max_value))


def _box_world(extents: tuple[float, float, float], center: tuple[float, float, float]) -> trimesh.Trimesh:
    mesh = trimesh.creation.box(extents=extents)
    mesh.apply_translation(center)
    return mesh


def _cylinder_world(radius: float, height: float, center: tuple[float, float, float], sections: int) -> trimesh.Trimesh:
    mesh = trimesh.creation.cylinder(radius=max(0.001, radius), height=max(0.002, height), sections=max(6, sections))
    align = trimesh.geometry.align_vectors(np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0]))
    mesh.apply_transform(align)
    mesh.apply_translation(center)
    return mesh


def _cylinder_between_points(p0: np.ndarray, p1: np.ndarray, radius: float, sections: int) -> trimesh.Trimesh:
    delta = p1 - p0
    length = float(np.linalg.norm(delta))
    if length <= 1e-6:
        return _empty_mesh()

    mesh = trimesh.creation.cylinder(radius=max(0.001, radius), height=max(0.002, length), sections=max(6, sections))
    direction = delta / length
    align = trimesh.geometry.align_vectors(np.array([0.0, 0.0, 1.0]), direction)
    mesh.apply_transform(align)
    mesh.apply_translation((p0 + p1) * 0.5)
    return mesh


def _build_table_component_meshes(
    preset: PresetDefinition,
    dimensions: tuple[float, float, float],
    quality: str,
    heuristics: dict[str, object],
) -> dict[str, trimesh.Trimesh]:
    width_m, height_m, depth_m = dimensions
    width_cm = width_m * 100.0
    height_cm = height_m * 100.0
    depth_cm = depth_m * 100.0

    thickness_cm = _clamp(height_cm * 0.04, 2.0, 6.0)
    leg_height_cm = max(1.0, height_cm - thickness_cm)
    leg_w_cm = _clamp(width_cm * 0.04, 3.0, 7.0)
    leg_d_cm = _clamp(depth_cm * 0.04, 3.0, 7.0)
    inset_x_cm = _clamp(width_cm * 0.06, 4.0, 10.0)
    inset_z_cm = _clamp(depth_cm * 0.06, 4.0, 10.0)

    width = width_cm / 100.0
    height = height_cm / 100.0
    depth = depth_cm / 100.0
    thickness = thickness_cm / 100.0
    leg_height = leg_height_cm / 100.0
    leg_w = leg_w_cm / 100.0
    leg_d = leg_d_cm / 100.0
    inset_x = inset_x_cm / 100.0
    inset_z = inset_z_cm / 100.0

    meshes: dict[str, trimesh.Trimesh] = {component.name: _empty_mesh() for component in preset.components}
    table_top_shape = str(heuristics.get("table_top_shape", "rect"))
    support_mode = str(heuristics.get("table_support_mode", "four_legs"))
    drawer_hint = bool(heuristics.get("drawer_hint", False))

    # OBJ_Top
    top_center_y = leg_height + thickness * 0.5
    if table_top_shape == "round":
        top_radius = max(0.02, width * 0.5)
        top_sections = 14 if quality == "low" else 20
        meshes["OBJ_Top"] = _cylinder_world(top_radius, thickness, (0.0, top_center_y, 0.0), sections=top_sections)
    else:
        meshes["OBJ_Top"] = _box_world((width, thickness, depth), (0.0, top_center_y, 0.0))

    # OBJ_Legs / OBJ_Frame
    frame_meshes: list[trimesh.Trimesh] = []
    if support_mode == "continuous_frame":
        meshes["OBJ_Legs"] = _empty_mesh()
        frame_thick_cm = _clamp(thickness_cm * 0.6, 1.5, 3.5)
        frame_thick = frame_thick_cm / 100.0
        if quality == "low":
            frame_box_w = _clamp(width * 0.72, width * 0.45, width * 0.9)
            frame_box_d = _clamp(depth * 0.5, depth * 0.3, depth * 0.8)
            frame_box_h = _clamp(frame_thick * 1.2, 0.012, 0.04)
            frame_box_y = _clamp(leg_height * 0.45, frame_box_h * 0.5, max(frame_box_h * 0.5, leg_height - frame_box_h * 0.5))
            frame_meshes.append(_box_world((frame_box_w, frame_box_h, frame_box_d), (0.0, frame_box_y, 0.0)))
        else:
            tube_radius = _clamp(frame_thick * 0.45, 0.008, 0.02)
            arc_rx = _clamp(width * 0.34, width * 0.22, width * 0.44)
            arc_ry = _clamp(leg_height * 0.34, leg_height * 0.2, leg_height * 0.45)
            arc_base_y = _clamp(leg_height * 0.14, 0.03, leg_height * 0.35)
            z_offset = _clamp(depth * 0.22, depth * 0.12, depth * 0.3)
            steps = 8
            t_values = np.linspace(np.pi, 0.0, steps)

            arc_sets: list[list[np.ndarray]] = []
            for z_sign in (-1.0, 1.0):
                points: list[np.ndarray] = []
                for t in t_values:
                    x = arc_rx * np.cos(t)
                    y = arc_base_y + arc_ry * np.sin(t)
                    z = z_sign * z_offset
                    points.append(np.array([x, y, z], dtype=np.float64))
                arc_sets.append(points)
                for idx in range(len(points) - 1):
                    frame_meshes.append(_cylinder_between_points(points[idx], points[idx + 1], tube_radius, sections=10))

            # connectors between arcs
            for point_idx in (0, len(arc_sets[0]) // 2, len(arc_sets[0]) - 1):
                p0 = arc_sets[0][point_idx]
                p1 = arc_sets[1][point_idx]
                frame_meshes.append(_cylinder_between_points(p0, p1, tube_radius, sections=10))

        meshes["OBJ_Frame"] = _concat(frame_meshes) if frame_meshes else _empty_mesh()
    else:
        leg_centers = [
            (-width * 0.5 + inset_x + leg_w * 0.5, leg_height * 0.5, -depth * 0.5 + inset_z + leg_d * 0.5),
            (width * 0.5 - inset_x - leg_w * 0.5, leg_height * 0.5, -depth * 0.5 + inset_z + leg_d * 0.5),
            (-width * 0.5 + inset_x + leg_w * 0.5, leg_height * 0.5, depth * 0.5 - inset_z - leg_d * 0.5),
            (width * 0.5 - inset_x - leg_w * 0.5, leg_height * 0.5, depth * 0.5 - inset_z - leg_d * 0.5),
        ]
        leg_meshes: list[trimesh.Trimesh] = []
        if quality == "low":
            for center in leg_centers:
                leg_meshes.append(_box_world((leg_w, leg_height, leg_d), center))
        else:
            leg_radius = min(leg_w, leg_d) * 0.5
            for center in leg_centers:
                leg_meshes.append(_cylinder_world(leg_radius, leg_height, center, sections=10))
        meshes["OBJ_Legs"] = _concat(leg_meshes)

        # Frame stretchers around legs.
        frame_thick_cm = _clamp(thickness_cm * 0.6, 1.5, 3.5)
        frame_drop_cm = _clamp(leg_height_cm * 0.12, 6.0, 12.0)
        frame_thick = frame_thick_cm / 100.0
        frame_drop = frame_drop_cm / 100.0
        frame_center_y = _clamp(leg_height - frame_drop, frame_thick * 0.5, max(frame_thick * 0.5, leg_height - frame_thick * 0.5))

        x_min_inner = -width * 0.5 + inset_x + leg_w
        x_max_inner = width * 0.5 - inset_x - leg_w
        z_min_inner = -depth * 0.5 + inset_z + leg_d
        z_max_inner = depth * 0.5 - inset_z - leg_d

        span_x = x_max_inner - x_min_inner
        span_z = z_max_inner - z_min_inner
        if span_x > frame_thick * 1.2 and span_z > frame_thick * 1.2:
            frame_meshes.append(
                _box_world(
                    (span_x, frame_thick, frame_thick),
                    ((x_min_inner + x_max_inner) * 0.5, frame_center_y, z_min_inner + frame_thick * 0.5),
                )
            )
            frame_meshes.append(
                _box_world(
                    (span_x, frame_thick, frame_thick),
                    ((x_min_inner + x_max_inner) * 0.5, frame_center_y, z_max_inner - frame_thick * 0.5),
                )
            )
            frame_meshes.append(
                _box_world(
                    (frame_thick, frame_thick, span_z),
                    (x_min_inner + frame_thick * 0.5, frame_center_y, (z_min_inner + z_max_inner) * 0.5),
                )
            )
            frame_meshes.append(
                _box_world(
                    (frame_thick, frame_thick, span_z),
                    (x_max_inner - frame_thick * 0.5, frame_center_y, (z_min_inner + z_max_inner) * 0.5),
                )
            )
        meshes["OBJ_Frame"] = _concat(frame_meshes) if frame_meshes else _empty_mesh()

    # OBJ_Drawers heuristic
    if drawer_hint:
        drawer_w_cm = _clamp(width_cm * 0.38, 25.0, 70.0)
        drawer_h_cm = _clamp(height_cm * 0.12, 6.0, 18.0)
        drawer_d_cm = _clamp(depth_cm * 0.2, 10.0, 30.0)

        drawer_w = drawer_w_cm / 100.0
        drawer_h = drawer_h_cm / 100.0
        drawer_d = drawer_d_cm / 100.0
        drawer_center_y = _clamp(leg_height - drawer_h * 0.5 - 0.01, drawer_h * 0.5, leg_height - drawer_h * 0.5)
        drawer_center_z = -depth * 0.5 + inset_z + drawer_d * 0.5

        meshes["OBJ_Drawers"] = _box_world((drawer_w, drawer_h, drawer_d), (0.0, drawer_center_y, drawer_center_z))

        # OBJ_Hardware: handle at drawer front.
        handle_w = _clamp(drawer_w * 0.22, 0.08, 0.22)
        handle_h = _clamp(drawer_h * 0.18, 0.012, 0.03)
        handle_d = _clamp(drawer_d * 0.14, 0.012, 0.03)
        handle_center = (
            0.0,
            drawer_center_y,
            drawer_center_z - drawer_d * 0.5 + handle_d * 0.5 + 0.002,
        )
        meshes["OBJ_Hardware"] = _box_world((handle_w, handle_h, handle_d), handle_center)
    else:
        meshes["OBJ_Drawers"] = _empty_mesh()
        meshes["OBJ_Hardware"] = _empty_mesh()

    return meshes


def _mask_band_bounds(mask_obs: MaskObservation, y0_ratio: float, y1_ratio: float) -> tuple[float, float] | None:
    crop = _mask_crop(mask_obs)
    if crop.size == 0:
        return None
    h, w = crop.shape
    y0 = int(np.clip(h * y0_ratio, 0, max(0, h - 1)))
    y1 = int(np.clip(h * y1_ratio, y0 + 1, h))
    band = crop[y0:y1, :] > 0
    if np.sum(band) <= 0:
        return None
    cols = np.where(np.any(band, axis=0))[0]
    if cols.size == 0:
        return None
    min_x = float(cols.min())
    max_x = float(cols.max() + 1)
    return min_x / max(1.0, float(w)), max_x / max(1.0, float(w))


def _proxy_mesh_from_mask(
    mask_obs: MaskObservation,
    dimensions: tuple[float, float, float],
    depth_scale: float,
    bands: int,
) -> trimesh.Trimesh:
    crop = _mask_crop(mask_obs)
    if crop.size == 0:
        return _empty_mesh()

    h, w = crop.shape
    width, height, depth = dimensions
    band_count = max(6, int(bands))
    band_step = max(1, h // band_count)
    meshes: list[trimesh.Trimesh] = []

    for y0 in range(0, h, band_step):
        y1 = min(h, y0 + band_step)
        if y1 <= y0:
            continue
        band = crop[y0:y1, :] > 0
        if np.sum(band) <= 0:
            continue
        cols = np.where(np.any(band, axis=0))[0]
        if cols.size <= 0:
            continue

        x0 = int(cols.min())
        x1 = int(cols.max() + 1)
        width_ratio = max(1e-3, float(x1 - x0) / max(1.0, float(w)))
        center_x_ratio = ((float(x0 + x1) * 0.5) / max(1.0, float(w))) - 0.5
        band_h_ratio = max(1e-3, float(y1 - y0) / max(1.0, float(h)))
        center_y_ratio = (float(y0 + y1) * 0.5) / max(1.0, float(h))

        extents = (
            max(0.01, width * width_ratio),
            max(0.01, height * band_h_ratio),
            max(0.01, depth * depth_scale),
        )
        center = (
            center_x_ratio * width,
            center_y_ratio * height,
            0.0,
        )
        meshes.append(_box_world(extents, center))

    return _concat(meshes) if meshes else _empty_mesh()


def conservative_component_meshes(
    preset: PresetDefinition,
    dimensions: tuple[float, float, float],
    quality: str,
    front_mask: MaskObservation,
    heuristics: dict[str, object] | None = None,
    scale_axis: str = "height",
    pivot_mode: str = "floor-center",
) -> GeometryBuildResult:
    heuristics = dict(heuristics or {})
    component_meshes: dict[str, trimesh.Trimesh] = {component.name: _empty_mesh() for component in preset.components}

    width, height, depth = dimensions
    proxy_bands = 14 if quality == "low" else 24
    proxy_mesh = _proxy_mesh_from_mask(front_mask, dimensions, depth_scale=1.0, bands=proxy_bands)

    if preset.id == "table-desk":
        thickness = _clamp(height * 0.04, 0.02, 0.06)
        top_band = _mask_band_bounds(front_mask, 0.0, 0.24)
        if top_band is None:
            top_width = width * 0.8
            center_x = 0.0
        else:
            left_ratio, right_ratio = top_band
            top_width = max(0.05, width * (right_ratio - left_ratio))
            center_x = (((left_ratio + right_ratio) * 0.5) - 0.5) * width
        top_center_y = max(thickness * 0.5, height - thickness * 0.5)
        component_meshes["OBJ_Top"] = _box_world((top_width, thickness, depth), (center_x, top_center_y, 0.0))

        lower_proxy = _proxy_mesh_from_mask(front_mask, (width, height * 0.62, depth * 0.85), depth_scale=1.0, bands=max(6, proxy_bands // 2))
        lower_proxy.apply_translation((0.0, (height * 0.62) * 0.5, 0.0))
        component_meshes["OBJ_Frame"] = lower_proxy

        support_mode = str(heuristics.get("table_support_mode", "continuous_frame"))
        thin_count = int(heuristics.get("table_lower_thin_components", 0))
        if support_mode == "four_legs" and thin_count >= 4:
            leg_h = max(0.03, height - thickness)
            leg_w = _clamp(width * 0.06, 0.03, 0.08)
            leg_d = _clamp(depth * 0.06, 0.03, 0.08)
            inset_x = _clamp(width * 0.08, 0.04, 0.12)
            inset_z = _clamp(depth * 0.08, 0.04, 0.12)
            leg_centers = [
                (-width * 0.5 + inset_x, leg_h * 0.5, -depth * 0.5 + inset_z),
                (width * 0.5 - inset_x, leg_h * 0.5, -depth * 0.5 + inset_z),
                (-width * 0.5 + inset_x, leg_h * 0.5, depth * 0.5 - inset_z),
                (width * 0.5 - inset_x, leg_h * 0.5, depth * 0.5 - inset_z),
            ]
            legs = [_box_world((leg_w, leg_h, leg_d), center) for center in leg_centers]
            component_meshes["OBJ_Legs"] = _concat(legs)
        else:
            component_meshes["OBJ_Legs"] = _empty_mesh()
        component_meshes["OBJ_Drawers"] = _empty_mesh()
        component_meshes["OBJ_Hardware"] = _empty_mesh()
    else:
        primary_target: str | None = None
        for candidate in ("OBJ_Main", "OBJ_Frame", "OBJ_Body", "OBJ_Seat", "OBJ_Top"):
            if candidate in component_meshes:
                primary_target = candidate
                break
        if primary_target is None and preset.components:
            primary_target = preset.components[0].name
        if primary_target is not None:
            component_meshes[primary_target] = proxy_mesh

    for component_name, mesh in component_meshes.items():
        if len(mesh.faces) > 0:
            mesh.metadata = {"componentName": component_name}

    _apply_uniform_scale_to_axis(component_meshes, dimensions, scale_axis=scale_axis)
    _apply_pivot(component_meshes, pivot_mode=pivot_mode)
    merged = _concat(list(component_meshes.values()))

    scene = trimesh.Scene()
    for component in preset.components:
        mesh = component_meshes[component.name]
        if len(mesh.faces) == 0:
            continue
        scene.add_geometry(mesh, geom_name=component.name, node_name=component.name)

    return GeometryBuildResult(scene=scene, merged=merged, component_meshes=component_meshes)


def _quality_parameters(quality: str, complexity: str) -> tuple[int, int, int]:
    if quality == "low":
        return 0, 8, 2400 if complexity != "high" else 3000
    if complexity == "high":
        return 2, 24, 18000
    if complexity == "low":
        return 1, 12, 9000
    return 1, 16, 13000


def _axis_index(axis: str) -> int:
    return {"width": 0, "height": 1, "depth": 2}.get(axis, 1)


def _apply_uniform_scale_to_axis(
    component_meshes: dict[str, trimesh.Trimesh],
    target_dimensions: tuple[float, float, float],
    scale_axis: str,
) -> None:
    merged = _concat(list(component_meshes.values()))
    bounds = merged.bounds
    extents = bounds[1] - bounds[0]
    axis_idx = _axis_index(scale_axis)
    current_axis = float(max(extents[axis_idx], 1e-6))
    target_axis = float(max(target_dimensions[axis_idx], 1e-6))
    scale_factor = target_axis / current_axis

    for mesh in component_meshes.values():
        mesh.apply_scale(scale_factor)


def _apply_pivot(
    component_meshes: dict[str, trimesh.Trimesh],
    pivot_mode: str,
) -> None:
    merged = _concat(list(component_meshes.values()))
    bounds_min = merged.bounds[0]
    bounds_max = merged.bounds[1]

    if pivot_mode == "center":
        offset = -(bounds_min + bounds_max) * 0.5
    else:
        offset = np.array(
            [
                -((bounds_min[0] + bounds_max[0]) * 0.5),
                -bounds_min[1],
                -((bounds_min[2] + bounds_max[2]) * 0.5),
            ],
            dtype=np.float64,
        )

    for mesh in component_meshes.values():
        mesh.apply_translation(offset)


def recipe_to_component_meshes(
    preset: PresetDefinition,
    dimensions: tuple[float, float, float],
    quality: str,
    complexity: str,
    recipes: dict[str, list[dict[str, object]]],
    heuristics: dict[str, object] | None = None,
    scale_axis: str = "height",
    pivot_mode: str = "floor-center",
) -> GeometryBuildResult:
    subdivisions, sections, face_budget = _quality_parameters(quality, complexity)
    if preset.id == "table-desk":
        # Dedicated builder to enforce clean table structure and scale-driven proportions.
        table_heuristics: dict[str, object] = dict(heuristics or {})
        table_heuristics["drawer_hint"] = bool(table_heuristics.get("drawer_hint", len(recipes.get("OBJ_Drawers", [])) > 0))
        component_meshes = _build_table_component_meshes(
            preset=preset,
            dimensions=dimensions,
            quality=quality,
            heuristics=table_heuristics,
        )
    else:
        component_meshes = {}

    if preset.id != "table-desk":
        for component in preset.components:
            primitive_recipes = recipes.get(component.name, [])
            if len(primitive_recipes) == 0:
                component_meshes[component.name] = _empty_mesh()
                continue

            meshes: list[trimesh.Trimesh] = []
            for primitive in primitive_recipes:
                primitive_type = str(primitive.get("type", "box"))
                if primitive_type == "box":
                    meshes.append(_bounds_to_box(dimensions, primitive["bounds"], subdivisions if quality == "high" else 0))
                elif primitive_type == "cylinder":
                    meshes.append(
                        _cylinder(
                            dimensions,
                            float(primitive["radiusRatio"]),
                            float(primitive["heightRatio"]),
                            tuple(primitive["centerRatio"]),  # type: ignore[arg-type]
                            sections,
                        )
                    )
                elif primitive_type == "cone":
                    meshes.append(
                        _cone(
                            dimensions,
                            float(primitive["radiusRatio"]),
                            float(primitive["heightRatio"]),
                            tuple(primitive["centerRatio"]),  # type: ignore[arg-type]
                            max(8, sections),
                        )
                    )
                elif primitive_type == "truncated_cone":
                    meshes.append(
                        _truncated_cone(
                            dimensions,
                            float(primitive["baseRadiusRatio"]),
                            float(primitive["topRadiusRatio"]),
                            float(primitive["heightRatio"]),
                            tuple(primitive["centerRatio"]),  # type: ignore[arg-type]
                            max(8, sections),
                        )
                    )
                elif primitive_type == "sphere":
                    meshes.append(
                        _sphere(
                            dimensions,
                            float(primitive["radiusRatio"]),
                            tuple(primitive["centerRatio"]),  # type: ignore[arg-type]
                            1 if quality == "high" else 0,
                        )
                    )
                elif primitive_type == "lathe":
                    meshes.append(_lathe(dimensions, list(primitive["profile"]), max(10, sections)))
                else:
                    meshes.append(_bounds_to_box(dimensions, (0.44, 0.56, 0.2, 0.3, 0.44, 0.56), 0))

            mesh = _concat(meshes)
            mesh.metadata = {"componentName": component.name}
            component_meshes[component.name] = mesh

    for component_name, mesh in component_meshes.items():
        if len(mesh.faces) > 0:
            mesh.metadata = {"componentName": component_name}

    merged = _concat(list(component_meshes.values()))
    if len(merged.faces) > face_budget:
        for component_name, mesh in list(component_meshes.items()):
            if len(mesh.faces) > (face_budget // max(1, len(component_meshes))):
                try:
                    component_meshes[component_name] = mesh.simplify_quadric_decimation(max(200, face_budget // len(component_meshes)))
                except Exception:
                    component_meshes[component_name] = mesh
    _apply_uniform_scale_to_axis(component_meshes, dimensions, scale_axis=scale_axis)
    _apply_pivot(component_meshes, pivot_mode=pivot_mode)
    merged = _concat(list(component_meshes.values()))

    scene = trimesh.Scene()
    for component in preset.components:
        mesh = component_meshes[component.name]
        if len(mesh.faces) == 0:
            continue
        scene.add_geometry(mesh, geom_name=component.name, node_name=component.name)

    return GeometryBuildResult(scene=scene, merged=merged, component_meshes=component_meshes)


def fallback_component_meshes(
    preset: PresetDefinition,
    dimensions: tuple[float, float, float],
    quality: str,
    heuristics: dict[str, object] | None = None,
    scale_axis: str = "height",
    pivot_mode: str = "floor-center",
) -> GeometryBuildResult:
    minimal_recipes = {
        component.name: [{"type": "box", "bounds": (0.24, 0.76, 0.14 + idx * 0.05, 0.22 + idx * 0.05, 0.2, 0.8)}]
        for idx, component in enumerate(preset.components)
    }
    return recipe_to_component_meshes(
        preset,
        dimensions,
        quality=quality,
        complexity="low",
        recipes=minimal_recipes,
        heuristics=heuristics,
        scale_axis=scale_axis,
        pivot_mode=pivot_mode,
    )
