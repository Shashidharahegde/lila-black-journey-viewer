"""Check the reverse coordinate mapping (map position → world x/z) on all three maps.

The pipeline maps world → UV and writes UV to the JSON. The browser maps back for the hover
readout: cursor → drawing space → UV → world x/z (`web/src/map/space.ts`). This script checks
that whole chain against the raw parquet data and the real images:

1. Dimensions: original minimap, exported WebP and `index.json` agree; world units per pixel.
2. Extent: every recorded position falls inside each map's calibrated square.
3. Round trip on real data: every exported JSON point, sent through the TypeScript code in
   `space.ts` (run with node), lands back on the parquet x/z within the rounding of the JSON.
4. Pixel probes on the exported WebP: TypeScript result vs an independent formula in this file.
5. Same world point on the original image and the exported WebP (different sizes).
6. Pictures: real positions on each exported minimap, with probes, plus wrong-orientation controls.

It only reads data and writes evidence files (docs/evidence/reverse_*). The controls exist for
comparison and must not be used anywhere else.

Run from pipeline/:  uv run python validate_reverse_mapping.py [--data-dir PATH]
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

from lila_pipeline.export import UV_DECIMALS, player_hash
from lila_pipeline.ingest import DEFAULT_DATA_DIR, load_journeys
from lila_pipeline.normalize import add_match_clock, classify_actors
from lila_pipeline.projection import MAPS, uv_to_pixel, world_to_uv

REPO = Path(__file__).resolve().parent.parent
WEB_DATA = REPO / "web" / "public" / "data"
SPACE_TS = REPO / "web" / "src" / "map" / "space.ts"
OUT_DIR = REPO / "docs" / "evidence"
DRAW_WIDTH = 2048  # px of the evidence pictures (the exported images are downscaled to this)
CONTROL_WIDTH = 760
GRID_STEP = 100  # world units between labelled grid lines
PROBE_FRACTIONS = (0.2, 0.5, 0.8)
RANDOM_PROBES = 2000
SEED = 7

HUMAN = (255, 214, 10)
BOT = (80, 200, 255)

# Runs the real space.ts: JSON in on stdin, JSON out. `cursor` mode starts from a deck.gl drawing-space
# coordinate (what the hover handler receives); `uv` mode starts from the exported u, v.
NODE_RUNNER = """
import fs from 'node:fs'
const space = await import(process.argv[1])
const input = JSON.parse(fs.readFileSync(0, 'utf8'))
const maps = input.maps
const out = input.rows.map((r) => {
  const map = maps[r[0]]
  const [x, y] = r[3] === 'cursor' ? [r[1], r[2]] : space.uvToSpace(r[1], r[2], map)
  const [u, v] = space.spaceToUv(x, y, map)
  const w = space.uvToWorld(u, v, map)
  return [w.x, w.z, x, y, space.isInsideMap(x, y, map) ? 1 : 0]
})
process.stdout.write(JSON.stringify(out))
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()

    index = json.loads((WEB_DATA / "index.json").read_text(encoding="utf-8"))
    events, ingest_report = load_journeys(args.data_dir)
    events = classify_actors(add_match_clock(events))
    positions = events[events["event"].isin(["Position", "BotPosition"])].copy()

    sizes = check_dimensions(args.data_dir / "minimaps", index)
    extent = check_extent(positions)
    exported = load_exported_points()
    roundtrip = check_roundtrip(positions, exported, index)
    probes = check_probes(index)
    cross_size = check_cross_size(args.data_dir / "minimaps", index)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pictures = {}
    for map_id in MAPS:
        pictures[map_id] = draw_map(map_id, index["maps"][map_id], exported[exported["map"] == map_id])
        draw_controls(map_id, index["maps"][map_id], exported[exported["map"] == map_id])

    metrics = {
        "ingest": ingest_report.summary(),
        "dimensions": sizes,
        "extent": extent,
        "roundtrip_real_points": roundtrip,
        "pixel_probes": probes,
        "same_point_original_vs_web": cross_size,
        "pictures": pictures,
    }
    (OUT_DIR / "reverse_mapping_metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: metrics[k] for k in ("dimensions", "extent", "roundtrip_real_points", "pixel_probes",
                                              "same_point_original_vs_web")}, indent=2))


# --- independent formulas (deliberately not importing space.ts or projection.py's inverse) ---------------


def world_to_pixel(map_id: str, x, z, width: int, height: int):
    cal = MAPS[map_id]
    return (np.asarray(x) - cal.origin_x) / cal.scale * width, (1 - (np.asarray(z) - cal.origin_z) / cal.scale) * height


def pixel_to_world(map_id: str, px, py, width: int, height: int):
    cal = MAPS[map_id]
    return cal.origin_x + np.asarray(px) / width * cal.scale, cal.origin_z + (1 - np.asarray(py) / height) * cal.scale


def run_space_ts(index: dict, rows: list[list]) -> np.ndarray:
    """Send rows [map, a, b, mode] through the real space.ts; returns [x, z, space_x, space_y, inside]."""
    payload = json.dumps({"maps": index["maps"], "rows": rows})
    done = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_RUNNER, SPACE_TS.as_uri()],
        input=payload, capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return np.array(json.loads(done.stdout), dtype=np.float64).reshape(-1, 5)


# --- checks -----------------------------------------------------------------------------------------------


def check_dimensions(minimap_dir: Path, index: dict) -> dict:
    result = {}
    for map_id, cal in MAPS.items():
        info = index["maps"][map_id]
        with Image.open(minimap_dir / cal.minimap_file) as original:
            ow, oh = original.size
        with Image.open(WEB_DATA.parent / info["image"]) as web:
            ww, wh = web.size
        result[map_id] = {
            "original_px": [ow, oh],
            "web_webp_px": [ww, wh],
            "index_json_px": [info["width"], info["height"]],
            "index_matches_webp": [info["width"], info["height"]] == [ww, wh],
            "index_calibration_matches_pipeline": [info["scale"], info["origin_x"], info["origin_z"]]
            == [cal.scale, cal.origin_x, cal.origin_z],
            "aspect_original": round(ow / oh, 6),
            "aspect_web": round(ww / wh, 6),
            "aspect_preserved": abs(ow / oh - ww / wh) < 1e-3,
            "world_square": {"x": [cal.origin_x, cal.origin_x + cal.scale], "z": [cal.origin_z, cal.origin_z + cal.scale]},
            "world_units_per_px_original": {"x": round(cal.scale / ow, 5), "z": round(cal.scale / oh, 5)},
            "world_units_per_px_web": {"x": round(cal.scale / ww, 5), "z": round(cal.scale / wh, 5)},
            "axis_scale_mismatch_pct_web": round(abs(ww - wh) / max(ww, wh) * 100, 4),
            # If a square image were wrongly assumed, the south edge would be this many pixels off.
            "max_error_px_if_treated_as_square": abs(ww - wh),
        }
    return result


def check_extent(positions: pd.DataFrame) -> dict:
    result = {}
    for map_id, rows in positions.groupby("map_id"):
        u, v = world_to_uv(str(map_id), rows["x"], rows["z"])
        outside = ~((u >= 0) & (u <= 1) & (v >= 0) & (v <= 1))
        result[str(map_id)] = {
            "positions": int(len(rows)),
            "outside_calibrated_square": int(outside.sum()),
            "u_range": [round(float(u.min()), 4), round(float(u.max()), 4)],
            "v_range": [round(float(v.min()), 4), round(float(v.max()), 4)],
            "x_range": [round(float(rows["x"].min()), 2), round(float(rows["x"].max()), 2)],
            "z_range": [round(float(rows["z"].min()), 2), round(float(rows["z"].max()), 2)],
        }
    return result


def load_exported_points() -> pd.DataFrame:
    """Every path point the website would draw: map, match, actor, kind, t, u, v."""
    rows = []
    for path in sorted((WEB_DATA / "matches").glob("*.json")):
        match = json.loads(path.read_text(encoding="utf-8"))
        for actor in match["actors"]:
            for segment in actor["segments"]:
                rows.extend((match["map"], match["id"], actor["id"], actor["kind"], t, u, v) for t, u, v in segment)
    return pd.DataFrame(rows, columns=["map", "match", "player", "kind", "t", "u", "v"])


def check_roundtrip(positions: pd.DataFrame, exported: pd.DataFrame, index: dict) -> dict:
    """exported u, v → space.ts (uv → drawing space → uv → world) vs the parquet x, z."""
    original = positions.assign(match=positions["match_id"].str[:8], player=positions["user_id"].map(player_hash))
    original = original[["match", "player", "t", "x", "z"]]
    points = exported.reset_index(names="pid")
    both = points.merge(original, on=["match", "player", "t"], how="left")
    unmatched = int(both.groupby("pid")["x"].apply(lambda s: s.isna().all()).sum())

    world = run_space_ts(index, [[m, u, v, "uv"] for m, u, v in zip(points["map"], points["u"], points["v"])])
    both["rx"] = world[both["pid"].to_numpy(), 0]
    both["rz"] = world[both["pid"].to_numpy(), 1]
    both["err"] = np.hypot(both["rx"] - both["x"], both["rz"] - both["z"])
    best = both.groupby("pid")["err"].min()  # a few points share (match, player, t); take the matching row
    result = {"exported_points": int(len(points)), "no_parquet_row_found": unmatched, "by_map": {}}
    for map_id, cal in MAPS.items():
        err = best[points.loc[best.index, "map"] == map_id]
        # u, v are rounded to UV_DECIMALS, so the largest possible error per axis is 0.5·10^-4 · scale
        bound = float(np.hypot(0.5 * 10**-UV_DECIMALS * cal.scale, 0.5 * 10**-UV_DECIMALS * cal.scale))
        result["by_map"][map_id] = {
            "points": int(len(err)),
            "max_error_world_units": round(float(err.max()), 4),
            "mean_error_world_units": round(float(err.mean()), 4),
            "rounding_bound_world_units": round(bound, 4),
            "within_bound": bool((err <= bound + 1e-9).all()),
        }
    return result


def check_probes(index: dict) -> dict:
    """Pixel positions on the exported WebP → deck coordinates → space.ts → world, vs the independent formula."""
    rng = np.random.default_rng(SEED)
    result = {}
    for map_id, cal in MAPS.items():
        info = index["maps"][map_id]
        w, h = info["width"], info["height"]
        edge = [(0, 0), (w, 0), (0, h), (w, h), (w / 2, h / 2)]
        pixels = np.vstack([np.array(edge, dtype=float), rng.uniform([0, 0], [w, h], size=(RANDOM_PROBES, 2))])
        cursor = pixels / [w, h] * [1000, 1000 * h / w]  # BitmapLayer stretches the image over exactly these bounds
        got = run_space_ts(index, [[map_id, cx, cy, "cursor"] for cx, cy in cursor])
        want_x, want_z = pixel_to_world(map_id, pixels[:, 0], pixels[:, 1], w, h)
        err = np.hypot(got[:, 0] - want_x, got[:, 1] - want_z)
        back_px, back_py = world_to_pixel(map_id, got[:, 0], got[:, 1], w, h)
        round_trip_px = np.hypot(back_px - pixels[:, 0], back_py - pixels[:, 1])
        corners = {name: [round(float(got[i, 0]), 6), round(float(got[i, 1]), 6)]
                   for i, name in enumerate(["top-left", "top-right", "bottom-left", "bottom-right", "centre"])}
        result[map_id] = {
            "probes": int(len(pixels)),
            "max_diff_vs_independent_formula_world_units": float(f"{err.max():.3g}"),
            "max_round_trip_error_px": float(f"{round_trip_px.max():.3g}"),
            "all_inside_map": bool(got[:, 4].all()),
            "corners_world_xz": corners,
            "expected_corners_world_xz": {
                "top-left": [cal.origin_x, cal.origin_z + cal.scale],
                "top-right": [cal.origin_x + cal.scale, cal.origin_z + cal.scale],
                "bottom-left": [cal.origin_x, cal.origin_z],
                "bottom-right": [cal.origin_x + cal.scale, cal.origin_z],
                "centre": [cal.origin_x + cal.scale / 2, cal.origin_z + cal.scale / 2],
            },
        }
    return result


def check_cross_size(minimap_dir: Path, index: dict) -> dict:
    """A world point goes to the same fraction of the image on the original and on the exported WebP."""
    result = {}
    for map_id, cal in MAPS.items():
        with Image.open(minimap_dir / cal.minimap_file) as original:
            ow, oh = original.size
        info = index["maps"][map_id]
        ww, wh = info["width"], info["height"]
        x = cal.origin_x + np.array([0.1, 0.37, 0.5, 0.81, 0.99]) * cal.scale
        z = cal.origin_z + np.array([0.9, 0.12, 0.5, 0.66, 0.03]) * cal.scale
        ox, oy = world_to_pixel(map_id, x, z, ow, oh)
        wx, wy = world_to_pixel(map_id, x, z, ww, wh)
        frac = np.hypot(ox / ow - wx / ww, oy / oh - wy / wh)
        result[map_id] = {
            "original_px": [ow, oh],
            "web_px": [ww, wh],
            "pixel_scale_factor": [round(ww / ow, 6), round(wh / oh, 6)],
            "max_fraction_difference": float(f"{frac.max():.3g}"),
            "example": {"world": [round(float(x[0]), 2), round(float(z[0]), 2)],
                        "original_px": [round(float(ox[0]), 2), round(float(oy[0]), 2)],
                        "web_px": [round(float(wx[0]), 2), round(float(wy[0]), 2)]},
        }
    return result


# --- pictures ---------------------------------------------------------------------------------------------


def load_web_image(info: dict, width: int) -> Image.Image:
    with Image.open(WEB_DATA.parent / info["image"]) as source:
        image = source.convert("RGB")
    height = round(width * image.height / image.width)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def draw_map(map_id: str, info: dict, points: pd.DataFrame) -> dict:
    """Every exported position on the exported minimap, with labelled world grid and cursor probes."""
    cal = MAPS[map_id]
    canvas = load_web_image(info, DRAW_WIDTH).convert("RGBA")
    width, height = canvas.size
    dots = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    dots_draw = ImageDraw.Draw(dots)
    for kind, colour, alpha in (("bot", BOT, 70), ("human", HUMAN, 190)):
        part = points[points["kind"] == kind]
        px, py = uv_to_pixel(part["u"], part["v"], width, height)
        for x, y in zip(px, py):
            dots_draw.ellipse((x - 2.5, y - 2.5, x + 2.5, y + 2.5), fill=(*colour, alpha))
    canvas = Image.alpha_composite(canvas, dots)
    draw = ImageDraw.Draw(canvas)
    small, medium = ImageFont.load_default(size=26), ImageFont.load_default(size=30)

    # World grid: drawn with the independent formula, labelled with the world value it stands for.
    first_x = int(np.ceil(cal.origin_x / GRID_STEP) * GRID_STEP)
    first_z = int(np.ceil(cal.origin_z / GRID_STEP) * GRID_STEP)
    for gx in range(first_x, int(cal.origin_x + cal.scale) + 1, GRID_STEP):
        px, _ = world_to_pixel(map_id, gx, cal.origin_z, width, height)
        draw.line((px, 0, px, height), fill=(255, 255, 255, 70), width=2)
        draw.text((px + 6, 4), f"x {gx}", font=small, fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0))
    for gz in range(first_z, int(cal.origin_z + cal.scale) + 1, GRID_STEP):
        _, py = world_to_pixel(map_id, cal.origin_x, gz, width, height)
        draw.line((0, py, width, py), fill=(255, 255, 255, 70), width=2)
        draw.text((6, py + 4), f"z {gz}", font=small, fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0))
    ox, oy = world_to_pixel(map_id, 0, 0, width, height)
    draw.ellipse((ox - 14, oy - 14, ox + 14, oy + 14), outline=(255, 60, 60), width=5)
    draw.text((ox + 20, oy - 40), "world (0, 0)", font=medium, fill=(255, 90, 90), stroke_width=4, stroke_fill=(0, 0, 0))

    # Cursor probes: pixel → space.ts → world, then the world point is sent forward again to the same spot.
    probe_px = np.array([(f * width, g * height) for g in PROBE_FRACTIONS for f in PROBE_FRACTIONS])
    cursor = probe_px / [width, height] * [1000, 1000 * height / width]
    got = run_space_ts({"maps": {map_id: info}}, [[map_id, cx, cy, "cursor"] for cx, cy in cursor])
    for (px, py), (x, z, *_rest) in zip(probe_px, got):
        draw.line((px - 22, py, px + 22, py), fill=(255, 40, 40), width=4)
        draw.line((px, py - 22, px, py + 22), fill=(255, 40, 40), width=4)
        label = f"px ({px:.0f}, {py:.0f}) -> x {x:.1f}, z {z:.1f}"
        draw.text((px + 28, py + 10), label, font=small, fill=(255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0))

    legend = f"{map_id}  {info['width']}x{info['height']} px  scale {cal.scale}  origin ({cal.origin_x}, {cal.origin_z})"
    draw.rectangle((0, height - 90, width, height), fill=(0, 0, 0, 200))
    draw.text((12, height - 84), legend, font=medium, fill=(255, 255, 255))
    draw.ellipse((14, height - 40, 30, height - 24), fill=HUMAN)
    draw.text((38, height - 46), f"human positions ({int((points['kind'] == 'human').sum())})", font=small, fill=(255, 255, 255))
    draw.ellipse((420, height - 40, 436, height - 24), fill=BOT)
    draw.text((444, height - 46), f"bot positions ({int((points['kind'] == 'bot').sum())})", font=small, fill=(255, 255, 255))
    draw.text((820, height - 46), "red crosses = cursor probes; grid = world coordinates", font=small, fill=(255, 255, 255))
    name = f"reverse_{map_id.lower()}_overlay.png"
    canvas.convert("RGB").save(OUT_DIR / name, optimize=True)
    return {"overlay": name, "human_points": int((points["kind"] == "human").sum()), "bot_points": int((points["kind"] == "bot").sum())}


def draw_controls(map_id: str, info: dict, points: pd.DataFrame) -> None:
    """Production mapping next to wrong versions (no y-flip, x and z swapped); only the first should fit the map."""
    humans = points[points["kind"] == "human"]
    variants = {
        "production": lambda u, v, w, h: uv_to_pixel(u, v, w, h),
        "control: no y-flip": lambda u, v, w, h: (u * w, v * h),
        "control: x and z swapped": lambda u, v, w, h: uv_to_pixel(v, u, w, h),
    }
    panels = []
    font = ImageFont.load_default(size=28)
    for title, project in variants.items():
        panel = load_web_image(info, CONTROL_WIDTH).convert("RGBA")
        layer = Image.new("RGBA", panel.size, (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        px, py = project(humans["u"].to_numpy(), humans["v"].to_numpy(), *panel.size)
        for x, y in zip(px, py):
            layer_draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(*HUMAN, 200))
        panel = Image.alpha_composite(panel, layer)
        ImageDraw.Draw(panel).text((10, 8), title, font=font, fill=(255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0))
        panels.append(panel.convert("RGB"))
    gap = 12
    sheet = Image.new("RGB", (sum(p.width for p in panels) + gap * 2, max(p.height for p in panels)), (24, 24, 24))
    left = 0
    for panel in panels:
        sheet.paste(panel, (left, 0))
        left += panel.width + gap
    sheet.save(OUT_DIR / f"reverse_{map_id.lower()}_controls.png", optimize=True)


if __name__ == "__main__":
    main()
