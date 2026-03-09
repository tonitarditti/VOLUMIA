import argparse
import json
import os
import time
import traceback
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


def log_line(message: str) -> None:
    print(f"[hunyuan_mesh_optimize] {message}", flush=True)


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"{json.dumps(payload, indent=2, ensure_ascii=False)}\n",
        encoding="utf-8",
    )


def mesh_stats(mesh_set: Any) -> Tuple[int, int]:
    mesh = mesh_set.current_mesh()
    return int(mesh.vertex_number()), int(mesh.face_number())


def apply_filter_with_supported_params(
    mesh_set: Any,
    filter_name: str,
    desired_params: Dict[str, Any],
) -> Dict[str, Any]:
    defaults = mesh_set.filter_parameter_values(filter_name)
    kwargs = {
        key: value for key, value in desired_params.items() if key in defaults
    }
    mesh_set.apply_filter(filter_name, **kwargs)
    return kwargs


def resolve_quadriflow_filter_name(meshlab_module: Any) -> Optional[str]:
    available = set(meshlab_module.filter_list())
    preferred = [
        "meshing_quadri_flow",
        "meshing_quadriflow",
        "meshing_quadriflow_remeshing",
        "meshing_quadri_flow_remeshing",
        "meshing_retopology_quadriflow",
    ]
    for candidate in preferred:
        if candidate in available:
            return candidate
    for candidate in available:
        lowered = candidate.lower()
        if "quadriflow" in lowered or "quadri_flow" in lowered:
            return candidate
    return None


def run_optimization(
    input_mesh_path: Path,
    output_mesh_path: Path,
    decimate_target: int,
    quad_target: int,
    smooth_iterations: int,
) -> Dict[str, Any]:
    import pymeshlab  # noqa: WPS433

    mesh_set = pymeshlab.MeshSet()
    mesh_set.load_new_mesh(str(input_mesh_path))

    input_vertex_count, input_face_count = mesh_stats(mesh_set)
    log_line(
        "mesh loaded: "
        f"vertices={input_vertex_count} faces={input_face_count}"
    )

    applied_filters: list[Dict[str, Any]] = []

    # 1) Quadric edge collapse decimation.
    decimation_params = apply_filter_with_supported_params(
        mesh_set,
        "meshing_decimation_quadric_edge_collapse",
        {
            "targetfacenum": int(decimate_target),
            "preservenormal": True,
            "preservetopology": True,
            "planarquadric": True,
        },
    )
    applied_filters.append(
        {
            "name": "meshing_decimation_quadric_edge_collapse",
            "params": decimation_params,
        }
    )

    # 2) Quad remeshing (QuadriFlow if available, fallback otherwise).
    quadriflow_filter = resolve_quadriflow_filter_name(pymeshlab)
    quadriflow_used = False
    if quadriflow_filter:
        quadriflow_params = apply_filter_with_supported_params(
            mesh_set,
            quadriflow_filter,
            {
                "targetfacenum": int(quad_target),
                "preserve_boundary": True,
                "preserveboundary": True,
                "adaptive_scale": True,
                "adaptivescale": True,
            },
        )
        applied_filters.append(
            {
                "name": quadriflow_filter,
                "params": quadriflow_params,
            }
        )
        quadriflow_used = True
    else:
        # Fallback path when QuadriFlow plugin is missing in current PyMeshLab build.
        mesh_set.apply_filter("meshing_tri_to_quad_dominant")
        applied_filters.append(
            {
                "name": "meshing_tri_to_quad_dominant",
                "params": {},
            }
        )
        fallback_decimation_params = apply_filter_with_supported_params(
            mesh_set,
            "meshing_decimation_quadric_edge_collapse",
            {
                "targetfacenum": int(quad_target),
                "preservenormal": True,
                "preservetopology": True,
                "planarquadric": True,
            },
        )
        applied_filters.append(
            {
                "name": "meshing_decimation_quadric_edge_collapse",
                "params": fallback_decimation_params,
            }
        )

    # 3) Mild Laplacian smoothing.
    smoothing_params = apply_filter_with_supported_params(
        mesh_set,
        "apply_coord_laplacian_smoothing",
        {
            "stepsmoothnum": int(smooth_iterations),
        },
    )
    applied_filters.append(
        {
            "name": "apply_coord_laplacian_smoothing",
            "params": smoothing_params,
        }
    )

    # 4) Mesh cleanup.
    mesh_set.apply_filter("meshing_remove_duplicate_vertices")
    applied_filters.append({"name": "meshing_remove_duplicate_vertices", "params": {}})
    mesh_set.apply_filter("meshing_remove_duplicate_faces")
    applied_filters.append({"name": "meshing_remove_duplicate_faces", "params": {}})
    mesh_set.apply_filter("meshing_remove_null_faces")
    applied_filters.append({"name": "meshing_remove_null_faces", "params": {}})
    mesh_set.apply_filter("meshing_remove_unreferenced_vertices")
    applied_filters.append(
        {"name": "meshing_remove_unreferenced_vertices", "params": {}}
    )

    # 5) Recompute normals.
    mesh_set.apply_filter("compute_normal_per_face")
    applied_filters.append({"name": "compute_normal_per_face", "params": {}})
    mesh_set.apply_filter("compute_normal_per_vertex")
    applied_filters.append({"name": "compute_normal_per_vertex", "params": {}})

    output_mesh_path.parent.mkdir(parents=True, exist_ok=True)
    mesh_set.save_current_mesh(str(output_mesh_path))

    output_vertex_count, output_face_count = mesh_stats(mesh_set)
    log_line(
        "mesh optimized: "
        f"vertices={output_vertex_count} faces={output_face_count}"
    )

    return {
        "quadriflow_filter": quadriflow_filter,
        "quadriflow_used": quadriflow_used,
        "applied_filters": applied_filters,
        "input_vertex_count": input_vertex_count,
        "input_face_count": input_face_count,
        "output_vertex_count": output_vertex_count,
        "output_face_count": output_face_count,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Optimize generated mesh topology before texgen.",
    )
    parser.add_argument("--mesh", required=True, help="Input mesh path (.glb/.obj)")
    parser.add_argument("--output", required=True, help="Optimized mesh output path")
    parser.add_argument(
        "--result-json",
        required=True,
        help="Optimization metadata JSON output path",
    )
    parser.add_argument(
        "--decimate-target",
        type=int,
        default=20000,
        help="Target face count for quadric decimation stage",
    )
    parser.add_argument(
        "--quad-target",
        type=int,
        default=8000,
        help="Target face count for quad remeshing stage",
    )
    parser.add_argument(
        "--smooth-iterations",
        type=int,
        default=3,
        help="Laplacian smoothing iterations",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    mesh_path = Path(args.mesh).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    result_json_path = Path(args.result_json).expanduser().resolve()

    result: Dict[str, Any] = {
        "status": "failed",
        "input_mesh_path": str(mesh_path),
        "output_mesh_path": str(output_path),
        "decimate_target": int(args.decimate_target),
        "quad_target": int(args.quad_target),
        "smooth_iterations": int(args.smooth_iterations),
        "error": None,
        "traceback": None,
        "duration_ms": None,
    }

    started_at = time.perf_counter()
    exit_code = 1
    try:
        if not mesh_path.is_file():
            raise RuntimeError(f"Input mesh not found: {mesh_path}")

        details = run_optimization(
            input_mesh_path=mesh_path,
            output_mesh_path=output_path,
            decimate_target=int(args.decimate_target),
            quad_target=int(args.quad_target),
            smooth_iterations=int(args.smooth_iterations),
        )

        if not output_path.is_file() or output_path.stat().st_size <= 0:
            raise RuntimeError("Optimization finished without writing valid output mesh.")

        result.update(details)
        result["status"] = "completed"
        exit_code = 0
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)
        result["traceback"] = traceback.format_exc()
    finally:
        result["duration_ms"] = int((time.perf_counter() - started_at) * 1000)
        write_json(result_json_path, result)
        print(json.dumps(result, ensure_ascii=False))

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
