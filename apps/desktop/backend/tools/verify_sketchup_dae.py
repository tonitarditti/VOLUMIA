#!/usr/bin/env python3
"""Import a real DAE into SketchUp and report the groups it creates."""

import argparse
import json
import subprocess
import time
from pathlib import Path


def ruby_quote(value: Path) -> str:
    return str(value).replace("\\", "\\\\").replace('"', '\\"')


def find_template(sketchup_exe: Path) -> Path:
    templates = sorted(sketchup_exe.parent.rglob("Templates/*.skp"))
    if not templates:
        raise RuntimeError("No se encontró una plantilla SKP para la prueba.")
    return templates[0]


def write_ruby(path: Path, dae: Path, output: Path, report: Path) -> None:
    path.write_text(
        "require 'json'\n"
        "def count_containers(entities)\n"
        "  entities.sum do |entity|\n"
        "    nested = entity.respond_to?(:entities) ? count_containers(entity.entities) : 0\n"
        "    ((entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)) ? 1 : 0) + nested\n"
        "  end\n"
        "end\n"
        "model = Sketchup.active_model\n"
        "before = model.entities.to_a\n"
        f"ok = model.import(\"{ruby_quote(dae)}\")\n"
        "created = model.entities.to_a - before\n"
        "report = { imported: ok, rootEntities: created.length, containers: count_containers(created) }\n"
        f"File.write(\"{ruby_quote(report)}\", JSON.generate(report))\n"
        f"model.save(\"{ruby_quote(output)}\") if ok\n"
        "Sketchup.quit\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dae", required=True)
    parser.add_argument("--sketchup-exe", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    dae = Path(args.dae).resolve()
    sketchup = Path(args.sketchup_exe).resolve()
    output = Path(args.output).resolve()
    report = Path(args.report).resolve()
    if not dae.is_file() or not sketchup.is_file():
        raise RuntimeError("El DAE o SketchUp.exe no existe.")
    output.parent.mkdir(parents=True, exist_ok=True)
    ruby = report.with_suffix(".rb")
    write_ruby(ruby, dae, output, report)
    process = subprocess.Popen([str(sketchup), str(find_template(sketchup)), "-RubyStartup", str(ruby)])
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        if report.is_file() and output.is_file() and output.stat().st_size > 0:
            print(json.dumps(json.loads(report.read_text(encoding="utf-8"))), flush=True)
            return 0
        if process.poll() is not None:
            break
        time.sleep(1)
    if process.poll() is None:
        process.kill()
    raise RuntimeError("SketchUp no generó el informe de importación DAE.")


if __name__ == "__main__":
    raise SystemExit(main())
