from __future__ import annotations

from typing import Any

import numpy as np

PrimitiveRecipe = dict[str, Any]
ComponentRecipes = dict[str, list[PrimitiveRecipe]]


def _box(bounds: tuple[float, float, float, float, float, float]) -> PrimitiveRecipe:
    return {"type": "box", "bounds": bounds}


def _cylinder(
    radius_ratio: float,
    height_ratio: float,
    center_ratio: tuple[float, float, float],
) -> PrimitiveRecipe:
    return {
        "type": "cylinder",
        "radiusRatio": radius_ratio,
        "heightRatio": height_ratio,
        "centerRatio": center_ratio,
    }


def _cone(
    radius_ratio: float,
    height_ratio: float,
    center_ratio: tuple[float, float, float],
) -> PrimitiveRecipe:
    return {
        "type": "cone",
        "radiusRatio": radius_ratio,
        "heightRatio": height_ratio,
        "centerRatio": center_ratio,
    }


def _truncated_cone(
    base_radius_ratio: float,
    top_radius_ratio: float,
    height_ratio: float,
    center_ratio: tuple[float, float, float],
) -> PrimitiveRecipe:
    return {
        "type": "truncated_cone",
        "baseRadiusRatio": base_radius_ratio,
        "topRadiusRatio": top_radius_ratio,
        "heightRatio": height_ratio,
        "centerRatio": center_ratio,
    }


def _sphere(radius_ratio: float, center_ratio: tuple[float, float, float]) -> PrimitiveRecipe:
    return {"type": "sphere", "radiusRatio": radius_ratio, "centerRatio": center_ratio}


def _lathe(profile: list[tuple[float, float]]) -> PrimitiveRecipe:
    return {"type": "lathe", "profile": profile}


def _hfloat(heuristics: dict[str, object], key: str, default: float) -> float:
    value = heuristics.get(key, default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _hbool(heuristics: dict[str, object], key: str, default: bool = False) -> bool:
    value = heuristics.get(key, default)
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.lower() in {"1", "true", "yes", "on"}
    return default


def _hprofile(heuristics: dict[str, object], key: str) -> list[tuple[float, float]] | None:
    value = heuristics.get(key)
    if not isinstance(value, list):
        return None
    profile: list[tuple[float, float]] = []
    for item in value:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            continue
        try:
            radius = float(item[0])
            height = float(item[1])
        except (TypeError, ValueError):
            continue
        profile.append((radius, height))
    return profile if len(profile) >= 4 else None


def build_component_recipes(
    preset_id: str,
    component_names: list[str],
    quality: str,
    heuristics: dict[str, object],
) -> ComponentRecipes:
    recipes: ComponentRecipes = {}
    depth_ratio = _hfloat(heuristics, "depth_ratio", 0.6)
    seat_ratio = _hfloat(heuristics, "seat_height_ratio", 0.45)
    drawer_hint = _hbool(heuristics, "drawer_hint", False)
    back_profile = _hfloat(heuristics, "back_profile", 0.35)
    top_width_ratio = _hfloat(heuristics, "top_width_ratio", 0.62)
    mid_width_ratio = _hfloat(heuristics, "mid_width_ratio", 0.78)
    bottom_width_ratio = _hfloat(heuristics, "bottom_width_ratio", 0.66)
    silhouette_fill = _hfloat(heuristics, "silhouette_fill", 0.52)

    if preset_id == "chair-stool":
        seat_depth = float(min(0.88, max(0.5, 0.52 + depth_ratio * 0.34)))
        seat_half_width = float(np.clip(0.28 + mid_width_ratio * 0.22, 0.28, 0.42))
        seat_y0 = float(np.clip(seat_ratio - 0.05, 0.28, 0.52))
        seat_y1 = float(np.clip(seat_ratio + 0.06, 0.38, 0.62))
        back_depth = float(np.clip(0.06 + (1.0 - top_width_ratio) * 0.12, 0.04, 0.2))
        back_width_half = float(np.clip(0.24 + top_width_ratio * 0.16, 0.22, 0.4))
        leg_as_box = quality == "low"
        leg_height = float(np.clip(seat_y0 - 0.04, 0.18, 0.5))
        recipes["OBJ_Seat"] = [_box((0.5 - seat_half_width, 0.5 + seat_half_width, seat_y0, seat_y1, 0.1, seat_depth))]
        recipes["OBJ_Backrest"] = [
            _box(
                (
                    0.5 - back_width_half,
                    0.5 + back_width_half,
                    seat_y1 - 0.01,
                    0.95,
                    back_depth,
                    back_depth + 0.12 + back_profile * 0.08,
                )
            )
        ]
        if leg_as_box:
            recipes["OBJ_Legs"] = [
                _box((0.12, 0.2, 0.0, leg_height, 0.14, 0.24)),
                _box((0.8, 0.88, 0.0, leg_height, 0.14, 0.24)),
                _box((0.12, 0.2, 0.0, leg_height, seat_depth - 0.14, seat_depth - 0.04)),
                _box((0.8, 0.88, 0.0, leg_height, seat_depth - 0.14, seat_depth - 0.04)),
            ]
        else:
            recipes["OBJ_Legs"] = [
                _cylinder(0.035, leg_height, (-0.36, leg_height * 0.5, -0.3)),
                _cylinder(0.035, leg_height, (0.36, leg_height * 0.5, -0.3)),
                _cylinder(0.035, leg_height, (-0.36, leg_height * 0.5, 0.3)),
                _cylinder(0.035, leg_height, (0.36, leg_height * 0.5, 0.3)),
            ]
        recipes["OBJ_Frame"] = [_box((0.16, 0.84, seat_y0 - 0.06, seat_y0 - 0.01, 0.18, seat_depth - 0.05))]
        recipes["OBJ_Hardware"] = [_box((0.45, 0.55, seat_ratio + 0.02, seat_ratio + 0.04, 0.12, 0.16))]

    elif preset_id == "table-desk":
        top_thickness = float(np.clip(0.03 + (1.0 - silhouette_fill) * 0.06, 0.03, 0.08))
        top_y1 = float(np.clip(0.84 + (1.0 - seat_ratio) * 0.06, 0.8, 0.9))
        top_y0 = top_y1 - top_thickness
        top_half_width = float(np.clip(0.32 + mid_width_ratio * 0.18, 0.3, 0.45))
        top_depth = float(np.clip(0.52 + depth_ratio * 0.3, 0.48, 0.92))
        leg_as_box = quality == "low"
        recipes["OBJ_Top"] = [_box((0.5 - top_half_width, 0.5 + top_half_width, top_y0, top_y1, 0.5 - top_depth * 0.5, 0.5 + top_depth * 0.5))]
        if leg_as_box:
            recipes["OBJ_Legs"] = [
                _box((0.08, 0.16, 0.0, top_y0 - 0.01, 0.12, 0.2)),
                _box((0.84, 0.92, 0.0, top_y0 - 0.01, 0.12, 0.2)),
                _box((0.08, 0.16, 0.0, top_y0 - 0.01, 0.8, 0.88)),
                _box((0.84, 0.92, 0.0, top_y0 - 0.01, 0.8, 0.88)),
            ]
        else:
            recipes["OBJ_Legs"] = [
                _cylinder(0.03, top_y0, (-0.4, top_y0 * 0.5, -0.35)),
                _cylinder(0.03, top_y0, (0.4, top_y0 * 0.5, -0.35)),
                _cylinder(0.03, top_y0, (-0.4, top_y0 * 0.5, 0.35)),
                _cylinder(0.03, top_y0, (0.4, top_y0 * 0.5, 0.35)),
            ]
        recipes["OBJ_Frame"] = [_box((0.1, 0.9, 0.46, 0.52, 0.14, 0.86))]
        recipes["OBJ_Drawers"] = [_box((0.26, 0.74, 0.56, 0.76, 0.1, 0.26))] if drawer_hint else [_box((0.4, 0.6, 0.57, 0.7, 0.12, 0.22))]
        recipes["OBJ_Hardware"] = [_box((0.46, 0.54, 0.62, 0.67, 0.08, 0.12))]

    elif preset_id == "sofa-textile":
        cushion_count = 3 if (quality == "high" and mid_width_ratio > 0.65) else 2
        seat_boxes = []
        back_boxes = []
        for index in range(cushion_count):
            x0 = 0.12 + index * (0.76 / cushion_count)
            x1 = x0 + (0.76 / cushion_count) - 0.02
            seat_boxes.append(_box((x0, x1, 0.42, 0.64, 0.2, min(0.92, 0.72 + depth_ratio * 0.2))))
            back_boxes.append(_box((x0, x1, 0.62, 0.9, 0.08, 0.28)))
        arm_y0 = float(np.clip(0.34 + (1.0 - top_width_ratio) * 0.08, 0.32, 0.45))
        recipes["OBJ_Frame"] = [_box((0.08, 0.92, 0.12, 0.46, 0.12, 0.9))]
        recipes["OBJ_Cushions_Seat"] = seat_boxes
        recipes["OBJ_Cushions_Back"] = back_boxes
        recipes["OBJ_Arms"] = [
            _box((0.06, 0.18, arm_y0, 0.76, 0.14, 0.9)),
            _box((0.82, 0.94, arm_y0, 0.76, 0.14, 0.9)),
        ]
        if quality == "low":
            recipes["OBJ_Legs"] = [
                _box((0.14, 0.2, 0.0, 0.1, 0.16, 0.24)),
                _box((0.8, 0.86, 0.0, 0.1, 0.16, 0.24)),
                _box((0.14, 0.2, 0.0, 0.1, 0.76, 0.84)),
                _box((0.8, 0.86, 0.0, 0.1, 0.76, 0.84)),
            ]
        else:
            recipes["OBJ_Legs"] = [
                _cylinder(0.026, 0.1, (-0.35, 0.05, -0.32)),
                _cylinder(0.026, 0.1, (0.35, 0.05, -0.32)),
                _cylinder(0.026, 0.1, (-0.35, 0.05, 0.32)),
                _cylinder(0.026, 0.1, (0.35, 0.05, 0.32)),
            ]
        recipes["OBJ_Hardware"] = [_box((0.44, 0.56, 0.1, 0.15, 0.42, 0.58))]

    elif preset_id == "lighting":
        base_radius = float(np.clip(0.2 + mid_width_ratio * 0.22, 0.2, 0.42))
        top_radius = float(np.clip(base_radius * (0.45 + top_width_ratio * 0.35), 0.08, base_radius * 0.95))
        body_radius = float(np.clip(0.06 + (1.0 - top_width_ratio) * 0.05, 0.055, 0.11))
        recipes["OBJ_Shade"] = [_truncated_cone(base_radius, top_radius, 0.34, (0.0, 0.83, 0.0))]
        recipes["OBJ_Body"] = [_cylinder(body_radius, 0.66, (0.0, 0.41, 0.0))]
        recipes["OBJ_Cable"] = [_cylinder(0.016, 0.32, (0.0, 0.16, 0.0))]
        recipes["OBJ_Bulb"] = [_sphere(0.08, (0.0, 0.66, 0.0))]
        recipes["OBJ_Hardware"] = [_cylinder(0.12, 0.06, (0.0, 0.03, 0.0))]

    elif preset_id == "rug-curtain":
        thickness = float(np.clip(0.012 + (1.0 - silhouette_fill) * 0.024, 0.01, 0.04))
        recipes["OBJ_Main"] = [_box((0.05, 0.95, 0.0, thickness, 0.06, 0.94))]
        fold_count = 4 if (quality == "high" and silhouette_fill > 0.35) else 2
        recipes["OBJ_Folds"] = [_box((0.14 + i * 0.16, 0.22 + i * 0.16, thickness * 0.3, thickness + 0.04, 0.08, 0.92)) for i in range(fold_count)]

    else:  # decor + divider
        profile = _hprofile(heuristics, "lathe_profile")
        if profile is not None:
            recipes["OBJ_Main"] = [_lathe(profile)]
        elif quality == "high":
            body_radius = float(np.clip(0.16 + mid_width_ratio * 0.14, 0.16, 0.32))
            recipes["OBJ_Main"] = [_cylinder(body_radius, 0.82, (0.0, 0.41, 0.0))]
        else:
            body_half = float(np.clip(0.22 + mid_width_ratio * 0.12, 0.2, 0.36))
            recipes["OBJ_Main"] = [_box((0.5 - body_half, 0.5 + body_half, 0.1, 0.9, 0.5 - body_half, 0.5 + body_half))]
        recipes["OBJ_Base"] = [_cylinder(0.22, 0.08, (0.0, 0.04, 0.0))]
        recipes["OBJ_Details"] = [_box((0.32, 0.68, 0.38, 0.7, 0.32, 0.68))]

    # Always keep strict structure order from preset; fill with minimal placeholder if missing.
    strict: ComponentRecipes = {}
    for index, name in enumerate(component_names):
        strict[name] = recipes.get(name, [_box((0.42, 0.58, 0.12 + index * 0.05, 0.18 + index * 0.05, 0.42, 0.58))])
    return strict
