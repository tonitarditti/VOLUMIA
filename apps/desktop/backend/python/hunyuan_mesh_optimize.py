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
) -> Tuple[np.ndarray, Dict[str, Any]]:
    keep_mask = np.ones(faces.shape[0], dtype=bool)
    replacement_faces: List[Tuple[int, int, int]] = []

    fallback_region_count = 0
    applied_region_count = 0
    planar_faces_before = int(sum(int(region.face_indices.size) for region in regions))

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
        new_triangles = triangulate_polygon_ear_clip(loop, projected)
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
    if replacement_faces:
        merged_faces = np.vstack([merged_faces, np.asarray(replacement_faces, dtype=np.int64)])

    reverted_due_to_floor = False
    if merged_faces.shape[0] < min_face_threshold and faces.shape[0] >= min_face_threshold:
        merged_faces = faces.copy()
        reverted_due_to_floor = True

    stats = {
        "planar_regions_detected": len(regions),
        "planar_regions_applied": applied_region_count,
        "planar_region_fallback_count": fallback_region_count,
        "planar_faces_before": planar_faces_before,
        "planar_fallback_used": bool(fallback_region_count > 0 or reverted_due_to_floor),
        "planar_reverted_due_to_floor": reverted_due_to_floor,
    }
    return merged_faces, stats


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

        simplified_faces = decimated_faces
        planar_stats: Dict[str, Any] = {
            "planar_regions_detected": len(regions),
            "planar_regions_applied": 0,
            "planar_region_fallback_count": 0,
            "planar_faces_before": planar_faces_before,
            "planar_fallback_used": False,
            "planar_reverted_due_to_floor": False,
        }
        if regions:
            simplified_faces, planar_stats = simplify_planar_regions(
                decimated_vertices,
                decimated_faces,
                regions,
                plane_distance_tolerance=plane_distance_tolerance,
                min_face_threshold=int(args.min_face_threshold),
            )

        mesh_set = meshset_from_arrays(decimated_vertices, simplified_faces)
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

        log_line(
            "mesh output counts: "
            f"vertices={output_v} faces={output_f} "
            f"planar_regions={result['planar_regions_detected']} "
            f"planar_faces_before={result['planar_faces_before']} "
            f"planar_faces_after={result['planar_faces_after']} "
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
