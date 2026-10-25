"""Print the numbers behind INSIGHTS.md, from the cleaned pipeline output, and draw its evidence pictures.

    cd pipeline && uv run python tools/insight_stats.py [--figures]

Human journeys only (`actor_kind == "human"`, which includes the 17 `id_mismatch` journeys, EC-09);
bots are left out, as in the heatmaps. Every definition is in the docstring of the function that
computes it. It prints; with --figures it also writes the pictures to docs/evidence/insights/.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw

from lila_pipeline.build import DEFAULT_WEB_DIR, REPO_ROOT, prepare
from lila_pipeline.heatmaps import GRID, traffic_grid
from lila_pipeline.ingest import DEFAULT_DATA_DIR
from lila_pipeline.journeys import DEATH_CATEGORIES
from lila_pipeline.projection import MAPS

ZONE_GRID = 20  # insight 1: 20 × 20 cells per map
TOP_CELLS = 6
CHANCE_DRAWS = 500
ON_MAP_MIN_SHARE = 0.5  # insight 2: a cell is land when at least half its pixels are land
ON_MAP_MIN_CHANNEL = 16  # a land pixel has a channel brighter than this (the off-map margin is opaque black, EC-20)...
WATER_BLUE_MARGIN = 40  # ...and is not water: blue at least this much above red and not below green - 10 (sea, bay, rivers)
COAST_CELLS = 2  # inland = land cells at least this many cells from water or the map edge
SUBSAMPLE_DRAWS = 100
SEED = 7
FIGURE_DIR = REPO_ROOT / "docs" / "evidence" / "insights"
FIGURE_PX = 1024


def journeys(events: pd.DataFrame) -> pd.DataFrame:
    """One row per human journey: map, start/end time, how it ended, first/last position, loot count.

    `ending` is the first death's raw label (`BotKilled`, `KilledByStorm`, `Killed`), or
    `survived` when the journey has no death. "Survived" means "no death recorded", not a
    confirmed extraction (EC-13). `loot` counts the journey's `Loot` events.
    """
    humans = events[events["actor_kind"] == "human"]
    deaths = humans[humans["category"].isin(DEATH_CATEGORIES)].sort_values(["file", "epoch_s", "row"])
    first_death = deaths.groupby("file").first()
    positions = humans[humans["category"] == "position"].sort_values(["file", "epoch_s", "row"])
    by_file = positions.groupby("file")
    out = humans.groupby("file").agg(map=("map_id", "first"), match=("match_id", "first"),
                                     start=("epoch_s", "min"), end=("epoch_s", "max"))
    out["duration_s"] = out["end"] - out["start"]
    out["ending"] = first_death["raw"].reindex(out.index).fillna("survived")
    out["death_t"] = first_death["t"].reindex(out.index)
    out[["death_u", "death_v"]] = first_death[["u", "v"]].reindex(out.index)
    out[["u0", "v0"]] = by_file[["u", "v"]].first().reindex(out.index)
    out[["u1", "v1"]] = by_file[["u", "v"]].last().reindex(out.index)
    out["loot"] = humans[humans["category"] == "loot"].groupby("file").size().reindex(out.index).fillna(0).astype(int)
    out["first_loot_t"] = humans[humans["category"] == "loot"].groupby("file")["t"].min().reindex(out.index)
    out["date"] = pd.to_datetime(out["start"], unit="s").dt.date
    return out


def fisher_p(a: int, n1: int, b: int, n2: int) -> float:
    """Two-sided Fisher exact test: are a of n1 and b of n2 different shares?"""
    k, n = a + b, n1 + n2
    pmf = [math.comb(k, x) * math.comb(n - k, n1 - x) / math.comb(n, n1) for x in range(0, min(k, n1) + 1)]
    return float(sum(p for x, p in enumerate(pmf) if x >= max(0, k - n2) and p <= pmf[a] * (1 + 1e-9)))


def mann_whitney_p(a, b) -> float:
    """Two-sided Mann-Whitney U test (normal approximation): do two samples differ in level?"""
    a, b = np.asarray(a, float), np.asarray(b, float)
    n1, n2 = len(a), len(b)
    ranks = pd.Series(np.r_[a, b]).rank().to_numpy()
    u = ranks[:n1].sum() - n1 * (n1 + 1) / 2
    z = (u - n1 * n2 / 2) / math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12)
    return math.erfc(abs(z) / math.sqrt(2))


def _zone(u: pd.Series, v: pd.Series, grid: int = ZONE_GRID) -> pd.Series:
    i = np.clip(np.floor(u.to_numpy(dtype=float) * grid).astype(int), 0, grid - 1)
    k = np.clip(np.floor(v.to_numpy(dtype=float) * grid).astype(int), 0, grid - 1)
    return pd.Series(i * grid + k, index=u.index)


def _top_share(cells) -> tuple[int, float]:
    counts = pd.Series(cells).value_counts()
    return len(counts), 100 * counts.iloc[:TOP_CELLS].sum() / counts.sum()


def lead_starts_and_ends(j: pd.DataFrame, web_dir: Path) -> pd.DataFrame:
    """Insight 1: in how many 20×20 cells journeys start (first position) and survivors end (last position).

    `top6_pct` = share of journeys whose start (or end) is in the 6 most used cells. `chance_pct` =
    the median top-6 share when the same number of points falls at random on the map's land cells
    (CHANCE_DRAWS draws). The 10×10 and 40×40 columns repeat the top-6 share on other grids.
    """
    rng = np.random.default_rng(SEED)
    rows = []
    for map_id, part in j.groupby("map"):
        survivors = part[part["ending"] == "survived"]
        land = np.flatnonzero(land_cells(map_id, web_dir, ZONE_GRID).ravel())
        chance = lambda n: float(np.median([_top_share(rng.choice(land, n))[1] for _ in range(CHANCE_DRAWS)]))  # noqa: E731
        row = {"map": map_id, "journeys": len(part), "survivors": len(survivors),
               "first_position_after_t0": int((part["u0"].notna() & (part["start"] > part.groupby("match")["start"].transform("min"))).sum())}
        for name, us, vs in (("start", part["u0"], part["v0"]), ("end", survivors["u1"], survivors["v1"])):
            row[f"{name}_cells"], row[f"{name}_top6_pct"] = _top_share(_zone(us, vs))
            row[f"{name}_chance_pct"] = chance(len(us))
            for g in (10, 40):
                row[f"{name}_top6_pct_{g}x{g}"] = _top_share(_zone(us, vs, g))[1]
        row["shortest_survivor_s"] = survivors["duration_s"].min()
        rows.append(row)
    return pd.DataFrame(rows).set_index("map")


def land_cells(map_id: str, web_dir: Path, grid: int = GRID) -> np.ndarray:
    """[i, j] mask of cells that are land on the exported minimap: not the black margin and not water.

    Cell (i, j) covers u ∈ [i/grid, (i+1)/grid), v ∈ [j/grid, (j+1)/grid); v runs up, image rows run
    down. A pixel is land when a channel is brighter than ON_MAP_MIN_CHANNEL and it is not water
    (blue > red + WATER_BLUE_MARGIN and blue >= green - 10: the teal sea, bay and rivers). A cell is
    land when at least ON_MAP_MIN_SHARE of its pixels are. Land may still include cliffs or rock.
    """
    with Image.open(web_dir / "maps" / f"{map_id}.webp") as image:
        rgb = np.asarray(image.convert("RGB")).astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    water = (b > r + WATER_BLUE_MARGIN) & (b >= g - 10)
    pixels = (rgb.max(axis=2) > ON_MAP_MIN_CHANNEL) & ~water
    height, width = pixels.shape
    mask = np.zeros((grid, grid), dtype=bool)
    for i in range(grid):
        x0, x1 = round(i * width / grid), round((i + 1) * width / grid)
        for k in range(grid):
            y0, y1 = round((1 - (k + 1) / grid) * height), round((1 - k / grid) * height)
            mask[i, k] = pixels[y0:y1, x0:x1].mean() >= ON_MAP_MIN_SHARE
    return mask


def inland(mask: np.ndarray, cells: int = COAST_CELLS) -> np.ndarray:
    """Land cells at least `cells` cells (4-neighbour steps) from any non-land cell."""
    out = mask.copy()
    for _ in range(cells):
        p = np.pad(out, 1)
        out = out & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return out


def lead_coverage(events: pd.DataFrame, web_dir: Path) -> tuple[pd.DataFrame, dict, dict]:
    """Insight 2: inland 64×64 cells that no human path crosses (traffic as in the heatmaps, D5).

    Also the same share with humans and bots, and on AmbroseValley with random subsets the size
    of Lockdown's human journeys, because coverage grows with the number of journeys.
    """
    positions = events[events["category"] == "position"]
    humans = positions[positions["actor_kind"] == "human"]
    rows, masks, grids = [], {}, {}
    for map_id in MAPS:
        part = humans[humans["map_id"] == map_id]
        land = land_cells(map_id, web_dir)
        masks[map_id] = inland(land)
        grids[map_id] = traffic_grid(part)
        empty = masks[map_id] & (grids[map_id] == 0)
        with_bots = masks[map_id] & (traffic_grid(positions[positions["map_id"] == map_id]) == 0)
        rows.append({
            "map": map_id, "human_journeys": part["file"].nunique(),
            "land_cells": int(land.sum()), "never_crossed_land_pct": 100 * (land & (grids[map_id] == 0)).sum() / land.sum(),
            "inland_cells": int(masks[map_id].sum()), "never_crossed": int(empty.sum()),
            "never_crossed_pct": 100 * empty.sum() / masks[map_id].sum(),
            "never_crossed_with_bots_pct": 100 * with_bots.sum() / masks[map_id].sum(),
        })
    table = pd.DataFrame(rows).set_index("map")

    n = int(table.loc["Lockdown", "human_journeys"])
    rng = np.random.default_rng(SEED)
    fair = {}
    for map_id in ("AmbroseValley",):
        part = humans[humans["map_id"] == map_id]
        files = part["file"].unique()
        shares = []
        for _ in range(SUBSAMPLE_DRAWS):
            chosen = part[part["file"].isin(rng.choice(files, size=n, replace=False))]
            shares.append(100 * (masks[map_id] & (traffic_grid(chosen) == 0)).sum() / masks[map_id].sum())
        fair[map_id] = {"journeys": n, "draws": SUBSAMPLE_DRAWS, "median": float(np.median(shares)),
                        "min": float(np.min(shares)), "max": float(np.max(shares))}
    return table, fair, {"masks": masks, "grids": grids}


def lead_no_loot(j: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Insight 3: journeys with no `Loot` event, per map, and how they end.

    `split_*` repeat the share on the first half and the second half of the dates. The distance
    is from the first position to the death, in world units (UV × the map's scale).
    """
    scale = {m: MAPS[m].scale for m in MAPS}
    dates = sorted(j["date"].unique())
    halves = (dates[: len(dates) // 2], dates[len(dates) // 2:])
    rows = []
    for map_id, part in j.groupby("map"):
        none = part[part["loot"] == 0]
        bot = part[part["ending"] == "BotKilled"]
        bot_none = bot[bot["loot"] == 0]
        dist = np.hypot(bot_none["death_u"] - bot_none["u0"], bot_none["death_v"] - bot_none["v0"]) * scale[map_id]
        dist_all = np.hypot(bot["death_u"] - bot["u0"], bot["death_v"] - bot["v0"]) * scale[map_id]
        row = {"map": map_id, "journeys": len(part), "no_loot": len(none), "no_loot_pct": 100 * len(none) / len(part),
               "no_loot_killed_by_bot": int((none["ending"] == "BotKilled").sum()),
               "bot_killed": len(bot), "bot_killed_no_loot_pct": 100 * len(bot_none) / len(bot),
               "no_loot_death_t_median": bot_none["death_t"].median(), "no_loot_death_dist_median": float(np.median(dist)),
               "bot_death_dist_median": float(np.median(dist_all)),
               "first_loot_median_s": part["first_loot_t"].median()}
        for k, half in enumerate(halves, 1):
            h = part[part["date"].isin(half)]
            row[f"split_{k}_no_loot_pct"] = 100 * (h["loot"] == 0).mean()
        rows.append(row)
    table = pd.DataFrame(rows).set_index("map")
    lock, amb = j[j["map"] == "Lockdown"], j[j["map"] == "AmbroseValley"]
    lb, ab = lock[lock["ending"] == "BotKilled"], amb[amb["ending"] == "BotKilled"]
    tests = {
        "halves": [f"{h[0]}..{h[-1]}" for h in halves],
        "p_no_loot": fisher_p(int((lock["loot"] == 0).sum()), len(lock), int((amb["loot"] == 0).sum()), len(amb)),
        "p_bot_killed_no_loot": fisher_p(int((lb["loot"] == 0).sum()), len(lb), int((ab["loot"] == 0).sum()), len(ab)),
        "p_first_loot_time": mann_whitney_p(lock["first_loot_t"].dropna(), amb["first_loot_t"].dropna()),
    }
    return table, tests


def _minimap(map_id: str, web_dir: Path) -> Image.Image:
    image = Image.open(web_dir / "maps" / f"{map_id}.webp").convert("RGB")
    image.thumbnail((FIGURE_PX, FIGURE_PX))
    return image


def draw_figures(j: pd.DataFrame, coverage: dict, web_dir: Path, out_dir: Path = FIGURE_DIR) -> list[Path]:
    """Evidence pictures: starts (green rings) and survivor ends (red squares); inland cells never crossed (red)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for map_id in MAPS:
        image = _minimap(map_id, web_dir)
        w, h = image.size
        draw = ImageDraw.Draw(image)
        part = j[j["map"] == map_id]
        for u, v in part[["u0", "v0"]].itertuples(index=False):
            draw.ellipse([u * w - 4, (1 - v) * h - 4, u * w + 4, (1 - v) * h + 4], outline=(60, 255, 90), width=2)
        for u, v in part.loc[part["ending"] == "survived", ["u1", "v1"]].itertuples(index=False):
            draw.rectangle([u * w - 4, (1 - v) * h - 4, u * w + 4, (1 - v) * h + 4], outline=(255, 60, 60), width=2)
        written.append(out_dir / f"starts_and_ends_{map_id}.webp")
        image.save(written[-1], quality=85)

        image = _minimap(map_id, web_dir).convert("RGBA")
        overlay = Image.new("RGBA", image.size)
        draw = ImageDraw.Draw(overlay)
        empty = coverage["masks"][map_id] & (coverage["grids"][map_id] == 0)
        for i, k in zip(*np.nonzero(empty)):
            draw.rectangle([i * w / GRID, (1 - (k + 1) / GRID) * h, (i + 1) * w / GRID, (1 - k / GRID) * h], fill=(255, 30, 30, 140))
        written.append(out_dir / f"never_crossed_{map_id}.webp")
        Image.alpha_composite(image, overlay).convert("RGB").save(written[-1], quality=85)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--web-dir", type=Path, default=DEFAULT_WEB_DIR, help="where the exported minimaps are")
    parser.add_argument("--figures", action="store_true", help=f"write the evidence pictures to {FIGURE_DIR}")
    args = parser.parse_args()

    events = prepare(args.data_dir).events
    j = journeys(events)
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    print(f"Human journeys: {len(j)} (bot journeys excluded)\n")

    print(f"Insight 1: start and survivor end cells ({ZONE_GRID}x{ZONE_GRID} grid; top {TOP_CELLS} cells; chance = random points on land)")
    print(lead_starts_and_ends(j, args.web_dir).round(1).T.to_string(), "\n")

    table, fair, coverage = lead_coverage(events, args.web_dir)
    print(f"Insight 2: {GRID}x{GRID} cells no human path crosses (land = not black, not water; inland = >= {COAST_CELLS} cells from water or the edge)")
    print(table.round(1).T.to_string())
    for map_id, f in fair.items():
        print(f"  {map_id} with {f['journeys']} random journeys ({f['draws']} draws): inland never crossed "
              f"{f['median']:.1f} % median ({f['min']:.1f} to {f['max']:.1f} %)")
    print()

    table, tests = lead_no_loot(j)
    print("Insight 3: journeys with no loot")
    print(table.round(1).T.to_string())
    print(f"  date halves {tests['halves']}; Lockdown vs AmbroseValley: no loot p = {tests['p_no_loot']:.2g}, "
          f"no loot among bot kills p = {tests['p_bot_killed_no_loot']:.2g}, time to first loot p = {tests['p_first_loot_time']:.2g}")

    if args.figures:
        for path in draw_figures(j, coverage, args.web_dir):
            print("wrote", path.relative_to(REPO_ROOT).as_posix())


if __name__ == "__main__":
    main()
