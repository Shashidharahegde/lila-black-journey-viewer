"""Absolute count bands for the 64 x 64 kill and death views -> docs/evidence/spatial_analysis/count_bands.*

    cd pipeline && uv run python tools/count_bands.py

The proposal (S, 2026-10-23): colour kill and death cells by absolute event count in four classes, 1 / 2-3 / 4-9 / 10 or more, the same on
every date and map. It applies to the 64 x 64 cells only, never to the aggregated 16 x 16 regions. Questions:
  1. How are the real cells distributed over those bands (all dates and each date)?
  2. Do the bands read better than the continuous ramp? Measured as perceptual distance (CIELAB dE76) between neighbouring
     classes over each minimap's own colours, with and without colour-vision deficiency, for the current continuous palette,
     the same palette cut into bands, and a lightness-ordered band palette.
Also writes a side-by-side preview. The palettes and opacity curves of the continuous version are copies from
web/src/heatmap/scale.ts (see visual_encoding.py); the candidate band styles are listed below.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import visual_encoding as ve

OUT = ve.OUT
EDGES = (2, 4, 10)  # a cell holds 1 | 2-3 | 4-9 | 10+
LABELS = ("1", "2-3", "4-9", "10+")

# Candidate band styles: (hex colour, opacity) per class, weakest to strongest.
CANDIDATES = {
    # the continuous palette cut into four classes (hue steps amber -> red, opacity steps)
    "same palette, cut into bands": {
        "kills": [(ve.palette_color("kills", t), a) for t, a in zip((0.12, 0.37, 0.62, 0.88), (0.35, 0.55, 0.75, 0.92))],
        "deaths": [(ve.palette_color("deaths", t), a) for t, a in zip((0.12, 0.37, 0.62, 0.88), (0.4, 0.6, 0.78, 0.92))],
    },
    # lightness rises with the count (dark red to pale yellow; deep indigo to pale pink), opacity rises too
    "lightness-ordered": {
        "kills": [(ve.hex_rgb(h), a) for h, a in (("#c2361b", 0.42), ("#ff6a1a", 0.62), ("#ffb52e", 0.82), ("#fff1b8", 0.95))],
        "deaths": [(ve.hex_rgb(h), a) for h, a in (("#5648d1", 0.5), ("#8a6cff", 0.66), ("#d04bff", 0.82), ("#ffc7f3", 0.95))],
    },
    # the same idea with a wider lightness spread for deaths (deep indigo, violet, orchid, pale pink)
    "lightness-ordered, wider for deaths": {
        "kills": [(ve.hex_rgb(h), a) for h, a in (("#c2361b", 0.42), ("#ff6a1a", 0.62), ("#ffb52e", 0.82), ("#fff1b8", 0.95))],
        "deaths": [(ve.hex_rgb(h), a) for h, a in (("#3b2fb5", 0.55), ("#7c68ff", 0.7), ("#c86bff", 0.85), ("#ffd9f7", 0.97))],
    },
}
BACKGROUNDS = ("typical", "dark_fifth", "bright_fifth")


def band_of(value: float) -> int:
    return int(np.digitize(value, EDGES))


def distributions() -> dict:
    out: dict = {}
    for map_id in ("AmbroseValley", "GrandRift", "Lockdown"):
        data = json.loads((ve.DATA_DIR / f"{map_id}.json").read_text(encoding="utf-8"))
        out[map_id] = {}
        for layer in ("kills", "deaths"):
            per_key = {}
            for key, cells in data["layers"][layer].items():
                counts = [0, 0, 0, 0]
                events = [0, 0, 0, 0]
                for _, _, v in cells:
                    b = band_of(v)
                    counts[b] += 1
                    events[b] += v
                per_key[key] = {"cells": counts, "events": events}
            out[map_id][layer] = per_key
    return out


def styled_levels(style: list, bg: np.ndarray, cvd: np.ndarray | None) -> dict:
    labs = [ve.to_lab(a * np.asarray(c) + (1 - a) * bg, cvd) for c, a in style]
    bg_lab = ve.to_lab(bg, cvd)
    adjacent = [ve.delta_e(x, y) for x, y in zip(labs, labs[1:])]
    return {
        "adjacent_dE": [round(d, 1) for d in adjacent],
        "min_adjacent_dE": round(min(adjacent), 1),
        "weakest_vs_map_dE": round(ve.delta_e(labs[0], bg_lab), 1),
        "lightness_L": [round(float(l[0]), 1) for l in labs],
        "lightness_rises": all(b[0] > a[0] for a, b in zip(labs, labs[1:])),
    }


def continuous_adjacent(layer: str, bg: np.ndarray, cvd: np.ndarray | None, domain: float) -> dict:
    """The current continuous look at the counts 1, 2-3 (taking 2), 4-9 (taking 4) and 10 on this layer's domain: do neighbours differ?"""
    labs = []
    for count in (1, 2, 4, 10):
        t = min(1.0, count / domain)
        labs.append(ve.to_lab(ve.intensity_alpha(layer, "hotspots", t) * ve.palette_color(layer, t) + (1 - ve.intensity_alpha(layer, "hotspots", t)) * bg, cvd))
    adjacent = [ve.delta_e(x, y) for x, y in zip(labs, labs[1:])]
    return {"adjacent_dE": [round(d, 1) for d in adjacent], "min_adjacent_dE": round(min(adjacent), 1)}


def evaluate() -> dict:
    domains = {}
    for map_id in ("AmbroseValley", "GrandRift", "Lockdown"):
        data = json.loads((ve.DATA_DIR / f"{map_id}.json").read_text(encoding="utf-8"))
        domains[map_id] = {layer: max(c[2] for cells in data["layers"][layer].values() for c in cells) for layer in ("kills", "deaths")}
    out: dict = {}
    for map_id in domains:
        bgs = ve.backgrounds(map_id)
        out[map_id] = {}
        for layer in ("kills", "deaths"):
            rows = {}
            for name in ("current continuous", *CANDIDATES):
                per_bg = {}
                for bg_name in BACKGROUNDS:
                    cell = {}
                    for vision, matrix in (("normal", None), ("deuteranopia", ve.M_DEUTAN), ("protanopia", ve.M_PROTAN)):
                        if name == "current continuous":
                            cell[vision] = continuous_adjacent(layer, bgs[bg_name], matrix, domains[map_id][layer])
                        else:
                            cell[vision] = styled_levels(CANDIDATES[name][layer], bgs[bg_name], matrix)
                    per_bg[bg_name] = cell
                rows[name] = per_bg
            out[map_id][layer] = rows
    return out


def paint(cells, layer: str, style) -> np.ndarray:
    """Soft bumps (as web/src/heatmap/raster.ts) with each cell's colour and opacity taken from its count band."""
    size, sigma = ve.GRID * ve.SCALE, ve.SIGMA * ve.SCALE
    reach = math.ceil(sigma * ve.REACH)
    edge = math.exp(-(ve.REACH**2) / 2)
    alpha = np.zeros((size, size))
    weight = np.zeros((size, size))
    colour = np.zeros((size, size, 3))
    ys, xs = np.mgrid[0:size, 0:size]
    for i, j, v in cells:
        rgb, peak = style[band_of(v)]
        cx, cy = (i + 0.5) * ve.SCALE, (ve.GRID - (j + 0.5)) * ve.SCALE
        x0, x1, y0, y1 = max(0, int(cx - reach)), min(size, int(cx + reach) + 1), max(0, int(cy - reach)), min(size, int(cy + reach) + 1)
        d2 = (xs[y0:y1, x0:x1] + 0.5 - cx) ** 2 + (ys[y0:y1, x0:x1] + 0.5 - cy) ** 2
        g = np.exp(-d2 / (2 * sigma**2))
        bump = np.where(g > edge, (g - edge) / (1 - edge), 0.0)
        alpha[y0:y1, x0:x1] = np.maximum(alpha[y0:y1, x0:x1], peak * bump)
        weight[y0:y1, x0:x1] += peak * bump
        colour[y0:y1, x0:x1] += (peak * bump)[..., None] * np.asarray(rgb)
    rgb = np.where(weight[..., None] > 0, colour / np.maximum(weight[..., None], 1e-9), np.asarray(style[0][0]))
    return np.dstack([rgb, alpha])


def render(map_id: str, layer: str, style, width: int = 520) -> Image.Image:
    base = Image.open(ve.MAPS_DIR / f"{map_id}.webp").convert("RGB")
    cells, domain = ve.load_cells(map_id, layer)
    if style is None:  # the current continuous look
        overlay = ve.paint(cells, layer, domain, banded=False)
    else:
        overlay = paint(cells, layer, style)
    ov = Image.fromarray((overlay * 255).round().astype(np.uint8), "RGBA").resize(base.size, Image.BILINEAR)
    out = Image.alpha_composite(base.convert("RGBA"), ov).convert("RGB")
    x0, y0, x1, y1 = ve.content_box(np.asarray(base.resize((256, 256)), dtype=float) / 255)
    s = base.size[0] / 256, base.size[1] / 256
    out = out.crop((int(x0 * s[0]), int(y0 * s[1]), int(x1 * s[0]), int(y1 * s[1])))
    return out.resize((width, round(out.size[1] * width / out.size[0])), Image.LANCZOS)


def preview() -> None:
    rows = []
    for map_id, layer in (("AmbroseValley", "kills"), ("AmbroseValley", "deaths"), ("GrandRift", "kills"), ("GrandRift", "deaths")):
        tiles = [render(map_id, layer, None), render(map_id, layer, CANDIDATES["same palette, cut into bands"][layer]), render(map_id, layer, CANDIDATES["lightness-ordered"][layer])]
        h = max(t.size[1] for t in tiles)
        row = Image.new("RGB", (sum(t.size[0] for t in tiles) + 16, h), (14, 21, 32))
        x = 0
        for t in tiles:
            row.paste(t, (x, 0))
            x += t.size[0] + 8
        rows.append(row)
    sheet = Image.new("RGB", (rows[0].size[0], sum(r.size[1] + 8 for r in rows)), (14, 21, 32))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.size[1] + 8
    sheet.save(OUT / "count_bands_preview.webp", quality=88)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    result = {"edges": EDGES, "labels": LABELS, "distributions": distributions(), "perceptual": evaluate()}
    (OUT / "count_bands.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    preview()
    print("wrote", OUT / "count_bands.json", "and count_bands_preview.webp")


if __name__ == "__main__":
    main()
