#!/usr/bin/env python3
import argparse
import inspect
import json
import math
import os
import re
import subprocess
import sys
import time
import traceback
from pathlib import Path
from typing import Any, Dict, Optional, Sequence, Tuple


DEFAULT_SKETCHUP_2025 = r"C:\Program Files\SketchUp\SketchUp 2025\SketchUp.exe"

STEP_PARAM_NAMES = (
    "steps",
    "num_steps",
    "n_steps",
    "sampling_steps",
    "num_inference_steps",
)
RESOLUTION_PARAM_NAMES = (
    "resolution",
    "mc_resolution",
    "mesh_resolution",
    "grid_resolution",
)

QUALITY_CONFIG: Dict[str, Dict[str, int]] = {
    "fast": {
        "steps": 20,
        "resolution": 256,
        "chunk_size": 16384,
        "smooth_iterations": 6,
        "target_faces": 120_000,
    },
    "high": {
        "steps": 60,
        "resolution": 512,
        "chunk_size": 4096,
        "smooth_iterations": 16,
        "target_faces": 220_000,
    },
}


def emit(payload: Dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def emit_progress(stage: str, pct: int, message: str) -> None:
    emit({"type": "progress", "stage": stage, "pct": int(pct), "message": message})


def emit_done(skp_path: str) -> None:
    emit({"type": "done", "skpPath": skp_path})


def emit_error(message: str, detail: str = "") -> None:
    payload: Dict[str, Any] = {"type": "error", "message": message}
    if detail:
        payload["detail"] = detail
    emit(payload)


def ensure_dir(path: str) -> str:
    absolute = os.path.abspath(path)
    os.makedirs(absolute, exist_ok=True)
    return absolute


def normalize_inputs(inputs: Sequence[str]) -> list[str]:
    normalized = [os.path.abspath(value) for value in inputs if isinstance(value, str) and value.strip()]
    if len(normalized) < 1 or len(normalized) > 4:
        raise RuntimeError(f"--inputs must contain 1..4 images, got {len(normalized)}")
    for image_path in normalized:
        if not os.path.exists(image_path):
            raise RuntimeError(f"Input image not found: {image_path}")
    return normalized


def resolve_sketchup_exe(override_path: Optional[str]) -> str:
    if override_path and override_path.strip():
        candidate = os.path.abspath(override_path.strip())
        if os.path.exists(candidate):
            return candidate
        raise RuntimeError(f"SketchUp executable not found: {candidate}")

    if os.path.exists(DEFAULT_SKETCHUP_2025):
        return DEFAULT_SKETCHUP_2025

    raise RuntimeError(
        f"SketchUp 2025 not found at default path: {DEFAULT_SKETCHUP_2025}. "
        "Provide --sketchup_exe."
    )


def resolve_device(requested: str) -> str:
    if requested == "cpu":
        return "cpu"
    try:
        import torch  # type: ignore

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def pick_supported_kwarg(func: Any, names: Tuple[str, ...], value: Any) -> Dict[str, Any]:
    try:
        signature = inspect.signature(func)
    except Exception:
        return {}
    for name in names:
        if name in signature.parameters:
            return {name: value}
    return {}


def mesh_from_output(mesh_or_scene: Any, trimesh: Any) -> Any:
    if isinstance(mesh_or_scene, trimesh.Trimesh):
        return mesh_or_scene
    if isinstance(mesh_or_scene, trimesh.Scene):
        geometries = [g for g in mesh_or_scene.geometry.values() if isinstance(g, trimesh.Trimesh)]
        if not geometries:
            raise RuntimeError("TripoSR returned an empty scene.")
        return trimesh.util.concatenate(geometries)
    raise RuntimeError(f"Unsupported mesh output type: {type(mesh_or_scene)!r}")


def create_base_cap(mesh: Any, trimesh: Any) -> Optional[Any]:
    bounds = getattr(mesh, "bounds", None)
    if bounds is None:
        return None
    mins = bounds[0]
    maxs = bounds[1]
    extents = [float(maxs[i] - mins[i]) for i in range(3)]
    if any(v <= 0.0 for v in extents):
        return None

    up_axis = 1
    thickness = max(extents[up_axis] * 0.01, 1e-4)
    cap_extents = extents[:]
    cap_extents[up_axis] = thickness
    center = [(float(mins[i]) + float(maxs[i])) * 0.5 for i in range(3)]
    center[up_axis] = float(mins[up_axis]) + thickness * 0.5
    transform = trimesh.transformations.translation_matrix(center)
    return trimesh.creation.box(extents=cap_extents, transform=transform)


def ensure_texture_uv(mesh: Any, np_mod: Any, trimesh: Any) -> Any:
    uv = getattr(getattr(mesh, "visual", None), "uv", None)
    if uv is not None and len(uv) == len(mesh.vertices):
        return mesh

    vertices = np_mod.asarray(mesh.vertices, dtype=np_mod.float64)
    if len(vertices) == 0:
        return mesh
    centered = vertices - vertices.mean(axis=0)
    radius = np_mod.linalg.norm(centered, axis=1)
    safe_radius = np_mod.where(radius > 1e-8, radius, 1.0)
    nx = centered[:, 0] / safe_radius
    ny = centered[:, 1] / safe_radius
    nz = centered[:, 2] / safe_radius
    u = 0.5 + np_mod.arctan2(nz, nx) / (2.0 * np_mod.pi)
    v = 0.5 - np_mod.arcsin(np_mod.clip(ny, -1.0, 1.0)) / np_mod.pi
    generated_uv = np_mod.column_stack((u, v)).astype(np_mod.float32)
    image = getattr(getattr(mesh, "visual", None), "material", None)
    image = getattr(image, "image", None)
    mesh.visual = trimesh.visual.texture.TextureVisuals(uv=generated_uv, image=image)
    return mesh


def cleanup_mesh(mesh: Any, quality: str, trimesh: Any, smoothing: Any) -> Any:
    config = QUALITY_CONFIG[quality]
    mesh.remove_degenerate_faces()
    mesh.remove_unreferenced_vertices()
    mesh.rezero()
    mesh.fix_normals()
    processed = mesh.process(validate=True)
    if isinstance(processed, trimesh.Trimesh):
        mesh = processed

    smoothing.filter_laplacian(mesh, lamb=0.5, iterations=config["smooth_iterations"])
    if hasattr(mesh, "fill_holes"):
        try:
            mesh.fill_holes()
        except Exception:
            pass
    if not bool(getattr(mesh, "is_watertight", False)):
        base_cap = create_base_cap(mesh, trimesh)
        if base_cap is not None:
            mesh = trimesh.util.concatenate([mesh, base_cap])

    target_faces = config["target_faces"]
    if len(mesh.faces) > target_faces and hasattr(mesh, "simplify_quadratic_decimation"):
        try:
            simplified = mesh.simplify_quadratic_decimation(target_faces)
            if simplified is not None and len(simplified.faces) > 0:
                mesh = simplified
        except Exception:
            pass

    mesh.remove_degenerate_faces()
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals()
    mesh.process(validate=True)
    return mesh


def blend_texture(images: Sequence[str], target_size: int, image_mod: Any, np_mod: Any) -> Any:
    arrays = []
    for image_path in images:
        try:
            image = image_mod.open(image_path).convert("RGB").resize((target_size, target_size), image_mod.LANCZOS)
            arrays.append(np_mod.asarray(image, dtype=np_mod.float32))
        except Exception:
            continue
    if not arrays:
        raise RuntimeError("Failed to build texture from input images.")
    blend = np_mod.mean(np_mod.stack(arrays, axis=0), axis=0)
    blend = np_mod.clip(blend, 0, 255).astype(np_mod.uint8)
    return image_mod.fromarray(blend, mode="RGB")


def safe_id(value: str) -> str:
    candidate = re.sub(r"[^a-zA-Z0-9_\-]", "_", value.strip())
    return candidate or "generated_model"


def escape_xml(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def write_dae_with_texture(mesh: Any, dae_path: str, texture_rel_path: str, model_name: str, np_mod: Any) -> None:
    vertices = np_mod.asarray(mesh.vertices, dtype=np_mod.float64)
    faces = np_mod.asarray(mesh.faces, dtype=np_mod.int64)
    if len(vertices) == 0 or len(faces) == 0:
        raise RuntimeError("Mesh is empty; cannot export DAE.")

    normals = np_mod.asarray(mesh.vertex_normals, dtype=np_mod.float64)
    if len(normals) != len(vertices):
        mesh.fix_normals()
        normals = np_mod.asarray(mesh.vertex_normals, dtype=np_mod.float64)
    if len(normals) != len(vertices):
        normals = np_mod.tile(np_mod.array([[0.0, 1.0, 0.0]], dtype=np_mod.float64), (len(vertices), 1))

    uv = getattr(getattr(mesh, "visual", None), "uv", None)
    if uv is None or len(uv) != len(vertices):
        raise RuntimeError("Mesh has no valid UV coordinates.")
    uv_array = np_mod.asarray(uv, dtype=np_mod.float64)

    mesh_id = safe_id(model_name)
    geom_id = f"{mesh_id}-geometry"
    pos_id = f"{mesh_id}-positions"
    norm_id = f"{mesh_id}-normals"
    uv_id = f"{mesh_id}-map-0"
    verts_id = f"{mesh_id}-vertices"
    image_id = f"{mesh_id}-image"
    effect_id = f"{mesh_id}-effect"
    material_id = f"{mesh_id}-material"

    pos_data = " ".join(f"{v:.6f}" for v in vertices.reshape(-1))
    norm_data = " ".join(f"{v:.6f}" for v in normals.reshape(-1))
    uv_data = " ".join(f"{v:.6f}" for v in uv_array.reshape(-1))

    tri_parts = []
    for tri in faces:
        for idx in tri:
            tri_parts.extend([str(int(idx)), str(int(idx)), str(int(idx))])
    tri_data = " ".join(tri_parts)

    dae_text = f"""<?xml version="1.0" encoding="UTF-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <contributor><authoring_tool>VOLUMIA Gen SKP Pipeline</authoring_tool></contributor>
    <unit meter="1" name="meter"/>
    <up_axis>Y_UP</up_axis>
  </asset>
  <library_images>
    <image id="{image_id}" name="{image_id}">
      <init_from>{escape_xml(texture_rel_path)}</init_from>
    </image>
  </library_images>
  <library_effects>
    <effect id="{effect_id}">
      <profile_COMMON>
        <newparam sid="{image_id}-surface">
          <surface type="2D"><init_from>{image_id}</init_from></surface>
        </newparam>
        <newparam sid="{image_id}-sampler">
          <sampler2D><source>{image_id}-surface</source></sampler2D>
        </newparam>
        <technique sid="common">
          <phong>
            <diffuse><texture texture="{image_id}-sampler" texcoord="UVMap"/></diffuse>
            <specular><color>0.03 0.03 0.03 1</color></specular>
            <shininess><float>8</float></shininess>
          </phong>
        </technique>
      </profile_COMMON>
    </effect>
  </library_effects>
  <library_materials>
    <material id="{material_id}" name="{material_id}">
      <instance_effect url="#{effect_id}"/>
    </material>
  </library_materials>
  <library_geometries>
    <geometry id="{geom_id}" name="{escape_xml(model_name)}">
      <mesh>
        <source id="{pos_id}">
          <float_array id="{pos_id}-array" count="{len(vertices) * 3}">{pos_data}</float_array>
          <technique_common>
            <accessor source="#{pos_id}-array" count="{len(vertices)}" stride="3">
              <param name="X" type="float"/>
              <param name="Y" type="float"/>
              <param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="{norm_id}">
          <float_array id="{norm_id}-array" count="{len(normals) * 3}">{norm_data}</float_array>
          <technique_common>
            <accessor source="#{norm_id}-array" count="{len(normals)}" stride="3">
              <param name="X" type="float"/>
              <param name="Y" type="float"/>
              <param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="{uv_id}">
          <float_array id="{uv_id}-array" count="{len(uv_array) * 2}">{uv_data}</float_array>
          <technique_common>
            <accessor source="#{uv_id}-array" count="{len(uv_array)}" stride="2">
              <param name="S" type="float"/>
              <param name="T" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="{verts_id}">
          <input semantic="POSITION" source="#{pos_id}"/>
        </vertices>
        <triangles count="{len(faces)}" material="{material_id}">
          <input semantic="VERTEX" source="#{verts_id}" offset="0"/>
          <input semantic="NORMAL" source="#{norm_id}" offset="1"/>
          <input semantic="TEXCOORD" source="#{uv_id}" offset="2" set="0"/>
          <p>{tri_data}</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="{mesh_id}" name="{escape_xml(model_name)}">
        <instance_geometry url="#{geom_id}">
          <bind_material>
            <technique_common>
              <instance_material symbol="{material_id}" target="#{material_id}">
                <bind_vertex_input semantic="UVMap" input_semantic="TEXCOORD" input_set="0"/>
              </instance_material>
            </technique_common>
          </bind_material>
        </instance_geometry>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene>
    <instance_visual_scene url="#Scene"/>
  </scene>
</COLLADA>
"""
    with open(dae_path, "w", encoding="utf-8") as handle:
        handle.write(dae_text)


def ruby_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def write_ruby_script(ruby_path: str, dae_path: str, project_name: str, output_skp_path: str) -> None:
    dae_ruby = ruby_escape(dae_path)
    skp_ruby = ruby_escape(output_skp_path)
    name_ruby = ruby_escape(project_name)
    ruby_text = f'''model = Sketchup.active_model
model.start_operation("ImportGenerated", true)

dae_path = "{dae_ruby}"
status = model.import(dae_path)

if status
  ents = model.entities
  defs = model.definitions
  comp_def = defs.add("{name_ruby}")
  ents.to_a.each {{ |e| comp_def.entities.add_instance(e.definition, e.transformation) rescue nil }}
  ents.clear!
  model.entities.add_instance(comp_def, Geom::Transformation.new)
end

model.commit_operation
model.save("{skp_ruby}")
Sketchup.quit
'''
    with open(ruby_path, "w", encoding="utf-8") as handle:
        handle.write(ruby_text)


def run_sketchup_conversion(
    sketchup_exe: str,
    ruby_script_path: str,
    output_skp_path: str,
    timeout_seconds: int = 900,
) -> None:
    command = [sketchup_exe, "-RubyStartup", ruby_script_path]
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    start = time.time()
    while True:
        if os.path.exists(output_skp_path):
            return
        if process.poll() is not None:
            break
        if time.time() - start > timeout_seconds:
            try:
                process.kill()
            except Exception:
                pass
            raise RuntimeError("SketchUp conversion timed out.")
        time.sleep(1.0)

    if not os.path.exists(output_skp_path):
        raise RuntimeError("SketchUp finished but SKP output was not created.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="VOLUMIA AI pipeline: images -> DAE + textures -> SKP 2025")
    parser.add_argument("--inputs", nargs="+", required=True)
    parser.add_argument("--project_name", required=True)
    parser.add_argument("--work_dir", required=True)
    parser.add_argument("--output_dir", required=True)
    parser.add_argument("--quality", choices=["fast", "high"], required=True)
    parser.add_argument("--sketchup_exe", default="")
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cuda")
    return parser


def run_pipeline(args: argparse.Namespace) -> str:
    emit_progress("validate", 5, "Validating inputs")
    input_paths = normalize_inputs(args.inputs)
    project_name = args.project_name.strip()
    if not project_name:
        raise RuntimeError("--project_name cannot be empty")

    work_dir = ensure_dir(args.work_dir)
    output_dir = ensure_dir(args.output_dir)
    textures_dir = ensure_dir(os.path.join(work_dir, "textures"))
    dae_path = os.path.join(work_dir, "model.dae")
    texture_path = os.path.join(textures_dir, "albedo.png")
    output_skp_path = os.path.join(output_dir, f"{project_name}.skp")
    ruby_path = os.path.join(work_dir, "import_and_save.rb")

    emit_progress("bootstrap", 12, "Loading dependencies")
    try:
        import numpy as np  # type: ignore
        import torch  # type: ignore
        import trimesh  # type: ignore
        import trimesh.smoothing as smoothing  # type: ignore
        from PIL import Image  # type: ignore
        from tsr.system import TSR  # type: ignore
        from tsr.utils import remove_background, resize_foreground  # type: ignore
    except Exception as error:
        raise RuntimeError(
            "Missing dependencies. Install torch, pillow, trimesh and TripoSR runtime in your environment."
        ) from error

    emit_progress("texture", 20, "Building texture map")
    texture_image = blend_texture(input_paths, 1024 if args.quality == "high" else 768, Image, np)
    texture_image.save(texture_path)

    emit_progress("infer", 30, "Loading TripoSR model")
    device = resolve_device(args.device)
    config = QUALITY_CONFIG[args.quality]
    base_image = Image.open(input_paths[0]).convert("RGB")
    base_image = remove_background(base_image)
    base_image = resize_foreground(base_image, 0.85)

    model = TSR.from_pretrained(
        "stabilityai/TripoSR",
        config_name="config.yaml",
        weight_name="model.ckpt",
    )
    model.to(device)
    if hasattr(model, "renderer") and hasattr(model.renderer, "set_chunk_size"):
        model.renderer.set_chunk_size(config["chunk_size"])

    infer_kwargs = pick_supported_kwarg(model.__call__, STEP_PARAM_NAMES, config["steps"])
    extract_kwargs = pick_supported_kwarg(model.extract_mesh, RESOLUTION_PARAM_NAMES, config["resolution"])
    if not extract_kwargs:
        extract_kwargs = {"resolution": config["resolution"]}

    emit_progress("infer", 46, f"Running geometry generation on {device}")
    with torch.no_grad():
        try:
            scene_codes = model([base_image], device=device, **infer_kwargs)
        except TypeError:
            scene_codes = model([base_image], device=device)

        try:
            meshes = model.extract_mesh(scene_codes, **extract_kwargs)
        except TypeError:
            meshes = model.extract_mesh(scene_codes, resolution=config["resolution"])

    if not meshes:
        raise RuntimeError("TripoSR did not return any mesh.")
    mesh = mesh_from_output(meshes[0], trimesh)

    emit_progress("mesh_cleanup", 62, "Cleaning mesh and completing open areas")
    mesh = cleanup_mesh(mesh, args.quality, trimesh, smoothing)

    emit_progress("uv", 72, "Generating UV map")
    mesh = ensure_texture_uv(mesh, np, trimesh)
    mesh.visual = trimesh.visual.texture.TextureVisuals(
        uv=mesh.visual.uv,
        image=texture_image,
    )

    emit_progress("export_dae", 82, "Exporting DAE and relative textures")
    texture_rel_path = os.path.relpath(texture_path, os.path.dirname(dae_path)).replace("\\", "/")
    write_dae_with_texture(mesh, dae_path, texture_rel_path, project_name, np)

    emit_progress("convert_skp", 90, "Converting DAE to SKP 2025")
    sketchup_exe = resolve_sketchup_exe(args.sketchup_exe)
    write_ruby_script(ruby_path, dae_path, project_name, output_skp_path)
    run_sketchup_conversion(sketchup_exe, ruby_path, output_skp_path, timeout_seconds=900)

    if not os.path.exists(output_skp_path):
        raise RuntimeError(f"SKP output was not created: {output_skp_path}")

    emit_progress("convert_skp", 99, "SketchUp conversion complete")
    return output_skp_path


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        skp_path = run_pipeline(args)
        emit_done(skp_path)
        return 0
    except Exception as error:
        emit_error(str(error), traceback.format_exc())
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
