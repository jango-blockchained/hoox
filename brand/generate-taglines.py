#!/usr/bin/env python3
# Copyright (c) 2026 HOOX · HOOX · jango-blockchained
# SPDX-License-Identifier: Apache-2.0
"""
Generate a *small* curated set of tagline banners.

Only keeps variants that are visually cool and useful:
  - Layout: br-bottom (cluster), br-split (opposite corners)
  - Case: ALWAYS UPPERCASE
  - Colors: dark | white | orange (orange only for br-bottom)
  - Sizes: social/hero only (no 1:1 squares, no email/discord/story)

Usage:
  python3 brand/generate-taglines.py
  python3 brand/generate-taglines.py --raster
  python3 brand/generate-taglines.py --clean   # delete non-curated tagline files first
"""
from __future__ import annotations

import argparse
import html
import re
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
FONT = '"IBM Plex Mono", "IBM Plex Mono Medium", "JetBrains Mono", ui-monospace, monospace'

TAGLINES = [
    ("distributed-by-design", "Distributed by design."),
    ("failure-is-local", "Failure is local. Resilience is global."),
    ("faster-everywhere", "Faster. Everywhere."),
]

# Wide/social only — never 1:1 corner layouts
SIZES = [
    ("og-1200x630", 1200, 630),
    ("twitter-1500x500", 1500, 500),
    ("linkedin-1584x396", 1584, 396),
    ("github-1280x640", 1280, 640),
    ("blog-1600x900", 1600, 900),
    ("youtube-2560x1440", 2560, 1440),
]

# Curated only — see README
# (mode, variants) — type is always UPPERCASE
CURATED = [
    ("cluster", ("dark", "white", "orange")),
    ("split", ("dark", "white")),
]

KEEP_RE = re.compile(
    r"^tagline-(distributed-by-design|failure-is-local|faster-everywhere)-"
    r"(og-1200x630|twitter-1500x500|linkedin-1584x396|github-1280x640|blog-1600x900|youtube-2560x1440)-"
    r"(br-bottom|br-split)-(dark|white|orange)\.(svg|png|jpg)$"
)


def theme(variant: str) -> dict:
    if variant == "orange":
        return dict(
            bg="#F97316", grid="#000000", grid_op=0.09,  # mid: 0.06 → 0.14 → 0.09
            text="rgba(255,255,255,0.95)", bracket="#FFFFFF",
            noise_rgb=0, noise_a=0.08, fill="#FFFFFF", stroke="#FFFFFF",
        )
    if variant == "white":
        return dict(
            bg="#FAFAFA", grid="#0A0A0A", grid_op=0.08,  # mid: 0.05 → 0.12 → 0.08
            text="rgba(10,10,10,0.90)", bracket="#0A0A0A",
            noise_rgb=0, noise_a=0.05, fill="#0A0A0A", stroke="#0A0A0A",
        )
    return dict(
        bg="#050505", grid="#FFFFFF", grid_op=0.07,  # mid: 0.04 → 0.11 → 0.07
        text="rgba(245,245,245,0.92)", bracket="#FFFFFF",
        noise_rgb=1, noise_a=0.06, fill="#F5F5F5", stroke="#FFFFFF",
    )


def mark_paths(fill, stroke=None, stroke_w=0, stroke_opacity=1):
    attrs = f'fill="{fill}"'
    if stroke and stroke_w:
        attrs += f' stroke="{stroke}" stroke-width="{stroke_w}" stroke-opacity="{stroke_opacity}" stroke-linejoin="round" stroke-linecap="round"'
    return "\n".join(f'      <path {attrs} d="{d}"/>' for d in D_PATHS)


def logo_stack(scale, cx, cy, *, fill, stroke, outline_w=1.5):
    return f"""  <g transform="translate({cx},{cy}) scale({scale}) translate({-CX},{-CY})">
    <g transform="matrix(2.2062294,0,0,2.2117592,-1506.9584,-1032.9513)">
    <g filter="url(#edgeGlow)" opacity="0.9">
{mark_paths("none", stroke=stroke, stroke_w=outline_w * 2.5, stroke_opacity=1)}
    </g>
    <g>
{mark_paths(fill)}
    </g>
    <g>
{mark_paths("none", stroke=stroke, stroke_w=outline_w, stroke_opacity=0.9)}
    </g>
    </g>
  </g>"""


def defs(t):
    return f"""  <defs>
    <pattern id="micro" width="5" height="5" patternUnits="userSpaceOnUse">
      <path d="M 5 0 L 0 0 0 5" fill="none" stroke="{t["grid"]}" stroke-opacity="{t["grid_op"]}" stroke-width="0.52"/>
    </pattern>
    <pattern id="major" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="{t["grid"]}" stroke-opacity="{min(t["grid_op"] * 1.35, 0.18):.3f}" stroke-width="0.6"/>
    </pattern>
    <filter id="monoNoise" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="1.25" numOctaves="2" seed="17" stitchTiles="stitch" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 0 {t["noise_rgb"]}
                0 0 0 0 {t["noise_rgb"]}
                0 0 0 0 {t["noise_rgb"]}
                0 0 0 {t["noise_a"]} 0"/>
    </filter>
    <filter id="edgeGlow" x="-70%" y="-70%" width="240%" height="240%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b0"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="b1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="b2"/>
      <feMerge>
        <feMergeNode in="b2"/><feMergeNode in="b1"/><feMergeNode in="b0"/><feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>"""


def brackets(w, h, color, op=0.22):
    t = max(12, int(min(w, h) * 0.022))
    arm = max(14, int(min(w, h) * 0.032))
    return f"""  <g stroke="{color}" stroke-width="1" opacity="{op}" fill="none" stroke-linecap="square">
    <path d="M {t} {t+arm} V {t} H {t+arm}"/>
    <path d="M {w-t} {h-t-arm} V {h-t} H {w-t-arm}"/>
  </g>"""


def split_tagline(text, max_chars=40):
    """Split tagline into lines. 'Failure is local…' always uses 2 sentences → 2 lines."""
    # Always two sentences on two lines for the resilience tagline
    if "FAILURE IS LOCAL" in text.upper() and "RESILIENCE IS GLOBAL" in text.upper():
        # normalize to two lines regardless of max_chars
        parts = re.split(r"\.\s+", text.strip().rstrip("."), maxsplit=1)
        if len(parts) == 2:
            return [parts[0].strip() + ".", parts[1].strip().rstrip(".") + "."]
        return ["FAILURE IS LOCAL.", "RESILIENCE IS GLOBAL."]
    if ". " in text:
        a, b = text.split(". ", 1)
        return [a + ".", b]
    if len(text) <= max_chars:
        return [text]
    words, line1, line2, n = text.split(), [], [], 0
    for w in words:
        if n + len(w) + 1 <= max_chars and not line2:
            line1.append(w)
            n += len(w) + 1
        else:
            line2.append(w)
    return [" ".join(line1), " ".join(line2)] if line2 else [" ".join(line1)]


def text_el(lines, x, y, *, size, fill, anchor, tracking, line_gap=1.35):
    parts = []
    for i, line in enumerate(lines):
        dy = "0" if i == 0 else f"{line_gap}em"
        parts.append(f'<tspan x="{x}" dy="{dy}">{html.escape(line)}</tspan>')
    return f"""  <text x="{x}" y="{y}" fill="{fill}" font-family='{FONT}' font-size="{size}" font-weight="500"
        letter-spacing="{tracking * size:.2f}" text-anchor="{anchor}" dominant-baseline="hanging">{"".join(parts)}</text>"""


def banner(w, h, tagline, *, variant, mode):
    assert w != h, "1:1 disabled"
    t = theme(variant)
    display = tagline.upper()  # always uppercase
    m = min(w, h)
    logo_px = m * 0.18
    s = logo_px / 1400
    fs = max(13, min(26, int(h * 0.068)))  # slightly tighter for caps
    tracking = 0.12
    lines = split_tagline(display, max_chars=42 if w >= 1200 else 30)
    text_h = len(lines) * fs * 1.35
    pad_x, pad_y = w * 0.07, h * 0.16
    gap = max(40, int(m * 0.06))

    # always br logo for curated set
    lx = w - pad_x - logo_px * 0.5
    ly = h - pad_y - logo_px * 0.5
    logo_bottom = ly + logo_px * 0.5

    if mode == "split":
        # text top-left
        tx, ty, anchor = pad_x, pad_y, "start"
    else:
        # cluster: text left of logo, right-aligned, bottom-aligned
        tx = w - pad_x - logo_px - gap
        ty = logo_bottom - text_h
        ty = max(pad_y * 0.5, min(ty, h - pad_y - text_h))
        anchor = "end"

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" version="1.1">
{defs(t)}
  <rect width="{w}" height="{h}" fill="{t["bg"]}"/>
  <rect width="{w}" height="{h}" fill="url(#micro)"/>
  <rect width="{w}" height="{h}" fill="url(#major)"/>
  <rect width="{w}" height="{h}" filter="url(#monoNoise)"/>
{brackets(w, h, t["bracket"], 0.2 if variant == "dark" else 0.28)}
{logo_stack(s, lx, ly, fill=t["fill"], stroke=t["stroke"])}
{text_el(lines, tx, ty, size=fs, fill=t["text"], anchor=anchor, tracking=tracking)}
</svg>
"""


def clean_non_curated() -> int:
    removed = 0
    for folder in (SVG_DIR, PNG_DIR):
        for f in list(folder.glob("tagline-*")):
            if not KEEP_RE.match(f.name):
                f.unlink()
                removed += 1
    return removed


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raster", action="store_true")
    ap.add_argument("--clean", action="store_true", help="Remove non-curated tagline files")
    args = ap.parse_args()

    SVG_DIR.mkdir(parents=True, exist_ok=True)
    PNG_DIR.mkdir(parents=True, exist_ok=True)

    if args.clean:
        n = clean_non_curated()
        print(f"Removed {n} non-curated tagline files")

    names = []
    for slug, text in TAGLINES:
        for size_name, w, h in SIZES:
            for mode, variants in CURATED:
                for variant in variants:
                    layout = "br-split" if mode == "split" else "br-bottom"
                    name = f"tagline-{slug}-{size_name}-{layout}-{variant}"
                    (SVG_DIR / f"{name}.svg").write_text(
                        banner(w, h, text, variant=variant, mode=mode)
                    )
                    names.append(name)

    print(f"Wrote {len(names)} curated tagline SVGs (always UPPERCASE)")
    print("Kept layouts: br-bottom (dark/white/orange), br-split (dark/white)")

    if args.raster:
        ok = 0
        for name in names:
            src, dst = SVG_DIR / f"{name}.svg", PNG_DIR / f"{name}.png"
            try:
                subprocess.run(["rsvg-convert", "-o", str(dst), str(src)], check=True, capture_output=True)
                ok += 1
            except (subprocess.CalledProcessError, FileNotFoundError) as e:
                print(f"FAIL {name}: {e}", file=sys.stderr)
        print(f"Rasterized {ok}/{len(names)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
