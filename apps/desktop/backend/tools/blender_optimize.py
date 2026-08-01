import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_asset(source: Path) -> None:
    suffix = source.suffix.lower()
    if suffix == ".glb" or suffix == ".gltf":
        bpy.ops.import_scene.gltf(filepath=str(source))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(source))
    elif suffix == ".ply":
        bpy.ops.wm.ply_import(filepath=str(source))
    else:
        raise RuntimeError(f"Unsupported input format: {source.suffix}")


def scene_mesh_objects() -> list[bpy.types.Object]:
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def apply_canonical_rotation(rotation_x_deg: float, rotation_y_deg: float, rotation_z_deg: float) -> None:
    if abs(rotation_x_deg) < 0.0001 and abs(rotation_y_deg) < 0.0001 and abs(rotation_z_deg) < 0.0001:
        print("[blender-transform] canonical rotation skipped")
        return

    rotation = Euler(
        (
            math.radians(rotation_x_deg),
            math.radians(rotation_y_deg),
            math.radians(rotation_z_deg),
        ),
        "XYZ",
    ).to_matrix().to_4x4()
    print(
        "[blender-transform] applying canonical rotation before bake/export "
        f"x={rotation_x_deg} y={rotation_y_deg} z={rotation_z_deg}",
        flush=True,
    )

    # Apply rotation at the object (world) level then bake the rotation into the mesh.
    # This preserves UVs and keeps texture coordinates aligned with the mesh.
    for obj in scene_mesh_objects():
        try:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            # transform object's world matrix by the canonical rotation
            obj.matrix_world = rotation @ obj.matrix_world
            # bake rotation into object (applies to mesh while preserving UVs)
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
            # try to ensure normals are consistent after transform
            try:
                bpy.ops.object.mode_set(mode="EDIT")
                bpy.ops.mesh.normals_make_consistent(inside=False)
                bpy.ops.object.mode_set(mode="OBJECT")
            except Exception:
                pass
        finally:
            try:
                obj.select_set(False)
            except Exception:
                pass


def optimize_scene() -> None:
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.shade_smooth()
        except Exception:
            pass
        obj.select_set(False)


def ensure_image_textures_use_uv() -> None:
    """Ensure Image Texture nodes use a UVMap node as their vector input.
    This avoids Generated/Generated coordinates being used which misaligns photo textures.
    """
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        for img_node in [n for n in nodes if n.type == 'TEX_IMAGE']:
            vec_input = img_node.inputs.get('Vector')
            if vec_input is None:
                continue
            if vec_input.is_linked:
                from_node = vec_input.links[0].from_node
                if from_node.type == 'UVMAP':
                    continue
            # create a UV Map node (or reuse an existing one) and link it
            uv_nodes = [n for n in nodes if n.type == 'UVMAP']
            if uv_nodes:
                uv_node = uv_nodes[0]
            else:
                uv_node = nodes.new('ShaderNodeUVMap')
            try:
                uv_node.uv_map = 'UVMap'
            except Exception:
                pass
            try:
                links.new(uv_node.outputs[0], img_node.inputs['Vector'])
            except Exception:
                pass


def get_area_weighted_normal(obj: bpy.types.Object):
    """Return area-weighted average normal in object space as a Vector, or None."""
    mesh = obj.data
    # ensure triangulation info available
    try:
        mesh.calc_loop_triangles()
    except Exception:
        return None
    total = None
    total_area = 0.0
    for tri in mesh.loop_triangles:
        area = tri.area
        n = tri.normal
        if total is None:
            total = n * area
        else:
            total += n * area
        total_area += area
    if not total_area or total is None:
        return None
    return (total / total_area).normalized()


def auto_orient_scene(threshold_deg: float = 20.0) -> None:
    """Rotate objects so their dominant face normal points upwards (+Z).
    Skips small angles under 1 degree. Uses area-weighted normals to detect large planar surfaces.
    """
    import mathutils
    from mathutils import Vector
    import math

    for obj in scene_mesh_objects():
        try:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            normal = get_area_weighted_normal(obj)
            if normal is None:
                continue
            up = Vector((0.0, 0.0, 1.0))
            # normal is in object space; transform to world space
            world_normal = (obj.matrix_world.to_3x3() @ normal).normalized()
            angle = world_normal.angle(up)
            angle_deg = math.degrees(angle)
            # if already aligned, skip
            if angle_deg < 1.0:
                continue
            # compute shortest rotation to align world_normal to up
            axis = world_normal.cross(up)
            if axis.length < 1e-6:
                # opposite direction
                axis = Vector((1.0, 0.0, 0.0))
            rot = mathutils.Matrix.Rotation(-angle, 4, axis)
            # apply rotation in world-space
            obj.matrix_world = rot @ obj.matrix_world
            # bake rotation into mesh while preserving UVs
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        finally:
            try:
                obj.select_set(False)
            except Exception:
                pass


def export_glb(target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(target),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Optimize and export a model as GLB.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--rotation-x-deg", type=float, default=0.0)
    parser.add_argument("--rotation-y-deg", type=float, default=0.0)
    parser.add_argument("--rotation-z-deg", type=float, default=0.0)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else None)

    source = Path(args.input).resolve()
    target = Path(args.output).resolve()
    if not source.exists():
        raise FileNotFoundError(source)

    clear_scene()
    import_asset(source)
    apply_canonical_rotation(args.rotation_x_deg, args.rotation_y_deg, args.rotation_z_deg)
    optimize_scene()
    export_glb(target)
    print(f"Exported GLB: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
