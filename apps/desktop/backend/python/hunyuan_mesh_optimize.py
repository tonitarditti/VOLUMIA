import argparse
import json
import time
import traceback
from pathlib import Path
from typing import Any, Dict, Tuple


DEFAULT_TARGET_PERC = 0.25
DEFAULT_MIN_FACE_THRESHOLD = 10000


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


def append_filter(
    applied_filters: list[Dict[str, Any]],
    name: str,
    params: Dict[str, Any],
) -> None:
    applied_filters.append({"name": name, "params": params})


def apply_post_decimation_cleanup(
    mesh_set: Any,
    applied_filters: list[Dict[str, Any]],
) -> None:
    mesh_set.apply_filter("meshing_remove_duplicate_vertices")
    append_filter(applied_filters, "meshing_remove_duplicate_vertices", {})
    mesh_set.apply_filter("meshing_remove_duplicate_faces")
    append_filter(applied_filters, "meshing_remove_duplicate_faces", {})
    mesh_set.apply_filter("meshing_remove_null_faces")
    append_filter(applied_filters, "meshing_remove_null_faces", {})
    mesh_set.apply_filter("compute_normal_per_face")
    append_filter(applied_filters, "compute_normal_per_face", {})
    mesh_set.apply_filter("compute_normal_per_vertex")
    append_filter(applied_filters, "compute_normal_per_vertex", {})


def apply_decimation_pass(
    mesh_set: Any,
    applied_filters: list[Dict[str, Any]],
    *,
    targetperc: float | None = None,
    targetfacenum: int | None = None,
) -> Dict[str, Any]:
    desired_params: Dict[str, Any] = {
        "preservenormal": True,
        "preservetopology": True,
        "preserveboundary": True,
        "planarquadric": True,
        "qualitythr": 0.3,
        "autoclean": True,
    }
    if targetperc is not None:
        desired_params["targetperc"] = float(targetperc)
    if targetfacenum is not None and int(targetfacenum) > 0:
        desired_params["targetfacenum"] = int(targetfacenum)

    used_params = apply_filter_with_supported_params(
        mesh_set,
        "meshing_decimation_quadric_edge_collapse",
        desired_params,
    )
    append_filter(
        applied_filters,
        "meshing_decimation_quadric_edge_collapse",
        used_params,
    )
    return used_params


def run_optimization(
    input_mesh_path: Path,
    output_mesh_path: Path,
    target_perc: float,
    min_face_threshold: int,
) -> Dict[str, Any]:
    import pymeshlab  # noqa: WPS433

    mesh_set = pymeshlab.MeshSet()
    mesh_set.load_new_mesh(str(input_mesh_path))

    original_vertex_count, original_face_count = mesh_stats(mesh_set)
    log_line(
        "mesh loaded: "
        f"vertices={original_vertex_count} faces={original_face_count}"
    )

    applied_filters: list[Dict[str, Any]] = []
    decimation_attempts: list[Dict[str, Any]] = []

    decimation_strategy = "skipped_low_source_face_count"
    target_perc_used: float | None = None

    if original_face_count > min_face_threshold:
        # Pass 1: requested conservative decimation strategy.
        pass1_params = apply_decimation_pass(
            mesh_set,
            applied_filters,
            targetperc=target_perc,
        )
        _, pass1_face_count = mesh_stats(mesh_set)
        decimation_attempts.append(
            {
                "name": "targetperc_primary",
                "params": pass1_params,
                "face_count": pass1_face_count,
            }
        )
        decimation_strategy = "targetperc_primary"
        target_perc_used = float(pass1_params.get("targetperc", target_perc))

        if pass1_face_count < min_face_threshold:
            # Pass 2: less aggressive percent fallback.
            log_line(
                "decimation below threshold, retrying with less aggressive targetperc: "
                f"faces={pass1_face_count} threshold={min_face_threshold}"
            )
            less_aggressive_target_perc = max(
                float(target_perc),
                min(
                    0.95,
                    (float(min_face_threshold) / float(original_face_count)) + 0.05,
                ),
            )
            mesh_set = pymeshlab.MeshSet()
            mesh_set.load_new_mesh(str(input_mesh_path))
            applied_filters = []
            pass2_params = apply_decimation_pass(
                mesh_set,
                applied_filters,
                targetperc=less_aggressive_target_perc,
            )
            _, pass2_face_count = mesh_stats(mesh_set)
            decimation_attempts.append(
                {
                    "name": "targetperc_fallback",
                    "params": pass2_params,
                    "face_count": pass2_face_count,
                }
            )
            decimation_strategy = "targetperc_fallback"
            target_perc_used = float(
                pass2_params.get("targetperc", less_aggressive_target_perc)
            )

            if pass2_face_count < min_face_threshold:
                # Pass 3: enforce an explicit floor target by face count.
                log_line(
                    "fallback targetperc still below threshold, retrying with targetfacenum floor: "
                    f"faces={pass2_face_count} threshold={min_face_threshold}"
                )
                mesh_set = pymeshlab.MeshSet()
                mesh_set.load_new_mesh(str(input_mesh_path))
                applied_filters = []
                pass3_params = apply_decimation_pass(
                    mesh_set,
                    applied_filters,
                    targetfacenum=min_face_threshold,
                )
                _, pass3_face_count = mesh_stats(mesh_set)
                decimation_attempts.append(
                    {
                        "name": "targetfacenum_floor",
                        "params": pass3_params,
                        "face_count": pass3_face_count,
                    }
                )
                decimation_strategy = "targetfacenum_floor"
                target_perc_used = None

                if pass3_face_count < min_face_threshold:
                    # Final fallback: keep original mesh to preserve shape.
                    log_line(
                        "face floor still not met, reverting to original mesh for safety: "
                        f"faces={pass3_face_count} threshold={min_face_threshold}"
                    )
                    mesh_set = pymeshlab.MeshSet()
                    mesh_set.load_new_mesh(str(input_mesh_path))
                    applied_filters = []
                    decimation_strategy = "reverted_original_mesh"

    # Required post-decimation cleanup only.
    apply_post_decimation_cleanup(mesh_set, applied_filters)

    optimized_vertex_count, optimized_face_count = mesh_stats(mesh_set)
    output_mesh_path.parent.mkdir(parents=True, exist_ok=True)
    mesh_set.save_current_mesh(str(output_mesh_path))

    reduction_ratio = (
        0.0
        if original_face_count <= 0
        else (1.0 - (optimized_face_count / float(original_face_count)))
    )
    log_line(
        "mesh optimized: "
        f"vertices={optimized_vertex_count} faces={optimized_face_count}"
    )
    log_line(
        "mesh optimization summary: "
        f"original_vertices={original_vertex_count} original_faces={original_face_count} "
        f"optimized_vertices={optimized_vertex_count} optimized_faces={optimized_face_count} "
        f"face_reduction={reduction_ratio:.4f} strategy={decimation_strategy} "
        f"path={output_mesh_path}"
    )

    return {
        "decimation_strategy": decimation_strategy,
        "target_perc_requested": float(target_perc),
        "target_perc_used": target_perc_used,
        "min_face_threshold": int(min_face_threshold),
        "decimation_attempts": decimation_attempts,
        "applied_filters": applied_filters,
        "original_vertex_count": original_vertex_count,
        "original_face_count": original_face_count,
        "optimized_vertex_count": optimized_vertex_count,
        "optimized_face_count": optimized_face_count,
        "face_reduction_ratio": reduction_ratio,
        # Backward-compatible aliases used by existing backend parsing.
        "input_vertex_count": original_vertex_count,
        "input_face_count": original_face_count,
        "output_vertex_count": optimized_vertex_count,
        "output_face_count": optimized_face_count,
        "quad_remesh_applied": False,
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
        "--target-perc",
        type=float,
        default=DEFAULT_TARGET_PERC,
        help="Quadric decimation target percentage (0-1 range).",
    )
    parser.add_argument(
        "--min-face-threshold",
        type=int,
        default=DEFAULT_MIN_FACE_THRESHOLD,
        help="Minimum face count floor after decimation fallback.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    mesh_path = Path(args.mesh).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    result_json_path = Path(args.result_json).expanduser().resolve()
    target_perc = max(0.01, min(0.99, float(args.target_perc)))
    min_face_threshold = max(8000, int(args.min_face_threshold))

    result: Dict[str, Any] = {
        "status": "failed",
        "input_mesh_path": str(mesh_path),
        "output_mesh_path": str(output_path),
        "target_perc": target_perc,
        "min_face_threshold": min_face_threshold,
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
            target_perc=target_perc,
            min_face_threshold=min_face_threshold,
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
