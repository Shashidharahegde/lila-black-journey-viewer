"""C03: sensitivity of published outputs to the remaining contested choices.

(a) including the 17 `unknown` journeys as human; (b) deduplicating identical same-second Loot/BotKill rows;
(c) map_score: bootstrap rank stability and dependence on the sample-size part; (d) hotspot regions: bootstrap seed and
threshold sensitivity (production zones code, varied seed/rules); (e) folder vs UTC-start date; (f) bot coverage;
(g) positions kept in the same second after a death.
Usage (from pipeline/): python c03_other_sensitivity.py out_json
"""
import dataclasses
import json
import sys

import numpy as np
import pandas as pd

from lila_pipeline import zones
from lila_pipeline.build import prepare
from lila_pipeline.export import match_dates, zone_inputs
from lila_pipeline.heatmaps import count_grid, traffic_grid
from lila_pipeline.journeys import DEATH_CATEGORIES, counted_kills

OUT = sys.argv[1]
MAPS = ["AmbroseValley", "GrandRift", "Lockdown"]
res = {}
prep = prepare()
ev = prep.events


def layers(e):
    return {"kills": count_grid(e[counted_kills(e)]), "deaths": count_grid(e[e.category.isin(DEATH_CATEGORIES)]),
            "traffic": traffic_grid(e[e.category == "position"])}


# (a) unknown journeys included as human
a = {}
for m in MAPS:
    h = layers(ev[(ev.map_id == m) & (ev.actor_kind == "human")])
    hu = layers(ev[(ev.map_id == m) & ev.actor_kind.isin(["human", "unknown"])])
    a[m] = {k: {"total_change_pct": round(100 * (hu[k].sum() - h[k].sum()) / h[k].sum(), 2),
                "top10_same": len(set(np.argsort(-h[k].ravel())[:10]) & set(np.argsort(-hu[k].ravel())[:10]))} for k in h}
res["a_unknown_included"] = a

# (b) dedupe identical same-second rows
cols = ["file", "user_id", "match_id", "map_id", "x", "y", "z", "epoch_s", "event"]
dup = ev.duplicated(cols) & ev.event.isin(["Loot", "BotKill"])
hum = ev.actor_kind == "human"
b = {}
for m in MAPS:
    sel = hum & (ev.map_id == m)
    j = ev[sel].file.nunique()
    loot = int((sel & (ev.event == "Loot")).sum())
    loot_d = int((sel & (ev.event == "Loot") & ~dup).sum())
    kills = int((sel & counted_kills(ev)).sum())
    kills_d = int((sel & counted_kills(ev) & ~dup).sum())
    b[m] = {"loot_rate": [round(loot / j, 2), round(loot_d / j, 2)], "kill_rate": [round(kills / j, 2), round(kills_d / j, 2)],
            "loot_removed_pct": round(100 * (loot - loot_d) / loot, 2)}
res["b_dedupe"] = b

# (c) map_score bootstrap: resample human journeys within each map; same 5 parts, same min-max scaling
jt = ev[hum].groupby("file").agg(map=("map_id", "first"), kills=("category", lambda s: 0), )
timed = ev[hum & ~ev.after_death].groupby("file").t
jt["span"] = timed.max() - timed.min()
jt["kills"] = counted_kills(ev[hum]).groupby(ev[hum].file).sum()
jt["loot"] = (ev[hum].event == "Loot").groupby(ev[hum].file).sum()
jt["storm"] = (ev[hum].event == "KilledByStorm").groupby(ev[hum].file).sum()


def score(tables, use_n=True):
    parts = {"n": [len(t) for t in tables], "span": [np.median(t.span) for t in tables],
             "kill": [t.kills.mean() for t in tables], "loot": [t.loot.mean() for t in tables],
             "storm": [-100 * t.storm.mean() for t in tables]}
    if not use_n:
        parts.pop("n")
    s = np.zeros(len(tables))
    for v in parts.values():
        v = np.array(v, float)
        s += 0.5 if v.max() == v.min() else (v - v.min()) / (v.max() - v.min())
    return s / len(parts)


tabs = [jt[jt["map"] == m] for m in MAPS]
rng = np.random.default_rng(7)
ranks, ranks_non = [], []
for _ in range(2000):
    bt = [t.sample(len(t), replace=True, random_state=int(rng.integers(1 << 31))) for t in tabs]
    ranks.append(tuple(np.argsort(-score(bt))))
    ranks_non.append(tuple(np.argsort(-score(bt, use_n=False))))
rc = pd.Series([tuple(MAPS[i] for i in r) for r in ranks]).value_counts(normalize=True).round(3)
rn = pd.Series([tuple(MAPS[i] for i in r) for r in ranks_non]).value_counts(normalize=True).round(3)
res["c_map_score"] = {"published_order_scores": dict(zip(MAPS, np.round(score(tabs), 2).tolist())),
                      "without_sample_size_part": dict(zip(MAPS, np.round(score(tabs, use_n=False), 2).tolist())),
                      "bootstrap_rank_freq": {" > ".join(k): v for k, v in rc.items()},
                      "bootstrap_rank_freq_without_sample_size": {" > ".join(k): v for k, v in rn.items()},
                      "per_map_part_CI95": {m: {p: [round(float(np.percentile(vals, 2.5)), 2), round(float(np.percentile(vals, 97.5)), 2)]
                                                for p, vals in {"kill_rate": [t.sample(len(t), replace=True, random_state=s).kills.mean() for s in range(500)],
                                                                "storm_per100": [100 * t.sample(len(t), replace=True, random_state=s).storm.mean() for s in range(500)],
                                                                "span_median": [t.sample(len(t), replace=True, random_state=s).span.median() for s in range(500)]}.items()}
                                            for m, t in zip(MAPS, tabs)}}

# (d) hotspot regions: seed and threshold sensitivity (all-dates selection)
d = {}
for m in MAPS:
    inp = zone_inputs(m, ev)
    for layer in zones.LAYERS:
        def consistent(rules=zones.RULES, seed=None):
            old = zones.SEED
            if seed is not None:
                zones.SEED = seed
            try:
                e = zones.collect(inp.tensors[layer], inp.match_of, inp.player_of, key=f"{m}|{layer}|all", rules=rules,
                                  count_journeys=layer == "traffic")
                return frozenset((z["i"], z["j"]) for z in zones.classify(e, rules)["zones"] if z["tier"] == "consistent")
            finally:
                zones.SEED = old
        base = consistent()
        seeds = [consistent(seed=s) for s in range(1, 11)]
        thr = {f"stability>={x}": len(consistent(dataclasses.replace(zones.RULES, min_stability=x))) for x in (0.7, 0.9)}
        thr["min_matches=3"] = len(consistent(dataclasses.replace(zones.RULES, min_matches=3)))
        thr["min_matches=10"] = len(consistent(dataclasses.replace(zones.RULES, min_matches=10)))
        d[f"{m}|{layer}"] = {"published": len(base), "seed_counts": [len(s) for s in seeds],
                             "seeds_identical_to_published": sum(s == base for s in seeds),
                             "regions_ever_flipping": len(set().union(*seeds, base) - set.intersection(*map(set, seeds), base)),
                             "threshold_variants": thr}
        print(m, layer, d[f"{m}|{layer}"])
res["d_zones"] = d

# (e) folder vs UTC date
raw = prep.events.groupby("match_id").agg(folder=("folder", "min"))
utc = match_dates(ev)
fold = raw.folder.str.replace("February_", "2026-02-", regex=False)
res["e_dates"] = {"matches_whose_date_differs": int((fold != utc.reindex(fold.index)).sum())}

# (f) bot coverage
mh = ev[hum].groupby("match_id").event.apply(lambda s: s.isin(["BotKill", "BotKilled"]).any())
mb = ev[ev.actor_kind == "bot"].groupby("match_id").size()
res["f_bots"] = {"matches_with_human_bot_combat": int(mh.sum()), "matches_with_bot_files": int(len(mb)),
                 "matches_with_human_bot_combat_but_no_bot_file": int(mh[mh].index.difference(mb.index).size),
                 "human_journeys": int(ev[hum].file.nunique())}

# (g) same-second positions after death
fd = ev[ev.category.isin(DEATH_CATEGORIES)].groupby("file").agg(e=("epoch_s", "min"), r=("row", "min"))
p = ev[ev.category == "position"].join(fd, on="file", how="inner")
res["g_same_second_after_death_positions"] = int(((p.epoch_s == p.e) & (p.row > p.r)).sum())
json.dump(res, open(OUT, "w"), indent=1, default=str)
print(json.dumps({k: v for k, v in res.items() if k != "d_zones"}, indent=1, default=str))
