from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import trimesh

from ..models import GenerationRequest
from ..presets import PresetDefinition
from .silhouette import MaskObservation


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


def estimate_object_dimensions(
    request: GenerationRequest,
    front_mask: MaskObservation,
    side_mask: MaskObservation | None,
) -> tuple[tuple[float, float, float], dict[str, object], dict[str, float | str]]:
    front_w_px, front_h_px = _safe_bbox_width_height(front_mask)
    width_px = max(1.0, front_w_px)
    height_px = max(1.0, front_h_px)

    depth_source = "inferred_0.6_width"
    if side_mask is not None and side_mask.valid:
        side_w_px, side_h_px = _safe_bbox_width_height(side_mask)
        _ = side_h_px
        depth_px = max(1.0, side_w_px)
        depth_source = "side_bbox"
    else:
        depth_px = max(1.0, width_px * 0.6)

    axis_pixel = {
        "width": width_px,
        "height": height_px,
        "depth": depth_px,
    }[request.scaleDimension]
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

    back_profile = float(np.clip((top_slice.mean() / max(rows.mean(), 1e-5)) if top_slice.size else 0.35, 0.18, 0.62))
    peak_width = float(np.max(rows)) if rows.size > 0 else 1.0
    top_width_ratio = float(np.clip(_band_mean(rows, 0.0, 0.22) / max(peak_width, 1e-6), 0.12, 1.0))
    mid_width_ratio = float(np.clip(_band_mean(rows, 0.42, 0.64) / max(peak_width, 1e-6), 0.12, 1.0))
    bottom_width_ratio = float(np.clip(np.mean(bottom_slice) / max(peak_width, 1e-6), 0.12, 1.0)) if bottom_slice.size > 0 else mid_width_ratio

    bbox_area = max(1.0, (front_mask.bbox[2] - front_mask.bbox[0]) * (front_mask.bbox[3] - front_mask.bbox[1]))
    silhouette_pixels = float(np.sum(front_mask.mask > 0))
    silhouette_fill = float(np.clip(silhouette_pixels / bbox_area, 0.05, 1.0))
    lathe_profile = _lathe_profile_from_mask(front_mask)

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
    }
    scale_stats = {
        "width_cm": float(width_cm),
        "height_cm": float(height_cm),
        "depth_cm": float(depth_cm),
        "scale_axis_used": request.scaleDimension,
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
    scale_axis: str = "height",
    pivot_mode: str = "floor-center",
) -> GeometryBuildResult:
    subdivisions, sections, face_budget = _quality_parameters(quality, complexity)
    component_meshes: dict[str, trimesh.Trimesh] = {}

    for component in preset.components:
        primitive_recipes = recipes.get(component.name, [])
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
        scene.add_geometry(mesh, geom_name=component.name, node_name=component.name)

    return GeometryBuildResult(scene=scene, merged=merged, component_meshes=component_meshes)


def fallback_component_meshes(
    preset: PresetDefinition,
    dimensions: tuple[float, float, float],
    quality: str,
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
        scale_axis=scale_axis,
        pivot_mode=pivot_mode,
    )
