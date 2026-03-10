import argparse
import json
import math
import tempfile
import time
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

try:
    import pymeshlab
except Exception as import_error:  # pragma: no cover
    raise RuntimeError(f"PyMeshLab import failed: {import_error}") from import_error

try:
    import trimesh
except Exception:  # pragma: no cover
    trimesh = None


def log_line(message: str) -> None:
    print(f"[hunyuan_mesh_optimize] {message}", flush=True)


def safe_mkdir(file_path: Path) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)


def write_json(file_path: Path, payload: Dict[str, Any]) -> None:
    safe_mkdir(file_path)
    file_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def normalize(vectors: np.ndarray, eps: float = 1e-12) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms = np.clip(norms, eps, None)
    return vectors / norms


def mesh_counts(mesh_set: "pymeshlab.MeshSet") -> Tuple[int, int]:
    mesh = mesh_set.current_mesh()
    return int(mesh.vertex_number()), int(mesh.face_number())


def mesh_arrays(mesh_set: "pymeshlab.MeshSet") -> Tuple[np.ndarray, np.ndarray]:
    mesh = mesh_set.current_mesh()
    vertices = np.asarray(mesh.vertex_matrix(), dtype=np.float64)
    faces = np.asarray(mesh.face_matrix(), dtype=np.int64)
    return vertices, faces


def meshset_from_arrays(vertices: np.ndarray, faces: np.ndarray) -> "pymeshlab.MeshSet":
    mesh = pymeshlab.Mesh(vertex_matrix=vertices, face_matrix=faces)
    mesh_set = pymeshlab.MeshSet()
    mesh_set.add_mesh(mesh, "optimized")
    return mesh_set


def apply_filter_if_available(
    mesh_set: "pymeshlab.MeshSet",
    filter_names: Sequence[str],
    **kwargs: Any,
) -> Optional[str]:
    for filter_name in filter_names:
        try:
            mesh_set.apply_filter(filter_name, **kwargs)
            return filter_name
        except Exception:
            continue
    return None


def cleanup_mesh(mesh_set: "pymeshlab.MeshSet") -> None:
    apply_filter_if_available(
        mesh_set,
        ("meshing_remove_duplicate_vertices", "remove_duplicate_vertices"),
    )
    apply_filter_if_available(
        mesh_set,
        ("meshing_remove_duplicate_faces", "remove_duplicate_faces"),
    )
    apply_filter_if_available(
        mesh_set,
        ("meshing_remove_null_faces", "remove_null_faces", "meshing_remove_zero_area_faces"),
    )
    apply_filter_if_available(
        mesh_set,
        ("meshing_remove_unreferenced_vertices", "remove_unreferenced_vertices"),
    )
    apply_filter_if_available(
        mesh_set,
        ("compute_normal_per_face", "compute_normals_for_faces"),
    )
    apply_filter_if_available(
        mesh_set,
        ("compute_normal_per_vertex", "compute_normals_for_vertices"),
    )


def run_safe_decimation(mesh_set: "pymeshlab.MeshSet", targetperc: float) -> str:
    attempts: List[Dict[str, Any]] = [
        {
            "targetperc": targetperc,
            "preservenormal": True,
            "preservetopology": True,
            "preserveboundary": True,
            "planarquadric": True,
            "qualitythr": 0.3,
        },
        {
            "targetperc": targetperc,
            "preservenormal": True,
            "preservetopology": True,
            "planarquadric": True,
            "qualitythr": 0.3,
        },
        {
            "targetperc": targetperc,
            "preservenormal": True,
            "preservetopology": True,
            "planarquadric": True,
        },
    ]
    filter_names = (
        "meshing_decimation_quadric_edge_collapse",
        "simplification_quadric_edge_collapse_decimation",
    )
    errors: List[str] = []
    for params in attempts:
        for filter_name in filter_names:
            try:
                mesh_set.apply_filter(filter_name, **params)
                return filter_name
            except Exception as decimation_error:
                errors.append(f"{filter_name}({params}): {decimation_error}")
    raise RuntimeError("Decimation failed: " + " | ".join(errors))


def load_mesh(mesh_path: Path) -> Tuple["pymeshlab.MeshSet", Optional[str]]:
    mesh_set = pymeshlab.MeshSet()
    try:
        mesh_set.load_new_mesh(str(mesh_path))
        return mesh_set, None
    except Exception as first_error:
        if trimesh is None:
            raise RuntimeError(
                f"Could not load mesh via PyMeshLab ({first_error}) and trimesh is unavailable."
            ) from first_error
        with tempfile.TemporaryDirectory(prefix="hunyuan_mesh_load_") as temp_dir:
            converted_path = Path(temp_dir) / "converted_input.obj"
            loaded = trimesh.load(str(mesh_path), force="mesh", process=False)
            if loaded is None:
                raise RuntimeError(f"Could not load mesh: {mesh_path}") from first_error
            loaded.export(str(converted_path))
            mesh_set = pymeshlab.MeshSet()
            mesh_set.load_new_mesh(str(converted_path))
            return mesh_set, f"converted_from={mesh_path.name}"


def face_normals_and_areas(vertices: np.ndarray, faces: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    triangles = vertices[faces]
    cross = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    areas = np.linalg.norm(cross, axis=1) * 0.5
    normals = normalize(cross)
    return normals, areas


def build_face_adjacency(faces: np.ndarray) -> Dict[Tuple[int, int], List[int]]:
    edge_faces: Dict[Tuple[int, int], List[int]] = {}
    for face_index, (a, b, c) in enumerate(faces):
        for u, v in ((a, b), (b, c), (c, a)):
            edge = (int(u), int(v))
            sorted_edge = (edge[0], edge[1]) if edge[0] < edge[1] else (edge[1], edge[0])
            edge_faces.setdefault(sorted_edge, []).append(face_index)
    return edge_faces


@dataclass
class PlanarRegion:
    face_indices: np.ndarray
    normal: np.ndarray
    centroid: np.ndarray
    area: float


def detect_planar_regions(
    vertices: np.ndarray,
    faces: np.ndarray,
    angle_threshold_deg: float,
    sharp_edge_deg: float,
    plane_distance_tolerance: float,
    min_region_faces: int,
) -> Tuple[List[PlanarRegion], int]:
    if faces.shape[0] == 0:
        return [], 0

    face_normals, face_areas = face_normals_and_areas(vertices, faces)
    edge_faces = build_face_adjacency(faces)

    cos_angle_threshold = math.cos(math.radians(angle_threshold_deg))
    sharp_edge_threshold = math.radians(sharp_edge_deg)
    neighbors: List[List[int]] = [[] for _ in range(faces.shape[0])]

    for shared_faces in edge_faces.values():
        if len(shared_faces) != 2:
            continue
        f0, f1 = shared_faces
        normal_dot = float(np.clip(np.dot(face_normals[f0], face_normals[f1]), -1.0, 1.0))
        if normal_dot < cos_angle_threshold:
            continue
        dihedral = math.acos(normal_dot)
        if dihedral > sharp_edge_threshold:
            continue
        neighbors[f0].append(f1)
        neighbors[f1].append(f0)

    visited = np.zeros(faces.shape[0], dtype=bool)
    regions: List[PlanarRegion] = []
    planar_faces_before = 0

    for seed_face in range(faces.shape[0]):
        if visited[seed_face]:
            continue
        stack = [seed_face]
        component: List[int] = []
        while stack:
            current = stack.pop()
            if visited[current]:
                continue
            visited[current] = True
            component.append(current)
            for next_face in neighbors[current]:
                if not visited[next_face]:
                    stack.append(next_face)

        if len(component) < min_region_faces:
            continue

        region_indices = np.asarray(component, dtype=np.int64)
        region_faces = faces[region_indices].reshape(-1)
        region_points = vertices[region_faces]
        centroid = np.mean(region_points, axis=0)

        weighted_normals = face_normals[region_indices] * face_areas[region_indices][:, None]
        normal = np.sum(weighted_normals, axis=0)
        normal_norm = float(np.linalg.norm(normal))
        if normal_norm < 1e-12:
            continue
        normal = normal / normal_norm

        point_distances = np.abs((region_points - centroid) @ normal)
        if float(np.percentile(point_distances, 95.0)) > plane_distance_tolerance:
            continue

        planar_faces_before += int(region_indices.size)
        regions.append(
            PlanarRegion(
                face_indices=region_indices,
                normal=normal.astype(np.float64),
                centroid=centroid.astype(np.float64),
                area=float(np.sum(face_areas[region_indices])),
            )
        )

    return regions, planar_faces_before


def polygon_signed_area(points_2d: np.ndarray) -> float:
    if points_2d.shape[0] < 3:
        return 0.0
    x = points_2d[:, 0]
    y = points_2d[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - y * np.roll(x, -1)))


def point_in_triangle(point: np.ndarray, a: np.ndarray, b: np.ndarray, c: np.ndarray) -> bool:
    v0 = c - a
    v1 = b - a
    v2 = point - a

    dot00 = np.dot(v0, v0)
    dot01 = np.dot(v0, v1)
    dot02 = np.dot(v0, v2)
    dot11 = np.dot(v1, v1)
    dot12 = np.dot(v1, v2)

    denom = dot00 * dot11 - dot01 * dot01
    if abs(denom) < 1e-15:
        return False
    inv_denom = 1.0 / denom
    u = (dot11 * dot02 - dot01 * dot12) * inv_denom
    v = (dot00 * dot12 - dot01 * dot02) * inv_denom
    return u >= 0.0 and v >= 0.0 and (u + v) <= 1.0


def triangulate_polygon_ear_clip(loop_vertex_ids: List[int], points_2d: np.ndarray) -> Optional[List[Tuple[int, int, int]]]:
    if len(loop_vertex_ids) < 3:
        return None

    order = list(range(len(loop_vertex_ids)))
    if polygon_signed_area(points_2d) < 0:
        order.reverse()

    triangles: List[Tuple[int, int, int]] = []
    guard = 0
    max_guard = max(1000, len(order) * len(order) * 4)
    while len(order) > 3 and guard < max_guard:
        guard += 1
        ear_found = False
        for idx in range(len(order)):
            prev_idx = order[(idx - 1) % len(order)]
            curr_idx = order[idx]
            next_idx = order[(idx + 1) % len(order)]

            a = points_2d[prev_idx]
            b = points_2d[curr_idx]
            c = points_2d[next_idx]
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if cross <= 1e-12:
                continue

            contains_point = False
            for test_idx in order:
                if test_idx in (prev_idx, curr_idx, next_idx):
                    continue
                if point_in_triangle(points_2d[test_idx], a, b, c):
                    contains_point = True
                    break
            if contains_point:
                continue

            triangles.append(
                (
                    loop_vertex_ids[prev_idx],
                    loop_vertex_ids[curr_idx],
                    loop_vertex_ids[next_idx],
                )
            )
            del order[idx]
            ear_found = True
            break

        if not ear_found:
            return None

    if len(order) == 3:
        triangles.append(
            (
                loop_vertex_ids[order[0]],
                loop_vertex_ids[order[1]],
                loop_vertex_ids[order[2]],
            )
        )
    return triangles if len(triangles) > 0 else None


def point_line_distance(point: np.ndarray, start: np.ndarray, end: np.ndarray) -> float:
    segment = end - start
    seg_len_sq = float(np.dot(segment, segment))
    if seg_len_sq <= 1e-15:
        return float(np.linalg.norm(point - start))
    t = float(np.dot(point - start, segment) / seg_len_sq)
    t = max(0.0, min(1.0, t))
    projection = start + segment * t
    return float(np.linalg.norm(point - projection))


def rdp_indices(points: np.ndarray, epsilon: float) -> List[int]:
    if points.shape[0] <= 2:
        return [0, points.shape[0] - 1]

    start = points[0]
    end = points[-1]
    max_dist = -1.0
    max_idx = -1
    for idx in range(1, points.shape[0] - 1):
        dist = point_line_distance(points[idx], start, end)
        if dist > max_dist:
            max_dist = dist
            max_idx = idx

    if max_dist > epsilon and max_idx > 0:
        left = rdp_indices(points[: max_idx + 1], epsilon)
        right = rdp_indices(points[max_idx:], epsilon)
        return left[:-1] + [index + max_idx for index in right]
    return [0, points.shape[0] - 1]


def simplify_boundary_loop(
    loop_vertex_ids: List[int],
    projected_points: np.ndarray,
    epsilon: float,
    min_vertices: int = 16,
    max_vertices: int = 96,
) -> Tuple[List[int], np.ndarray]:
    if len(loop_vertex_ids) <= min_vertices:
        return loop_vertex_ids, projected_points

    start_idx = int(np.argmin(projected_points[:, 0] + projected_points[:, 1] * 1e-3))
    reordered_ids = loop_vertex_ids[start_idx:] + loop_vertex_ids[:start_idx]
    reordered_points = np.vstack([projected_points[start_idx:], projected_points[:start_idx]])
    open_points = np.vstack([reordered_points, reordered_points[0]])

    keep_open = rdp_indices(open_points, epsilon=max(epsilon, 1e-6))
    keep = sorted(set(index for index in keep_open if index < len(reordered_ids)))
    if len(keep) < min_vertices:
        step = max(1, len(reordered_ids) // min_vertices)
        keep = list(range(0, len(reordered_ids), step))
    if len(keep) > max_vertices:
        step = max(1, len(keep) // max_vertices)
        keep = keep[::step]
    if len(keep) < 3:
        keep = list(range(min(3, len(reordered_ids))))

    simplified_ids = [reordered_ids[idx] for idx in keep]
    simplified_points = reordered_points[np.asarray(keep, dtype=np.int64)]
    return simplified_ids, simplified_points


def extract_boundary_loop(region_faces: np.ndarray) -> Optional[List[int]]:
    edge_counts: Dict[Tuple[int, int], int] = {}
    for a, b, c in region_faces:
        for u, v in ((a, b), (b, c), (c, a)):
            edge = (int(u), int(v))
            sorted_edge = (edge[0], edge[1]) if edge[0] < edge[1] else (edge[1], edge[0])
            edge_counts[sorted_edge] = edge_counts.get(sorted_edge, 0) + 1

    boundary_edges = [edge for edge, count in edge_counts.items() if count == 1]
    if len(boundary_edges) < 3:
        return None

    adjacency: Dict[int, List[int]] = {}
    for u, v in boundary_edges:
        adjacency.setdefault(u, []).append(v)
        adjacency.setdefault(v, []).append(u)

    if any(len(neighbors) != 2 for neighbors in adjacency.values()):
        return None

    start = min(adjacency.keys())
    loop = [start]
    prev = -1
    current = start
    for _ in range(len(boundary_edges) + 2):
        neighbors = adjacency[current]
        nxt = neighbors[0] if neighbors[0] != prev else neighbors[1]
        if nxt == start:
            if len(loop) >= 3:
                break
            return None
        loop.append(nxt)
        prev, current = current, nxt
    else:
        return None

    if len(set(loop)) != len(loop):
        return None
    if len(set(loop)) != len(adjacency.keys()):
        return None
    return loop


def project_loop_to_plane(
    vertices: np.ndarray,
    loop_vertex_ids: List[int],
    normal: np.ndarray,
    centroid: np.ndarray,
) -> np.ndarray:
    points = vertices[np.asarray(loop_vertex_ids, dtype=np.int64)] - centroid
    ref_axis = np.array([1.0, 0.0, 0.0], dtype=np.float64)
    if abs(float(np.dot(ref_axis, normal))) > 0.9:
        ref_axis = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    tangent = np.cross(normal, ref_axis)
    tangent_norm = float(np.linalg.norm(tangent))
    if tangent_norm < 1e-12:
        tangent = np.array([0.0, 0.0, 1.0], dtype=np.float64)
    tangent = tangent / np.linalg.norm(tangent)
    bitangent = np.cross(normal, tangent)
    bitangent = bitangent / np.linalg.norm(bitangent)
    x = points @ tangent
    y = points @ bitangent
    return np.column_stack((x, y))


def simplify_planar_regions(
    vertices: np.ndarray,
    faces: np.ndarray,
    regions: List[PlanarRegion],
    plane_distance_tolerance: float,
    min_face_threshold: int,
) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    keep_mask = np.ones(faces.shape[0], dtype=bool)
    replacement_faces: List[Tuple[int, int, int]] = []

    fallback_region_count = 0
    applied_region_count = 0
    planar_faces_before = int(sum(int(region.face_indices.size) for region in regions))
    boundary_vertices_before = 0
    boundary_vertices_after = 0

    for region in sorted(regions, key=lambda item: int(item.face_indices.size), reverse=True):
        region_indices = region.face_indices
        region_faces = faces[region_indices]
        loop = extract_boundary_loop(region_faces)
        if loop is None:
            fallback_region_count += 1
            continue

        loop_points = vertices[np.asarray(loop, dtype=np.int64)]
        loop_distances = np.abs((loop_points - region.centroid) @ region.normal)
        if float(np.max(loop_distances)) > plane_distance_tolerance * 2.0:
            fallback_region_count += 1
            continue

        projected = project_loop_to_plane(vertices, loop, region.normal, region.centroid)
        loop_bbox_diag = float(np.linalg.norm(projected.max(axis=0) - projected.min(axis=0)))
        simplify_epsilon = max(plane_distance_tolerance * 3.0, loop_bbox_diag * 0.004)
        simplified_loop, simplified_projected = simplify_boundary_loop(
            loop,
            projected,
            epsilon=simplify_epsilon,
            min_vertices=16,
            max_vertices=96,
        )
        boundary_vertices_before += len(loop)
        boundary_vertices_after += len(simplified_loop)

        new_triangles = triangulate_polygon_ear_clip(simplified_loop, simplified_projected)
        if not new_triangles:
            fallback_region_count += 1
            continue

        if len(new_triangles) >= int(region_indices.size):
            fallback_region_count += 1
            continue

        keep_mask[region_indices] = False
        replacement_faces.extend(new_triangles)
        applied_region_count += 1

    merged_faces = faces[keep_mask]
    protected_mask = np.zeros(merged_faces.shape[0], dtype=bool)
    if replacement_faces:
        replacement_array = np.asarray(replacement_faces, dtype=np.int64)
        merged_faces = np.vstack([merged_faces, replacement_array])
        protected_mask = np.concatenate(
            [
                protected_mask,
                np.ones(replacement_array.shape[0], dtype=bool),
            ]
        )

    reverted_due_to_floor = False
    if merged_faces.shape[0] < min_face_threshold and faces.shape[0] >= min_face_threshold:
        merged_faces = faces.copy()
        protected_mask = np.zeros(merged_faces.shape[0], dtype=bool)
        reverted_due_to_floor = True

    stats = {
        "planar_regions_detected": len(regions),
        "planar_regions_applied": applied_region_count,
        "planar_region_fallback_count": fallback_region_count,
        "planar_faces_before": planar_faces_before,
        "planar_fallback_used": bool(fallback_region_count > 0 or reverted_due_to_floor),
        "planar_reverted_due_to_floor": reverted_due_to_floor,
        "planar_boundary_vertices_before": boundary_vertices_before,
        "planar_boundary_vertices_after": boundary_vertices_after,
        "planar_reconstructed_faces": int(np.count_nonzero(protected_mask)),
    }
    return merged_faces, protected_mask, stats


@dataclass
class PrismRegion:
    face_indices: np.ndarray
    basis: np.ndarray
    center: np.ndarray
    extents: np.ndarray
    axis: np.ndarray
    confidence: float
    reason: str
    repeated_group: int


def build_face_neighbors(faces: np.ndarray) -> List[List[int]]:
    edge_faces = build_face_adjacency(faces)
    neighbors: List[List[int]] = [[] for _ in range(faces.shape[0])]
    for shared_faces in edge_faces.values():
        if len(shared_faces) != 2:
            continue
        f0, f1 = shared_faces
        neighbors[f0].append(f1)
        neighbors[f1].append(f0)
    return neighbors


def face_connected_components(
    neighbors: List[List[int]],
    allowed_mask: Optional[np.ndarray] = None,
) -> List[np.ndarray]:
    face_count = len(neighbors)
    visited = np.zeros(face_count, dtype=bool)
    components: List[np.ndarray] = []
    for face_id in range(face_count):
        if visited[face_id]:
            continue
        if allowed_mask is not None and not bool(allowed_mask[face_id]):
            visited[face_id] = True
            continue
        stack = [face_id]
        indices: List[int] = []
        while stack:
            current = stack.pop()
            if visited[current]:
                continue
            visited[current] = True
            if allowed_mask is not None and not bool(allowed_mask[current]):
                continue
            indices.append(current)
            for nxt in neighbors[current]:
                if not visited[nxt]:
                    stack.append(nxt)
        if indices:
            components.append(np.asarray(indices, dtype=np.int64))
    return components


def oriented_basis_from_points(points: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    centroid = np.mean(points, axis=0)
    centered = points - centroid
    cov = np.cov(centered.T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    order = np.argsort(eigvals)[::-1]
    basis = eigvecs[:, order]
    if np.linalg.det(basis) < 0:
        basis[:, 2] *= -1.0
    local = centered @ basis
    mins = local.min(axis=0)
    maxs = local.max(axis=0)
    extents = maxs - mins
    center_local = (mins + maxs) * 0.5
    world_center = centroid + (basis @ center_local)
    return basis, world_center, extents


def build_box_mesh(
    center: np.ndarray,
    basis: np.ndarray,
    extents: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    half = extents * 0.5
    corners_local = np.array(
        [
            [-half[0], -half[1], -half[2]],
            [half[0], -half[1], -half[2]],
            [half[0], half[1], -half[2]],
            [-half[0], half[1], -half[2]],
            [-half[0], -half[1], half[2]],
            [half[0], -half[1], half[2]],
            [half[0], half[1], half[2]],
            [-half[0], half[1], half[2]],
        ],
        dtype=np.float64,
    )
    corners_world = center + (corners_local @ basis.T)
    faces = np.array(
        [
            [0, 1, 2],
            [0, 2, 3],
            [4, 6, 5],
            [4, 7, 6],
            [0, 4, 5],
            [0, 5, 1],
            [1, 5, 6],
            [1, 6, 2],
            [2, 6, 7],
            [2, 7, 3],
            [3, 7, 4],
            [3, 4, 0],
        ],
        dtype=np.int64,
    )
    return corners_world, faces


def build_prism_region_from_component(
    vertices: np.ndarray,
    faces: np.ndarray,
    face_normals: np.ndarray,
    face_areas: np.ndarray,
    component: np.ndarray,
    total_area: float,
    plane_distance_tolerance: float,
) -> Tuple[Optional[PrismRegion], bool]:
    comp_faces = faces[component]
    vertex_ids = np.unique(comp_faces.reshape(-1))
    if vertex_ids.size < 24:
        return None, False
    points = vertices[vertex_ids]
    basis, center, extents = oriented_basis_from_points(points)
    axis = basis[:, 0]
    main_extent = float(extents[0])
    cross_1 = float(extents[1])
    cross_2 = float(extents[2])

    cross_max = max(cross_1, cross_2, 1e-9)
    cross_min = max(min(cross_1, cross_2), 1e-9)
    elongation = main_extent / cross_max
    cross_ratio = cross_max / cross_min

    comp_normals = face_normals[component]
    alignment = np.abs(comp_normals @ axis)
    side_ratio = float(np.mean(alignment < 0.35))
    cap_ratio = float(np.mean(alignment > 0.8))
    area_share = float(np.sum(face_areas[component]) / max(total_area, 1e-9))

    confidence = 0.0
    if elongation >= 1.8:
        confidence += 0.35
    if side_ratio >= 0.58:
        confidence += 0.30
    if cap_ratio >= 0.05:
        confidence += 0.10
    if cross_ratio <= 2.8:
        confidence += 0.10
    if area_share <= 0.25:
        confidence += 0.10
    if main_extent > plane_distance_tolerance * 12.0 and cross_min > plane_distance_tolerance * 2.0:
        confidence += 0.05

    reason = (
        f"elongation={elongation:.2f} side_ratio={side_ratio:.2f} "
        f"cap_ratio={cap_ratio:.2f} cross_ratio={cross_ratio:.2f} "
        f"area_share={area_share:.3f}"
    )

    if confidence < 0.72:
        return None, True

    return (
        PrismRegion(
            face_indices=component,
            basis=basis.astype(np.float64),
            center=center.astype(np.float64),
            extents=extents.astype(np.float64),
            axis=axis.astype(np.float64),
            confidence=float(confidence),
            reason=reason,
            repeated_group=-1,
        ),
        False,
    )


def detect_prism_regions(
    vertices: np.ndarray,
    faces: np.ndarray,
    planar_regions: List[PlanarRegion],
    plane_distance_tolerance: float,
    min_component_faces: int = 64,
    max_component_faces: int = 25000,
) -> Tuple[List[PrismRegion], int]:
    if faces.shape[0] == 0:
        return [], 0

    face_normals, face_areas = face_normals_and_areas(vertices, faces)
    total_area = float(np.sum(face_areas))
    neighbors = build_face_neighbors(faces)

    protected = np.zeros(faces.shape[0], dtype=bool)
    for region in planar_regions:
        area_ratio = region.area / max(total_area, 1e-9)
        # Keep large horizontal planes untouched (tabletops/panels).
        if area_ratio >= 0.06 and abs(float(region.normal[2])) >= 0.85:
            protected[region.face_indices] = True

    allowed = ~protected
    components = face_connected_components(neighbors, allowed_mask=allowed)

    detected: List[PrismRegion] = []
    skipped_low_confidence = 0
    for component in components:
        if component.size < min_component_faces:
            continue
        if component.size > max_component_faces:
            skipped_low_confidence += 1
            continue
        prism_region, low_conf = build_prism_region_from_component(
            vertices,
            faces,
            face_normals,
            face_areas,
            component,
            total_area=total_area,
            plane_distance_tolerance=plane_distance_tolerance,
        )
        if prism_region is None:
            if low_conf:
                skipped_low_confidence += 1
            continue
        detected.append(prism_region)

    if detected:
        return detected, skipped_low_confidence

    # Fallback path: cluster vertical faces spatially in XY to isolate leg-like supports.
    centroids = np.mean(vertices[faces], axis=1)
    bbox_min = vertices.min(axis=0)
    bbox_max = vertices.max(axis=0)
    bbox_diag = float(np.linalg.norm(bbox_max - bbox_min))
    z_min = float(bbox_min[2])
    z_max = float(bbox_max[2])
    z_cutoff = z_min + (z_max - z_min) * 0.92
    vertical_mask = np.abs(face_normals[:, 2]) < 0.35
    vertical_mask &= centroids[:, 2] < z_cutoff
    vertical_mask &= ~protected

    face_ids = np.nonzero(vertical_mask)[0]
    if face_ids.size < min_component_faces:
        return detected, skipped_low_confidence

    cell_size = max(plane_distance_tolerance * 12.0, bbox_diag * 0.05)
    xy = centroids[face_ids, :2]
    xy_min = xy.min(axis=0)
    cell_coords = np.floor((xy - xy_min) / max(cell_size, 1e-9)).astype(np.int64)

    cell_to_faces: Dict[Tuple[int, int], List[int]] = {}
    for index, cell in enumerate(cell_coords):
        key = (int(cell[0]), int(cell[1]))
        cell_to_faces.setdefault(key, []).append(int(face_ids[index]))

    visited_cells: set[Tuple[int, int]] = set()
    for seed_cell in list(cell_to_faces.keys()):
        if seed_cell in visited_cells:
            continue
        stack = [seed_cell]
        connected_cells: List[Tuple[int, int]] = []
        while stack:
            current = stack.pop()
            if current in visited_cells:
                continue
            visited_cells.add(current)
            connected_cells.append(current)
            cx, cy = current
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    neighbor = (cx + dx, cy + dy)
                    if neighbor in cell_to_faces and neighbor not in visited_cells:
                        stack.append(neighbor)

        cluster_faces: List[int] = []
        for cell in connected_cells:
            cluster_faces.extend(cell_to_faces[cell])
        component = np.asarray(sorted(set(cluster_faces)), dtype=np.int64)
        if component.size < min_component_faces or component.size > max_component_faces:
            continue

        prism_region, low_conf = build_prism_region_from_component(
            vertices,
            faces,
            face_normals,
            face_areas,
            component,
            total_area=total_area,
            plane_distance_tolerance=plane_distance_tolerance,
        )
        if prism_region is None:
            if low_conf:
                skipped_low_confidence += 1
            continue
        detected.append(prism_region)

    return detected, skipped_low_confidence


def assign_repeated_support_groups(prisms: List[PrismRegion]) -> int:
    if len(prisms) < 2:
        return 0

    group_id = 0
    used = [False] * len(prisms)
    repeated_count = 0
    for i, seed in enumerate(prisms):
        if used[i]:
            continue
        cluster = [i]
        for j in range(i + 1, len(prisms)):
            if used[j]:
                continue
            candidate = prisms[j]
            axis_align = abs(float(np.dot(seed.axis, candidate.axis)))
            if axis_align < 0.95:
                continue
            seed_cross = np.sort(seed.extents[1:3])
            cand_cross = np.sort(candidate.extents[1:3])
            cross_diff = np.max(np.abs(seed_cross - cand_cross) / np.maximum(seed_cross, 1e-9))
            length_diff = abs(float(seed.extents[0] - candidate.extents[0])) / max(
                float(seed.extents[0]),
                float(candidate.extents[0]),
                1e-9,
            )
            if cross_diff <= 0.2 and length_diff <= 0.3:
                cluster.append(j)

        if len(cluster) >= 2:
            for idx in cluster:
                prisms[idx].repeated_group = group_id
                used[idx] = True
            repeated_count += len(cluster)
            group_id += 1

    return repeated_count


def reconstruct_furniture_prisms(
    vertices: np.ndarray,
    faces: np.ndarray,
    prisms: List[PrismRegion],
    min_face_threshold: int,
    protected_face_mask: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Dict[str, Any]]:
    if protected_face_mask is None or protected_face_mask.shape[0] != faces.shape[0]:
        protected_face_mask = np.zeros(faces.shape[0], dtype=bool)
    if not prisms:
        return vertices, faces, protected_face_mask, {
            "prism_regions_detected": 0,
            "repeated_supports_detected": 0,
            "prism_regions_reconstructed": 0,
            "prism_regions_skipped_low_confidence": 0,
        }

    repeated_supports_detected = assign_repeated_support_groups(prisms)
    cross_section_medians: Dict[int, np.ndarray] = {}
    for region in prisms:
        if region.repeated_group < 0:
            continue
        group_regions = [r for r in prisms if r.repeated_group == region.repeated_group]
        group_cross = np.array([np.sort(r.extents[1:3]) for r in group_regions], dtype=np.float64)
        cross_section_medians[region.repeated_group] = np.median(group_cross, axis=0)

    keep_mask = np.ones(faces.shape[0], dtype=bool)
    out_vertices = vertices.copy()
    replacement_faces: List[np.ndarray] = []
    reconstructed = 0
    skipped_low_confidence = 0

    for region in prisms:
        extents = region.extents.copy()
        if region.repeated_group >= 0 and region.repeated_group in cross_section_medians:
            # Normalize repeated support thickness while preserving length and placement.
            cross_dims = cross_section_medians[region.repeated_group]
            extents[1] = max(float(cross_dims[0]), 1e-6)
            extents[2] = max(float(cross_dims[1]), 1e-6)

        if np.min(extents) <= 1e-6:
            skipped_low_confidence += 1
            continue

        if extents[0] / max(extents[1], extents[2], 1e-9) < 1.6:
            skipped_low_confidence += 1
            continue

        box_vertices, box_faces = build_box_mesh(region.center, region.basis, extents)
        face_offset = out_vertices.shape[0]
        out_vertices = np.vstack([out_vertices, box_vertices])
        replacement_faces.append(box_faces + face_offset)
        keep_mask[region.face_indices] = False
        reconstructed += 1

    merged_faces = faces[keep_mask]
    merged_protected = protected_face_mask[keep_mask]
    if replacement_faces:
        merged_faces = np.vstack([merged_faces, *replacement_faces])
        merged_protected = np.concatenate(
            [
                merged_protected,
                np.zeros(sum(face_block.shape[0] for face_block in replacement_faces), dtype=bool),
            ]
        )

    if merged_faces.shape[0] < min_face_threshold and faces.shape[0] >= min_face_threshold:
        return vertices, faces, protected_face_mask, {
            "prism_regions_detected": len(prisms),
            "repeated_supports_detected": repeated_supports_detected,
            "prism_regions_reconstructed": 0,
            "prism_regions_skipped_low_confidence": len(prisms),
            "prism_reverted_due_to_floor": True,
        }

    return out_vertices, merged_faces, merged_protected, {
        "prism_regions_detected": len(prisms),
        "repeated_supports_detected": repeated_supports_detected,
        "prism_regions_reconstructed": reconstructed,
        "prism_regions_skipped_low_confidence": skipped_low_confidence,
        "prism_reverted_due_to_floor": False,
    }


def extract_submesh(
    vertices: np.ndarray,
    faces: np.ndarray,
    face_mask: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    selected_faces = faces[face_mask]
    if selected_faces.shape[0] == 0:
        return np.zeros((0, 3), dtype=np.float64), np.zeros((0, 3), dtype=np.int64)
    unique_vertices, inverse = np.unique(selected_faces.reshape(-1), return_inverse=True)
    sub_vertices = vertices[unique_vertices]
    sub_faces = inverse.reshape(-1, 3).astype(np.int64)
    return sub_vertices, sub_faces


def decimate_mesh_to_face_target(
    vertices: np.ndarray,
    faces: np.ndarray,
    target_faces: int,
) -> Tuple[np.ndarray, np.ndarray, bool]:
    current_faces = int(faces.shape[0])
    if current_faces <= target_faces or current_faces == 0:
        return vertices, faces, False

    targetperc = max(min(float(target_faces) / float(current_faces), 0.99), 0.02)
    mesh_set = meshset_from_arrays(vertices, faces)
    run_safe_decimation(mesh_set, targetperc)
    cleanup_mesh(mesh_set)
    out_vertices, out_faces = mesh_arrays(mesh_set)
    return out_vertices, out_faces, True


def planar_safe_final_decimation(
    vertices: np.ndarray,
    faces: np.ndarray,
    protected_planar_mask: np.ndarray,
    target_min_faces: int,
    target_max_faces: int,
) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    face_count = int(faces.shape[0])
    if face_count <= target_max_faces:
        return vertices, faces, {
            "final_decimation_applied": False,
            "protected_planar_faces": 0,
            "decimated_non_planar_faces_before": 0,
            "decimated_non_planar_faces_after": 0,
            "final_target_faces": target_max_faces,
            "final_decimation_reason": "already_below_target",
        }

    if protected_planar_mask.shape[0] != face_count:
        protected_mask = np.zeros(face_count, dtype=bool)
    else:
        protected_mask = protected_planar_mask.copy()

    protected_faces_count = int(np.count_nonzero(protected_mask))
    decimatable_mask = ~protected_mask
    decimatable_faces_count = int(np.count_nonzero(decimatable_mask))
    if decimatable_faces_count <= 0:
        return vertices, faces, {
            "final_decimation_applied": False,
            "protected_planar_faces": protected_faces_count,
            "decimated_non_planar_faces_before": 0,
            "decimated_non_planar_faces_after": 0,
            "final_target_faces": target_max_faces,
            "final_decimation_reason": "no_decimatable_faces",
        }

    target_total = min(target_max_faces, max(target_min_faces, face_count))
    target_for_non_planar = max(target_total - protected_faces_count, 500)
    if target_for_non_planar >= decimatable_faces_count:
        return vertices, faces, {
            "final_decimation_applied": False,
            "protected_planar_faces": protected_faces_count,
            "decimated_non_planar_faces_before": decimatable_faces_count,
            "decimated_non_planar_faces_after": decimatable_faces_count,
            "final_target_faces": target_total,
            "final_decimation_reason": "non_planar_already_below_target",
        }

    protected_vertices, protected_faces = extract_submesh(vertices, faces, protected_mask)
    dec_vertices, dec_faces = extract_submesh(vertices, faces, decimatable_mask)
    decimated_vertices, decimated_faces, applied = decimate_mesh_to_face_target(
        dec_vertices,
        dec_faces,
        target_for_non_planar,
    )
    if not applied:
        return vertices, faces, {
            "final_decimation_applied": False,
            "protected_planar_faces": protected_faces_count,
            "decimated_non_planar_faces_before": decimatable_faces_count,
            "decimated_non_planar_faces_after": decimatable_faces_count,
            "final_target_faces": target_total,
            "final_decimation_reason": "decimation_not_applied",
        }

    merged_vertices = protected_vertices
    merged_faces = protected_faces
    if decimated_faces.shape[0] > 0:
        offset = merged_vertices.shape[0]
        merged_vertices = np.vstack([merged_vertices, decimated_vertices])
        merged_faces = np.vstack([merged_faces, decimated_faces + offset])

    merged_set = meshset_from_arrays(merged_vertices, merged_faces)
    cleanup_mesh(merged_set)
    final_vertices, final_faces = mesh_arrays(merged_set)
    if final_faces.shape[0] < target_min_faces and faces.shape[0] >= target_min_faces:
        return vertices, faces, {
            "final_decimation_applied": False,
            "protected_planar_faces": protected_faces_count,
            "decimated_non_planar_faces_before": decimatable_faces_count,
            "decimated_non_planar_faces_after": int(decimated_faces.shape[0]),
            "final_target_faces": target_total,
            "final_decimation_reason": "reverted_due_to_floor",
        }

    return final_vertices, final_faces, {
        "final_decimation_applied": True,
        "protected_planar_faces": protected_faces_count,
        "decimated_non_planar_faces_before": decimatable_faces_count,
        "decimated_non_planar_faces_after": int(decimated_faces.shape[0]),
        "final_target_faces": target_total,
        "final_decimation_reason": "applied",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Conservative mesh optimization for Hunyuan shape meshes.",
    )
    parser.add_argument("--mesh", required=True, help="Input mesh path (GLB/OBJ/PLY...)")
    parser.add_argument("--output", required=True, help="Optimized mesh output path")
    parser.add_argument("--result-json", required=True, help="Metadata output JSON path")
    parser.add_argument("--target-perc", type=float, default=0.25)
    parser.add_argument("--min-face-threshold", type=int, default=10000)
    parser.add_argument("--planar-angle-deg", type=float, default=4.0)
    parser.add_argument("--sharp-angle-deg", type=float, default=28.0)
    parser.add_argument("--plane-distance-ratio", type=float, default=0.002)
    parser.add_argument("--plane-distance-min", type=float, default=1e-4)
    parser.add_argument("--planar-min-region-faces", type=int, default=48)
    parser.add_argument("--final-target-min-faces", type=int, default=3000)
    parser.add_argument("--final-target-max-faces", type=int, default=8000)
    parser.add_argument("--prism-min-component-faces", type=int, default=64)
    parser.add_argument("--prism-max-component-faces", type=int, default=25000)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    started = time.perf_counter()
    input_mesh_path = Path(args.mesh).expanduser().resolve()
    output_mesh_path = Path(args.output).expanduser().resolve()
    result_json_path = Path(args.result_json).expanduser().resolve()

    result: Dict[str, Any] = {
        "status": "failed",
        "input_mesh_path": str(input_mesh_path),
        "output_mesh_path": str(output_mesh_path),
        "input_vertex_count": None,
        "input_face_count": None,
        "output_vertex_count": None,
        "output_face_count": None,
        "decimation_strategy": "not-run",
        "quad_remesh_applied": False,
        "planar_regions_detected": 0,
        "planar_regions_applied": 0,
        "planar_region_fallback_count": 0,
        "planar_faces_before": 0,
        "planar_faces_after": 0,
        "planar_fallback_used": False,
        "planar_boundary_vertices_before": 0,
        "planar_boundary_vertices_after": 0,
        "planar_reconstructed_faces": 0,
        "prism_regions_detected": 0,
        "repeated_supports_detected": 0,
        "prism_regions_reconstructed": 0,
        "prism_regions_skipped_low_confidence": 0,
        "reconstructed_regions_count": 0,
        "skipped_low_confidence_regions_count": 0,
        "final_decimation_applied": False,
        "protected_planar_faces": 0,
        "decimated_non_planar_faces_before": 0,
        "decimated_non_planar_faces_after": 0,
        "final_target_faces": int(args.final_target_max_faces),
        "final_decimation_reason": None,
        "error": None,
        "traceback": None,
        "duration_ms": 0,
        "config": {
            "target_perc": float(args.target_perc),
            "min_face_threshold": int(args.min_face_threshold),
            "planar_angle_deg": float(args.planar_angle_deg),
            "sharp_angle_deg": float(args.sharp_angle_deg),
            "plane_distance_ratio": float(args.plane_distance_ratio),
            "plane_distance_min": float(args.plane_distance_min),
            "planar_min_region_faces": int(args.planar_min_region_faces),
            "final_target_min_faces": int(args.final_target_min_faces),
            "final_target_max_faces": int(args.final_target_max_faces),
            "prism_min_component_faces": int(args.prism_min_component_faces),
            "prism_max_component_faces": int(args.prism_max_component_faces),
        },
    }

    try:
        if not input_mesh_path.is_file():
            raise FileNotFoundError(f"Input mesh not found: {input_mesh_path}")

        mesh_set, load_note = load_mesh(input_mesh_path)
        if load_note:
            log_line(f"mesh load note: {load_note}")

        input_v, input_f = mesh_counts(mesh_set)
        result["input_vertex_count"] = input_v
        result["input_face_count"] = input_f
        result["original_vertex_count"] = input_v
        result["original_face_count"] = input_f
        log_line(f"mesh input counts: vertices={input_v} faces={input_f}")

        cleanup_mesh(mesh_set)
        clean_vertices, clean_faces = mesh_arrays(mesh_set)
        clean_face_count = int(clean_faces.shape[0])
        clean_vertex_count = int(clean_vertices.shape[0])
        log_line(
            f"cleanup completed: vertices={clean_vertex_count} faces={clean_face_count}"
        )

        base_vertices = clean_vertices.copy()
        base_faces = clean_faces.copy()

        run_safe_decimation(mesh_set, float(args.target_perc))
        cleanup_mesh(mesh_set)
        decimated_vertices, decimated_faces = mesh_arrays(mesh_set)
        decimated_face_count = int(decimated_faces.shape[0])
        strategy = f"target_perc={float(args.target_perc):.4f}"

        if (
            clean_face_count > int(args.min_face_threshold)
            and decimated_face_count < int(args.min_face_threshold)
        ):
            floor_target_perc = max(
                float(args.target_perc),
                float(args.min_face_threshold) / float(clean_face_count),
            )
            floor_target_perc = min(floor_target_perc, 0.99)
            mesh_set = meshset_from_arrays(base_vertices, base_faces)
            run_safe_decimation(mesh_set, floor_target_perc)
            cleanup_mesh(mesh_set)
            decimated_vertices, decimated_faces = mesh_arrays(mesh_set)
            decimated_face_count = int(decimated_faces.shape[0])
            strategy = f"floor_target_perc={floor_target_perc:.4f}"

        result["decimation_strategy"] = strategy
        log_line(
            f"decimation completed: strategy={strategy} vertices={decimated_vertices.shape[0]} faces={decimated_face_count}"
        )

        bbox_min = decimated_vertices.min(axis=0)
        bbox_max = decimated_vertices.max(axis=0)
        bbox_diag = float(np.linalg.norm(bbox_max - bbox_min))
        plane_distance_tolerance = max(
            float(args.plane_distance_min),
            bbox_diag * float(args.plane_distance_ratio),
        )

        regions, planar_faces_before = detect_planar_regions(
            decimated_vertices,
            decimated_faces,
            angle_threshold_deg=float(args.planar_angle_deg),
            sharp_edge_deg=float(args.sharp_angle_deg),
            plane_distance_tolerance=plane_distance_tolerance,
            min_region_faces=int(args.planar_min_region_faces),
        )
        log_line(
            f"planar detection: regions={len(regions)} planar_faces_before={planar_faces_before} tol={plane_distance_tolerance:.6f}"
        )

        simplified_vertices = decimated_vertices
        simplified_faces = decimated_faces
        planar_stats: Dict[str, Any] = {
            "planar_regions_detected": len(regions),
            "planar_regions_applied": 0,
            "planar_region_fallback_count": 0,
            "planar_faces_before": planar_faces_before,
            "planar_fallback_used": False,
            "planar_reverted_due_to_floor": False,
            "planar_boundary_vertices_before": 0,
            "planar_boundary_vertices_after": 0,
            "planar_reconstructed_faces": 0,
        }
        planar_protected_mask = np.zeros(simplified_faces.shape[0], dtype=bool)
        if regions:
            simplified_faces, planar_protected_mask, planar_stats = simplify_planar_regions(
                decimated_vertices,
                decimated_faces,
                regions,
                plane_distance_tolerance=plane_distance_tolerance,
                min_face_threshold=int(args.min_face_threshold),
            )

        regions_for_prisms, _ = detect_planar_regions(
            simplified_vertices,
            simplified_faces,
            angle_threshold_deg=float(args.planar_angle_deg),
            sharp_edge_deg=float(args.sharp_angle_deg),
            plane_distance_tolerance=plane_distance_tolerance,
            min_region_faces=int(args.planar_min_region_faces),
        )

        prism_regions, prism_skipped_low_conf = detect_prism_regions(
            simplified_vertices,
            simplified_faces,
            regions_for_prisms,
            plane_distance_tolerance=plane_distance_tolerance,
            min_component_faces=int(args.prism_min_component_faces),
            max_component_faces=int(args.prism_max_component_faces),
        )
        log_line(
            f"prism detection: regions={len(prism_regions)} skipped_low_confidence={prism_skipped_low_conf}"
        )

        reconstructed_vertices, reconstructed_faces, reconstructed_protected_mask, prism_stats = reconstruct_furniture_prisms(
            simplified_vertices,
            simplified_faces,
            prism_regions,
            min_face_threshold=int(args.min_face_threshold),
            protected_face_mask=planar_protected_mask,
        )
        result["prism_regions_detected"] = int(prism_stats["prism_regions_detected"])
        result["repeated_supports_detected"] = int(prism_stats["repeated_supports_detected"])
        result["prism_regions_reconstructed"] = int(prism_stats["prism_regions_reconstructed"])
        result["prism_regions_skipped_low_confidence"] = int(
            prism_stats["prism_regions_skipped_low_confidence"] + prism_skipped_low_conf
        )
        log_line(
            "furniture reconstruction: "
            f"reconstructed={result['prism_regions_reconstructed']} "
            f"repeated_supports={result['repeated_supports_detected']} "
            f"skipped_low_confidence={result['prism_regions_skipped_low_confidence']}"
        )

        optimized_vertices, optimized_faces, final_decimation_stats = planar_safe_final_decimation(
            reconstructed_vertices,
            reconstructed_faces,
            reconstructed_protected_mask,
            target_min_faces=int(args.final_target_min_faces),
            target_max_faces=int(args.final_target_max_faces),
        )
        result["final_decimation_applied"] = bool(
            final_decimation_stats["final_decimation_applied"]
        )
        result["protected_planar_faces"] = int(
            final_decimation_stats["protected_planar_faces"]
        )
        result["decimated_non_planar_faces_before"] = int(
            final_decimation_stats["decimated_non_planar_faces_before"]
        )
        result["decimated_non_planar_faces_after"] = int(
            final_decimation_stats["decimated_non_planar_faces_after"]
        )
        result["final_target_faces"] = int(final_decimation_stats["final_target_faces"])
        result["final_decimation_reason"] = str(
            final_decimation_stats["final_decimation_reason"]
        )
        log_line(
            "final decimation: "
            f"applied={result['final_decimation_applied']} "
            f"protected_planar_faces={result['protected_planar_faces']} "
            f"non_planar_before={result['decimated_non_planar_faces_before']} "
            f"non_planar_after={result['decimated_non_planar_faces_after']} "
            f"target={result['final_target_faces']} "
            f"reason={result['final_decimation_reason']}"
        )

        mesh_set = meshset_from_arrays(optimized_vertices, optimized_faces)
        cleanup_mesh(mesh_set)
        optimized_vertices, optimized_faces = mesh_arrays(mesh_set)

        regions_after, planar_faces_after = detect_planar_regions(
            optimized_vertices,
            optimized_faces,
            angle_threshold_deg=float(args.planar_angle_deg),
            sharp_edge_deg=float(args.sharp_angle_deg),
            plane_distance_tolerance=plane_distance_tolerance,
            min_region_faces=int(args.planar_min_region_faces),
        )
        _ = regions_after

        safe_mkdir(output_mesh_path)
        mesh_set.save_current_mesh(str(output_mesh_path))

        output_v, output_f = mesh_counts(mesh_set)
        result["status"] = "completed"
        result["output_mesh_path"] = str(output_mesh_path)
        result["output_vertex_count"] = output_v
        result["output_face_count"] = output_f
        result["optimized_vertex_count"] = output_v
        result["optimized_face_count"] = output_f
        result["planar_regions_detected"] = int(planar_stats["planar_regions_detected"])
        result["planar_regions_applied"] = int(planar_stats["planar_regions_applied"])
        result["planar_region_fallback_count"] = int(
            planar_stats["planar_region_fallback_count"]
        )
        result["planar_faces_before"] = int(planar_stats["planar_faces_before"])
        result["planar_faces_after"] = int(planar_faces_after)
        result["planar_fallback_used"] = bool(planar_stats["planar_fallback_used"])
        result["planar_boundary_vertices_before"] = int(
            planar_stats["planar_boundary_vertices_before"]
        )
        result["planar_boundary_vertices_after"] = int(
            planar_stats["planar_boundary_vertices_after"]
        )
        result["planar_reconstructed_faces"] = int(planar_stats["planar_reconstructed_faces"])
        result["reconstructed_regions_count"] = int(
            result["planar_regions_applied"] + result["prism_regions_reconstructed"]
        )
        result["skipped_low_confidence_regions_count"] = int(
            result["planar_region_fallback_count"] + result["prism_regions_skipped_low_confidence"]
        )
        result["final_face_count"] = int(output_f)

        log_line(
            "mesh output counts: "
            f"vertices={output_v} faces={output_f} "
            f"planar_regions={result['planar_regions_detected']} "
            f"planar_faces_before={result['planar_faces_before']} "
            f"planar_faces_after={result['planar_faces_after']} "
            f"planar_reconstructed_faces={result['planar_reconstructed_faces']} "
            f"planar_boundary_vertices_before={result['planar_boundary_vertices_before']} "
            f"planar_boundary_vertices_after={result['planar_boundary_vertices_after']} "
            f"prism_regions={result['prism_regions_detected']} "
            f"repeated_supports={result['repeated_supports_detected']} "
            f"reconstructed_regions={result['reconstructed_regions_count']} "
            f"skipped_low_confidence={result['skipped_low_confidence_regions_count']} "
            f"final_decimation_applied={result['final_decimation_applied']} "
            f"final_decimation_reason={result['final_decimation_reason']} "
            f"planar_fallback_used={result['planar_fallback_used']}"
        )
    except Exception as exc:
        result["status"] = "failed"
        result["error"] = str(exc)
        result["traceback"] = traceback.format_exc()
        # Keep upstream fallback behavior by pointing to the original mesh.
        result["output_mesh_path"] = str(input_mesh_path)
        log_line(f"optimization failed: {exc}")
    finally:
        result["duration_ms"] = int((time.perf_counter() - started) * 1000)
        write_json(result_json_path, result)
        print(json.dumps(result), flush=True)

    return 0 if result["status"] == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
