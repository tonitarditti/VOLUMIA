#!/usr/bin/env python3
import argparse
from pathlib import Path
from PIL import Image, ImageChops
import sys


def has_transparency(img: Image.Image) -> bool:
    if img.mode in ("RGBA", "LA"):
        extrema = img.split()[-1].getextrema()
        return extrema[0] < 255
    return False


def crop_by_alpha(img: Image.Image):
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    return img.crop(bbox) if bbox else img


def crop_by_bg_color(img: Image.Image, thresh=250):
    # Convert to grayscale and find bbox of pixels below threshold
    gray = img.convert("L")
    # create binary mask where pixels are "object" (below thresh)
    mask = gray.point(lambda p: 255 if p < thresh else 0)
    bbox = mask.getbbox()
    return img.crop(bbox) if bbox else img


def center_on_square_canvas(img: Image.Image, canvas_size=1024, margin_frac=0.12, bg=(0,0,0,0)):
    # img assumed RGBA
    w, h = img.size
    max_dim = max(w, h)
    margin = int(max_dim * margin_frac)
    target_size = max_dim + margin * 2
    # ensure at least small padding
    target_size = max(target_size, 16)
    # scale down/up to fit into canvas_size - but preserve aspect
    scale = canvas_size / target_size
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    img_resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), bg)
    left = (canvas_size - new_w) // 2
    top = (canvas_size - new_h) // 2
    canvas.paste(img_resized, (left, top), img_resized)
    return canvas


def try_rembg(img_bytes: bytes):
    try:
        from rembg import remove
        import io
        out = remove(io.BytesIO(img_bytes).read())
        # rembg returns bytes of PNG
        return Image.open(io.BytesIO(out)).convert("RGBA")
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="Preprocess image for TripoSR")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--debug-output", required=False)
    parser.add_argument("--no-rembg", action="store_true")
    args = parser.parse_args()

    inp = Path(args.input)
    out = Path(args.output)
    debug_out = Path(args.debug_output) if args.debug_output else None

    if not inp.exists():
        print(f"[preprocess] input not found: {inp}", file=sys.stderr)
        return 2

    try:
        img = Image.open(inp).convert("RGBA")
        original_size = img.size

        used_rembg = False
        if not args.no_rembg:
            try:
                rembg_res = try_rembg(inp.read_bytes())
                if rembg_res is not None:
                    img = rembg_res
                    used_rembg = True
            except Exception:
                # ignore rembg failures
                used_rembg = False

        if has_transparency(img):
            cropped = crop_by_alpha(img)
        else:
            # try to crop by near-white background
            cropped = crop_by_bg_color(img, thresh=250)

        # ensure RGBA
        cropped = cropped.convert("RGBA")

        # center on square canvas and resize
        canvas = center_on_square_canvas(cropped, canvas_size=1024, margin_frac=0.12, bg=(0,0,0,0))

        # save
        out.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(out, format="PNG")

        if debug_out:
            debug_out.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(debug_out / "input_clean_debug.png", format="PNG")

        print(f"[preprocess] OK input={inp} original_size={original_size} output={out} output_size={canvas.size} rembg_used={used_rembg}")
        return 0
    except Exception as e:
        print(f"[preprocess] ERROR: {e}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
