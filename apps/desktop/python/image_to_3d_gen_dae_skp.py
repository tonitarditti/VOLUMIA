#!/usr/bin/env python3
import argparse
import inspect
import json
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
    "mc_resolution",
    "resolution",
    "mesh_resolution",
    "grid_resolution",
)
MULTIVIEW_PARAM_NAMES = (
    "num_views",
    "n_views",
    "view_count",
    "num_images",
)
DENSITY_THRESHOLD_PARAM_NAMES = (
    "density_threshold",
    "threshold",
    "iso_threshold",
    "level",
)

TRIPOSR_INSTALL_HINT = (
    "TripoSR not installed. Run: "
    "pip install git+https://github.com/VAST-AI-Research/TripoSR.git"
)

QUALITY_CONFIG: Dict[str, Dict[str, int]] = {
    "fast": {
        "steps": 20,
        "resolution": 256,
        "chunk_size": 16384,
        "smooth_iterations": 3,
        "target_faces": 120_000,
    },
    "high": {
        "steps": 60,
        "resolution": 512,
        "chunk_size": 4096,
        "smooth_iterations": 5,
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


def _extract_mesh_candidate(output: Any, trimesh: Any) -> Optional[Any]:
    if output is None:
        return None
    try:
        if isinstance(output, (trimesh.Trimesh, trimesh.Scene)):
            return mesh_from_output(output, trimesh)
    except Exception:
        pass

    if isinstance(output, dict):
        for key in ("mesh", "meshes", "scene", "result", "outputs"):
            value = output.get(key)
            if value is None:
                continue
            candidate = _extract_mesh_candidate(value, trimesh)
            if candidate is not None:
                return candidate
        return None

    if isinstance(output, (list, tuple)):
        for item in output:
            candidate = _extract_mesh_candidate(item, trimesh)
            if candidate is not None:
                return candidate
    return None


def _load_optional_preprocess_utils() -> Tuple[Any, Any]:
    try:
        from tsr.utils import remove_background, resize_foreground  # type: ignore

        return remove_background, resize_foreground
    except Exception:
        pass

    def _noop_remove_background(image: Any) -> Any:
        return image

    def _noop_resize_foreground(image: Any, _ratio: float) -> Any:
        return image

    return _noop_remove_background, _noop_resize_foreground


def _load_triposr_model(device: str) -> Tuple[Any, str]:
    try:
        from triposr import TripoSR  # type: ignore

        model = TripoSR(device=device)
        return model, "triposr"
    except Exception:
        pass

    try:
        from tsr.system import TSR  # type: ignore

        model = TSR.from_pretrained(
            "stabilityai/TripoSR",
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        if hasattr(model, "to"):
            model.to(device)
        return model, "tsr"
    except Exception:
        raise RuntimeError(TRIPOSR_INSTALL_HINT) from None


def reconstruct_mesh_with_triposr(
    model: Any,
    backend: str,
    image: Any,
    image_path: str,
    config: Dict[str, int],
    device: str,
    torch_mod: Any,
    trimesh: Any,
) -> Any:
    if backend == "triposr" and hasattr(model, "generate_mesh"):
        generate_mesh = getattr(model, "generate_mesh")
        kwargs: Dict[str, Any] = {}
        kwargs.update(pick_supported_kwarg(generate_mesh, STEP_PARAM_NAMES, config["steps"]))
        kwargs.update(pick_supported_kwarg(generate_mesh, RESOLUTION_PARAM_NAMES, config["resolution"]))

        try:
            signature = inspect.signature(generate_mesh)
            if "image_path" in signature.parameters:
                kwargs["image_path"] = image_path
            elif "image" in signature.parameters:
                kwargs["image"] = image
        except Exception:
            pass

        with torch_mod.no_grad():
            if "image_path" in kwargs or "image" in kwargs:
                output = generate_mesh(**kwargs)
            else:
                try:
                    output = generate_mesh(image_path, **kwargs)
                except TypeError:
                    output = generate_mesh(image, **kwargs)

        mesh = _extract_mesh_candidate(output, trimesh)
        if mesh is not None:
            return mesh

    infer_kwargs = pick_supported_kwarg(model.__call__, STEP_PARAM_NAMES, config["steps"])
    extract_kwargs = pick_supported_kwarg(model.extract_mesh, RESOLUTION_PARAM_NAMES, config["resolution"])
    if not extract_kwargs:
        extract_kwargs = {"resolution": config["resolution"]}

    with torch_mod.no_grad():
        try:
            scene_codes = model([image], device=device, **infer_kwargs)
        except TypeError:
            scene_codes = model([image], device=device)

        try:
            meshes = model.extract_mesh(scene_codes, **extract_kwargs)
        except TypeError:
            try:
                meshes = model.extract_mesh(scene_codes, resolution=config["resolution"])
            except TypeError:
                meshes = model.extract_mesh(scene_codes)

    if not meshes:
        raise RuntimeError("TripoSR did not return any mesh.")
    return mesh_from_output(meshes[0], trimesh)


def ensure_texture_uv(mesh: Any, np_mod: Any, trimesh: Any) -> Any:
    vertices = np_mod.asarray(mesh.vertices, dtype=np_mod.float64)
    if len(vertices) == 0:
        return mesh

    # Frontal planar mapping (projection on X/Y plane, front along Z axis).
    mins = vertices.min(axis=0)
    maxs = vertices.max(axis=0)
    span = np_mod.maximum(maxs - mins, 1e-8)
    u = (vertices[:, 0] - mins[0]) / span[0]
    v = (vertices[:, 1] - mins[1]) / span[1]
    v = 1.0 - v
    generated_uv = np_mod.column_stack(
        (np_mod.clip(u, 0.0, 1.0), np_mod.clip(v, 0.0, 1.0))
    ).astype(np_mod.float32)

    image = getattr(getattr(mesh, "visual", None), "material", None)
    image = getattr(image, "image", None)
    mesh.visual = trimesh.visual.texture.TextureVisuals(uv=generated_uv, image=image)
    return mesh


def keep_largest_connected_component(mesh: Any, trimesh: Any) -> Any:
    if not hasattr(mesh, "split"):
        return mesh
    try:
        components = mesh.split(only_watertight=False)
    except Exception:
        return mesh
    if not components or len(components) <= 1:
        return mesh

    largest = max(
        components,
        key=lambda component: (
            int(len(getattr(component, "faces", ()))),
            float(getattr(component, "area", 0.0)),
        ),
    )
    return largest.copy() if hasattr(largest, "copy") else largest


def apply_edge_preserving_smoothing(mesh: Any, smoothing: Any, iterations: int) -> None:
    safe_iterations = max(1, int(iterations))
    if hasattr(smoothing, "filter_taubin"):
        smoothing.filter_taubin(mesh, lamb=0.5, nu=-0.53, iterations=safe_iterations)
        return
    if hasattr(smoothing, "filter_humphrey"):
        smoothing.filter_humphrey(mesh, alpha=0.1, beta=0.5, iterations=safe_iterations)
        return
    # Fallback for older trimesh versions without edge-preserving filters.
    smoothing.filter_laplacian(mesh, lamb=0.35, iterations=safe_iterations)


def cleanup_mesh(mesh: Any, quality: str, trimesh: Any, smoothing: Any) -> Any:
    config = QUALITY_CONFIG[quality]
    mesh.remove_degenerate_faces()
    mesh.remove_unreferenced_vertices()
    mesh.rezero()
    mesh.fix_normals()
    processed = mesh.process(validate=True)
    if isinstance(processed, trimesh.Trimesh):
        mesh = processed

    mesh = keep_largest_connected_component(mesh, trimesh)

    if len(mesh.faces) > 10_000:
        smooth_iterations = max(1, min(int(config["smooth_iterations"]), 5))
        apply_edge_preserving_smoothing(mesh, smoothing, smooth_iterations)
    if hasattr(mesh, "fill_holes"):
        try:
            mesh.fill_holes()
        except Exception:
            pass

    target_faces = config["target_faces"]
    if len(mesh.faces) > target_faces and hasattr(mesh, "simplify_quadratic_decimation"):
        try:
            simplified = mesh.simplify_quadratic_decimation(target_faces)
            if simplified is not None and len(simplified.faces) > 0:
                mesh = simplified
        except Exception:
            pass

    mesh = keep_largest_connected_component(mesh, trimesh)
    mesh.remove_degenerate_faces()
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals()
    mesh.process(validate=True)
    return mesh


def load_primary_texture(images: Sequence[str], image_mod: Any) -> Any:
    for image_path in images:
        try:
            with image_mod.open(image_path) as image:
                return image.convert("RGB").copy()
        except Exception:
            continue
    raise RuntimeError("Failed to load texture from input images.")


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
    except Exception as error:
        raise RuntimeError(
            "Missing dependencies. Install torch, pillow and trimesh in your environment."
        ) from error

    remove_background, resize_foreground = _load_optional_preprocess_utils()
    device = resolve_device(args.device)
    model, backend = _load_triposr_model(device)

    emit_progress("texture", 20, "Building texture map")
    texture_image = load_primary_texture(input_paths, Image)
    texture_image.save(texture_path, format="PNG")

    emit_progress("infer", 30, "Preparing TripoSR input")
    config = QUALITY_CONFIG[args.quality]
    base_image = Image.open(input_paths[0]).convert("RGB")
    base_image = remove_background(base_image)
    base_image = resize_foreground(base_image, 0.95)
    if hasattr(model, "to"):
        try:
            model.to(device)
        except Exception:
            pass
    if hasattr(model, "renderer") and hasattr(model.renderer, "set_chunk_size"):
        model.renderer.set_chunk_size(config["chunk_size"])

    emit_progress("infer", 44, f"Running TripoSR reconstruction on {device} ({backend})")
    mesh = reconstruct_mesh_with_triposr(
        model=model,
        backend=backend,
        image=base_image,
        image_path=input_paths[0],
        config=config,
        device=device,
        torch_mod=torch,
        trimesh=trimesh,
    )
    emit_progress("infer", 56, "Mesh reconstruction complete")

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
        debug_mode = os.environ.get("VOLUMIA_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}
        detail = traceback.format_exc() if debug_mode else ""
        emit_error(str(error), detail)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
