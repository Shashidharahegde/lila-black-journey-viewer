"""D03: are the "consistent" hotspot regions robust, or artefacts of one bootstrap seed?

All-dates selection, every map x layer, production zones rules (deliberate reuse; only seed / resample count vary):
  (a) precise stability: 5,000 resamples instead of 300 -> each candidate's stability with a Wilson 95 % interval, and
      its tier when the 0.8 rule is applied to that precise estimate
  (b) 100 seeds x 300 resamples (the production setting): how often each region is classified consistent; Jaccard of
      each run's set with the published set; spatial tolerance (a published region counts as found when a consistent
      region lies within one region, Chebyshev distance <= 1)
  (c) rank stability: each candidate's rank by value across the 5,000 resamples (median and 5-95 % range)
Usage (from pipeline/): python d03_zone_robustness.py out_json
"""
import dataclasses
import json
import math
import sys

import numpy as np

from lila_pipeline import zones
from lila_pipeline.build import prepare
from lila_pipeline.export import zone_inputs

OUT = sys.argv[1]
SEEDS = range(1, 101)


def wilson(p, n, z=1.96):
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(c - h, 3), round(c + h, 3)]


def run(inp, layer, m, rules=zones.RULES, seed=None):
    old = zones.SEED
    if seed is not None:
        zones.SEED = seed
    try:
        e = zones.collect(inp.tensors[layer], inp.match_of, inp.player_of, key=f"{m}|{layer}|all", rules=rules,
                          count_journeys=layer == "traffic")
        return e, zones.classify(e, rules)
    finally:
        zones.SEED = old


def main():
    ev = prepare().events
    res = {}
    for m in ["AmbroseValley", "GrandRift", "Lockdown"]:
        inp = zone_inputs(m, ev)
        for layer in zones.LAYERS:
            _, pub = run(inp, layer, m)
            published = {(z["i"], z["j"]) for z in pub["zones"] if z["tier"] == "consistent"}
            # (a) precise stability
            big = dataclasses.replace(zones.RULES, bootstraps=5000)
            e5, c5 = run(inp, layer, m, rules=big)
            precise = {}
            for z in c5["zones"]:
                key = (z["i"], z["j"])
                precise[str(key)] = {"stability_5000": round(z["stability"], 3), "ci95": wilson(z["stability"], 5000),
                                     "passes_other_checks": z["matches"] >= 5 and z["players"] >= 3 and z["largest_match_share"] <= 0.5,
                                     "tier_5000": z["tier"], "published_consistent": key in published}
            # (c) rank stability of candidates by value across the 5,000 resamples
            g0 = e5.grids[0]
            ranks = (-g0.boot_values).argsort(axis=1).argsort(axis=1) + 1
            for z in c5["zones"]:
                flat = z["i"] * g0.nj + z["j"]
                r = ranks[:, flat]
                precise[str((z["i"], z["j"]))]["rank_published"] = int((-g0.value).argsort().argsort()[flat] + 1)
                precise[str((z["i"], z["j"]))]["rank_median_5_95"] = [int(np.median(r)), int(np.percentile(r, 5)), int(np.percentile(r, 95))]
            # (b) seeds
            freq, jac, near = {}, [], {str(z): 0 for z in published}
            for s in SEEDS:
                _, c = run(inp, layer, m, seed=s)
                got = {(z["i"], z["j"]) for z in c["zones"] if z["tier"] == "consistent"}
                for z in got:
                    freq[str(z)] = freq.get(str(z), 0) + 1
                u = got | published
                jac.append(len(got & published) / len(u) if u else 1.0)
                for z in published:
                    if any(max(abs(z[0] - g[0]), abs(z[1] - g[1])) <= 1 for g in got):
                        near[str(z)] += 1
            res[f"{m}|{layer}"] = {
                "published_consistent": sorted(str(z) for z in published),
                "consistent_with_5000_resamples": sorted(str((z["i"], z["j"])) for z in c5["zones"] if z["tier"] == "consistent"),
                "candidates": precise,
                "seed_runs": len(SEEDS),
                "share_of_runs_consistent_per_region": {k: round(v / len(SEEDS), 2) for k, v in sorted(freq.items(), key=lambda kv: -kv[1])},
                "jaccard_vs_published_mean_min": [round(float(np.mean(jac)), 3), round(float(np.min(jac)), 3)],
                "published_region_found_within_1_region_share": {k: round(v / len(SEEDS), 2) for k, v in near.items()},
            }
            print(m, layer, json.dumps({k: v for k, v in res[f"{m}|{layer}"].items() if k != "candidates"}))
    json.dump(res, open(OUT, "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
