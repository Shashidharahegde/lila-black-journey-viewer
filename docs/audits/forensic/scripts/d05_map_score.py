"""D05: how much of the map performance ranking comes from the score's construction rather than the data?

Variants of the all-dates score over the three maps: published (5 parts, min-max, equal weights); leave each part out;
rank-based (Borda) instead of min-max; z-score instead of min-max. Each is bootstrapped (1,000 resamples of human journeys
within each map). Also the five parts as plain descriptive figures with 95 % bootstrap intervals.
No lila_pipeline imports. Usage: python d05_map_score.py raw_all.parquet files.parquet web_dir out_json
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import c01_reconstruct as c01  # noqa: E402

OUT = sys.argv[4]
MAPS = ["AmbroseValley", "GrandRift", "Lockdown"]
PARTS = {"human_journeys": True, "median_span_s": True, "kills_per_journey": True, "loot_per_journey": True,
         "storm_deaths_per_100": False}


def parts_of(t):
    return {"human_journeys": len(t), "median_span_s": float(np.median(t.span)), "kills_per_journey": t.kills.mean(),
            "loot_per_journey": t.loot.mean(), "storm_deaths_per_100": 100 * t.storm.mean()}


def score(tables, use=tuple(PARTS), norm="minmax"):
    P = [parts_of(t) for t in tables]
    s = np.zeros(len(tables))
    for p in use:
        v = np.array([x[p] for x in P], float) * (1 if PARTS[p] else -1)
        if norm == "minmax":
            s += 0.5 if v.max() == v.min() else (v - v.min()) / (v.max() - v.min())
        elif norm == "rank":
            s += pd.Series(v).rank().to_numpy() - 1
        else:
            s += 0 if v.std() == 0 else (v - v.mean()) / v.std()
    return s / len(use)


def main():
    df, _ = c01.load_clean()
    df, _ = c01.apply_conventions(df)
    h = df[df.kind == "human"]
    J = h.groupby("fname").agg(map=("map_id", "first"), kills=("kill", "sum"), loot=("event", lambda s: (s == "Loot").sum()),
                               storm=("event", lambda s: (s == "KilledByStorm").sum()))
    nd = h[~h.after_death].groupby("fname").t
    J["span"] = nd.max() - nd.min()
    tabs = [J[J["map"] == m] for m in MAPS]
    variants = {"published": dict(), **{f"without_{p}": dict(use=tuple(q for q in PARTS if q != p)) for p in PARTS},
                "rank_based": dict(norm="rank"), "z_score": dict(norm="z")}
    rng = np.random.default_rng(5)
    boots = [[t.sample(len(t), replace=True, random_state=int(rng.integers(1 << 31))) for t in tabs] for _ in range(1000)]
    res = {"variants": {}}
    for name, kw in variants.items():
        s = score(tabs, **kw)
        order = " > ".join(MAPS[i] for i in np.argsort(-s))
        orders = pd.Series([" > ".join(MAPS[i] for i in np.argsort(-score(b, **kw))) for b in boots]).value_counts(normalize=True)
        res["variants"][name] = {"scores": dict(zip(MAPS, np.round(s, 2).tolist())), "order": order,
                                 "bootstrap_share_of_this_order": round(float(orders.get(order, 0)), 3),
                                 "bootstrap_share_AmbroseValley_first": round(float(orders[[o.startswith("AmbroseValley") for o in orders.index]].sum()), 3)}
    res["parts_with_95ci"] = {m: {p: [round(parts_of(t)[p], 2), [round(float(np.percentile([parts_of(b[k])[p] for b in boots], q)), 2) for q in (2.5, 97.5)]]
                                  for p in PARTS} for k, (m, t) in enumerate(zip(MAPS, tabs))}
    json.dump(res, open(OUT, "w"), indent=1)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
