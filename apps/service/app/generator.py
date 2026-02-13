from __future__ import annotations

import json
import uuid
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageDraw

from .models import (
    GenerationArtifacts,
    GenerationComponent,
    GenerationMaterial,
    GenerationRequest,
    GenerationResult,
    MaterialMapSet,
    StatsSummary,
)
from .presets import PRESET_MAP, PresetDefinition, resolve_auto_preset

MATERIALS_SCHEMA_VERSION = "volumia.materials.v1"


def _safe_name(value: str) -> str:
    keep = [c if c.isalnum() or c in ("-", "_") else "_" for c in value.strip()]
    normalized = "".join(keep).strip("_")
    return normalized or "Object"


def _box(extents: tuple[float, float, float], translate: tuple[float, float, float]) -> trimesh.Trimesh:
    mesh = trimesh.creation.box(extents=extents)
    mesh.apply_translation(translate)
    return mesh


def _cylinder(radius: float, height: float, sections: int, translate: tuple[float, float, float]) -> trimesh.Trimesh:
    mesh = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    mesh.apply_translation(translate)
    return mesh


def _cone(radius: float, height: float, sections: int, translate: tuple[float, float, float]) -> trimesh.Trimesh:
    mesh = trimesh.creation.cone(radius=radius, height=height, sections=sections)
    mesh.apply_translation(translate)
    return mesh


def _build_placeholder_mesh(preset_id: str, quality: str) -> trimesh.Trimesh:
    high = quality == "high"
    sections = 28 if high else 10
    meshes: list[trimesh.Trimesh] = []

    if preset_id == "chair-stool":
        meshes.append(_box((1.1, 0.14, 1.0), (0, 0.56, 0)))
        meshes.append(_box((1.1, 1.0, 0.12), (0, 1.12, -0.44)))
        for x in (-0.44, 0.44):
            for z in (-0.34, 0.34):
                meshes.append(_cylinder(0.06, 0.55, sections, (x, 0.28, z)))
        meshes.append(_box((1.0, 0.08, 0.08), (0, 0.38, -0.28)))
    elif preset_id == "sofa-textile":
        meshes.append(_box((2.2, 0.45, 0.95), (0, 0.38, 0)))
        meshes.append(_box((2.1, 0.55, 0.3), (0, 0.83, -0.33)))
        meshes.append(_box((2.05, 0.24, 0.86), (0, 0.73, 0.04)))
        meshes.append(_box((2.08, 0.22, 0.24), (0, 1.02, -0.22)))
        meshes.append(_box((0.12, 0.42, 0.9), (-1.0, 0.75, 0.0)))
        meshes.append(_box((0.12, 0.42, 0.9), (1.0, 0.75, 0.0)))
    elif preset_id == "lighting":
        meshes.append(_cylinder(0.12, 1.4, sections, (0, 0.85, 0)))
        meshes.append(_cone(0.55, 0.75, sections, (0, 1.6, 0)))
        meshes.append(_cylinder(0.07, 0.25, sections, (0, 0.2, 0)))
    elif preset_id == "table-desk":
        meshes.append(_box((2.0, 0.12, 1.0), (0, 0.82, 0)))
        for x in (-0.84, 0.84):
            for z in (-0.34, 0.34):
                meshes.append(_cylinder(0.07, 0.8, sections, (x, 0.4, z)))
        meshes.append(_box((1.6, 0.08, 0.1), (0, 0.5, -0.34)))
    else:
        meshes.append(_box((1.4, 1.2, 0.4), (0, 0.7, 0)))
        meshes.append(_box((1.3, 0.08, 0.42), (0, 0.04, 0)))

    return trimesh.util.concatenate(meshes)


def _material_base_color(name: str) -> tuple[int, int, int]:
    lower = name.lower()
    if "wood" in lower:
        return (168, 132, 96)
    if "fabric" in lower:
        return (176, 168, 153)
    if "metal" in lower:
        return (150, 152, 160)
    if "glass" in lower:
        return (190, 205, 214)
    if "stone" in lower:
        return (170, 168, 161)
    if "emissive" in lower:
        return (247, 224, 162)
    return (166, 156, 141)


def _noise_map(size: int, base: tuple[int, int, int]) -> Image.Image:
    rng = np.random.default_rng(seed=(base[0] * 3 + base[1] * 5 + base[2] * 7 + size))
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    for i, channel in enumerate(base):
        noise = rng.normal(0, 11, size=(size, size))
        arr[:, :, i] = np.clip(channel + noise, 0, 255)
    return Image.fromarray(arr, mode="RGB")


def _normal_map(size: int) -> Image.Image:
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    arr[:, :, 0] = 128
    arr[:, :, 1] = 128
    arr[:, :, 2] = 255
    return Image.fromarray(arr, mode="RGB")


def _roughness_map(size: int, roughness: float) -> Image.Image:
    value = int(max(0, min(255, roughness * 255)))
    arr = np.full((size, size), value, dtype=np.uint8)
    return Image.fromarray(arr, mode="L")


def _write_collada_placeholder(file_path: Path, object_name: str, quality: str, component_names: list[str]) -> None:
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
      <!-- Object: {object_name} | Quality: {quality} -->
      <!-- Components: {', '.join(component_names)} -->
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url=\"#Scene\"/></scene>
</COLLADA>
"""
    file_path.write_text(xml, encoding="utf-8")


def _write_preview(image_path: Path, object_name: str, quality: str) -> None:
    image = Image.new("RGB", (1024, 768), color=(236, 233, 227))
    draw = ImageDraw.Draw(image)
    draw.rectangle((70, 70, 954, 698), outline=(161, 134, 111), width=3)
    draw.text((104, 120), "VOLUMIA PREVIEW", fill=(46, 43, 39))
    draw.text((104, 180), f"Object: {object_name}", fill=(46, 43, 39))
    draw.text((104, 240), f"Quality: {quality.upper()}", fill=(111, 106, 98))
    draw.text((104, 300), "Precision in Form. Intelligence in Material.", fill=(161, 134, 111))
    image.save(image_path)


def _texture_size_from_quality(quality: str) -> int:
    return 1024 if quality == "high" else 512


def generate_stub_assets(request: GenerationRequest, generated_root: Path, base_url: str) -> GenerationResult:
    hints = [img.fileName for img in request.images]
    if request.objectType.startswith("studio:") and request.studioBasePreset:
        resolved_preset = request.studioBasePreset
    else:
        resolved_preset = resolve_auto_preset(request.objectType, request.reconstructionMode, hints)

    preset: PresetDefinition = PRESET_MAP.get(resolved_preset, PRESET_MAP["decor"])

    generation_id = uuid.uuid4().hex[:12]
    safe_name = _safe_name(request.objectName)
    generation_dir = generated_root / generation_id
    high_dir = generation_dir / "HIGH"
    low_dir = generation_dir / "LOW"
    high_tex_dir = high_dir / "textures"
    low_tex_dir = low_dir / "textures"

    for directory in (high_dir, low_dir, high_tex_dir, low_tex_dir):
        directory.mkdir(parents=True, exist_ok=True)

    high_mesh = _build_placeholder_mesh(preset.id, "high")
    low_mesh = _build_placeholder_mesh(preset.id, "low")

    high_glb = high_dir / "model_high.glb"
    low_glb = low_dir / "model_low.glb"
    high_glb.write_bytes(high_mesh.export(file_type="glb"))
    low_glb.write_bytes(low_mesh.export(file_type="glb"))

    component_names = [component.name for component in preset.components]
    high_dae = high_dir / "model_high.dae"
    low_dae = low_dir / "model_low.dae"
    _write_collada_placeholder(high_dae, safe_name, "high", component_names)
    _write_collada_placeholder(low_dae, safe_name, "low", component_names)

    preview_high = generation_dir / "preview_high.png"
    preview_low = generation_dir / "preview_low.png"
    _write_preview(preview_high, safe_name, "high")
    _write_preview(preview_low, safe_name, "low")

    generation_materials: list[GenerationMaterial] = []
    for material in preset.materials:
        high_size = _texture_size_from_quality("high")
        low_size = _texture_size_from_quality("low")

        high_base = high_tex_dir / f"{material.name}_BaseColor.png"
        high_normal = high_tex_dir / f"{material.name}_Normal.png"
        high_rough = high_tex_dir / f"{material.name}_Roughness.png"

        low_base = low_tex_dir / f"{material.name}_BaseColor.png"
        low_normal = low_tex_dir / f"{material.name}_Normal.png"
        low_rough = low_tex_dir / f"{material.name}_Roughness.png"

        base_color = _material_base_color(material.name)
        _noise_map(high_size, base_color).save(high_base)
        _normal_map(high_size).save(high_normal)
        _roughness_map(high_size, material.roughness).save(high_rough)

        _noise_map(low_size, base_color).save(low_base)
        _normal_map(low_size).save(low_normal)
        _roughness_map(low_size, material.roughness).save(low_rough)

        generation_materials.append(
            GenerationMaterial(
                name=material.name,
                roughnessDefault=material.roughness,
                normalStrengthDefault=material.normal_strength,
                mapsHigh=MaterialMapSet(
                    baseColor=f"{base_url}/generated/{generation_id}/HIGH/textures/{high_base.name}",
                    normal=f"{base_url}/generated/{generation_id}/HIGH/textures/{high_normal.name}",
                    roughness=f"{base_url}/generated/{generation_id}/HIGH/textures/{high_rough.name}",
                ),
                mapsLow=MaterialMapSet(
                    baseColor=f"{base_url}/generated/{generation_id}/LOW/textures/{low_base.name}",
                    normal=f"{base_url}/generated/{generation_id}/LOW/textures/{low_normal.name}",
                    roughness=f"{base_url}/generated/{generation_id}/LOW/textures/{low_rough.name}",
                ),
            )
        )

    components = [
        GenerationComponent(
            name=component.name,
            order=index,
            present=True if component.required else not component.name.endswith("Hardware"),
            materialSlots=list(component.material_slots),
        )
        for index, component in enumerate(preset.components, start=1)
    ]

    stats_high = StatsSummary(
        faces=int(len(high_mesh.faces)),
        materials=len(generation_materials),
        components=len(components),
    )
    stats_low = StatsSummary(
        faces=int(len(low_mesh.faces)),
        materials=len(generation_materials),
        components=len(components),
    )

    result = GenerationResult(
        generationId=generation_id,
        objectName=safe_name,
        resolvedPreset=resolved_preset,
        components=components,
        materials=generation_materials,
        stats={"high": stats_high, "low": stats_low},
        artifacts=GenerationArtifacts(
            highGlb=f"{base_url}/generated/{generation_id}/HIGH/{high_glb.name}",
            lowGlb=f"{base_url}/generated/{generation_id}/LOW/{low_glb.name}",
            highDae=f"{base_url}/generated/{generation_id}/HIGH/{high_dae.name}",
            lowDae=f"{base_url}/generated/{generation_id}/LOW/{low_dae.name}",
            previewHigh=f"{base_url}/generated/{generation_id}/{preview_high.name}",
            previewLow=f"{base_url}/generated/{generation_id}/{preview_low.name}",
        ),
        suggestedExportName=f"{safe_name}_SketchUp_Package.zip",
    )

    metadata_path = generation_dir / "generation_result.json"
    metadata_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")

    materials_schema = {
        "schema": MATERIALS_SCHEMA_VERSION,
        "object": {
            "name": safe_name,
            "generationId": generation_id,
            "preset": resolved_preset,
            "qualityTargets": {
                "highFaces": stats_high.faces,
                "lowFaces": stats_low.faces,
            },
        },
        "components": [
            {
                "name": component.name,
                "order": component.order,
                "materialSlots": component.materialSlots,
            }
            for component in components
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
            for material in generation_materials
        ],
    }
    (generation_dir / "materials.schema.snapshot.json").write_text(json.dumps(materials_schema, indent=2), encoding="utf-8")

    return result
