import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Meshroom runner placeholder.")
    parser.add_argument("--meshroom-dir", required=True)
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    meshroom_dir = Path(args.meshroom_dir).resolve()
    if not meshroom_dir.exists():
        print(f"Meshroom dir not found: {meshroom_dir}", file=sys.stderr)
        return 2
    print(
        "Meshroom is configured, but no concrete CLI graph has been mapped yet. "
        "Add the project-specific command in meshroom_runner.py.",
        file=sys.stderr,
    )
    return 4


if __name__ == "__main__":
    raise SystemExit(main())
