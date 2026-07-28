#!/usr/bin/env python3
# Copyright (c) 2026 HOOX · HOOX · jango-blockchained
# SPDX-License-Identifier: Apache-2.0
"""
Generate pure centered-logo brand assets (first kit style).

- Official HOOX mark only (no product name wordmark)
- Centered logo, flat bg, micro-grid, mono noise, soft outline glow
- Max 2 corner brackets (TL + BR)
- Colors: dark | orange | white

Usage:
  python3 brand/generate-centered.py
  python3 brand/generate-centered.py --raster   # also write PNGs via rsvg-convert
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SVG_DIR = ROOT / "svg"
PNG_DIR = ROOT / "png"

D_PATHS = [
    "m 1024.04,675.876 c 9.61,8.797 21.53,21.439 30.93,30.842 l 60.92,60.911 64.67,-64.663 119.79,-0.021 65.02,64.909 -65.07,65.008 -119.48,0.035 c -21.7,-21.207 -43.47,-43.36 -64.98,-64.832 l -91.24,91.236 c -5.86,-2.803 -80.868,-79.926 -92.266,-91.298 l -64.893,64.883 -119.277,-0.045 -65.117,-65.099 64.831,-64.765 119.814,-0.031 64.627,64.595 z",
    "m 1232.94,467.045 92.02,10e-4 v 91.811 c -26.49,27.819 -56.93,57.065 -84.22,84.402 -24.41,1.422 -66.03,0.153 -92.08,0.169 l -0.01,-92.172 z",
    "m 807.882,892.19 91.983,-0.005 -0.021,91.784 c -27.549,28.221 -56.511,56.651 -84.537,84.501 -29.899,0.53 -61.821,0.03 -91.855,0.03 l -0.006,-92.147 c 27.99,-28.21 56.136,-56.265 84.436,-84.163 z",
    "m 723.569,467.027 91.556,0.002 c 28.133,26.948 57.059,56.938 84.669,84.614 l 0.052,91.703 -92.108,0.075 -84.298,-84.317 z",
    "m 1148.68,892.158 91.71,-0.025 84.61,84.679 -0.01,91.668 c -30.37,0.36 -61.52,0.06 -91.94,0.09 l -84.38,-84.377 z",
]
CX, CY = 752.68055, 665.3929

# Curated sizes only (no nonsense)
SPECS = [
    # name, w, h, style: icon | centered | watermark
    ("og-1200x630", 1200, 630, "centered"),
    ("twitter-header-1500x500", 1500, 500, "centered"),
    ("linkedin-banner-1584x396", 1584, 396, "centered"),
    ("github-social-1280x640", 1280, 640, "centered"),
    ("blog-hero-1600x900", 1600, 900, "centered"),
    ("youtube-channel-2560x1440", 2560, 1440, "centered"),
    ("discord-banner-960x540", 960, 540, "centered"),
    ("email-header-600x200", 600, 200, "centered"),
    ("profile-1024", 1024, 1024, "icon"),
    ("profile-512", 512, 512, "icon"),
    ("app-icon-512", 512, 512, "icon"),
    ("app-icon-192", 192, 192, "icon"),
    ("slack-500", 500, 500, "icon"),
    ("wallpaper-1920x1080", 1920, 1080, "watermark"),
    ("wallpaper-2560x1440", 2560, 1440, "watermark"),
]

VARIANTS = ("dark", "orange", "white")


def theme(variant: str) -> dict:
    if variant == "orange":
        return dict(
            bg="#F97316",
            grid="#000000",
            grid_op=0.09,  # mid: was 0.06 → 0.14 → now 0.09
            fill="#FFFFFF",
            stroke="#FFFFFF",
            bracket="#FFFFFF",
            noise_rgb=0,
            noise_a=0.08,
            bracket_op=0.35,
        )
    if variant == "white":
        return dict(
            bg="#FAFAFA",
            grid="#0A0A0A",
            grid_op=0.08,  # mid: was 0.05 → 0.12 → now 0.08
            fill="#0A0A0A",
            stroke="#0A0A0A",
            bracket="#0A0A0A",
            noise_rgb=0,
            noise_a=0.05,
            bracket_op=0.28,
        )
    return dict(
        bg="#050505",
        grid="#FFFFFF",
        grid_op=0.07,  # mid: was 0.04 → 0.11 → now 0.07
        fill="#F5F5F5",
        stroke="#FFFFFF",
        bracket="#FFFFFF",
        noise_rgb=1,
        noise_a=0.07,
        bracket_op=0.28,
    )


def mark_paths(fill: str, stroke: str | None = None, stroke_w: float = 0, stroke_opacity: float = 1) -> str:
    attrs = f'fill="{fill}"'
    if stroke and stroke_w:
        attrs += (
            f' stroke="{stroke}" stroke-width="{stroke_w}" '
            f'stroke-opacity="{stroke_opacity}" stroke-linejoin="round" stroke-linecap="round"'
        )
    return "\n".join(f'      <path {attrs} d="{d}"/>' for d in D_PATHS)


def logo_stack(scale: float, cx: float, cy: float, *, fill: str, stroke: str, outline_w: float) -> str:
    glow = f"""    <g filter="url(#edgeGlow)" opacity="0.92">
{mark_paths("none", stroke=stroke, stroke_w=outline_w * 2.6, stroke_opacity=1)}
    </g>"""
    body = f"""    <g>
{mark_paths(fill)}
    </g>"""
    rim = f"""    <g>
{mark_paths("none", stroke=stroke, stroke_w=outline_w, stroke_opacity=0.9)}
    </g>"""
    return f"""  <g transform="translate({cx},{cy}) scale({scale}) translate({-CX},{-CY})">
    <g transform="matrix(2.2062294,0,0,2.2117592,-1506.9584,-1032.9513)">
{glow}
{body}
{rim}
    </g>
  </g>"""


def brackets(w: int, h: int, color: str, op: float) -> str:
    t = max(12, int(min(w, h) * 0.022))
    arm = max(14, int(min(w, h) * 0.032))
    return f"""  <g stroke="{color}" stroke-width="1.25" opacity="{op}" fill="none" stroke-linecap="square">
    <path d="M {t} {t+arm} V {t} H {t+arm}"/>
    <path d="M {w-t} {h-t-arm} V {h-t} H {w-t-arm}"/>
  </g>"""


def make_svg(w: int, h: int, *, variant: str, style: str) -> str:
    t = theme(variant)
    m = min(w, h)
    if style == "icon":
        logo_frac = 0.70
        outline_w = 2.2
    elif style == "watermark":
        logo_frac = 0.32
        outline_w = 1.6
    else:
        logo_frac = 0.48 if h / max(w, 1) < 0.45 else 0.42
        outline_w = 1.8

    logo_px = m * logo_frac
    s = logo_px / 1400
    cx, cy = w * 0.5, h * 0.5

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" version="1.1">
  <defs>
    <pattern id="micro" width="5" height="5" patternUnits="userSpaceOnUse">
      <path d="M 5 0 L 0 0 0 5" fill="none" stroke="{t["grid"]}" stroke-opacity="{t["grid_op"]}" stroke-width="0.52"/>
    </pattern>
    <pattern id="major" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="{t["grid"]}" stroke-opacity="{min(t["grid_op"] * 1.35, 0.18):.3f}" stroke-width="0.6"/>
    </pattern>
    <filter id="monoNoise" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="11" stitchTiles="stitch" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 0 {t["noise_rgb"]}
                0 0 0 0 {t["noise_rgb"]}
                0 0 0 0 {t["noise_rgb"]}
                0 0 0 {t["noise_a"]} 0"/>
    </filter>
    <filter id="edgeGlow" x="-70%" y="-70%" width="240%" height="240%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b0"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="b1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="b2"/>
      <feMerge>
        <feMergeNode in="b2"/>
        <feMergeNode in="b1"/>
        <feMergeNode in="b0"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="{w}" height="{h}" fill="{t["bg"]}"/>
  <rect width="{w}" height="{h}" fill="url(#micro)"/>
  <rect width="{w}" height="{h}" fill="url(#major)"/>
  <rect width="{w}" height="{h}" filter="url(#monoNoise)"/>
{brackets(w, h, t["bracket"], t["bracket_op"])}
{logo_stack(s, cx, cy, fill=t["fill"], stroke=t["stroke"], outline_w=outline_w)}
</svg>
"""


def write_transparent_marks() -> list[str]:
    """Overlay marks (no bg) — useful, no wordmark."""
    out = []
    s = (1024 * 0.70) / 1400
    for fill, name in (
        ("#FFFFFF", "mark-white-transparent-1024"),
        ("#F97316", "mark-orange-transparent-1024"),
        ("#0A0A0A", "mark-black-transparent-1024"),
    ):
        svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" version="1.1">
  <g transform="translate(512,512) scale({s}) translate({-CX},{-CY})">
    <g transform="matrix(2.2062294,0,0,2.2117592,-1506.9584,-1032.9513)">
{mark_paths(fill)}
    </g>
  </g>
</svg>
"""
        path = SVG_DIR / f"{name}.svg"
        path.write_text(svg)
        out.append(name)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raster", action="store_true", help="Also write PNGs with rsvg-convert")
    args = ap.parse_args()

    SVG_DIR.mkdir(parents=True, exist_ok=True)
    PNG_DIR.mkdir(parents=True, exist_ok=True)

    names: list[str] = []
    for base, w, h, style in SPECS:
        for variant in VARIANTS:
            name = f"{base}-{variant}"
            (SVG_DIR / f"{name}.svg").write_text(make_svg(w, h, variant=variant, style=style))
            names.append(name)

    names.extend(write_transparent_marks())
    print(f"Wrote {len(names)} centered-logo SVGs → {SVG_DIR}")

    if args.raster:
        ok = 0
        for name in names:
            src = SVG_DIR / f"{name}.svg"
            dst = PNG_DIR / f"{name}.png"
            try:
                subprocess.run(
                    ["rsvg-convert", "-o", str(dst), str(src)],
                    check=True,
                    capture_output=True,
                )
                ok += 1
            except (subprocess.CalledProcessError, FileNotFoundError) as e:
                print(f"FAIL {name}: {e}", file=sys.stderr)
        print(f"Rasterized {ok}/{len(names)} PNGs → {PNG_DIR}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
