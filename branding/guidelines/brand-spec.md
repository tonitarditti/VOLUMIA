# VOLUMIA Brand Spec

## Intent
VOLUMIA visual identity is built for premium architectural software:
- spatial intelligence
- 3D generation
- volumetric reasoning
- controlled precision

The icon language is a 3D **V**:
- left side: solid geometric mass (architectural certainty)
- right side: parametric mesh surface (generative intelligence)

## Visual Direction
- sober, technical, premium
- dark-first product mood
- high legibility
- restrained highlights
- no gamer aesthetics and no generic AI neon look

## Core Rules
1. Use **Graphite Black** as dark-mode base.
2. Use **Technical Grey** for secondary text and structural UI lines.
3. Use accent colors in controlled hierarchy:
   - Neural Blue for primary actions
   - Digital Cyan for live/system-ready highlights
   - Deep Learning Violet for generative emphasis and secondary accent
4. Keep glow only for splash/hero/loading/generation highlights.
5. Maintain clean spacing and architectural alignment.

## Logo Usage
- Preferred app header logo: `volumia-logo-horizontal-dark.svg` on dark surfaces.
- Use `volumia-logo-horizontal-light.svg` on light surfaces.
- Use monochrome logo when color is constrained.
- Icon-only usage: navigation rails, compact badges, app icon assets.

## Asset Paths
- `branding/logo/volumia-icon-final.svg`
- `branding/logo/volumia-icon-final-1024.png`
- `branding/logo/volumia-logo-horizontal-dark.svg`
- `branding/logo/volumia-logo-horizontal-light.svg`
- `branding/logo/volumia-logo-monochrome.svg`

## Packaging Note
- Current Electron build uses `public/assets/branding/icon.png`.
- For full release parity across all targets, also generate:
  - `icon.ico` (Windows)
  - `icon.icns` (macOS)
