"""Spatial sparsity and hotspot-validity analysis for the heatmaps (spec 06) -> docs/evidence/spatial_analysis/.

    cd pipeline && uv run python tools/spatial_analysis.py

Evidence only: nothing here changes the pipeline, the generated files or the website.
Everything is computed from the cleaned human events (`prepare()`), at the pipeline's 64 x 64 grid, and from the
same cells summed into 32 x 32 and 16 x 16 (the cell edges nest, so the sums are exact). Per-match and per-journey
grids are kept so distinct contributing matches can be counted from the source events, not guessed from totals.

Two independence units are used for every support / split / bootstrap result: `match`, and `player` (all of one
player's matches together). Players repeat across matches (see `distinct_human_players`), so match-level splits can
leak a player's habits into both halves; the player-level numbers are the stricter test.

Random steps (splits, bootstraps) use a fixed seed, so a rerun gives the same numbers.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from lila_pipeline.build import prepare
from lila_pipeline.export import match_dates, match_starts
from lila_pipeline.heatmaps import GRID, traffic_grid
from lila_pipeline.journeys import DEATH_CATEGORIES, counted_kills
from lila_pipeline.projection import MAPS

OUT_DIR = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "spatial_analysis"
SEED = 20261023
RESOLUTIONS = (64, 32, 16)
LAYERS = ("kills", "deaths", "traffic")
TOP_KS = (5, 10)
SPLITS = 300
BOOTSTRAPS = 300
MIN_MATCHES = 3  # a cell is "supported" when this many different units (matches, or players) contribute to it
BAND_EDGES = (0.25, 0.5, 0.75)  # proposed bands, in normalised intensity (see the report)


def coarse(tensor: np.ndarray, g: int) -> np.ndarray:
    """Sum 64 x 64 cells into g x g (the last two axes)."""
    f = GRID // g
    shape = tensor.shape[:-2] + (g, f, g, f)
    return tensor.reshape(shape).sum(axis=(-3, -1))


def bin_events(df: pd.DataFrame, unit_index: dict[str, int], n_units: int, column: str = "match_id") -> np.ndarray:
    """Event counts per unit (match or player) and cell, binned exactly as the pipeline bins them (floor, clipped)."""
    out = np.zeros((n_units, GRID, GRID), dtype=np.float32)
    i = np.clip(np.floor(df["u"].to_numpy(dtype=float) * GRID).astype(int), 0, GRID - 1)
    j = np.clip(np.floor(df["v"].to_numpy(dtype=float) * GRID).astype(int), 0, GRID - 1)
    m = df[column].map(unit_index).to_numpy()
    np.add.at(out, (m, i, j), 1)
    return out


def top_k_mask(values: np.ndarray, k: int, rng: np.random.Generator) -> np.ndarray:
    """Boolean mask of the k largest positive cells; ties are broken at random, zero cells are never chosen."""
    flat = values.ravel().astype(float)
    score = np.where(flat > 0, flat + rng.random(flat.size) * 1e-9 * max(flat.max(), 1.0) + rng.random(flat.size) * 1e-6, -np.inf)
    k = min(k, int((flat > 0).sum()))
    mask = np.zeros(flat.size, dtype=bool)
    if k > 0:
        mask[np.argpartition(-score, k - 1)[:k]] = True
    return mask


def distribution(values: np.ndarray, layer: str) -> dict:
    v = np.sort(values[values > 0])[::-1]
    out: dict = {
        "total": round(float(v.sum()), 1),
        "occupied_cells": int(v.size),
        "cells": int(values.size),
        "occupied_share": round(v.size / values.size, 4),
        "quantiles": {q: round(float(np.quantile(v, p)), 2) for q, p in (("p50", 0.5), ("p75", 0.75), ("p90", 0.9), ("p95", 0.95), ("p99", 0.99), ("max", 1.0))},
    }
    total = v.sum()
    out["top1_share"] = round(float(v[:1].sum() / total), 4)
    out["top5_cells_share"] = round(float(v[:5].sum() / total), 4)
    out["top10_cells_share"] = round(float(v[:10].sum() / total), 4)
    out["top10pct_cells_share"] = round(float(v[: max(1, math.ceil(0.1 * v.size))].sum() / total), 4)
    cum = np.cumsum(v) / total
    out["cells_for_50pct"] = int(np.searchsorted(cum, 0.5) + 1)
    out["cells_for_80pct"] = int(np.searchsorted(cum, 0.8) + 1)
    asc = v[::-1]
    out["gini_occupied"] = round(float((2 * np.arange(1, asc.size + 1) - asc.size - 1).dot(asc) / (asc.size * asc.sum())), 3) if asc.size > 1 else 0.0
    if layer == "traffic":
        edges = [(0, 10), (10, 60), (60, 300), (300, 600), (600, float("inf"))]
        labels = ["<10 s", "10-60 s", "1-5 min", "5-10 min", ">=10 min"]
    else:
        edges = [(1, 2), (2, 3), (3, 5), (5, 10), (10, float("inf"))]
        labels = ["1", "2", "3-4", "5-9", ">=10"]
    out["bands"] = {
        label: {
            "cells": int(((v >= lo) & (v < hi)).sum()),
            "cell_share": round(float(((v >= lo) & (v < hi)).sum() / v.size), 3),
            "value_share": round(float(v[(v >= lo) & (v < hi)].sum() / total), 3),
        }
        for label, (lo, hi) in zip(labels, edges)
    }
    if layer != "traffic":
        out["single_event_cell_share"] = round(float((v == 1).sum() / v.size), 3)
        out["single_event_share_of_events"] = round(float(v[v == 1].sum() / total), 3)
    return out


def support(cell_total: np.ndarray, per_match: np.ndarray) -> dict:
    """Distinct contributing matches for the strongest cells, and for the whole layer."""
    n_matches = (per_match > 0).sum(axis=0)
    flat_total = cell_total.ravel()
    order = np.argsort(-flat_total)[:10]
    top = []
    for c in order:
        col = per_match.reshape(per_match.shape[0], -1)[:, c]
        top.append({"value": round(float(flat_total[c]), 1), "matches": int((col > 0).sum()), "largest_match_share": round(float(col.max() / col.sum()), 3)})
    occupied = flat_total > 0
    supported = n_matches.ravel() >= MIN_MATCHES
    return {
        "top10": top,
        "top10_min_matches": min(t["matches"] for t in top),
        "top10_median_matches": float(np.median([t["matches"] for t in top])),
        "top10_cells_with_min_support": sum(t["matches"] >= MIN_MATCHES for t in top),
        "occupied_cells_with_min_support_share": round(float(supported[occupied].mean()), 3),
        "value_in_supported_cells_share": round(float(flat_total[supported].sum() / flat_total.sum()), 3),
    }


def split_half(per_match: np.ndarray, rng: np.random.Generator, dates_order: np.ndarray | None = None) -> dict:
    """Do two disjoint halves of the matches pick out the same strongest cells?"""
    n, g, _ = per_match.shape
    flat = per_match.reshape(n, -1)
    out: dict = {}
    for k in TOP_KS:
        exact, near, null = [], [], []
        runs = 1 if dates_order is not None else SPLITS
        for r in range(runs):
            if dates_order is not None:
                half = np.zeros(n, dtype=bool)
                half[dates_order[: n // 2]] = True  # earlier half of the matches by start time
            else:
                half = np.zeros(n, dtype=bool)
                half[rng.permutation(n)[: n // 2]] = True
            a = half.astype(float) @ flat
            b = (~half).astype(float) @ flat
            ma, mb = top_k_mask(a, k, rng), top_k_mask(b, k, rng)
            exact.append((ma & mb).sum() / k)
            # a cell in one half's top-k with a neighbour (8-neighbourhood) in the other's top-k also counts
            grid_b = mb.reshape(g, g)
            padded = np.pad(grid_b, 1)
            near_b = sum(np.roll(np.roll(padded, di, 0), dj, 1) for di in (-1, 0, 1) for dj in (-1, 0, 1))[1:-1, 1:-1] > 0
            near.append((ma.reshape(g, g) & near_b).sum() / k)
            # chance level: the same B values placed at random over the cells either half saw
            pool = np.flatnonzero((a > 0) | (b > 0))
            shuffled = np.zeros_like(b)
            shuffled[pool] = rng.permutation(b[pool])
            null.append((ma & top_k_mask(shuffled, k, rng)).sum() / k)
        out[f"top{k}"] = {
            "exact_overlap_median": round(float(np.median(exact)), 3),
            "exact_overlap_p05_p95": [round(float(np.percentile(exact, 5)), 3), round(float(np.percentile(exact, 95)), 3)] if runs > 1 else None,
            "within_one_cell_median": round(float(np.median(near)), 3),
            "chance_exact_median": round(float(np.median(null)), 3),
        }
    return out


def bootstrap_stability(per_match: np.ndarray, rng: np.random.Generator, k: int) -> dict:
    """How often is each cell among the k strongest when the matches are resampled with replacement?"""
    n = per_match.shape[0]
    flat = per_match.reshape(n, -1)
    hits = np.zeros(flat.shape[1])
    for _ in range(BOOTSTRAPS):
        w = np.bincount(rng.integers(0, n, n), minlength=n).astype(float)
        hits += top_k_mask(w @ flat, k, rng)
    freq = hits / BOOTSTRAPS
    total = flat.sum(axis=0)
    out = {}
    for level in (0.5, 0.8, 0.9):
        sel = freq >= level
        out[f"freq>={level}"] = {"cells": int(sel.sum()), "value_share": round(float(total[sel].sum() / total.sum()), 3)}
    return out


def poisson_sf(k: int, lam: float) -> float:
    """P(X >= k) for X ~ Poisson(lam)."""
    if k <= 0:
        return 1.0
    if lam <= 0:
        return 0.0
    term = math.exp(-lam)
    cdf = term
    for i in range(1, k):
        term *= lam / i
        cdf += term
    return max(0.0, 1.0 - cdf)


def traffic_adjusted(events: np.ndarray, traffic: np.ndarray) -> dict:
    """Diagnostic only: which cells hold more events than their share of observed player time would predict (BH, 5 %)."""
    n_events = events.sum()
    t_total = traffic.sum()
    cells = np.flatnonzero(events.ravel() > 0)
    ev, tr = events.ravel(), traffic.ravel()
    in_untrafficked = float(ev[(tr == 0)].sum() / n_events)
    ps = []
    for c in cells:
        lam = n_events * tr[c] / t_total
        ps.append((poisson_sf(int(ev[c]), lam) if tr[c] > 0 else 0.0, c))
    ps.sort()
    m = len(ps)
    passed = [c for rank, (p, c) in enumerate(ps, 1) if p <= 0.05 * rank / m]
    # BH: everything up to the largest rank that passes
    last = max((rank for rank, (p, _) in enumerate(ps, 1) if p <= 0.05 * rank / m), default=0)
    sig = [c for _, c in ps[:last]]
    return {
        "events_in_cells_with_no_observed_traffic_share": round(in_untrafficked, 3),
        "cells_with_events": int(m),
        "cells_above_traffic_expectation_fdr5": len(sig),
        "events_in_those_cells_share": round(float(ev[sig].sum() / n_events), 3) if sig else 0.0,
        "_passed_ignored": len(passed),
    }


def rank_corr(a: np.ndarray, b: np.ndarray) -> float:
    mask = (a > 0) | (b > 0)
    return round(float(pd.Series(a[mask]).rank().corr(pd.Series(b[mask]).rank())), 3)


def band_summary(values: np.ndarray, layer: str, domain: float) -> dict:
    """Cells per proposed band under thresholds fixed from the layer's domain (so they don't move between dates)."""
    v = values[values > 0]
    if layer == "traffic":
        edges = [math.expm1(e * math.log1p(domain)) for e in BAND_EDGES]
    else:
        edges = [e * domain for e in BAND_EDGES]
    counts = [int(((v >= lo) & (v < hi)).sum()) for lo, hi in zip([0, *edges], [*edges, float("inf")])]
    return {"edges_raw": [round(e, 1) for e in edges], "cells_per_band": counts}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    prepared = prepare()
    events = prepared.events
    dates = match_dates(events)
    starts = match_starts(events)
    humans = events[events["actor_kind"] == "human"]
    result: dict = {"seed": SEED, "splits": SPLITS, "bootstraps": BOOTSTRAPS, "min_matches": MIN_MATCHES, "maps": {}}

    for map_id in MAPS:
        part = humans[humans["map_id"] == map_id]
        match_ids = sorted(part["match_id"].unique())
        index = {m: k for k, m in enumerate(match_ids)}
        n = len(match_ids)
        match_date = np.array([dates[m] for m in match_ids])
        order_by_start = np.argsort([starts[m] for m in match_ids])

        players = sorted(part["user_id"].unique())
        pindex = {u: k for k, u in enumerate(players)}
        kill_rows = part[counted_kills(part)]
        death_rows = part[part["category"].isin(DEATH_CATEGORIES)]
        positions = part[part["category"] == "position"]
        journeys = []  # (match index, player index, traced seconds per cell)
        for file, journey in positions.groupby("file", sort=False):
            journeys.append((index[journey["match_id"].iat[0]], pindex[journey["user_id"].iat[0]], traffic_grid(journey).astype(np.float32)))
        per_journey = np.stack([g for _, _, g in journeys])

        def unit_tensors(unit: str) -> dict[str, np.ndarray]:
            if unit == "match":
                lookup, size, col = index, n, "match_id"
            else:
                lookup, size, col = pindex, len(players), "user_id"
            traffic = np.zeros((size, GRID, GRID), dtype=np.float32)
            for m, pl, grid in journeys:
                traffic[m if unit == "match" else pl] += grid
            return {"kills": bin_events(kill_rows, lookup, size, col), "deaths": bin_events(death_rows, lookup, size, col), "traffic": traffic}

        by_unit = {"match": unit_tensors("match"), "player": unit_tensors("player")}
        tensors = by_unit["match"]
        traffic_per_match = tensors["traffic"]
        out: dict = {
            "human_matches": n,
            "human_journeys": int(part["file"].nunique()),
            "distinct_human_players": len(players),
            "layers": {},
        }
        for layer in LAYERS:
            layer_out: dict = {"by_resolution": {}}
            for g in RESOLUTIONS:
                total = coarse(tensors[layer], g).sum(axis=0)
                entry = {"distribution": distribution(total, layer)}
                for unit in ("match", "player"):
                    pm = coarse(by_unit[unit][layer], g)
                    entry[unit] = {
                        "support": support(total, pm),
                        "split_half_random": split_half(pm, rng),
                        "bootstrap_top10": bootstrap_stability(pm, rng, 10),
                        "bootstrap_top5": bootstrap_stability(pm, rng, 5),
                    }
                entry["match"]["split_half_early_vs_late"] = split_half(coarse(tensors[layer], g), rng, dates_order=order_by_start)
                layer_out["by_resolution"][str(g)] = entry
            out["layers"][layer] = layer_out

        # how kills and deaths relate to observed player time, and what traffic's journey coverage adds
        for g in RESOLUTIONS:
            tr = coarse(traffic_per_match, g).sum(axis=0)
            for layer in ("kills", "deaths"):
                ev = coarse(tensors[layer], g).sum(axis=0)
                entry = out["layers"][layer]["by_resolution"][str(g)]
                entry["vs_traffic"] = {
                    "rank_corr_with_traffic": rank_corr(ev, tr),
                    "top10_cell_overlap_with_top10_traffic_cells": int((top_k_mask(ev, 10, rng) & top_k_mask(tr, 10, rng)).sum()),
                    "share_of_events_in_top10pct_traffic_cells": round(float(ev.ravel()[tr.ravel() >= np.quantile(tr[tr > 0], 0.9)].sum() / ev.sum()), 3),
                    "traffic_adjusted": traffic_adjusted(ev, tr),
                }
            tj = coarse(per_journey, g)
            time = tj.sum(axis=0)
            covered = (tj > 0).sum(axis=0)
            entry = out["layers"]["traffic"]["by_resolution"][str(g)]
            flat_t = tj.reshape(tj.shape[0], -1)
            top_cells = np.argsort(-time.ravel())[:10]
            entry["journey_coverage"] = {
                "rank_corr_time_vs_journeys": rank_corr(time, covered.astype(float)),
                "top10_time_cells": [
                    {"seconds": round(float(time.ravel()[c]), 1), "journeys": int((flat_t[:, c] > 0).sum()), "largest_journey_share": round(float(flat_t[:, c].max() / time.ravel()[c]), 3)}
                    for c in top_cells
                ],
                "top10_overlap_time_vs_journeys": int((top_k_mask(time, 10, rng) & top_k_mask(covered.astype(float), 10, rng)).sum()),
                "cells_where_one_journey_is_over_half_of_the_time_share": round(float(((flat_t.max(axis=0) > 0.5 * time.ravel()) & (time.ravel() > 0)).sum() / (time > 0).sum()), 3),
            }

        # proposed bands, with thresholds fixed from each layer's domain over all dates
        for layer in LAYERS:
            by_date = {}
            domain = 0.0
            for d in sorted(set(match_date)):
                total = tensors[layer][match_date == d].sum(axis=0)
                domain = max(domain, float(total.max()))
            total_all = tensors[layer].sum(axis=0)
            domain = max(domain, float(total_all.max()))
            out["layers"][layer]["bands"] = {"domain_64": round(domain, 1), "all": band_summary(total_all, layer, domain)}
            for d in sorted(set(match_date)):
                by_date[d] = band_summary(tensors[layer][match_date == d].sum(axis=0), layer, domain)["cells_per_band"]
            out["layers"][layer]["bands"]["cells_per_band_by_date"] = by_date
        result["maps"][map_id] = out
        print(f"{map_id}: {n} matches, {out['human_journeys']} journeys done")

    (OUT_DIR / "spatial_analysis.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    print("wrote", OUT_DIR / "spatial_analysis.json")


if __name__ == "__main__":
    main()
