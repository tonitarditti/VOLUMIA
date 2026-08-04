import argparse
import json
import re
import sys
from pathlib import Path

import bpy


def mesh_objects():
    return [item for item in bpy.context.scene.objects if item.type == "MESH"]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def load_source(source):
    bpy.ops.import_scene.gltf(filepath=str(source))
    if not mesh_objects():
        raise RuntimeError("El GLB no contiene mallas editables.")


def triangle_count(mesh):
    return sum(max(0, len(polygon.vertices) - 2) for polygon in mesh.polygons)


def material_names(objects):
    return sorted({slot.material.name for obj in objects for slot in obj.material_slots if slot.material})


def object_stats(objects):
    return {
        "pieces": len(objects),
        "materials": len(material_names(objects)),
        "polygons": sum(len(obj.data.polygons) for obj in objects),
        "triangles": sum(triangle_count(obj.data) for obj in objects),
        "vertices": sum(len(obj.data.vertices) for obj in objects),
    }


def separate_loose_parts():
    source_objects = list(mesh_objects())
    source_count = len(source_objects)
    component_counts = []
    print("STAGE:Separando componentes", flush=True)
    for obj in source_objects:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="LOOSE")
        bpy.ops.object.mode_set(mode="OBJECT")
        component_counts.append(len([item for item in bpy.context.selected_objects if item.type == "MESH"]))

    pieces = sorted(mesh_objects(), key=lambda item: (item.name.lower(), item.location.x, item.location.y, item.location.z))
    for index, obj in enumerate(pieces, 1):
        obj.name = f"Pieza_{index:02d}"
        obj.data.name = f"Pieza_{index:02d}_Mesh"
    return pieces, {
        "method": "loose_parts_vertex_connectivity",
        "sourceMeshes": source_count,
        "piecesDetected": len(pieces),
        "additionalDisconnectedComponents": max(0, len(pieces) - source_count),
        "topologicallyUnsplitSourceMeshes": sum(1 for count in component_counts if count <= 1),
        "notice": "Se separaron únicamente componentes geométricamente desconectados. Algunas partes pueden permanecer unidas en la malla IA.",
    }


def apply_scale(pieces, factor):
    if factor <= 0:
        raise RuntimeError("El factor de escala debe ser positivo.")
    print("STAGE:Aplicando escala", flush=True)
    for obj in pieces:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        obj.scale *= factor
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def optimize_pieces(pieces, ratio):
    if not 0.01 <= ratio <= 1:
        raise RuntimeError("El ratio de optimización debe estar entre 0.01 y 1.")
    print("STAGE:Optimizando", flush=True)
    for obj in pieces:
        modifier = obj.modifiers.new("VOLUMIA_Decimate", "DECIMATE")
        modifier.ratio = ratio
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def safe_project_name(name):
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", name or "Activo_VOLUMIA").strip("_")
    return cleaned[:80] or "Activo_VOLUMIA"


def create_root(project_name, pieces):
    root = bpy.data.objects.new(safe_project_name(project_name), None)
    root.empty_display_type = "PLAIN_AXES"
    bpy.context.scene.collection.objects.link(root)
    for piece in pieces:
        piece.parent = root
    return root


def piece_records(pieces):
    return [{
        "name": piece.name,
        "polygons": len(piece.data.polygons),
        "triangles": triangle_count(piece.data),
        "vertices": len(piece.data.vertices),
        "materials": [slot.material.name for slot in piece.material_slots if slot.material],
    } for piece in pieces]


def export_editable(output_glb, output_dae):
    print("STAGE:Exportando DAE", flush=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(output_glb), export_format="GLB", export_apply=True, export_yup=True)
    bpy.ops.wm.collada_export(filepath=str(output_dae))


def write_manifest(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--operation", required=True, choices=["separate", "scale", "optimize"])
parser.add_argument("--scale", type=float, default=1.0)
parser.add_argument("--ratio", type=float, default=0.5)
parser.add_argument("--preset", choices=["ligero", "equilibrado", "liviano"], default="equilibrado")
parser.add_argument("--dae", required=True)
parser.add_argument("--manifest", required=True)
parser.add_argument("--project-name", default="Activo VOLUMIA")
parser.add_argument("--version-id", default="")
raw_args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = parser.parse_args(raw_args)

source = Path(args.input)
output = Path(args.output)
dae = Path(args.dae)
manifest = Path(args.manifest)

clear_scene()
load_source(source)
before = object_stats(mesh_objects())
print("STAGE:Analizando estructura", flush=True)
pieces, separation = separate_loose_parts()
if args.operation == "scale":
    apply_scale(pieces, args.scale)
elif args.operation == "optimize":
    optimize_pieces(pieces, args.ratio)
root = create_root(args.project_name, pieces)
after = object_stats(pieces)
export_editable(output, dae)
write_manifest(manifest, {
    "schemaVersion": 2,
    "source": "VOLUMIA",
    "versionId": args.version_id,
    "projectName": root.name,
    "operation": args.operation,
    "optimization": {"requested": args.operation == "optimize", "preset": args.preset if args.operation == "optimize" else None, "ratio": args.ratio if args.operation == "optimize" else None},
    "sourceStats": before,
    "editableStats": {**after, "fileBytes": dae.stat().st_size if dae.exists() else 0},
    "separation": separation,
    "files": {"glb": output.name, "dae": dae.name},
    "pieces": piece_records(pieces),
})
print("STAGE:Finalizado", flush=True)
