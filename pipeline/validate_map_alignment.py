"""Diagnostic for decision D4: is GrandRift's world → minimap mapping right?

Draws about ten human journeys on the original GrandRift minimap twice: once with the
production mapping, and once with the y-flip deliberately removed (a control that should
look wrong). Also writes matching zoomed crops and `grandrift_metrics.json`, the numbers
quoted in docs/evidence/grandrift_validation.md.

The script only reads data and writes evidence files. The no-flip version exists here for
comparison and must not be used anywhere else.

Run from pipeline/:  uv run python validate_map_alignment.py [--data-dir PATH]
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

from lila_pipeline.ingest import DEFAULT_DATA_DIR, load_journeys
from lila_pipeline.normalize import add_match_clock
from lila_pipeline.projection import MAPS, uv_to_pixel, world_to_uv

MAP_ID = "GrandRift"
N_JOURNEYS = 10
MIN_POSITIONS = 30  # enough samples to show a route
MAX_GAP_S = 30  # never draw a line across a longer gap (EC-16)
MIN_STEP_FOR_TURNS = 1.0  # world units; smaller steps are standing still, not turning
CROP_SIZE = 540  # px on the original 2160×2158 image
# Fixed crop windows (left, top) chosen by eye around named map features near the top and
# bottom edges, where a wrong y-orientation moves points furthest. Areas near the map's
# horizontal midline (e.g. Labour Quarters, Mine Pit) barely move under a flip, so they
# can't tell the two orientations apart.
CROP_AREAS = {
    "area_A_burnt_zone": (1440, 300),  # NE corner: where journeys 2, 6, 7, 10 start in the production mapping
    "area_B_south_east": (1440, 1380),  # where the no-flip control moves those same four starts
    "area_C_engineers_quarters": (1620, 800),  # east edge: journey 8's start in both orientations
}
NEAR_BLACK_RGB_SUM = 30  # descriptive only: dark roads are walkable, so this is no pass/fail test
OUT_DIR = Path(__file__).resolve().parent.parent / "docs" / "evidence"

# Bright, distinct colours that stand out on the dark brown map.
PALETTE = [
    (255, 59, 48), (52, 199, 89), (0, 170, 255), (255, 204, 0), (255, 45, 200),
    (0, 230, 210), (255, 140, 0), (170, 120, 255), (190, 255, 60), (255, 255, 255),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()

    events, ingest_report = load_journeys(args.data_dir)
    events = add_match_clock(events)

    # Bots record `BotPosition`; `Position` comes from humans and the 17 `unknown` journeys (EC-09).
    # For alignment both are player-client movement, so no actor classifier is needed here.
    positions = events[(events["map_id"] == MAP_ID) & (events["event"] == "Position")].copy()
    positions["u"], positions["v"] = world_to_uv(MAP_ID, positions["x"], positions["z"])

    stats = pd.DataFrame([journey_stats(j) for _, j in positions.groupby("file", sort=True)])
    selected = select_journeys(stats)
    journeys = [positions[positions["file"] == f] for f in selected["file"]]

    image_path = args.data_dir / "minimaps" / MAPS[MAP_ID].minimap_file
    with Image.open(image_path) as source:
        source.load()
    base = source.convert("RGBA")
    width, height = base.size

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    correct = draw_overlay(base, journeys, flip=True)
    no_flip = draw_overlay(base, journeys, flip=False)

    selected_pixels = pd.concat(journeys)
    crops = {name: (left, top, left + CROP_SIZE, top + CROP_SIZE) for name, (left, top) in CROP_AREAS.items()}
    for name, box in crops.items():
        save_crops(correct, no_flip, name, box)
    for overlay, filename in ((correct, "grandrift_correct.png"), (no_flip, "grandrift_no_flip.png")):
        mark_crops(overlay, crops)
        overlay.save(OUT_DIR / filename, optimize=True)

    metrics = {
        "ingest": ingest_report.summary(),
        "image": image_metadata(image_path, source, base),
        "calibration": {"scale": MAPS[MAP_ID].scale, "origin_x": MAPS[MAP_ID].origin_x,
                        "origin_z": MAPS[MAP_ID].origin_z},
        "selection_rule": (
            f"human journeys (Position rows) on {MAP_ID} with >= {MIN_POSITIONS} positions; score = path length / max "
            f"+ total turning / max (lines only across gaps <= {MAX_GAP_S} s); highest score first, ties by file "
            f"name; at most one journey per player and per match"
        ),
        "candidates": int((stats["positions"] >= MIN_POSITIONS).sum()),
        "all_grandrift_human_journeys": int(len(stats)),
        "selected": selected_table(selected, journeys, width, height),
        "inspected": {"journeys": len(journeys), "positions": int(len(selected_pixels))},
        "bounds": {
            "selected": bounds_summary(selected_pixels),
            "all_grandrift_positions": bounds_summary(positions),
        },
        "pixels_under_positions": {
            "selected": pixel_summary(base, selected_pixels),
            "all_grandrift_positions": pixel_summary(base, positions),
        },
        "crops": {name: {"left": b[0], "top": b[1], "right": b[2], "bottom": b[3]} for name, b in crops.items()},
        "math_checks": math_checks(width, height),
    }
    (OUT_DIR / "grandrift_metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: metrics[k] for k in ("ingest", "inspected", "bounds", "pixels_under_positions")}, indent=2))
    failed = [c["check"] for c in metrics["math_checks"] if not c["pass"]]
    print("math checks:", "all passed" if not failed else f"FAILED: {failed}")


def journey_stats(journey: pd.DataFrame) -> dict:
    """Size, length and twistiness of one journey, counting only steps within MAX_GAP_S."""
    x, z, t = (journey[c].to_numpy(dtype=np.float64) for c in ("x", "z", "t"))
    dt, dx, dz = np.diff(t), np.diff(x), np.diff(z)
    step = np.hypot(dx, dz)
    linked = dt <= MAX_GAP_S
    moving = np.flatnonzero(linked & (step >= MIN_STEP_FOR_TURNS))
    heading = np.arctan2(dz[moving], dx[moving])
    consecutive = np.diff(moving) == 1
    turns = (np.diff(heading) + np.pi) % (2 * np.pi) - np.pi
    return {
        "file": journey["file"].iat[0],
        "user_id": journey["user_id"].iat[0],
        "match_id": journey["match_id"].iat[0],
        "positions": len(journey),
        "segments": int(1 + (~linked).sum()),
        "path_length": float(step[linked].sum()),
        "turning_deg": float(np.degrees(np.abs(turns[consecutive]).sum())),
        "duration_s": float(t[-1] - t[0]) if len(t) else 0.0,
        "max_gap_s": float(dt.max()) if len(dt) else 0.0,
    }


def select_journeys(stats: pd.DataFrame) -> pd.DataFrame:
    """Deterministic pick: long, twisting journeys, one per player and per match."""
    candidates = stats[stats["positions"] >= MIN_POSITIONS].copy()
    candidates["score"] = (
        candidates["path_length"] / candidates["path_length"].max()
        + candidates["turning_deg"] / candidates["turning_deg"].max()
    )
    candidates = candidates.sort_values(["score", "file"], ascending=[False, True])
    chosen, players, matches = [], set(), set()
    for row in candidates.itertuples():
        if row.user_id in players or row.match_id in matches:
            continue
        chosen.append(row.Index)
        players.add(row.user_id)
        matches.add(row.match_id)
        if len(chosen) == N_JOURNEYS:
            break
    return candidates.loc[chosen]


def to_pixels(u: pd.Series, v: pd.Series, width: int, height: int, flip: bool) -> tuple[np.ndarray, np.ndarray]:
    px, py = uv_to_pixel(u, v, width, height)
    if not flip:
        py = v.to_numpy(dtype=np.float64) * height  # deliberately wrong control: no y-flip
    return px, py


def draw_overlay(base: Image.Image, journeys: list[pd.DataFrame], flip: bool) -> Image.Image:
    """Paths (split at gaps and at out-of-bounds points), sample dots, start/end markers, numbers."""
    image = base.copy()
    draw = ImageDraw.Draw(image)
    width, height = image.size
    font = ImageFont.load_default(size=36)
    layers = []
    for colour, journey in zip(PALETTE, journeys):
        px, py = to_pixels(journey["u"], journey["v"], width, height, flip)
        inside = journey["u"].between(0, 1).to_numpy() & journey["v"].between(0, 1).to_numpy()
        gap = np.r_[True, np.diff(journey["t"].to_numpy()) > MAX_GAP_S]
        segments, current = [], []
        for x, y, ok, new in zip(px, py, inside, gap):
            if new or not ok:
                if len(current) > 1:
                    segments.append(current)
                current = []
            if ok:
                current.append((float(x), float(y)))
        if len(current) > 1:
            segments.append(current)
        points = [(float(x), float(y)) for x, y, ok in zip(px, py, inside) if ok]
        layers.append((colour, segments, points))

    for colour, segments, _ in layers:
        for segment in segments:
            draw.line(segment, fill=(0, 0, 0), width=10, joint="curve")
            draw.line(segment, fill=colour, width=5, joint="curve")
    for colour, _, points in layers:
        for x, y in points:
            draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill=colour, outline=(0, 0, 0), width=2)
    for number, (colour, _, points) in enumerate(layers, start=1):
        if not points:
            continue
        (sx, sy), (ex, ey) = points[0], points[-1]
        draw.ellipse((sx - 18, sy - 18, sx + 18, sy + 18), fill=(255, 255, 255), outline=colour, width=7)
        draw.rectangle((ex - 16, ey - 16, ex + 16, ey + 16), fill=colour, outline=(255, 255, 255), width=4)
        draw.text((sx + 22, sy - 44), str(number), font=font, fill=colour, stroke_width=5, stroke_fill=(0, 0, 0))
    return image


def save_crops(correct: Image.Image, no_flip: Image.Image, name: str, box: tuple[int, int, int, int]) -> None:
    """The same window cut from both overlays, saved separately and side by side."""
    left_crop, right_crop = correct.crop(box), no_flip.crop(box)
    left_crop.save(OUT_DIR / f"grandrift_{name}_correct.png", optimize=True)
    right_crop.save(OUT_DIR / f"grandrift_{name}_no_flip.png", optimize=True)
    header, gap = 84, 16
    pair = Image.new("RGBA", (CROP_SIZE * 2 + gap, CROP_SIZE + header), (24, 24, 24, 255))
    pair.paste(left_crop, (0, header))
    pair.paste(right_crop, (CROP_SIZE + gap, header))
    draw = ImageDraw.Draw(pair)
    title, small = ImageFont.load_default(size=26), ImageFont.load_default(size=20)
    where = f"{name}: px {box[0]}-{box[2]}, py {box[1]}-{box[3]} (same window in both)"
    draw.text((12, 10), "production mapping", font=title, fill=(255, 255, 255))
    draw.text((CROP_SIZE + gap + 12, 10), "control: y-flip removed", font=title, fill=(255, 120, 120))
    draw.text((12, 50), where, font=small, fill=(200, 200, 200))
    pair.save(OUT_DIR / f"grandrift_{name}_compare.png", optimize=True)


def mark_crops(image: Image.Image, crops: dict[str, tuple[int, int, int, int]]) -> None:
    """Outline the crop windows on a full overlay (after the crops were cut) so they can be located."""
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=40)
    for name, box in crops.items():
        draw.rectangle(box, outline=(255, 255, 255), width=4)
        draw.text((box[0] + 10, box[1] + 6), name.split("_")[1], font=font, fill=(255, 255, 255),
                  stroke_width=4, stroke_fill=(0, 0, 0))


def image_metadata(path: Path, source: Image.Image, rgba: Image.Image) -> dict:
    alpha = np.asarray(rgba)[..., 3]
    return {
        "file": path.name,
        "width": rgba.width,
        "height": rgba.height,
        "source_mode": source.mode,
        "alpha_min": int(alpha.min()),
        "share_pixels_not_fully_opaque": float((alpha < 255).mean()),
        "meaningful_transparency": bool((alpha < 255).any()),
    }


def bounds_summary(rows: pd.DataFrame) -> dict:
    outside = ~(rows["u"].between(0, 1) & rows["v"].between(0, 1))
    return {
        "positions": int(len(rows)),
        "outside_0_1": int(outside.sum()),
        "outside_pct": round(float(outside.mean()) * 100, 3),
        "u_range": [round(float(rows["u"].min()), 4), round(float(rows["u"].max()), 4)],
        "v_range": [round(float(rows["v"].min()), 4), round(float(rows["v"].max()), 4)],
        "x_range": [round(float(rows["x"].min()), 2), round(float(rows["x"].max()), 2)],
        "z_range": [round(float(rows["z"].min()), 2), round(float(rows["z"].max()), 2)],
    }


def pixel_summary(image: Image.Image, rows: pd.DataFrame) -> dict:
    """What lies under each position, for both orientations. Out-of-bounds rows are excluded."""
    pixels = np.asarray(image)
    width, height = image.size
    rows = rows[rows["u"].between(0, 1) & rows["v"].between(0, 1)]
    result = {}
    for label, flip in (("production", True), ("no_flip_control", False)):
        px, py = to_pixels(rows["u"], rows["v"], width, height, flip)
        sample = pixels[np.clip(py.astype(int), 0, height - 1), np.clip(px.astype(int), 0, width - 1)]
        result[label] = {
            "over_transparent_pct": round(float((sample[:, 3] < 255).mean()) * 100, 3),
            "over_near_black_pct_descriptive": round(
                float((sample[:, :3].astype(int).sum(axis=1) < NEAR_BLACK_RGB_SUM).mean()) * 100, 3
            ),
        }
    return result


def math_checks(width: int, height: int) -> list[dict]:
    """Boundary, centre, orientation and non-square checks on the production functions."""
    cal = MAPS[MAP_ID]
    west, east = cal.origin_x, cal.origin_x + cal.scale
    south, north = cal.origin_z, cal.origin_z + cal.scale
    mid_x, mid_z = cal.origin_x + cal.scale / 2, cal.origin_z + cal.scale / 2

    def pixel(x: float, z: float, w: int = width, h: int = height, map_id: str = MAP_ID) -> list[float]:
        px, py = uv_to_pixel(*world_to_uv(map_id, x, z), w, h)
        return [round(float(px), 3), round(float(py), 3)]

    cases = [
        ("README example (AmbroseValley, 1024 px)", pixel(-301.45, -355.55, 1024, 1024, "AmbroseValley"), [78, 890], 0.5),
        ("south-west world corner -> bottom-left", pixel(west, south), [0, height], 1e-6),
        ("south-east world corner -> bottom-right", pixel(east, south), [width, height], 1e-6),
        ("north-west world corner -> top-left", pixel(west, north), [0, 0], 1e-6),
        ("north-east world corner -> top-right", pixel(east, north), [width, 0], 1e-6),
        ("world centre -> image centre (non-square: 1080, 1079)", pixel(mid_x, mid_z), [width / 2, height / 2], 1e-6),
    ]
    checks = [
        {"check": name, "actual": actual, "expected": expected,
         "pass": bool(np.allclose(actual, expected, atol=tol))}
        for name, actual, expected, tol in cases
    ]
    base, east_step, north_step = pixel(mid_x, mid_z), pixel(mid_x + 10, mid_z), pixel(mid_x, mid_z + 10)
    checks.append({"check": "orientation: +x moves right, +z moves up", "actual": [east_step, north_step],
                   "expected": "x grows, row shrinks",
                   "pass": east_step[0] > base[0] and north_step[1] < base[1]})
    return checks


def selected_table(selected: pd.DataFrame, journeys: list[pd.DataFrame], width: int, height: int) -> list[dict]:
    """Selected journeys with player IDs hashed: real account IDs never go into the repo."""
    ends = {}
    for number, journey in enumerate(journeys, start=1):
        for label, flip in (("production", True), ("no_flip_control", False)):
            px, py = to_pixels(journey["u"], journey["v"], width, height, flip)
            ends[number, label] = {"start": [round(float(px[0])), round(float(py[0]))],
                                   "end": [round(float(px[-1])), round(float(py[-1]))]}
    return [
        {
            "number": number,
            "start_end_px": {label: ends[number, label] for label in ("production", "no_flip_control")},
            "player": hashlib.sha1(row.user_id.encode()).hexdigest()[:8],
            "match": row.match_id[:8],
            "positions": row.positions,
            "segments": row.segments,
            "path_length_world_units": round(row.path_length, 1),
            "turning_deg": round(row.turning_deg),
            "duration_s": round(row.duration_s),
            "max_gap_s": round(row.max_gap_s),
            "colour_rgb": list(PALETTE[number - 1]),
        }
        for number, row in enumerate(selected.itertuples(), start=1)
    ]


if __name__ == "__main__":
    main()
