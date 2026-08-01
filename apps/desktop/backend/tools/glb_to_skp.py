#!/usr/bin/env python3
"""Export an existing GLB to SketchUp through Collada and SketchUp's Ruby API."""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def emit(payload: dict[str, str]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def require_file(value: str, label: str) -> Path:
    path = Path(value).expanduser().resolve()
    if not path.is_file():
        raise RuntimeError(f"{label} not found: {path}")
    return path


def write_blender_script(path: Path, source: Path, dae_path: Path) -> None:
    path.write_text(
        "import bpy\n"
        "bpy.ops.wm.read_factory_settings(use_empty=True)\n"
        f"bpy.ops.import_scene.gltf(filepath={str(source)!r})\n"
        f"bpy.ops.wm.collada_export(filepath={str(dae_path)!r})\n",
        encoding="utf-8",
    )


def ruby_quote(value: Path) -> str:
    return str(value).replace("\\", "\\\\").replace('"', '\\"')


def write_sketchup_script(path: Path, dae_path: Path, output_path: Path) -> None:
    path.write_text(
        "model = Sketchup.active_model\n"
        "model.start_operation('VolumiaImport', true)\n"
        f"imported = model.import(\"{ruby_quote(dae_path)}\")\n"
        "unless imported\n"
        "  raise 'SketchUp could not import the generated DAE.'\n"
        "end\n"
        "model.commit_operation\n"
        f"model.save(\"{ruby_quote(output_path)}\")\n"
        "Sketchup.quit\n",
        encoding="utf-8",
    )


def resolve_sketchup_template(sketchup_exe: Path) -> Path:
    templates = sorted((sketchup_exe.parent / "Resources").glob("*/Templates/*.skp"))
    if not templates:
        raise RuntimeError("SketchUp template not found; cannot start a model for automated export.")
    return templates[0]


def wait_for_skp(process: subprocess.Popen[bytes], output_path: Path, timeout_seconds: int) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if output_path.is_file() and output_path.stat().st_size > 0:
            return
        if process.poll() is not None:
            break
        time.sleep(0.5)
    if process.poll() is None:
        process.kill()
    raise RuntimeError("SketchUp finished without creating the SKP output.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert GLB to SKP using Blender and SketchUp.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--blender-exe", required=True)
    parser.add_argument("--sketchup-exe", required=True)
    args = parser.parse_args()

    try:
        source = require_file(args.input, "Source GLB")
        blender_exe = require_file(args.blender_exe, "Blender executable")
        sketchup_exe = require_file(args.sketchup_exe, "SketchUp executable")
        output = Path(args.output).expanduser().resolve()
        if output.suffix.lower() != ".skp":
            output = output.with_suffix(".skp")
        output.parent.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory(prefix="volumia_glb_to_skp_") as work_dir:
            work = Path(work_dir)
            dae_path = work / "model.dae"
            blender_script = work / "export_dae.py"
            ruby_script = work / "import_and_save.rb"
            write_blender_script(blender_script, source, dae_path)
            emit({"type": "progress", "message": "Converting GLB to Collada with Blender"})
            blender = subprocess.run(
                [str(blender_exe), "--background", "--python", str(blender_script)],
                capture_output=True,
                text=True,
                timeout=300,
            )
            if blender.returncode != 0 or not dae_path.is_file():
                detail = (blender.stderr or blender.stdout).strip()
                raise RuntimeError(f"Blender could not export DAE. {detail}")

            write_sketchup_script(ruby_script, dae_path, output)
            emit({"type": "progress", "message": "Importing Collada and saving SKP with SketchUp"})
            template = resolve_sketchup_template(sketchup_exe)
            sketchup = subprocess.Popen(
                [str(sketchup_exe), str(template), "-RubyStartup", str(ruby_script)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            wait_for_skp(sketchup, output, 600)

        emit({"type": "done", "outputPath": str(output)})
        return 0
    except Exception as error:
        emit({"type": "error", "message": str(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
