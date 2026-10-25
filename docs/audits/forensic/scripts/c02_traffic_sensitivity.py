"""C02: how much do the traffic heatmap and the validated hotspots depend on how gaps between position rows are treated?

Models (human journeys, after the pipeline's cleaning, all dates):
  D5        production: spread each step's time along A->B; steps > 30 s add nothing   (production code)
  D5_60     same, cut-off 60 s;  D5_inf  same, no cut-off
  DWELL     change-only logging (Part 1, 6.4): a step of dt > 6 s = (dt - 5) s standing at A + 5 s along A->B; no cut-off
Hotspot regions are recomputed with the production zones code (lila_pipeline.zones) on each model's per-journey tensors:
this reuses production *rules* deliberately, so only the traffic input varies.
Usage: python c02_traffic_sensitivity.py out_json
"""
import json
import sys

import numpy as np
import pandas as pd

from lila_pipeline import zones
from lila_pipeline.build import prepare
from lila_pipeline.export import zone_inputs
from lila_pipeline.heatmaps import GRID, trace_step

OUT = sys.argv[1]


def journey_grid(t, u, v, model):
    g = np.zeros((GRID, GRID))
    for k in range(len(t) - 1):
        dt = t[k + 1] - t[k]
        if dt <= 0:
            continue
        if model.startswith("D5"):
            cut = {"D5": 30, "D5_60": 60, "D5_inf": np.inf}[model]
            if dt > cut:
                continue
            for i, j, s in trace_step(u[k], v[k], u[k + 1], v[k + 1]):
                g[i, j] += dt * s
        else:  # DWELL
            move = dt if dt <= 6 else 5
            if dt > 6:
                i0, j0 = (min(max(int(np.floor(c * GRID)), 0), GRID - 1) for c in (u[k], v[k]))
                g[i0, j0] += dt - 5
            for i, j, s in trace_step(u[k], v[k], u[k + 1], v[k + 1]):
                g[i, j] += move * s
    return g


def spearman(a, b):
    m = (a > 0) | (b > 0)
    ra, rb = pd.Series(a[m]).rank(), pd.Series(b[m]).rank()
    return float(np.corrcoef(ra, rb)[0, 1])


def topk(a, k):
    return set(np.argsort(-a.ravel())[:k].tolist())


def main():
    prep = prepare()
    ev = prep.events
    res = {}
    for map_id in ["AmbroseValley", "GrandRift", "Lockdown"]:
        inp = zone_inputs(map_id, ev)
        hum = ev[(ev.map_id == map_id) & (ev.actor_kind == "human") & (ev.category == "position")]
        files = sorted(ev[(ev.map_id == map_id) & (ev.actor_kind == "human")]["file"].unique())
        index = {f: n for n, f in enumerate(files)}
        tensors = {}
        for model in ["D5", "D5_60", "D5_inf", "DWELL"]:
            T = np.zeros((len(files), GRID, GRID))
            for f, j in hum.groupby("file", sort=False):
                T[index[f]] = journey_grid(j.epoch_s.to_numpy(), j.u.to_numpy(float), j.v.to_numpy(float), model)
            tensors[model] = T
        assert np.allclose(tensors["D5"], inp.tensors["traffic"]), "my D5 driver must equal production"
        base = tensors["D5"].sum(0)
        r = {"total_s": {m: round(float(T.sum()), 1) for m, T in tensors.items()}}
        for m in ["D5_60", "D5_inf", "DWELL"]:
            a = tensors[m].sum(0)
            r[m] = {"spearman_vs_D5": round(spearman(base, a), 4), "top10_overlap": len(topk(base, 10) & topk(a, 10)),
                    "top50_overlap": len(topk(base, 50) & topk(a, 50)),
                    "max_cell_ratio": round(float((a[base > 0] / base[base > 0]).max()), 2),
                    "cells_gt_2x": int(((a > 2 * base) & (a > 60)).sum())}
        # hotspots under each model (production rules)
        hz = {}
        for m in ["D5", "DWELL", "D5_inf"]:
            evd = zones.collect(tensors[m], inp.match_of, inp.player_of, key=f"{map_id}|traffic|all", count_journeys=True)
            c = zones.classify(evd)
            hz[m] = sorted((z["i"], z["j"]) for z in c["zones"] if z["tier"] == "consistent")
        r["consistent_regions"] = {m: len(v) for m, v in hz.items()}
        r["consistent_only_in_D5"] = sorted(set(hz["D5"]) - set(hz["DWELL"]))
        r["consistent_only_in_DWELL"] = sorted(set(hz["DWELL"]) - set(hz["D5"]))
        r["consistent_regions_D5"] = hz["D5"]
        res[map_id] = r
        print(map_id, json.dumps(r))
    json.dump(res, open(OUT, "w"), indent=1)


if __name__ == "__main__":
    main()
