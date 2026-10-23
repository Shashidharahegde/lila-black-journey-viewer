"""Print the numbers behind the INSIGHTS.md leads, from the cleaned pipeline output.

    cd pipeline && uv run python tools/insight_stats.py

Human journeys only (`actor_kind == "human"`): the 17 `unknown` journeys (EC-09) and all
bots are left out, as in the heatmaps. Every definition is in the docstring of the function
that computes it. This script prints; it writes nothing. INSIGHTS.md text is S's.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

from lila_pipeline.build import DEFAULT_WEB_DIR, prepare
from lila_pipeline.heatmaps import GRID, traffic_grid
from lila_pipeline.ingest import DEFAULT_DATA_DIR
from lila_pipeline.journeys import DEATH_CATEGORIES
from lila_pipeline.projection import MAPS

ZONE_GRID = 20  # lead 2: 20 × 20 cells per map
TOP_CELLS = 6
ON_MAP_MIN_SHARE = 0.5  # lead 3: a cell is on the map when at least half its pixels are...
ON_MAP_MIN_CHANNEL = 16  # ...brighter than this in any channel (the off-map margin is opaque black, EC-20)
SUBSAMPLE_DRAWS = 200
SEED = 7


def journeys(events: pd.DataFrame) -> pd.DataFrame:
    """One row per human journey: map, start/end time, how it ended, first/last position.

    `ending` is the first death's raw label (`BotKilled`, `KilledByStorm`, `Killed`), or
    `survived` when the journey has no death. "Survived" means "no death recorded", not a
    confirmed extraction (EC-13).
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
    out[["u0", "v0"]] = by_file[["u", "v"]].first().reindex(out.index)
    out[["u1", "v1"]] = by_file[["u", "v"]].last().reindex(out.index)
    return out


def lead_storm(j: pd.DataFrame) -> pd.DataFrame:
    """Lead 1: how human journeys end, per map. Shares are of that map's human journeys."""
    rows = []
    for map_id, part in j.groupby("map"):
        n = len(part)
        storm = part[part["ending"] == "KilledByStorm"]
        rows.append({
            "map": map_id,
            "human_journeys": n,
            "storm_deaths": len(storm),
            "storm_pct": 100 * len(storm) / n,
            "killed_by_bots_pct": 100 * (part["ending"] == "BotKilled").mean(),
            "kill_killed_pair_pct": 100 * (part["ending"] == "Killed").mean(),
            "survived_pct": 100 * (part["ending"] == "survived").mean(),
            "storm_t_min": storm["death_t"].min(),
            "storm_t_median": storm["death_t"].median(),
            "storm_t_max": storm["death_t"].max(),
            "median_journey_s": part["duration_s"].median(),
        })
    return pd.DataFrame(rows).set_index("map")


def _zone(u: pd.Series, v: pd.Series, grid: int = ZONE_GRID) -> pd.Series:
    i = np.clip(np.floor(u.to_numpy(dtype=float) * grid).astype(int), 0, grid - 1)
    k = np.clip(np.floor(v.to_numpy(dtype=float) * grid).astype(int), 0, grid - 1)
    return pd.Series(i * grid + k, index=u.index)


def _concentration(cells: pd.Series) -> tuple[int, float]:
    counts = cells.value_counts()
    return len(counts), 100 * counts.iloc[:TOP_CELLS].sum() / counts.sum()


def lead_starts_and_ends(j: pd.DataFrame) -> pd.DataFrame:
    """Lead 2: in how many 20×20 cells journeys start (first position) and survivors end (last position).

    `top6_pct` = share of journeys whose start (or end) is in the 6 most used cells.
    """
    rows = []
    for map_id, part in j.groupby("map"):
        survivors = part[part["ending"] == "survived"]
        end_cells, end_top = _concentration(_zone(survivors["u1"], survivors["v1"]))
        start_cells, start_top = _concentration(_zone(part["u0"], part["v0"]))
        rows.append({
            "map": map_id,
            "survivors": len(survivors),
            "end_cells": end_cells,
            "end_top6_pct": end_top,
            "journeys": len(part),
            "start_cells": start_cells,
            "start_top6_pct": start_top,
            "shortest_survivor_s": survivors["duration_s"].min(),
        })
    return pd.DataFrame(rows).set_index("map")


def on_map_cells(map_id: str, web_dir: Path, grid: int = GRID) -> np.ndarray:
    """[i, j] mask of heatmap cells that lie on the map art, from the exported WebP.

    Cell (i, j) covers u ∈ [i/grid, (i+1)/grid), v ∈ [j/grid, (j+1)/grid); v runs up, image
    rows run down. On the map = at least ON_MAP_MIN_SHARE of its pixels have a channel
    brighter than ON_MAP_MIN_CHANNEL. Some on-map cells may still be walls or roofs.
    """
    with Image.open(web_dir / "maps" / f"{map_id}.webp") as image:
        pixels = np.asarray(image.convert("RGB")).max(axis=2) > ON_MAP_MIN_CHANNEL
    height, width = pixels.shape
    mask = np.zeros((grid, grid), dtype=bool)
    for i in range(grid):
        x0, x1 = round(i * width / grid), round((i + 1) * width / grid)
        for j in range(grid):
            y0, y1 = round((1 - (j + 1) / grid) * height), round((1 - j / grid) * height)
            mask[i, j] = pixels[y0:y1, x0:x1].mean() >= ON_MAP_MIN_SHARE
    return mask


def lead_coverage(events: pd.DataFrame, web_dir: Path) -> tuple[pd.DataFrame, dict]:
    """Lead 3: on-map 64×64 cells that no human path crosses (traffic as in the heatmaps, D5).

    Also: the same measure on AmbroseValley and GrandRift with random subsets the size of
    Lockdown's human journeys, because coverage grows with the number of journeys.
    """
    positions = events[(events["actor_kind"] == "human") & (events["category"] == "position")]
    rows, masks, grids = [], {}, {}
    for map_id in MAPS:
        part = positions[positions["map_id"] == map_id]
        masks[map_id] = on_map_cells(map_id, web_dir)
        grids[map_id] = traffic_grid(part)
        empty = masks[map_id] & (grids[map_id] == 0)
        rows.append({
            "map": map_id,
            "human_journeys": part["file"].nunique(),
            "on_map_cells": int(masks[map_id].sum()),
            "never_crossed": int(empty.sum()),
            "never_crossed_pct": 100 * empty.sum() / masks[map_id].sum(),
        })
    table = pd.DataFrame(rows).set_index("map")

    n = int(table.loc["Lockdown", "human_journeys"])
    rng = np.random.default_rng(SEED)
    fair = {}
    for map_id in ("AmbroseValley", "GrandRift"):
        part = positions[positions["map_id"] == map_id]
        files = part["file"].unique()
        if len(files) <= n:
            continue
        shares = []
        for _ in range(SUBSAMPLE_DRAWS):
            chosen = part[part["file"].isin(rng.choice(files, size=n, replace=False))]
            empty = masks[map_id] & (traffic_grid(chosen) == 0)
            shares.append(100 * empty.sum() / masks[map_id].sum())
        fair[map_id] = {"journeys": n, "draws": SUBSAMPLE_DRAWS,
                        "never_crossed_pct_median": float(np.median(shares)),
                        "never_crossed_pct_min": float(np.min(shares)),
                        "never_crossed_pct_max": float(np.max(shares))}
    return table, fair


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--web-dir", type=Path, default=DEFAULT_WEB_DIR, help="where the exported minimaps are")
    args = parser.parse_args()

    events = prepare(args.data_dir).events
    j = journeys(events)
    pd.set_option("display.width", 200)
    print(f"Human journeys: {len(j)} (unknown and bot journeys excluded)\n")
    print("Lead 1: how human journeys end (first death's raw label; 'survived' = no death recorded)")
    print(lead_storm(j).round(1).to_string(), "\n")
    print(f"Lead 2: start and survivor end cells ({ZONE_GRID}x{ZONE_GRID} grid; top {TOP_CELLS} cells)")
    print(lead_starts_and_ends(j).round(1).to_string(), "\n")
    table, fair = lead_coverage(events, args.web_dir)
    print(f"Lead 3: on-map {GRID}x{GRID} cells no human path crosses "
          f"(on-map = >= {ON_MAP_MIN_SHARE:.0%} of pixels with a channel > {ON_MAP_MIN_CHANNEL})")
    print(table.round(1).to_string())
    for map_id, f in fair.items():
        print(f"  {map_id} with {f['journeys']} random journeys ({f['draws']} draws): never crossed "
              f"{f['never_crossed_pct_median']:.1f} % median ({f['never_crossed_pct_min']:.1f} to {f['never_crossed_pct_max']:.1f} %)")


if __name__ == "__main__":
    main()
