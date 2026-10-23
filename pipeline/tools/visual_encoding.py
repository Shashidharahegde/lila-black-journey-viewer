"""Continuous glow vs banded intensity, measured (spec 06 research) -> docs/evidence/spatial_analysis/visual_encoding.json and visual_encoding_preview.webp

    cd pipeline && uv run python tools/visual_encoding.py

How many intensity levels can a viewer actually tell apart on the real minimaps? Overlay colours are composited over
each minimap's own background colours and compared in CIELAB (dE76), with and without colour-vision deficiency
(Machado et al. 2009 matrices, full severity). The palettes and opacity curves below are copies of
web/src/heatmap/scale.ts; a test in the web app keeps the originals honest, this tool only measures them.

Also writes a side-by-side preview. The preview paints bumps the way web/src/heatmap/raster.ts does, but in Python:
it is an illustration for review, not the renderer.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "docs" / "evidence" / "spatial_analysis"
MAPS_DIR = REPO / "web" / "public" / "maps"
DATA_DIR = REPO / "web" / "public" / "data" / "heatmaps"

PALETTE = {  # copied from web/src/heatmap/scale.ts
    "traffic": [(0, "#1a7fa3"), (0.5, "#38d3e0"), (0.85, "#ffe953"), (1, "#fff6a8")],
    "kills": [(0, "#ffcc33"), (0.5, "#ff8a1f"), (1, "#ff2b2b")],
    "deaths": [(0, "#8a6cff"), (0.5, "#b04dff"), (1, "#ff3bd4")],
}
OPACITY = {  # copied from web/src/heatmap/scale.ts
    "traffic": {"hotspots": dict(floor=0.05, knee=0.4, kneeAlpha=0.24, top=0.95, power=1.1), "all": dict(floor=0.18, top=0.85)},
    "kills": {"hotspots": dict(floor=0.22, top=0.95, power=0.55), "all": dict(floor=0.5, top=0.95)},
    "deaths": {"hotspots": dict(floor=0.42, top=0.95, power=0.6), "all": dict(floor=0.6, top=0.95)},
}
BAND_EDGES = (0.25, 0.5, 0.75)
BAND_T = (0.12, 0.37, 0.62, 0.88)  # a representative intensity inside each band
BAND_ALPHA = {"traffic": (0.12, 0.32, 0.6, 0.88), "kills": (0.35, 0.55, 0.75, 0.92), "deaths": (0.4, 0.6, 0.78, 0.92)}
MIN_VISIBLE = 5  # dE below this against the plain map: barely there
CLEAR = 10  # dE at or above this between neighbours: clearly different at a glance

M_DEUTAN = np.array([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]])
M_PROTAN = np.array([[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]])
D65 = np.array([0.95047, 1.0, 1.08883])


def hex_rgb(h: str) -> np.ndarray:
    return np.array([int(h[k : k + 2], 16) for k in (1, 3, 5)], dtype=float) / 255


def palette_color(layer: str, t: float) -> np.ndarray:
    stops = PALETTE[layer]
    t = min(1.0, max(0.0, t))
    for (a, ha), (b, hb) in zip(stops, stops[1:]):
        if t <= b:
            return hex_rgb(ha) + (hex_rgb(hb) - hex_rgb(ha)) * ((t - a) / (b - a))
    return hex_rgb(stops[-1][1])


def intensity_alpha(layer: str, mode: str, t: float) -> float:
    c = OPACITY[layer][mode]
    t = min(1.0, max(0.0, t))
    if layer == "traffic":
        if mode == "all":
            return c["floor"] + (c["top"] - c["floor"]) * t
        if t < c["knee"]:
            return c["floor"] + (c["kneeAlpha"] - c["floor"]) * t / c["knee"]
        return c["kneeAlpha"] + (c["top"] - c["kneeAlpha"]) * ((t - c["knee"]) / (1 - c["knee"])) ** c["power"]
    if mode == "all":
        return c["floor"] + (c["top"] - c["floor"]) * t
    return c["floor"] + (c["top"] - c["floor"]) * t ** c["power"]


def to_linear(rgb: np.ndarray) -> np.ndarray:
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def to_lab(rgb: np.ndarray, cvd: np.ndarray | None = None) -> np.ndarray:
    lin = to_linear(np.clip(rgb, 0, 1))
    if cvd is not None:
        lin = np.clip(cvd @ lin, 0, 1)
    m = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = (m @ lin) / D65
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])


def delta_e(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


def backgrounds(map_id: str) -> dict[str, np.ndarray]:
    """Typical, darkest-fifth and brightest-fifth colours of the minimap's real content."""
    im = np.asarray(Image.open(MAPS_DIR / f"{map_id}.webp").convert("RGB").resize((256, 256)), dtype=float) / 255
    flat = im.reshape(-1, 3)
    content = flat[flat.max(axis=1) > 40 / 255]
    lum = content @ np.array([0.2126, 0.7152, 0.0722])
    order = np.argsort(lum)
    n = len(order)
    return {
        "typical": np.median(content, axis=0),
        "dark_fifth": content[order[: n // 5]].mean(axis=0),
        "bright_fifth": content[order[-n // 5 :]].mean(axis=0),
    }


def composite(layer: str, t: float, alpha: float, bg: np.ndarray) -> np.ndarray:
    return alpha * palette_color(layer, t) + (1 - alpha) * bg


def continuous_levels(layer: str, mode: str, bg: np.ndarray, cvd: np.ndarray | None) -> dict:
    ts = np.linspace(0, 1, 101)
    labs = [to_lab(composite(layer, t, intensity_alpha(layer, mode, t), bg), cvd) for t in ts]
    bg_lab = to_lab(bg, cvd)
    steps = [delta_e(a, b) for a, b in zip(labs, labs[1:])]
    path = float(sum(steps))
    # greedy count of levels that differ by at least CLEAR from the previous kept one
    kept = [0]
    for k in range(1, len(ts)):
        if delta_e(labs[k], labs[kept[-1]]) >= CLEAR:
            kept.append(k)
    first_visible = next((float(ts[k]) for k in range(len(ts)) if delta_e(labs[k], bg_lab) >= MIN_VISIBLE), None)
    return {
        "path_length_dE": round(path, 1),
        "levels_at_dE10": len(kept),
        "weakest_vs_map_dE": round(delta_e(labs[0], bg_lab), 1),
        "first_intensity_visible_at_dE5": None if first_visible is None else round(first_visible, 2),
        "share_of_range_below_dE5_of_map": round(float(np.mean([delta_e(l, bg_lab) < MIN_VISIBLE for l in labs])), 2),
    }


def banded_levels(layer: str, bg: np.ndarray, cvd: np.ndarray | None) -> dict:
    labs = [to_lab(composite(layer, t, a, bg), cvd) for t, a in zip(BAND_T, BAND_ALPHA[layer])]
    bg_lab = to_lab(bg, cvd)
    adjacent = [round(delta_e(a, b), 1) for a, b in zip(labs, labs[1:])]
    return {"bands_vs_map_dE": [round(delta_e(l, bg_lab), 1) for l in labs], "adjacent_dE": adjacent, "min_adjacent_dE": min(adjacent), "bands_at_least_dE10_apart": all(d >= CLEAR for d in adjacent)}


def evaluate() -> dict:
    out: dict = {"thresholds": {"clear_dE": CLEAR, "barely_visible_dE": MIN_VISIBLE}, "band_edges_t": BAND_EDGES, "band_alpha": BAND_ALPHA, "maps": {}}
    for map_id in ("AmbroseValley", "GrandRift", "Lockdown"):
        out["maps"][map_id] = {}
        for bg_name, bg in backgrounds(map_id).items():
            entry: dict = {"background_rgb": [round(float(v) * 255) for v in bg]}
            for layer in PALETTE:
                entry[layer] = {
                    "continuous_hotspots": continuous_levels(layer, "hotspots", bg, None),
                    "continuous_all": continuous_levels(layer, "all", bg, None),
                    "banded": banded_levels(layer, bg, None),
                    "banded_deuteranopia": banded_levels(layer, bg, M_DEUTAN),
                    "banded_protanopia": banded_levels(layer, bg, M_PROTAN),
                    "continuous_hotspots_deuteranopia": continuous_levels(layer, "hotspots", bg, M_DEUTAN),
                }
            out["maps"][map_id][bg_name] = entry
    return out


# --- preview: continuous glow vs bands, painted from the real grids -----------------------------------------

GRID = 64
SCALE = 8
SIGMA = 1.0
REACH = 2.4


def load_cells(map_id: str, layer: str, key: str = "all"):
    data = json.loads((DATA_DIR / f"{map_id}.json").read_text(encoding="utf-8"))
    domain = max((c[2] for cells in data["layers"][layer].values() for c in cells), default=0)
    return data["layers"][layer][key], domain


def scale_t(layer: str, v: float, domain: float) -> float:
    return math.log1p(v) / math.log1p(domain) if layer == "traffic" else v / domain


def paint(cells, layer: str, domain: float, banded: bool) -> np.ndarray:
    """RGBA float image, row 0 = north, bumps combined by taking the stronger opacity (as web/src/heatmap/raster.ts does).
    Continuous: each cell's own intensity sets its colour and opacity. Banded: each cell is first put into one of four
    bands (fixed edges on its intensity) and takes that band's single colour and opacity, so a viewer reads a class,
    not a shade. Contouring the smoothed field instead was tried and rejected: it draws circles that come from the
    kernel, not from the data."""
    size = GRID * SCALE
    sigma = SIGMA * SCALE
    reach = math.ceil(sigma * REACH)
    edge = math.exp(-(REACH**2) / 2)
    alpha = np.zeros((size, size))
    weight = np.zeros((size, size))
    colour = np.zeros((size, size, 3))
    ys, xs = np.mgrid[0:size, 0:size]
    for i, j, v in cells:
        t = scale_t(layer, v, domain)
        if banded:
            b = int(np.digitize(t, BAND_EDGES))
            t, peak = BAND_T[b], BAND_ALPHA[layer][b]
        else:
            peak = intensity_alpha(layer, "hotspots", t)
        cx, cy = (i + 0.5) * SCALE, (GRID - (j + 0.5)) * SCALE
        x0, x1, y0, y1 = max(0, int(cx - reach)), min(size, int(cx + reach) + 1), max(0, int(cy - reach)), min(size, int(cy + reach) + 1)
        d2 = (xs[y0:y1, x0:x1] + 0.5 - cx) ** 2 + (ys[y0:y1, x0:x1] + 0.5 - cy) ** 2
        g = np.exp(-d2 / (2 * sigma**2))
        bump = np.where(g > edge, (g - edge) / (1 - edge), 0.0)
        alpha[y0:y1, x0:x1] = np.maximum(alpha[y0:y1, x0:x1], peak * bump)
        weight[y0:y1, x0:x1] += peak * bump
        colour[y0:y1, x0:x1] += (peak * bump)[..., None] * palette_color(layer, t)
    rgb = np.where(weight[..., None] > 0, colour / np.maximum(weight[..., None], 1e-9), palette_color(layer, 0))
    return np.dstack([rgb, alpha])


def content_box(im: np.ndarray) -> tuple[int, int, int, int]:
    mask = im.max(axis=2) > 40 / 255
    rows, cols = np.flatnonzero(mask.sum(axis=1) >= 3), np.flatnonzero(mask.sum(axis=0) >= 3)
    return cols[0], rows[0], cols[-1] + 1, rows[-1] + 1


def render(map_id: str, layer: str, banded: bool, width: int = 760) -> Image.Image:
    base = Image.open(MAPS_DIR / f"{map_id}.webp").convert("RGB")
    cells, domain = load_cells(map_id, layer)
    overlay = paint(cells, layer, domain, banded)
    ov = Image.fromarray((overlay * 255).round().astype(np.uint8), "RGBA").resize(base.size, Image.BILINEAR)
    # alpha-composite with the colour of fully transparent pixels already set to the palette's lowest colour
    out = Image.alpha_composite(base.convert("RGBA"), ov).convert("RGB")
    x0, y0, x1, y1 = content_box(np.asarray(base.resize((256, 256)), dtype=float) / 255)
    s = base.size[0] / 256, base.size[1] / 256
    out = out.crop((int(x0 * s[0]), int(y0 * s[1]), int(x1 * s[0]), int(y1 * s[1])))
    return out.resize((width, round(out.size[1] * width / out.size[0])), Image.LANCZOS)


def preview() -> None:
    cases = [("AmbroseValley", "traffic"), ("AmbroseValley", "deaths"), ("GrandRift", "traffic"), ("GrandRift", "kills")]
    rows = []
    for map_id, layer in cases:
        pair = [render(map_id, layer, banded) for banded in (False, True)]
        h = max(p.size[1] for p in pair)
        row = Image.new("RGB", (sum(p.size[0] for p in pair) + 12, h), (14, 21, 32))
        row.paste(pair[0], (0, 0))
        row.paste(pair[1], (pair[0].size[0] + 12, 0))
        rows.append(row)
    sheet = Image.new("RGB", (rows[0].size[0], sum(r.size[1] + 8 for r in rows)), (14, 21, 32))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.size[1] + 8
    sheet.save(OUT / "visual_encoding_preview.webp", quality=88)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    result = evaluate()
    (OUT / "visual_encoding.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    preview()
    print("wrote", OUT / "visual_encoding.json", "and visual_encoding_preview.webp")


if __name__ == "__main__":
    main()
