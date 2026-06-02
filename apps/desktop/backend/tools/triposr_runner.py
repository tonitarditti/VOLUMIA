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

    # Preprocess input image using backend script (non-fatal)
    try:
        script_path = Path(__file__).resolve().parent.parent / "scripts" / "preprocess_triposr_input.py"
        clean_path = input_path.parent / "input_clean.png"
        debug_dir = output_dir
        if script_path.exists():
            print(f"[preprocess] Running preprocess script: {script_path}", flush=True)
            pre_cmd = [sys.executable, str(script_path), "--input", str(input_path), "--output", str(clean_path), "--debug-output", str(debug_dir)]
            pre_env = os.environ.copy()
            pre_proc = subprocess.run(pre_cmd, cwd=str(script_path.parent), env=pre_env)
            if pre_proc.returncode == 0 and clean_path.exists():
                print(f"[preprocess] OK original={input_path} preprocessed={clean_path}", flush=True)
                used_input = clean_path
            else:
                print(f"[preprocess] WARNING preprocessing failed (code={pre_proc.returncode}), continuing with original image", file=sys.stderr, flush=True)
                used_input = input_path
        else:
            print(f"[preprocess] script not found: {script_path}, skipping preprocessing", flush=True)
            used_input = input_path
    except Exception as e:
        print(f"[preprocess] ERROR: {e}, continuing with original image", file=sys.stderr, flush=True)
        used_input = input_path

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
        str(used_input),
        "--output-dir",
        str(output_dir),
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{triposr_dir}{os.pathsep}{env.get('PYTHONPATH', '')}"
    print("Running TripoSR:", " ".join(command), "--output-dir", str(output_dir), flush=True)
    return subprocess.call(command, cwd=str(triposr_dir), env=env)


if __name__ == "__main__":
    raise SystemExit(main())
