import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Hunyuan3D runner placeholder.")
    parser.add_argument("--hunyuan-dir", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    hunyuan_dir = Path(args.hunyuan_dir).resolve()
    if not hunyuan_dir.exists():
        print(f"Hunyuan3D dir not found: {hunyuan_dir}", file=sys.stderr)
        return 2
    print(
        "Hunyuan3D is configured, but no concrete CLI entrypoint has been mapped yet. "
        "Add the project-specific command in hunyuan_runner.py.",
        file=sys.stderr,
    )
    return 4


if __name__ == "__main__":
    raise SystemExit(main())
