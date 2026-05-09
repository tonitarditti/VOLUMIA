import argparse
import sys
from pathlib import Path

import bpy


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
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else None)

    source = Path(args.input).resolve()
    target = Path(args.output).resolve()
    if not source.exists():
        raise FileNotFoundError(source)

    clear_scene()
    import_asset(source)
    optimize_scene()
    export_glb(target)
    print(f"Exported GLB: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
