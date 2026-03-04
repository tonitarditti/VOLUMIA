from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover - optional dependency fallback
    cv2 = None


@dataclass(frozen=True)
class MaterialTextureSet:
    base_color: Image.Image
    normal: Image.Image
    roughness: Image.Image
    ao: Image.Image | None
    metalness: Image.Image | None
    roughness_default: float


def infer_material_category(material_name: str) -> str:
    lower = material_name.lower()
    if "metal" in lower:
        return "metal"
    if "wood" in lower:
        return "wood"
    if "fabric" in lower or "rug" in lower or "curtain" in lower:
        return "fabric"
    if "stone" in lower:
        return "stone"
    if "glass" in lower:
        return "glass"
    if "emissive" in lower:
        return "emissive"
    return "generic"


def _to_float01(image_rgb: np.ndarray) -> np.ndarray:
    return np.asarray(image_rgb, dtype=np.float32) / 255.0


def _to_uint8(image_float: np.ndarray) -> np.ndarray:
    return np.clip(image_float * 255.0, 0.0, 255.0).astype(np.uint8)


def _gamma_to_linear(image_float: np.ndarray) -> np.ndarray:
    return np.clip(image_float, 0.0, 1.0) ** 2.2


def _linear_to_gamma(image_float: np.ndarray) -> np.ndarray:
    return np.clip(image_float, 0.0, 1.0) ** (1.0 / 2.2)


def _gray_world(image_linear: np.ndarray) -> np.ndarray:
    means = image_linear.reshape(-1, 3).mean(axis=0) + 1e-6
    target = float(np.mean(means))
    scale = np.clip(target / means, 0.72, 1.35)
    return np.clip(image_linear * scale[None, None, :], 0.0, 1.0)


def _gentle_contrast(image_linear: np.ndarray) -> np.ndarray:
    luminance = np.dot(image_linear, np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))
    mean = float(np.mean(luminance))
    std = float(np.std(luminance))
    gain = 1.0 if std <= 0.02 else float(np.clip(0.18 / std, 0.85, 1.2))
    shifted = (image_linear - mean) * gain + mean
    return np.clip(shifted, 0.0, 1.0)


def _make_tileable(image_linear: np.ndarray) -> np.ndarray:
    h, w = image_linear.shape[:2]
    shifted = np.roll(np.roll(image_linear, h // 2, axis=0), w // 2, axis=1)

    seam_x = max(2, w // 28)
    seam_y = max(2, h // 28)
    seam_mask = np.zeros((h, w), dtype=np.float32)
    seam_mask[:, w // 2 - seam_x : w // 2 + seam_x] = 1.0
    seam_mask[h // 2 - seam_y : h // 2 + seam_y, :] = 1.0

    if cv2 is not None:
        seam_mask = cv2.GaussianBlur(seam_mask, (0, 0), sigmaX=max(1.5, w / 50), sigmaY=max(1.5, h / 50))
        smoothed = cv2.GaussianBlur(shifted, (0, 0), sigmaX=max(1.2, w / 80), sigmaY=max(1.2, h / 80))
    else:
        sigma = max(1, w // 60)
        from PIL import ImageFilter

        seam_mask = np.asarray(Image.fromarray((seam_mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(sigma))) / 255.0
        smoothed = shifted

    seam_mask = np.clip(seam_mask[..., None], 0.0, 1.0)
    blended = shifted * (1.0 - seam_mask) + smoothed * seam_mask
    return np.roll(np.roll(blended, -(h // 2), axis=0), -(w // 2), axis=1)


def _sobel(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if cv2 is not None:
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        return gx, gy

    gy, gx = np.gradient(gray)
    return gx.astype(np.float32), gy.astype(np.float32)


def _normalize(values: np.ndarray) -> np.ndarray:
    min_v = float(values.min())
    max_v = float(values.max())
    span = max_v - min_v
    if span <= 1e-6:
        return np.zeros_like(values, dtype=np.float32)
    return (values - min_v) / span


def _box_blur(gray: np.ndarray, radius: int) -> np.ndarray:
    if cv2 is not None:
        k = max(3, radius * 2 + 1)
        return cv2.GaussianBlur(gray.astype(np.float32), (k, k), 0)

    accum = np.zeros_like(gray, dtype=np.float32)
    count = 0
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            accum += np.roll(np.roll(gray, dy, axis=0), dx, axis=1)
            count += 1
    return accum / max(1, count)


def _material_base_tint(category: str) -> np.ndarray:
    palette = {
        "metal": np.array([0.62, 0.63, 0.67], dtype=np.float32),
        "wood": np.array([0.67, 0.52, 0.39], dtype=np.float32),
        "fabric": np.array([0.66, 0.62, 0.58], dtype=np.float32),
        "stone": np.array([0.64, 0.63, 0.61], dtype=np.float32),
        "glass": np.array([0.7, 0.78, 0.82], dtype=np.float32),
        "emissive": np.array([0.9, 0.84, 0.68], dtype=np.float32),
        "generic": np.array([0.64, 0.6, 0.55], dtype=np.float32),
    }
    return palette.get(category, palette["generic"])


def _neutral_source(size: int, category: str) -> np.ndarray:
    tint = _material_base_tint(category)
    noise = np.random.default_rng(127 + size).normal(0, 0.03, size=(size, size, 3)).astype(np.float32)
    return np.clip(tint[None, None, :] + noise, 0.0, 1.0)


def _prepare_base(source_rgb: np.ndarray, size: int, category: str) -> np.ndarray:
    image = Image.fromarray(source_rgb, mode="RGB").resize((size, size), Image.Resampling.LANCZOS)
    base = _to_float01(np.asarray(image, dtype=np.uint8))
    linear = _gamma_to_linear(base)
    balanced = _gray_world(linear)
    contrasted = _gentle_contrast(balanced)
    tileable = _make_tileable(contrasted)
    if category == "emissive":
        tileable = np.clip(tileable * 1.1, 0.0, 1.0)
    return tileable


def _normal_from_base(base_linear: np.ndarray, normal_strength: float) -> np.ndarray:
    gray = np.dot(base_linear, np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))
    high_pass = gray - _box_blur(gray, radius=3)
    gx, gy = _sobel(high_pass)
    scale = 1.5 + float(np.clip(normal_strength, 0.0, 1.0)) * 4.5
    nx = -gx * scale
    ny = -gy * scale
    nz = np.ones_like(nx, dtype=np.float32)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-6
    normal = np.stack((nx / norm, ny / norm, nz / norm), axis=-1)
    return np.clip((normal * 0.5) + 0.5, 0.0, 1.0)


def _roughness_from_base(base_linear: np.ndarray, roughness_hint: float) -> tuple[np.ndarray, float]:
    luminance = np.dot(base_linear, np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))
    mean = _box_blur(luminance, radius=2)
    variance = _box_blur((luminance - mean) ** 2, radius=2)
    variance_norm = _normalize(variance)

    # Higher variance -> lower roughness (more spec response), then clamp to valid target.
    roughness = np.clip(0.9 - variance_norm * 0.55, 0.2, 0.9)
    roughness = np.clip(roughness * 0.7 + float(np.clip(roughness_hint, 0.2, 0.9)) * 0.3, 0.2, 0.9)
    return roughness, float(np.mean(roughness))


def _ao_from_base(base_linear: np.ndarray) -> np.ndarray:
    gray = np.dot(base_linear, np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))
    blurred = _box_blur(gray, radius=6)
    ao = np.clip(1.0 - _normalize(blurred), 0.0, 1.0)
    return np.clip(ao * 0.8 + 0.2, 0.0, 1.0)


def _metalness_map(category: str, size: int) -> np.ndarray:
    value = 1.0 if category == "metal" else 0.0
    return np.full((size, size), value, dtype=np.float32)


def extract_material_texture_set(
    source_image: np.ndarray,
    material_name: str,
    texture_size: int,
    roughness_hint: float,
    normal_strength: float,
) -> MaterialTextureSet:
    category = infer_material_category(material_name)
    base_linear = _prepare_base(source_image, texture_size, category=category)
    base_gamma = _linear_to_gamma(base_linear)

    normal = _normal_from_base(base_linear, normal_strength=normal_strength)
    roughness, roughness_default = _roughness_from_base(base_linear, roughness_hint=roughness_hint)
    ao = _ao_from_base(base_linear)
    metalness = _metalness_map(category, texture_size)

    return MaterialTextureSet(
        base_color=Image.fromarray(_to_uint8(base_gamma), mode="RGB"),
        normal=Image.fromarray(_to_uint8(normal), mode="RGB"),
        roughness=Image.fromarray(_to_uint8(np.stack([roughness] * 3, axis=-1)), mode="RGB").convert("L"),
        ao=Image.fromarray(_to_uint8(np.stack([ao] * 3, axis=-1)), mode="RGB").convert("L"),
        metalness=Image.fromarray(_to_uint8(np.stack([metalness] * 3, axis=-1)), mode="RGB").convert("L"),
        roughness_default=roughness_default,
    )


def build_neutral_material_texture_set(
    material_name: str,
    texture_size: int,
    roughness_hint: float,
    normal_strength: float,
) -> MaterialTextureSet:
    category = infer_material_category(material_name)
    neutral = _neutral_source(texture_size, category)
    source_u8 = _to_uint8(neutral)
    return extract_material_texture_set(
        source_u8,
        material_name=material_name,
        texture_size=texture_size,
        roughness_hint=roughness_hint,
        normal_strength=normal_strength,
    )
