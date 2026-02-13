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


def estimate_object_dimensions(
    request: GenerationRequest,
    front_mask: MaskObservation,
    side_mask: MaskObservation | None,
) -> tuple[tuple[float, float, float], dict[str, float | bool]]:
    front_w_px, front_h_px = _safe_bbox_width_height(front_mask)
    width_to_height = float(np.clip(front_w_px / max(front_h_px, 1.0), 0.22, 3.8))

    if side_mask is not None and side_mask.valid:
        side_w_px, side_h_px = _safe_bbox_width_height(side_mask)
        depth_to_height = float(np.clip(side_w_px / max(side_h_px, 1.0), 0.12, 2.8))
    else:
        depth_to_height = float(np.clip(width_to_height * 0.6, 0.12, 2.8))

    scale_m = max(0.12, float(request.scaleValueCm) / 100.0)
    if request.scaleDimension == "width":
        width_m = scale_m
        height_m = width_m / max(width_to_height, 0.1)
        depth_m = height_m * depth_to_height
    elif request.scaleDimension == "depth":
        depth_m = scale_m
        height_m = depth_m / max(depth_to_height, 0.1)
        width_m = height_m * width_to_height
    else:
        height_m = scale_m
        width_m = height_m * width_to_height
        depth_m = height_m * depth_to_height

    width_m = float(np.clip(width_m, 0.12, 5.0))
    height_m = float(np.clip(height_m, 0.12, 5.0))
    depth_m = float(np.clip(depth_m, 0.1, 4.0))

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
    drawer_hint = bool(mid_slice.mean() > (top_slice.mean() * 1.08 if top_slice.size else 0.0))

    back_profile = float(np.clip((top_slice.mean() / max(rows.mean(), 1e-5)) if top_slice.size else 0.35, 0.18, 0.62))

    heuristics = {
        "depth_ratio": float(np.clip(depth_to_height / max(width_to_height, 0.1), 0.25, 1.35)),
        "seat_height_ratio": seat_height_ratio,
        "drawer_hint": drawer_hint,
        "back_profile": back_profile,
    }
    return (width_m, height_m, depth_m), heuristics


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


def recipe_to_component_meshes(
    preset: PresetDefinition,
    dimensions: tuple[float, float, float],
    quality: str,
    complexity: str,
    recipes: dict[str, list[dict[str, object]]],
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
) -> GeometryBuildResult:
    minimal_recipes = {
        component.name: [{"type": "box", "bounds": (0.24, 0.76, 0.14 + idx * 0.05, 0.22 + idx * 0.05, 0.2, 0.8)}]
        for idx, component in enumerate(preset.components)
    }
    return recipe_to_component_meshes(preset, dimensions, quality=quality, complexity="low", recipes=minimal_recipes)
