from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image


@dataclass(frozen=True)
class ViewProjectionInput:
    image: np.ndarray
    mask: np.ndarray | None


def border_median_color(image_rgb: np.ndarray) -> np.ndarray:
    if image_rgb.size == 0:
        return np.array([128, 124, 118], dtype=np.uint8)
    h, w = image_rgb.shape[:2]
    border = np.concatenate(
        [
            image_rgb[0, :, :],
            image_rgb[h - 1, :, :],
            image_rgb[:, 0, :],
            image_rgb[:, w - 1, :],
        ],
        axis=0,
    )
    return np.median(border, axis=0).astype(np.uint8)


def masked_view_texture(
    image_rgb: np.ndarray,
    mask: np.ndarray | None,
    size: int,
    neutral_color: np.ndarray,
) -> np.ndarray:
    if image_rgb.size == 0:
        return np.full((size, size, 3), neutral_color.astype(np.uint8), dtype=np.uint8)

    if mask is None or mask.shape[:2] != image_rgb.shape[:2]:
        mask_bool = np.ones(image_rgb.shape[:2], dtype=bool)
    else:
        mask_bool = mask > 0

    base = np.full_like(image_rgb, neutral_color.astype(np.uint8), dtype=np.uint8)
    base[mask_bool] = image_rgb[mask_bool]
    resized = np.asarray(
        Image.fromarray(base, mode="RGB").resize((size, size), Image.Resampling.LANCZOS),
        dtype=np.uint8,
    )
    return resized


def build_view_textures(
    front: ViewProjectionInput,
    side: ViewProjectionInput | None,
    back: ViewProjectionInput | None,
    size: int,
    neutral_color: np.ndarray,
) -> dict[str, np.ndarray]:
    textures: dict[str, np.ndarray] = {}
    textures["front"] = masked_view_texture(front.image, front.mask, size=size, neutral_color=neutral_color)
    if side is not None:
        textures["side"] = masked_view_texture(side.image, side.mask, size=size, neutral_color=neutral_color)
    else:
        textures["side"] = np.full((size, size, 3), neutral_color.astype(np.uint8), dtype=np.uint8)
    if back is not None:
        textures["back"] = masked_view_texture(back.image, back.mask, size=size, neutral_color=neutral_color)
    else:
        textures["back"] = textures["front"].copy()
    textures["neutral"] = np.full((size, size, 3), neutral_color.astype(np.uint8), dtype=np.uint8)
    return textures


def _planar_uv(vertices: np.ndarray, view: str) -> np.ndarray:
    if vertices.size == 0:
        return np.zeros((0, 2), dtype=np.float32)
    vmin = vertices.min(axis=0)
    vmax = vertices.max(axis=0)
    extents = np.maximum(vmax - vmin, 1e-6)

    if view in {"front", "back"}:
        u = (vertices[:, 0] - vmin[0]) / extents[0]
        v = (vertices[:, 1] - vmin[1]) / extents[1]
    elif view == "side":
        u = (vertices[:, 2] - vmin[2]) / extents[2]
        v = (vertices[:, 1] - vmin[1]) / extents[1]
    else:
        u = (vertices[:, 0] - vmin[0]) / extents[0]
        v = (vertices[:, 2] - vmin[2]) / extents[2]

    uv = np.stack((u, 1.0 - v), axis=1).astype(np.float32)
    return np.clip(uv, 0.0, 1.0)


def _face_groups(face_normals: np.ndarray) -> dict[str, np.ndarray]:
    front = face_normals[:, 2] >= 0.35
    side = face_normals[:, 0] >= 0.35
    back = face_normals[:, 2] <= -0.35
    used = front | side | back
    hidden = ~used
    return {
        "front": np.where(front)[0],
        "side": np.where(side)[0],
        "back": np.where(back)[0],
        "neutral": np.where(hidden)[0],
    }


def build_projected_textured_scene(
    component_meshes: dict[str, trimesh.Trimesh],
    component_material: dict[str, str],
    view_textures: dict[str, np.ndarray],
    texture_dir: Path,
    quality_tag: str,
) -> tuple[trimesh.Scene, dict[str, str]]:
    scene = trimesh.Scene()
    saved_files: dict[str, str] = {}

    for component_name, mesh in component_meshes.items():
        if len(mesh.faces) == 0:
            continue
        groups = _face_groups(mesh.face_normals)
        for view_name in ("front", "side", "back", "neutral"):
            face_ids = groups[view_name]
            if len(face_ids) == 0:
                continue

            submesh = mesh.submesh([face_ids], append=True, repair=False)
            uv = _planar_uv(np.asarray(submesh.vertices, dtype=np.float64), view=view_name)

            texture_name = f"{component_name}_{view_name.capitalize()}.png"
            texture_path = texture_dir / texture_name
            if texture_name not in saved_files:
                Image.fromarray(view_textures[view_name], mode="RGB").save(texture_path)
                saved_files[texture_name] = texture_name

            texture_image = Image.fromarray(view_textures[view_name], mode="RGB")
            material_prefix = component_material.get(component_name, "MAT_Main_Surface")
            material_name = f"{material_prefix}_{component_name}_{view_name}_{quality_tag}"
            material = trimesh.visual.material.SimpleMaterial(
                image=texture_image,
                name=material_name,
            )
            submesh.visual = trimesh.visual.TextureVisuals(uv=uv, image=texture_image, material=material)
            scene.add_geometry(
                submesh,
                geom_name=f"{component_name}_{view_name}",
                node_name=f"{component_name}_{view_name}",
            )

    return scene, saved_files
