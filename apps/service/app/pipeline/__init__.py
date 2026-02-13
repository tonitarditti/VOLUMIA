from .geometry_approx import (
    GeometryBuildResult,
    conservative_component_meshes,
    estimate_object_dimensions,
    fallback_component_meshes,
    recipe_to_component_meshes,
)
from .pbr_extract import (
    MaterialTextureSet,
    build_neutral_material_texture_set,
    extract_material_texture_set,
    infer_material_category,
)
from .projection import (
    ViewProjectionInput,
    border_median_color,
    build_projected_textured_scene,
    build_view_textures,
)
from .preprocess import (
    LoadedCapture,
    choose_capture_by_slot,
    choose_material_captures,
    debug_enabled,
    debug_output_dir,
    load_capture_images,
    save_debug_image,
)
from .segmentation_rules import build_component_recipes
from .silhouette import MaskObservation, detect_object_masks, extract_mask_observation
from .uv_pack import apply_uv_placeholder

__all__ = [
    "GeometryBuildResult",
    "LoadedCapture",
    "MaskObservation",
    "MaterialTextureSet",
    "apply_uv_placeholder",
    "build_component_recipes",
    "build_projected_textured_scene",
    "build_view_textures",
    "border_median_color",
    "build_neutral_material_texture_set",
    "choose_capture_by_slot",
    "choose_material_captures",
    "conservative_component_meshes",
    "debug_enabled",
    "debug_output_dir",
    "estimate_object_dimensions",
    "detect_object_masks",
    "extract_mask_observation",
    "extract_material_texture_set",
    "fallback_component_meshes",
    "infer_material_category",
    "load_capture_images",
    "recipe_to_component_meshes",
    "save_debug_image",
    "ViewProjectionInput",
]
