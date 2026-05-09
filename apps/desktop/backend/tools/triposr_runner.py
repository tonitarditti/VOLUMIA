import argparse
import os
import subprocess
import sys
from pathlib import Path


def find_entrypoint(root: Path) -> Path | None:
    names = [
        "run.py",
        "infer.py",
        "inference.py",
        "demo.py",
        "main.py",
    ]
    for name in names:
        candidate = root / name
        if candidate.exists():
            return candidate
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a real TripoSR checkout.")
    parser.add_argument("--triposr-dir", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    triposr_dir = Path(args.triposr_dir).resolve()
    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not triposr_dir.exists():
        print(f"TripoSR dir not found: {triposr_dir}", file=sys.stderr)
        return 2
    if not input_path.exists():
        print(f"Input image not found: {input_path}", file=sys.stderr)
        return 2

    entrypoint = find_entrypoint(triposr_dir)
    if not entrypoint:
        print(
            "No TripoSR entrypoint found. Expected run.py, infer.py, inference.py, demo.py or main.py.",
            file=sys.stderr,
        )
        return 3

    command = [
        sys.executable,
        str(entrypoint),
        str(input_path),
        "--output-dir",
        str(output_dir),
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{triposr_dir}{os.pathsep}{env.get('PYTHONPATH', '')}"
    print("Running TripoSR:", " ".join(command), flush=True)
    return subprocess.call(command, cwd=str(triposr_dir), env=env)


if __name__ == "__main__":
    raise SystemExit(main())
