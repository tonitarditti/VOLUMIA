from __future__ import annotations

import json
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import trimesh
from PIL import Image, ImageDraw

from .models import ExportOptions, GenerationResult

MATERIALS_SCHEMA_VERSION = "volumia.materials.v1"


def _build_readme(object_name: str) -> str:
    return f"""VOLUMIA SketchUp Package\n\nObject: {object_name}\n\nImport Steps:\n1. Open SketchUp and create or open your project.\n2. Import HIGH/model_high.dae for full detail or LOW/model_low.dae for lightweight editing.\n3. Ensure texture paths remain in HIGH/textures or LOW/textures folders.\n4. Keep component names (OBJ_*) and material names (MAT_*) unchanged for best compatibility.\n"""


def _safe_texture_name(raw: str, fallback: str) -> str:
    name = Path(urlparse(raw).path).name if raw else ""
    return name or fallback


def _write_placeholder_dae(file_path: Path, object_name: str, quality: str) -> None:
    xml = f"""<?xml version=\"1.0\" encoding=\"utf-8\"?>
<COLLADA xmlns=\"http://www.collada.org/2005/11/COLLADASchema\" version=\"1.4.1\">
  <asset>
    <contributor><authoring_tool>VOLUMIA Stub Exporter</authoring_tool></contributor>
    <created>2026-01-01T00:00:00Z</created>
    <modified>2026-01-01T00:00:00Z</modified>
    <unit name=\"centimeter\" meter=\"0.01\"/>
    <up_axis>Y_UP</up_axis>
  </asset>
  <library_visual_scenes>
    <visual_scene id=\"Scene\" name=\"Scene\">
      <!-- Placeholder Object: {object_name} | Quality: {quality} -->
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url=\"#Scene\"/></scene>
</COLLADA>
"""
    file_path.write_text(xml, encoding="utf-8")


def _write_placeholder_glb(file_path: Path, quality: str) -> None:
    extents = (1.0, 1.0, 1.0) if quality == "high" else (0.9, 0.9, 0.9)
    mesh = trimesh.creation.box(extents=extents)
    file_path.write_bytes(mesh.export(file_type="glb"))


def _write_placeholder_preview(file_path: Path, object_name: str, quality: str) -> None:
    image = Image.new("RGB", (1024, 768), color=(236, 233, 227))
    draw = ImageDraw.Draw(image)
    draw.rectangle((70, 70, 954, 698), outline=(161, 134, 111), width=3)
    draw.text((104, 120), "VOLUMIA PREVIEW", fill=(46, 43, 39))
    draw.text((104, 180), f"Object: {object_name}", fill=(46, 43, 39))
    draw.text((104, 240), f"Quality: {quality.upper()}", fill=(111, 106, 98))
    draw.text((104, 300), "Placeholder preview", fill=(161, 134, 111))
    image.save(file_path)


def _write_placeholder_texture(file_path: Path, mode: str) -> None:
    size = 1024 if "HIGH" in str(file_path).upper() else 512
    if mode == "normal":
        image = Image.new("RGB", (size, size), color=(128, 128, 255))
    elif mode == "roughness":
        image = Image.new("L", (size, size), color=170)
    else:
        image = Image.new("RGB", (size, size), color=(167, 153, 137))
    image.save(file_path)


def _ensure_required_assets(generation_dir: Path, generation_result: GenerationResult) -> None:
    high_dir = generation_dir / "HIGH"
    low_dir = generation_dir / "LOW"
    high_textures = high_dir / "textures"
    low_textures = low_dir / "textures"

    for directory in (high_dir, low_dir, high_textures, low_textures):
        directory.mkdir(parents=True, exist_ok=True)

    required_models = [
        (high_dir / "model_high.glb", "high", "glb"),
        (high_dir / "model_high.dae", "high", "dae"),
        (low_dir / "model_low.glb", "low", "glb"),
        (low_dir / "model_low.dae", "low", "dae"),
    ]

    for file_path, quality, kind in required_models:
        if file_path.exists():
            continue
        if kind == "glb":
            _write_placeholder_glb(file_path, quality)
        else:
            _write_placeholder_dae(file_path, generation_result.objectName, quality)

    preview_high = generation_dir / "preview_high.png"
    preview_low = generation_dir / "preview_low.png"
    if not preview_high.exists():
        _write_placeholder_preview(preview_high, generation_result.objectName, "high")
    if not preview_low.exists():
        _write_placeholder_preview(preview_low, generation_result.objectName, "low")

    if generation_result.materials:
        for material in generation_result.materials:
            high_base = high_textures / _safe_texture_name(material.mapsHigh.baseColor, f"{material.name}_BaseColor.png")
            high_normal = high_textures / _safe_texture_name(material.mapsHigh.normal, f"{material.name}_Normal.png")
            high_rough = high_textures / _safe_texture_name(material.mapsHigh.roughness, f"{material.name}_Roughness.png")

            low_base = low_textures / _safe_texture_name(material.mapsLow.baseColor, f"{material.name}_BaseColor.png")
            low_normal = low_textures / _safe_texture_name(material.mapsLow.normal, f"{material.name}_Normal.png")
            low_rough = low_textures / _safe_texture_name(material.mapsLow.roughness, f"{material.name}_Roughness.png")

            if not high_base.exists():
                _write_placeholder_texture(high_base, "basecolor")
            if not high_normal.exists():
                _write_placeholder_texture(high_normal, "normal")
            if not high_rough.exists():
                _write_placeholder_texture(high_rough, "roughness")

            if not low_base.exists():
                _write_placeholder_texture(low_base, "basecolor")
            if not low_normal.exists():
                _write_placeholder_texture(low_normal, "normal")
            if not low_rough.exists():
                _write_placeholder_texture(low_rough, "roughness")
    else:
        for quality_dir in (high_textures, low_textures):
            fallback_base = quality_dir / "MAT_Placeholder_BaseColor.png"
            fallback_normal = quality_dir / "MAT_Placeholder_Normal.png"
            fallback_rough = quality_dir / "MAT_Placeholder_Roughness.png"
            if not fallback_base.exists():
                _write_placeholder_texture(fallback_base, "basecolor")
            if not fallback_normal.exists():
                _write_placeholder_texture(fallback_normal, "normal")
            if not fallback_rough.exists():
                _write_placeholder_texture(fallback_rough, "roughness")


def create_export_package(
    generation_dir: Path,
    generation_result: GenerationResult,
    options: ExportOptions,
) -> tuple[Path, str]:
    if not generation_result.generationId or not generation_result.objectName:
        raise ValueError("Invalid generation data for export.")

    exports_dir = generation_dir / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)

    object_name = generation_result.objectName
    package_name = f"{object_name}_SketchUp_Package.zip"
    zip_path = exports_dir / package_name

    _ensure_required_assets(generation_dir, generation_result)

    materials_json = {
        "schema": MATERIALS_SCHEMA_VERSION,
        "object": {
            "name": generation_result.objectName,
            "generationId": generation_result.generationId,
            "preset": generation_result.resolvedPreset,
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

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
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

        for source in required_sources:
            if source.exists():
                relative = source.relative_to(generation_dir)
                zf.write(source, str(relative).replace("\\", "/"))

        for texture in sorted((high_dir / "textures").glob("*.png")):
            zf.write(texture, f"HIGH/textures/{texture.name}")

        for texture in sorted((low_dir / "textures").glob("*.png")):
            zf.write(texture, f"LOW/textures/{texture.name}")

        zf.writestr("materials.json", json.dumps(materials_json, indent=2))
        zf.writestr("README.txt", _build_readme(object_name))

    return zip_path, package_name
