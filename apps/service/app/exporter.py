from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

from .models import ExportOptions, GenerationResult

MATERIALS_SCHEMA_VERSION = "volumia.materials.v1"
MATERIAL_MAP_SUFFIXES = ("BaseColor", "Normal", "Roughness", "AO", "Metalness")


def _build_readme(object_name: str) -> str:
    return f"""VOLUMIA SketchUp Package\n\nObject: {object_name}\n\nImport Steps:\n1. Open SketchUp and create or open your project.\n2. Import HIGH/model_high.dae for full detail or LOW/model_low.dae for lightweight editing.\n3. Ensure texture paths remain in HIGH/textures or LOW/textures folders.\n4. Keep component names (OBJ_*) and material names (MAT_*) unchanged for best compatibility.\n"""


def _material_prefixes(texture_files: list[Path]) -> set[str]:
    prefixes: set[str] = set()
    pattern = re.compile(r"^(MAT_[A-Za-z0-9_]+)_(BaseColor|Normal|Roughness|AO|Metalness)$")

    for texture_file in texture_files:
        match = pattern.match(texture_file.stem)
        if match:
            prefixes.add(match.group(1))

    return prefixes


def _validate_export_assets(generation_dir: Path, generation_result: GenerationResult) -> tuple[list[Path], list[Path]]:
    high_dir = generation_dir / "HIGH"
    low_dir = generation_dir / "LOW"
    high_textures_dir = high_dir / "textures"
    low_textures_dir = low_dir / "textures"

    required_files = [
        high_dir / "model_high.glb",
        high_dir / "model_high.dae",
        low_dir / "model_low.glb",
        low_dir / "model_low.dae",
        generation_dir / "preview_high.png",
        generation_dir / "preview_low.png",
    ]

    missing = [str(path.relative_to(generation_dir)).replace("\\", "/") for path in required_files if not path.exists()]
    if missing:
        raise ValueError(f"Missing required export assets: {', '.join(missing)}")

    high_textures = sorted(high_textures_dir.glob("*.png"))
    low_textures = sorted(low_textures_dir.glob("*.png"))
    if not high_textures or not low_textures:
        raise ValueError("Missing texture files in HIGH/textures or LOW/textures.")

    high_materials = _material_prefixes(high_textures)
    low_materials = _material_prefixes(low_textures)
    if not high_materials or not low_materials:
        raise ValueError(
            "Texture naming must follow MAT_*_BaseColor/Normal/Roughness in both HIGH/textures and LOW/textures."
        )

    if high_materials != low_materials:
        only_high = sorted(high_materials - low_materials)
        only_low = sorted(low_materials - high_materials)
        details = []
        if only_high:
            details.append(f"Only in HIGH: {', '.join(only_high)}")
        if only_low:
            details.append(f"Only in LOW: {', '.join(only_low)}")
        raise ValueError("Material mismatch between HIGH and LOW: " + " | ".join(details))

    component_names = [component.name for component in generation_result.components]
    if not component_names:
        raise ValueError("Missing component metadata for export (OBJ_*).")

    if len(set(component_names)) != len(component_names):
        raise ValueError("Duplicate component names detected in generation metadata.")

    invalid_components = [name for name in component_names if not name.startswith("OBJ_")]
    if invalid_components:
        raise ValueError("Component names must use OBJ_* prefix: " + ", ".join(sorted(invalid_components)))

    expected_materials = {material.name for material in generation_result.materials if material.name.startswith("MAT_")}
    if expected_materials and expected_materials != high_materials:
        missing_from_files = sorted(expected_materials - high_materials)
        unexpected_in_files = sorted(high_materials - expected_materials)
        details = []
        if missing_from_files:
            details.append(f"Missing MAT in textures: {', '.join(missing_from_files)}")
        if unexpected_in_files:
            details.append(f"Unexpected MAT in textures: {', '.join(unexpected_in_files)}")
        raise ValueError("Material metadata/texture mismatch: " + " | ".join(details))

    # High/Low component consistency comes from single generation metadata list.
    high_components = set(component_names)
    low_components = set(component_names)
    if high_components != low_components:
        raise ValueError("Component mismatch between HIGH and LOW OBJ_* sets.")

    return high_textures, low_textures


def _load_generation_context(generation_dir: Path) -> dict:
    context_file = generation_dir / "generation_context.json"
    if not context_file.exists():
        return {}
    try:
        return json.loads(context_file.read_text(encoding="utf-8"))
    except Exception:
        return {}


def create_export_package(
    generation_dir: Path,
    generation_result: GenerationResult,
    options: ExportOptions,
) -> tuple[Path, str]:
    if not generation_result.generationId or not generation_result.objectName:
        raise ValueError("Invalid generation data for export.")

    high_textures, low_textures = _validate_export_assets(generation_dir, generation_result)

    exports_dir = generation_dir / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)

    object_name = generation_result.objectName
    package_name = f"{object_name}_SketchUp_Package.zip"
    zip_path = exports_dir / package_name

    generation_context = _load_generation_context(generation_dir)
    object_context = generation_context.get("object", {}) if isinstance(generation_context, dict) else {}
    pipeline_context = generation_context.get("pipeline", {}) if isinstance(generation_context, dict) else {}

    materials_json = {
        "schema": MATERIALS_SCHEMA_VERSION,
        "pipeline": pipeline_context,
        "object": {
            "name": generation_result.objectName,
            "generationId": generation_result.generationId,
            "preset": generation_result.resolvedPreset,
            "mode": object_context.get("mode", "auto"),
            "units": object_context.get("units", options.units),
            "scale": object_context.get("scale", {"dimension": "height", "valueCm": None}),
            "dimensionsMeters": object_context.get("dimensionsMeters"),
            "qualityTargets": {
                "highFaces": generation_result.stats["high"].faces,
                "lowFaces": generation_result.stats["low"].faces,
            },
        },
        "options": options.model_dump(),
        "components": [
            {
                "name": component.name,
                "order": component.order,
                "materialSlots": component.materialSlots,
            }
            for component in generation_result.components
        ],
        "materials": [
            {
                "name": material.name,
                "defaults": {
                    "roughness": material.roughnessDefault,
                    "normalStrength": material.normalStrengthDefault,
                },
                "maps": {
                    "high": material.mapsHigh.model_dump(),
                    "low": material.mapsLow.model_dump(),
                },
            }
            for material in generation_result.materials
        ],
    }

    high_dir = generation_dir / "HIGH"
    low_dir = generation_dir / "LOW"

    required_sources = [
        high_dir / "model_high.dae",
        high_dir / "model_high.glb",
        low_dir / "model_low.dae",
        low_dir / "model_low.glb",
        generation_dir / "preview_high.png",
        generation_dir / "preview_low.png",
    ]

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for source in required_sources:
            relative = source.relative_to(generation_dir)
            zf.write(source, str(relative).replace("\\", "/"))

        for texture in high_textures:
            zf.write(texture, f"HIGH/textures/{texture.name}")

        for texture in low_textures:
            zf.write(texture, f"LOW/textures/{texture.name}")

        zf.writestr("materials.json", json.dumps(materials_json, indent=2))
        zf.writestr("README.txt", _build_readme(object_name))

    return zip_path, package_name
