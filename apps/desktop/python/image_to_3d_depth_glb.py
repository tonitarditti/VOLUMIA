#!/usr/bin/env python3
import argparse
import os
import sys
import traceback

from _bootstrap import ensure_cache_dirs, ensure_packages, get_cache_root
from _models import get_depth_model

print("VOLUMIA PYTHON PATH:", sys.executable)


def log(message: str) -> None:
    print(message, flush=True)


def log_error(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def emit_progress(stage: str, percent: int, message: str) -> None:
    print(
        f'{{"stage":"{stage}","percent":{max(0, min(100, int(percent)))},"message":"{message}"}}',
        flush=True,
    )


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

    h, w = depth.shape
    ys = np.arange(0, h, step)
    xs = np.arange(0, w, step)
    uu, vv = np.meshgrid(xs, ys)

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

    try:
        emit_progress("infer", 25, "Cargando modelo de profundidad")
        depth_model = get_depth_model(cache_root)

        image = Image.open(in_path).convert("RGB")
        rgb = np.asarray(image, dtype=np.uint8)

        emit_progress("infer", 60, "Ejecutando inferencia de profundidad")
        depth_result = depth_model(image)
        depth_raw = depth_to_numpy(depth_result)

        depth, dmin, dmax, p2, p98 = robust_normalize(depth_raw)
        log(f"depth stats: min={dmin:.6f} max={dmax:.6f} p2={p2:.6f} p98={p98:.6f}")

        emit_progress("mesh", 80, "Reconstruyendo malla")
        points, colors, focal, cx, cy = create_point_cloud(depth, rgb, args.quality)
        mesh = reconstruct_mesh(points, colors, args.quality)
        colorize_mesh_vertices(mesh, rgb, focal, cx, cy)

        emit_progress("export", 92, "Exportando GLB")
        vertex_count, face_count, glb_size = export_glb(mesh, out_path)
        log(f"mesh: vertices={vertex_count} faces={face_count}")
        log(f"glb size bytes: {glb_size}")
        log(f"OUT_SIZE_BYTES={glb_size}")

        if not os.path.exists(out_path):
            log_error(f"GLB not created: {out_path}")
            return 1

        if glb_size < 2000:
            log_error(f"GLB too small ({glb_size} bytes): {out_path}")
            return 1

        emit_progress("done", 100, "Modelo 3D listo")
        return 0
    except Exception as error:
        log_error(f"image_to_3d failed: {error}")
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
