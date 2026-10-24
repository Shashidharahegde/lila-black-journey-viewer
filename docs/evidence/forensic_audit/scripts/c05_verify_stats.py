"""C05: independent recomputation of every value in stats.json (all 28 map x date slices), compared leaf by leaf.

No lila_pipeline imports: rows are cleaned with this audit's own c01 loader, metric definitions are implemented from the
written definitions in stats.json / docs/10_DASHBOARD.md, traffic cells are traced with an independently written exact
line-grid intersection, and quantiles/histograms are computed here.
Usage: python c05_verify_stats.py raw_all.parquet files.parquet web_data_dir out_json
"""
import bisect
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import c01_reconstruct as c01  # noqa: E402  (audit code; reads the same four argv values)

RAW, FILES, WEB, OUT = sys.argv[1:5]
MAPS = ["AmbroseValley", "GrandRift", "Lockdown"]
SCALE = {m: c01.CAL[m][0] for m in MAPS}
CAUSES = {"BotKilled": "by_bot", "KilledByStorm": "storm", "Killed": "paired_killed"}
G = 64


def quantile(sorted_vals, q):  # linear interpolation between closest ranks (Hyndman-Fan type 7)
    h = (len(sorted_vals) - 1) * q
    lo = math.floor(h)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (h - lo) * (sorted_vals[hi] - sorted_vals[lo])


def hist(vals, edges, split=None):
    def counts(vs):
        c = [0] * (len(edges) - 1)
        for x in vs:
            if x < edges[-1]:
                c[bisect.bisect_right(edges, x) - 1] += 1
        return c
    out = {"edges": edges, "overflow": sum(1 for x in vals if x >= edges[-1]), "n": len(vals)}
    if split is None:
        out["counts"] = counts(vals)
    else:
        out["series"] = {c: counts([x for x, s in zip(vals, split) if s == c]) for c in CAUSES.values()}
    return out


def dist(vals, edges=None, decimals=0, split=None):
    vals = [float(v) for v in vals]
    num = (lambda x: round(x, decimals)) if decimals else (lambda x: int(round(x)))
    if vals:
        s = sorted(vals)
        out = {"n": len(s), "min": num(s[0]), "p25": round(quantile(s, .25), 1), "median": round(quantile(s, .5), 1),
               "p75": round(quantile(s, .75), 1), "max": num(s[-1]), "sum": num(math.fsum(s))}
    else:
        out = {"n": 0, "min": None, "p25": None, "median": None, "p75": None, "max": None, "sum": 0}
    out["few_values"] = len(vals) < 10
    if edges is not None:
        out["histogram"] = hist(vals, edges, split)
    return out


def ratio(n, d):
    return {"numerator": n, "denominator": d, "value": round(n / d, 4)}


def rate(n, d, per=1):
    return {"numerator": n, "denominator": d, "per": per, "value": round(per * n / d, 2)}


def exact_cells(u0, v0, u1, v1):
    """{cell: share of the step's length} by cutting the step at every grid-line crossing (own implementation)."""
    a = np.array([u0, v0]) * G
    b = np.array([u1, v1]) * G
    d = b - a
    ts = {0.0, 1.0}
    for k in range(2):
        if d[k] != 0:
            for line in range(int(math.floor(min(a[k], b[k]))) + 1, int(math.ceil(max(a[k], b[k])))):
                ts.add((line - a[k]) / d[k])
    ts = sorted(ts)
    out = {}
    for t0, t1 in zip(ts, ts[1:]):
        m = a + d * (t0 + t1) / 2
        c = (min(max(int(math.floor(m[0])), 0), G - 1), min(max(int(math.floor(m[1])), 0), G - 1))
        out[c] = out.get(c, 0.0) + (t1 - t0)
    if not out:
        out[(min(max(int(math.floor(a[0])), 0), G - 1), min(max(int(math.floor(a[1])), 0), G - 1))] = 1.0
    return out


def traffic_cells(pos):
    grid = np.zeros((G, G))
    for _, j in pos.groupby("fname", sort=False):
        t, u, v = j.epoch.values, j.u.values, j.v.values
        for k in range(len(t) - 1):
            dt = t[k + 1] - t[k]
            if 0 < dt <= 30:
                for (i, jj), s in exact_cells(u[k], v[k], u[k + 1], v[k + 1]).items():
                    grid[i, jj] += dt * s
    return int((np.round(grid, 1) != 0).sum())


def main():
    df, _ = c01.load_clean()
    df, mdate = c01.apply_conventions(df)
    df["is_pos"] = df.event.isin(["Position", "BotPosition"])

    # dates block, from the data
    lo, hi = int(df.epoch.min()), int(df.epoch.max())
    dates = []
    for d in sorted(mdate.unique()):
        start = int(datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
        f, t = max(start, lo), min(start + 86400, hi)
        iso = lambda s: datetime.fromtimestamp(s, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        dates.append({"date": d, "partial": t - f < 86400, "boundary": d in (min(mdate), max(mdate)),
                      "observed_from_utc": iso(f), "observed_to_utc": iso(t)})
    dinfo = {d["date"]: d for d in dates}

    # one row per journey
    J = df.groupby("fname").agg(kind=("kind", "first"), match=("match_id", "first"), map=("map_id", "first"),
                                user=("user_id", "first"))
    J["date"] = J.match.map(mdate)
    nd = df[~df.after_death].groupby("fname").t
    J["span"] = nd.max() - nd.min()
    J["kills"] = df.groupby("fname").kill.sum()
    lt = df[df.event == "Loot"].groupby("fname").t
    J["loot"] = lt.size()
    J["first_loot"] = lt.min()
    de = df[df.death]
    assert not de.fname.duplicated().any()
    J["death_t"] = de.set_index("fname").t
    J["cause"] = de.set_index("fname").event.map(CAUSES)
    J["storm"] = (J.cause == "storm").astype(int)
    mv, dist_, kept = {}, {}, []
    for f, p in df[df.is_pos].groupby("fname"):
        gap = np.diff(p.epoch.values)
        ok = gap <= 30
        step = np.hypot(np.diff(p.u.values), np.diff(p.v.values)) * SCALE[p.map_id.iat[0]]
        mv[f] = int(gap[ok].sum())
        dist_[f] = float(step[ok].sum())
    J["move"] = pd.Series(mv)
    J["distance"] = pd.Series(dist_)
    J[["kills", "loot", "move", "distance"]] = J[["kills", "loot", "move", "distance"]].fillna(0)
    M = df.groupby("match_id").agg(map=("map_id", "first"))
    M["date"] = M.index.map(mdate)

    # traffic cell counts per map x date (for grid_cells_observed)
    hum_pos = df[(df.kind == "human") & (df.event == "Position")]
    cells = {}
    for m in MAPS:
        hp = hum_pos[hum_pos.map_id == m]
        cells[(m, "all")] = traffic_cells(hp)
        for d in sorted(hp.date.unique()):
            cells[(m, d)] = traffic_cells(hp[hp.date == d])

    slices = {}
    for ms in ["all", *MAPS]:
        slices[ms] = {}
        for ds in ["all", *dinfo]:
            def sel(T):
                keep = pd.Series(True, index=T.index)
                if ms != "all":
                    keep &= T["map"] == ms
                if ds != "all":
                    keep &= T["date"] == ds
                return T[keep]
            part = sel(J)
            h = part[part.kind == "human"]
            wh = int(h.match.nunique())
            inc = sorted(set(h.date)) if ds == "all" else [ds]
            sample = {"matches": int(len(sel(M))), "matches_with_human": wh, "human_journeys": len(h),
                      "human_players": int(h.user.nunique()),
                      "excluded": {"bot_journeys": int((part.kind == "bot").sum()),
                                   "unknown_journeys": int((part.kind == "unknown").sum())}}
            flags = {"empty": len(h) == 0, "few_matches": wh < 10, "partial_date": any(dinfo[d]["partial"] for d in inc),
                     "boundary_date": any(dinfo[d]["boundary"] for d in inc)}
            if len(h) == 0:
                values = None
            else:
                pp = h.groupby("user").size()
                dd = h.dropna(subset=["death_t"])
                lo_ = h.dropna(subset=["first_loot"])
                n = len(h)
                values = {
                    "human_journeys": {"value": n}, "human_players": {"value": len(pp)},
                    "repeat_players": ratio(int((pp >= 2).sum()), len(pp)),
                    "journeys_per_player": dist(pp.values, [1, 2, 3, 4, 6, 11]),
                    "players_by_days_observed": hist([float(x) for x in h.groupby("user").date.nunique()],
                                                     list(range(1, len(dinfo) + 2))) if ds == "all" else None,
                    "journey_span_s": dist(h.span, list(range(0, 901, 60))),
                    "kills": {"value": int(h.kills.sum())},
                    "deaths": {"value": len(dd), "parts": {c: int((dd.cause == c).sum()) for c in CAUSES.values()}},
                    "kill_killed_pairs": {"value": int((dd.cause == "paired_killed").sum())},
                    "journeys_with_death": ratio(len(dd), n),
                    "death_time_s": dist(dd.death_t, list(range(0, 901, 60)), split=list(dd.cause)),
                    "kills_per_journey": dist(h.kills), "matches": {"value": int(len(sel(M)))},
                    "matches_with_human": {"value": wh}, "loot_events": {"value": int(h.loot.sum())},
                    "journeys_with_loot": ratio(len(lo_), n), "loot_per_journey": dist(h.loot),
                    "first_loot_s": dist(lo_.first_loot, list(range(0, 301, 15))),
                    "movement_time_s": dist(h.move), "distance": dist(h.distance, list(range(0, 3001, 250)), decimals=1),
                    "grid_cells_observed": ratio(cells[(ms, ds)], G * G) if ms != "all" else None,
                    "kill_rate": rate(int(h.kills.sum()), n), "loot_rate": rate(int(h.loot.sum()), n),
                    "storm_death_rate": rate(int(h.storm.sum()), n, 100), "map_score": None}
            slices[ms][ds] = {"sample": sample, "flags": flags, "values": values}
    # map score: between the map slices of one date, from the rounded published-style values
    parts = {"human_journeys": (lambda v: v["human_journeys"]["value"], True),
             "journey_span_s": (lambda v: v["journey_span_s"]["median"], True),
             "kill_rate": (lambda v: v["kill_rate"]["value"], True), "loot_rate": (lambda v: v["loot_rate"]["value"], True),
             "storm_death_rate": (lambda v: v["storm_death_rate"]["value"], False)}
    for ds in ["all", *dinfo]:
        present = [slices[m][ds] for m in MAPS if slices[m][ds]["values"] is not None]
        if len(present) < 2:
            continue
        sc = [{} for _ in present]
        for name, (read, up) in parts.items():
            raw = [float(read(s["values"])) for s in present]
            a, b = min(raw), max(raw)
            for k, x in enumerate(raw):
                share = 0.5 if a == b else (x - a) / (b - a)
                sc[k][name] = share if up else 1 - share
        for s, p in zip(present, sc):
            s["values"]["map_score"] = {"value": round(sum(p.values()) / len(p), 2),
                                        "parts": {k: round(v, 2) for k, v in p.items()}, "maps": len(present)}

    pub = json.load(open(f"{WEB}/stats.json", encoding="utf-8"))
    diffs, count = [], [0]

    def cmp(path, a, b):
        if isinstance(b, dict) and isinstance(a, dict):
            for k in set(a) | set(b):
                if k not in a or k not in b:
                    diffs.append((path + "/" + k, "missing in " + ("mine" if k not in a else "published")))
                else:
                    cmp(path + "/" + k, a[k], b[k])
        elif isinstance(b, list) and isinstance(a, list) and len(a) == len(b):
            for k, (x, y) in enumerate(zip(a, b)):
                cmp(f"{path}[{k}]", x, y)
        else:
            count[0] += 1
            same = (a == b) or (isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) < 1e-9)
            if not same or (a is None) != (b is None):
                diffs.append((path, a, b))

    for ms in slices:
        for ds in slices[ms]:
            mine = slices[ms][ds]
            if mine["values"] is None:
                mine = {**mine, "values": {k: None for k in pub["metrics"]}}
            cmp(f"{ms}/{ds}", mine, pub["slices"][ms][ds])
    cmp("dates", dates, pub["dates"])
    # source fingerprint over the files on disk
    root = Path(WEB)
    paths = sorted([root / "index.json", *(root / "heatmaps").glob("*.json"), *(root / "matches").glob("*.json")],
                   key=lambda p: p.relative_to(root).as_posix())
    hsh = hashlib.sha256()
    for p in paths:
        hsh.update(p.read_bytes())
    fp = {"fingerprint": f"sha256:{hsh.hexdigest()[:16]}", "files": len(paths)}
    cmp("source", fp, pub["source"])
    res = {"leaves_compared": count[0], "differences": len(diffs), "first_differences": diffs[:40],
           "slices": sum(len(v) for v in slices.values())}
    json.dump(res, open(OUT, "w"), indent=1, default=str)
    print(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()
