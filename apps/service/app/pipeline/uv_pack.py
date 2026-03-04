from __future__ import annotations

import numpy as np
import trimesh


def _planar_uv(mesh: trimesh.Trimesh) -> np.ndarray:
    vertices = np.asarray(mesh.vertices, dtype=np.float32)
    if vertices.size == 0:
        return np.zeros((0, 2), dtype=np.float32)

    bounds_min = vertices.min(axis=0)
    bounds_max = vertices.max(axis=0)
    extents = np.maximum(bounds_max - bounds_min, 1e-6)

    # Y-up scene: use X/Z plane projection for stable texture layout in placeholders.
    u = (vertices[:, 0] - bounds_min[0]) / extents[0]
    v = (vertices[:, 2] - bounds_min[2]) / extents[2]
    return np.stack((u, v), axis=1)


def _has_uv(mesh: trimesh.Trimesh) -> bool:
    visual = getattr(mesh, "visual", None)
    uv = getattr(visual, "uv", None) if visual is not None else None
    return uv is not None and len(uv) == len(mesh.vertices)


def apply_uv_placeholder(scene: trimesh.Scene, component_meshes: dict[str, trimesh.Trimesh]) -> None:
    _ = scene  # Scene is provided for interface consistency with future UV packers.
    for mesh in component_meshes.values():
        if _has_uv(mesh):
            continue
        uv = _planar_uv(mesh)
        mesh.visual = trimesh.visual.TextureVisuals(uv=uv)
