"""Print the numbers behind INSIGHTS.md, from the cleaned pipeline output, and draw its evidence pictures.

    cd pipeline && uv run python tools/insight_stats.py [--figures]

Human journeys only (`actor_kind == "human"`, which includes the 17 `id_mismatch` journeys, EC-09);
bots are left out, as in the heatmaps. Positions are world x, z. Every definition is in the docstring
of the function that computes it and the constants below. It prints the three insights in the order
of INSIGHTS.md, then the coverage lead that INSIGHTS.md no longer uses; with --figures it also writes
the pictures to docs/evidence/insights/.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

from lila_pipeline.build import DEFAULT_WEB_DIR, REPO_ROOT, prepare
from lila_pipeline.heatmaps import GRID, traffic_grid
from lila_pipeline.ingest import DEFAULT_DATA_DIR
from lila_pipeline.journeys import DEATH_CATEGORIES
from lila_pipeline.projection import MAPS, world_to_uv

SPAWN_RADIUS = 50  # insight 1: first positions closer than this (world units) share a spawn point
EARLY_S = 300  # "died within 5 minutes": a recorded death at or before this match time
EARLY_LOOT_S = 120  # loot "in the first 2 minutes"
SHUFFLES = 5000  # insight 1: spawn-label shuffles for the chance check
RIVERBANK_AREA = (-136, -46, -113, -5)  # insight 1: x min, x max, z min, z max of the riverside buildings
GAP_S = 30  # time between samples further apart than this is not counted (as in the paths)
EXIT_GROUP_RADIUS = 40  # insight 2: survivors' last positions closer than this form a group...
EXIT_CORE_RADIUS = 10  # ...whose median is a spot when at least EXIT_MIN_ENDS endings lie this close to it
EXIT_MIN_ENDS = 5
LOOT_HIGH, LOOT_LOW = 6, 2  # insight 3: 6 or more pickups by 2:00 against 0 to 2
MIN_GROUP = 3  # insight 3: a spawn is compared when both loot groups have at least this many players
ZONE_GRID = 20  # insight 2 check: 20 × 20 cells per map
TOP_CELLS = 6
CHANCE_DRAWS = 500
ON_MAP_MIN_SHARE = 0.5  # coverage: a cell is land when at least half its pixels are land
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
    out[["x0", "z0"]] = by_file[["x", "z"]].first().reindex(out.index)
    out[["x1", "z1"]] = by_file[["x", "z"]].last().reindex(out.index)
    out["t1"] = by_file["t"].last().reindex(out.index)
    loot = humans[humans["category"] == "loot"]
    out["loot"] = loot.groupby("file").size().reindex(out.index).fillna(0).astype(int)
    out["loot_2min"] = loot[loot["t"] <= EARLY_LOOT_S].groupby("file").size().reindex(out.index).fillna(0).astype(int)
    out["first_loot_t"] = loot.groupby("file")["t"].min().reindex(out.index)
    kills = humans[(humans["category"] == "kill") & ~humans["kill_killed_pair"]]
    out["kills"] = kills.groupby("file").size().reindex(out.index).fillna(0).astype(int)
    before = kills["t"] < out["death_t"].fillna(np.inf).reindex(kills["file"]).to_numpy()
    out["kills_before_death"] = kills[before].groupby("file").size().reindex(out.index).fillna(0).astype(int)
    out["early_death"] = out["death_t"] <= EARLY_S
    out["date"] = pd.to_datetime(out["start"], unit="s").dt.date
    return out


def groups(xy: np.ndarray, radius: float) -> np.ndarray:
    """Single-linkage groups: points closer than `radius` (directly or through a chain) share a label."""
    parent = np.arange(len(xy))

    def root(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    close = np.hypot(xy[:, None, 0] - xy[None, :, 0], xy[:, None, 1] - xy[None, :, 1]) <= radius
    for a, b in zip(*np.nonzero(np.triu(close, 1))):
        parent[root(a)] = root(b)
    return np.array([root(a) for a in range(len(xy))])


def with_spawns(j: pd.DataFrame) -> pd.DataFrame:
    """`spawn` label per journey: its first position's group within SPAWN_RADIUS, per map.

    Every human journey is first recorded at match time 0, so the first position is where it spawned.
    """
    out = j.copy()
    out["spawn"] = ""
    for map_id, part in j.groupby("map"):
        out.loc[part.index, "spawn"] = [f"{map_id}:{g}" for g in groups(part[["x0", "z0"]].to_numpy(), SPAWN_RADIUS)]
    return out


def _in_area(df: pd.DataFrame, area=RIVERBANK_AREA) -> pd.Series:
    return df["x"].between(area[0], area[1]) & df["z"].between(area[2], area[3])


def lead_spawns(j: pd.DataFrame, events: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Insight 1: AmbroseValley spawn points and the share of their journeys that die within 5 minutes.

    The worst spawn is compared with the rest: a shuffle check (spawn labels permuted SHUFFLES times;
    how often is the best-to-worst gap at least the real one), each full date (not `partial`), and the
    riverside area. Time in the area = the time to the next position sample, gaps over GAP_S left out.
    """
    amb = with_spawns(j[j["map"] == "AmbroseValley"])
    table = amb.groupby("spawn").agg(x=("x0", "median"), z=("z0", "median"), journeys=("early_death", "size"),
                                     died_5min=("early_death", "sum"), loot_2min_median=("loot_2min", "median"))
    table["died_5min_pct"] = 100 * table["died_5min"] / table["journeys"]
    table = table.sort_values("died_5min_pct", ascending=False)
    worst = table.index[0]
    spawn, rest = amb[amb["spawn"] == worst], amb[amb["spawn"] != worst]
    early = spawn[spawn["early_death"]]

    rng = np.random.default_rng(SEED)
    labels, died = amb["spawn"].to_numpy(), amb["early_death"].to_numpy()
    real_gap = table["died_5min_pct"].max() - table["died_5min_pct"].min()
    hits = 0
    for _ in range(SHUFFLES):
        shares = pd.Series(died).groupby(rng.permutation(labels)).mean() * 100
        hits += shares.max() - shares.min() >= real_gap
    full_dates = sorted(j["date"].unique())[1:-1]  # the first and last dates are partial (D1)
    by_date = {str(d): (int(spawn[spawn["date"] == d]["early_death"].sum()), int((spawn["date"] == d).sum()),
                        100 * rest[rest["date"] == d]["early_death"].mean()) for d in full_dates}

    humans = events[(events["actor_kind"] == "human") & (events["map_id"] == "AmbroseValley")]
    positions = humans[humans["category"] == "position"].sort_values(["file", "epoch_s", "row"]).copy()
    positions["dt"] = (positions.groupby("file")["epoch_s"].shift(-1) - positions["epoch_s"]).where(lambda s: s <= GAP_S, 0)
    deaths = humans[humans["category"].isin(DEATH_CATEGORIES)]
    area_deaths = deaths[_in_area(deaths)].merge(amb[["spawn"]], left_on="file", right_index=True)
    reached = positions[(positions["t"] <= EARLY_S) & _in_area(positions) & positions["file"].isin(spawn.index)]
    checks = {
        "worst": worst, "others_journeys": len(rest), "others_died_5min": int(rest["early_death"].sum()),
        "others_pct": 100 * rest["early_death"].mean(), "gap_pp": real_gap, "shuffles": SHUFFLES, "shuffle_hits": int(hits),
        "by_full_date": by_date,
        "early_no_kill": int((early["kills_before_death"] == 0).sum()), "early": len(early),
        "early_before_2min": int((early["death_t"] < 120).sum()), "no_loot_2min": int((spawn["loot_2min"] == 0).sum()),
        "reached_area_5min": reached["file"].nunique(), "spawn_journeys": len(spawn),
        "area_time_pct": 100 * positions.loc[_in_area(positions), "dt"].sum() / positions["dt"].sum(),
        "area_deaths": len(area_deaths), "deaths": len(deaths),
        "area_deaths_by_spawn": area_deaths.groupby("spawn").size().sort_values(ascending=False).to_dict(),
    }
    return table, checks


def exit_spots(survivors: pd.DataFrame) -> np.ndarray:
    """[x, z] of a map's inferred exit spots: the median of each EXIT_GROUP_RADIUS group of survivors'
    last positions, kept when at least EXIT_MIN_ENDS endings lie within EXIT_CORE_RADIUS of it."""
    labels = groups(survivors[["x1", "z1"]].to_numpy(), EXIT_GROUP_RADIUS)
    spots = []
    for _, part in survivors.groupby(labels):
        x, z = part["x1"].median(), part["z1"].median()
        if (np.hypot(survivors["x1"] - x, survivors["z1"] - z) <= EXIT_CORE_RADIUS).sum() >= EXIT_MIN_ENDS:
            spots.append((x, z))
    return np.array(spots)


def _nearest(x, z, spots: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    d = np.hypot(np.asarray(x, float)[:, None] - spots[:, 0], np.asarray(z, float)[:, None] - spots[:, 1])
    return d.argmin(axis=1), d.min(axis=1)


def lead_exits(j: pd.DataFrame, events: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Insight 2: where journeys without a recorded death end (inferred exits, EC-13).

    An ending is "at" a spot when its last position is within EXIT_CORE_RADIUS of it. `sample_pct` =
    share of the map's human position samples within EXIT_CORE_RADIUS of any spot.
    """
    positions = events[(events["actor_kind"] == "human") & (events["category"] == "position")]
    rows, spot_rows, extra = [], [], {}
    for map_id, part in with_spawns(j).groupby("map"):
        survivors = part[part["ending"] == "survived"]
        spots = exit_spots(survivors)
        spot, dist = _nearest(survivors["x1"], survivors["z1"], spots)
        at = survivors[dist <= EXIT_CORE_RADIUS].assign(spot=spot[dist <= EXIT_CORE_RADIUS])
        died = part[part["ending"] != "survived"]
        samples = positions[positions["map_id"] == map_id]
        rows.append({"map": map_id, "survivors": len(survivors), "spots": len(spots), "ending_at_spots": len(at),
                     "ending_at_spots_pct": 100 * len(at) / len(survivors),
                     "sample_pct": 100 * (_nearest(samples["x"], samples["z"], spots)[1] <= EXIT_CORE_RADIUS).mean(),
                     "deaths_last_position_at_spots": int((_nearest(died["x1"], died["z1"], spots)[1] <= EXIT_CORE_RADIUS).sum())})
        if map_id != "AmbroseValley":
            continue
        for k, (x, z) in enumerate(spots):
            ends = at[at["spot"] == k]
            spot_rows.append({"x": x, "z": z, "journeys": len(ends), "share_pct": 100 * len(ends) / len(at),
                              "end_t_median": ends["t1"].median(), "kills_per_journey": ends["kills"].mean()})
        centres = part.groupby("spawn")[["x0", "z0"]].median()
        nearest_spot = dict(zip(centres.index, _nearest(centres["x0"], centres["z0"], spots)[0]))
        extra["from_spot_nearest_spawn"] = int((at["spot"] == at["spawn"].map(nearest_spot)).sum())
        extra["at_spots"] = len(at)
        extra["spawn_centres"] = centres
    spots_table = pd.DataFrame(spot_rows).sort_values("journeys", ascending=False)
    return pd.DataFrame(rows).set_index("map"), spots_table, extra


def lead_early_loot(j: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Insight 3 checks: no-loot journeys per Lockdown spawn, and loot by 2:00 against a death by 5:00.

    The second part takes the journeys still alive at 2:00 (no death at or before EARLY_LOOT_S) on
    every map and compares LOOT_HIGH or more pickups by 2:00 with LOOT_LOW or fewer, overall and per
    spawn where both groups have at least MIN_GROUP players.
    """
    lock = with_spawns(j[j["map"] == "Lockdown"])
    none = lock[lock["loot"] == 0].groupby("spawn").size()
    per_spawn = lock.groupby("spawn").agg(x=("x0", "median"), z=("z0", "median"), journeys=("loot", "size"),
                                          died_5min=("early_death", "sum"))
    per_spawn["no_loot"] = none.reindex(per_spawn.index).fillna(0).astype(int)
    per_spawn = per_spawn.sort_values("no_loot", ascending=False)

    alive = with_spawns(j)
    alive = alive[~(alive["death_t"] <= EARLY_LOOT_S)]
    high, low = alive[alive["loot_2min"] >= LOOT_HIGH], alive[alive["loot_2min"] <= LOOT_LOW]
    compared = worse = 0
    for _, part in alive.groupby("spawn"):
        h, lo = part[part["loot_2min"] >= LOOT_HIGH], part[part["loot_2min"] <= LOOT_LOW]
        if len(h) >= MIN_GROUP and len(lo) >= MIN_GROUP:
            compared += 1
            worse += lo["early_death"].mean() > h["early_death"].mean()
    checks = {"alive_at_2min": len(alive), "high_died_5min_pct": 100 * high["early_death"].mean(),
              "low_died_5min_pct": 100 * low["early_death"].mean(), "spawns_compared": compared, "low_worse": int(worse)}
    return per_spawn, checks


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
    """Insight 2 check: in how many 20×20 cells journeys start (first position) and survivors end (last position).

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
    """Coverage (an earlier draft lead, not in INSIGHTS.md): inland 64×64 cells that no human path crosses (traffic as in the heatmaps, D5).

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
    """Insight 3: journeys with no `Loot` event, per map, and how they end (`lead_early_loot` has the rest).

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


SPAWN_FIGURE_PX = 1600


def draw_spawn_figure(j: pd.DataFrame, table: pd.DataFrame, web_dir: Path, out: Path) -> Path:
    """Insight 1 picture: AmbroseValley spawns labelled with their 5-minute death rate (the worst in
    orange, the rest in the human blue), every death within 5 minutes (red dots) and the riverside
    area (white box). `table` is `lead_spawns`'s, worst spawn first."""
    image = Image.open(web_dir / "maps" / "AmbroseValley.webp").convert("RGB")
    image.thumbnail((SPAWN_FIGURE_PX, SPAWN_FIGURE_PX))
    w, h = image.size
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=24)

    def px(x, z):
        u, v = world_to_uv("AmbroseValley", x, z)
        return float(u) * w, (1 - float(v)) * h

    x0, x1, z0, z1 = RIVERBANK_AREA
    (left, top), (right, bottom) = px(x0, z1), px(x1, z0)
    draw.rectangle([left, top, right, bottom], outline=(255, 255, 255), width=2)
    early = j[(j["map"] == "AmbroseValley") & j["early_death"]]
    for u, v in early[["death_u", "death_v"]].itertuples(index=False):
        draw.ellipse([u * w - 4, (1 - v) * h - 4, u * w + 4, (1 - v) * h + 4], fill=(240, 60, 60))
    for k, row in enumerate(table.itertuples()):
        cx, cy = px(row.x, row.z)
        draw.ellipse([cx - 15, cy - 15, cx + 15, cy + 15], fill=(233, 145, 36) if k == 0 else (37, 137, 245),
                     outline=(255, 255, 255), width=2)
        label = f"{row.died_5min_pct:.0f}%"
        x_text, y_text = cx + 22, cy - 15
        box = draw.textbbox((x_text, y_text), label, font=font)
        draw.rectangle([box[0] - 6, box[1] - 6, box[2] + 6, box[3] + 6], fill=(10, 14, 20))
        draw.text((x_text, y_text), label, fill=(255, 255, 255), font=font)
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, quality=85)
    return out


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

    spawns, c = lead_spawns(j, events)
    print(f"Insight 1: AmbroseValley spawn points (first positions within {SPAWN_RADIUS} units), deaths within {EARLY_S} s")
    print(spawns.round(1).to_string())
    print(f"  the other spawns: {c['others_died_5min']} of {c['others_journeys']} ({c['others_pct']:.1f} %); "
          f"gap {c['gap_pp']:.1f} pp, reached by {c['shuffle_hits']} of {c['shuffles']} label shuffles")
    for date, (died, n, others) in c["by_full_date"].items():
        print(f"  {date}: worst spawn {died} of {n}, other spawns {others:.1f} %")
    print(f"  of its {c['early']} early deaths: {c['early_no_kill']} before any kill, {c['early_before_2min']} before 2:00; "
          f"{c['no_loot_2min']} of {c['spawn_journeys']} looted nothing by 2:00")
    print(f"  riverside area: reached within 5 min by {c['reached_area_5min']} of {c['spawn_journeys']}; "
          f"{c['area_time_pct']:.1f} % of human time, {c['area_deaths']} of {c['deaths']} deaths; "
          f"deaths there by spawn {list(c['area_deaths_by_spawn'].values())}\n")

    exits, spots, extra = lead_exits(j, events)
    print(f"Insight 2: survivors' last positions within {EXIT_CORE_RADIUS} units of an exit spot "
          f"(groups within {EXIT_GROUP_RADIUS}, at least {EXIT_MIN_ENDS} endings)")
    print(exits.round(1).T.to_string())
    print(spots.round(2).to_string(index=False))
    print(f"  left from the spot nearest their spawn: {extra['from_spot_nearest_spawn']} of {extra['at_spots']}")
    worst_xy = spawns[["x", "z"]].iloc[0].to_numpy()
    earliest = spots.sort_values("end_t_median").iloc[0]
    print(f"  earliest spot ({earliest['x']:.0f}, {earliest['z']:.0f}) is "
          f"{np.hypot(earliest['x'] - worst_xy[0], earliest['z'] - worst_xy[1]):.1f} units from the worst spawn")
    print(f"  check, {ZONE_GRID}x{ZONE_GRID} cells (top {TOP_CELLS}; chance = random points on land)")
    print(lead_starts_and_ends(j, args.web_dir).round(1).T.to_string(), "\n")

    table, tests = lead_no_loot(j)
    print("Insight 3: journeys with no loot")
    print(table.round(1).T.to_string())
    print(f"  date halves {tests['halves']}; Lockdown vs AmbroseValley: no loot p = {tests['p_no_loot']:.2g}, "
          f"no loot among bot kills p = {tests['p_bot_killed_no_loot']:.2g}, time to first loot p = {tests['p_first_loot_time']:.2g}")
    per_spawn, e = lead_early_loot(j)
    print(per_spawn.round(0).to_string())
    print(f"  alive at 2:00: {e['alive_at_2min']}; died by 5:00 with {LOOT_HIGH}+ pickups {e['high_died_5min_pct']:.1f} %, "
          f"with 0 to {LOOT_LOW} {e['low_died_5min_pct']:.1f} %; low-loot worse at {e['low_worse']} of {e['spawns_compared']} spawns\n")

    table, fair, coverage = lead_coverage(events, args.web_dir)
    print(f"Coverage (not in INSIGHTS.md): {GRID}x{GRID} cells no human path crosses (land = not black, not water; inland = >= {COAST_CELLS} cells from water or the edge)")
    print(table.round(1).T.to_string())
    for map_id, f in fair.items():
        print(f"  {map_id} with {f['journeys']} random journeys ({f['draws']} draws): inland never crossed "
              f"{f['median']:.1f} % median ({f['min']:.1f} to {f['max']:.1f} %)")

    if args.figures:
        written = draw_figures(j, coverage, args.web_dir)
        written.append(draw_spawn_figure(j, spawns, args.web_dir, FIGURE_DIR / "spawn_early_deaths_AmbroseValley.webp"))
        for path in written:
            print("wrote", path.relative_to(REPO_ROOT).as_posix())


if __name__ == "__main__":
    main()
