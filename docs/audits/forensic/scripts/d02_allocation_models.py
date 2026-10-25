"""D02: sensitivity of the traffic heatmap and the ranked traffic regions to where gap time is assigned.

For consecutive human positions A (t0) -> B (t1), g = t1 - t0 (gaps = g > 6 s):
  D5_30    production: g spread along A->B, steps with g > 30 s dropped
  D5_inf   g spread along A->B, no cut-off
  DWELL_A  (g - 5) at A, 5 s along A->B          (best supported by D01: events inside gaps sit near A)
  SPLIT    (g - 5) half at A, half at B, 5 s along A->B
  DWELL_B  (g - 5) at B, 5 s along A->B          (bound; contradicted by D01)
  POINT    every position row credited 5 s in its own cell (sample counting; ignores gap length)
Regions use the production zones rules unchanged (deliberate reuse; only the traffic input varies), for all 19 map x date
selections. Usage (from pipeline/): python d02_allocation_models.py out_json
"""
import json
import sys

import numpy as np
import pandas as pd

from lila_pipeline import zones
from lila_pipeline.build import prepare
from lila_pipeline.export import match_dates, zone_inputs
from lila_pipeline.heatmaps import GRID, trace_step

OUT = sys.argv[1]
MODELS = ["D5_30", "D5_inf", "DWELL_A", "SPLIT", "DWELL_B", "POINT"]


def cell(c):
    return min(max(int(np.floor(c * GRID)), 0), GRID - 1)


def journey_grid(t, u, v, model):
    g = np.zeros((GRID, GRID))
    if model == "POINT":
        for a, b in zip(u, v):
            g[cell(a), cell(b)] += 5
        return g
    for k in range(len(t) - 1):
        dt = t[k + 1] - t[k]
        if dt <= 0:
            continue
        steps = trace_step(u[k], v[k], u[k + 1], v[k + 1])
        if model.startswith("D5"):
            if model == "D5_30" and dt > 30:
                continue
            for i, j, s in steps:
                g[i, j] += dt * s
            continue
        move, still = (dt, 0) if dt <= 6 else (5, dt - 5)
        for i, j, s in steps:
            g[i, j] += move * s
        if still:
            wa = {"DWELL_A": 1.0, "SPLIT": 0.5, "DWELL_B": 0.0}[model]
            g[cell(u[k]), cell(v[k])] += still * wa
            g[cell(u[k + 1]), cell(v[k + 1])] += still * (1 - wa)
    return g


def spearman(a, b):
    m = (a > 0) | (b > 0)
    return float(np.corrcoef(pd.Series(a[m]).rank(), pd.Series(b[m]).rank())[0, 1])


def kendall(x, y):
    n, s = len(x), 0
    for i in range(n):
        for j in range(i + 1, n):
            s += np.sign(x[i] - x[j]) * np.sign(y[i] - y[j])
    return round(float(s / (n * (n - 1) / 2)), 3) if n > 1 else None


def main():
    ev = prepare().events
    dates = match_dates(ev)
    res = {"per_map_all_dates": {}, "selections": {}}
    for m in ["AmbroseValley", "GrandRift", "Lockdown"]:
        inp = zone_inputs(m, ev)
        hum = ev[(ev.map_id == m) & (ev.actor_kind == "human")]
        files = sorted(hum.file.unique())
        idx = {f: n for n, f in enumerate(files)}
        T = {k: np.zeros((len(files), GRID, GRID)) for k in MODELS}
        for f, j in hum[hum.category == "position"].groupby("file", sort=False):
            for k in MODELS:
                T[k][idx[f]] = journey_grid(j.epoch_s.to_numpy(), j.u.to_numpy(float), j.v.to_numpy(float), k)
        assert np.allclose(T["D5_30"], inp.tensors["traffic"])
        base = T["D5_30"].sum(0)
        plaus = np.stack([T[k].sum(0) for k in ["D5_inf", "DWELL_A", "SPLIT"]])  # models not contradicted by the data
        lo, hi = plaus.min(0), plaus.max(0)
        lit = hi >= 60
        r = {"total_s": {k: round(float(T[k].sum()), 0) for k in MODELS},
             "vs_D5_30": {k: {"spearman": round(spearman(base, T[k].sum(0)), 4),
                              "top10_kept": len(set(np.argsort(-base.ravel())[:10]) & set(np.argsort(-T[k].sum(0).ravel())[:10]))}
                          for k in MODELS[1:]},
             "cells_ge_60s_where_plausible_models_differ_by_over_1.5x": f"{int(((hi > 1.5 * lo) & lit).sum())} of {int(lit.sum())}"}
        # regions on the all-dates selection
        regs, values = {}, {}
        for k in MODELS:
            e = zones.collect(T[k], inp.match_of, inp.player_of, key=f"{m}|traffic|all", count_journeys=True)
            c = zones.classify(e)
            regs[k] = [(z["i"], z["j"]) for z in c["zones"] if z["tier"] == "consistent"]
            values[k] = e.grids[0].value
        pub = regs["D5_30"]
        flat = lambda ij: ij[0] * zones.ZONES + ij[1]
        r["consistent_regions"] = {k: len(v) for k, v in regs.items()}
        r["published_regions_still_consistent"] = {k: f"{len(set(pub) & set(v))} of {len(pub)}" for k, v in regs.items()}
        r["new_regions_vs_published"] = {k: sorted(set(v) - set(pub)) for k, v in regs.items() if set(v) - set(pub)}
        r["published_regions_value_range_s_over_plausible_models"] = {
            str(z): [round(min(values[k][flat(z)] for k in ["D5_30", "D5_inf", "DWELL_A", "SPLIT"]), 0),
                     round(max(values[k][flat(z)] for k in ["D5_30", "D5_inf", "DWELL_A", "SPLIT"]), 0)] for z in pub}
        r["kendall_tau_of_published_region_order_vs_D5_30"] = {
            k: kendall([values["D5_30"][flat(z)] for z in pub], [values[k][flat(z)] for z in pub]) for k in MODELS[1:]}
        r["strongest_region"] = {k: (str(regs[k][0]) if regs[k] else None) for k in MODELS}
        res["per_map_all_dates"][m] = r
        print(m, json.dumps(r))
        # every date selection: does the consistent set change?
        for key in ["all", *sorted(set(inp.date_of))]:
            chosen = np.arange(len(inp.match_of)) if key == "all" else np.flatnonzero(inp.date_of == key)
            sets = {}
            for k in ["D5_30", "DWELL_A", "SPLIT", "D5_inf"]:
                e = zones.collect(T[k][chosen], inp.match_of[chosen], inp.player_of[chosen], key=f"{m}|traffic|{key}", count_journeys=True)
                sets[k] = sorted((z["i"], z["j"]) for z in zones.classify(e)["zones"] if z["tier"] == "consistent")
            res["selections"][f"{m}|{key}"] = {k: len(v) for k, v in sets.items()} | {
                "same_set_all_models": all(v == sets["D5_30"] for v in sets.values())}
    sel = res["selections"]
    res["selections_summary"] = {"selections": len(sel), "same_consistent_set_under_all_4_models": sum(v["same_set_all_models"] for v in sel.values())}
    json.dump(res, open(OUT, "w"), indent=1, default=str)
    print(json.dumps(res["selections"], indent=0), res["selections_summary"])


if __name__ == "__main__":
    main()
