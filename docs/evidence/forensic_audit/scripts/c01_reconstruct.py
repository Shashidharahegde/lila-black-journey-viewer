"""C01: independent reconstruction of the published outputs from raw rows (no lila_pipeline imports).

Implements the pipeline's *stated* conventions with my own code, so remaining differences are errors, not convention
choices. Traffic uses a different algorithm (dense sampling along each step) from the production exact line tracer.
Usage: python c01_reconstruct.py raw_all.parquet files.parquet web_data_dir out_json
"""
import json
import sys

import numpy as np
import pandas as pd

RAW, FILES, WEB, OUT = sys.argv[1:5]
CAL = {"AmbroseValley": (900, -370, -473), "GrandRift": (581, -290, -290), "Lockdown": (1000, -500, -500)}
G = 64
FK = "fname"
DEATH = {"BotKilled", "Killed", "KilledByStorm"}


def load_clean():
    df = pd.read_parquet(RAW)
    df["epoch"] = df.ts.astype("int64")
    F = pd.read_parquet(FILES).drop_duplicates("sha")
    df = df.merge(F[["folder", "fname"]], on=["folder", "fname"])  # drop the byte-identical copy
    cols = ["x", "y", "z", "epoch", "event"]

    def doubled(g):
        g = g.sort_values("row_in_file")
        h = len(g) // 2
        return len(g) % 2 == 0 and g.iloc[:h][cols].reset_index(drop=True).equals(g.iloc[h:][cols].reset_index(drop=True))

    dbl_files = {f for f, g in df.groupby(FK) if doubled(g)}
    n = df.groupby(FK).row_in_file.transform("size")
    df = df[~df[FK].isin(dbl_files) | (df.row_in_file < n // 2)].copy()
    isnum = df.user_id.str.fullmatch(r"\d+")
    bp = df.groupby(FK).event.apply(lambda s: (s == "BotPosition").any())
    hasbp = df[FK].map(bp)
    df["kind"] = np.select([~isnum & ~hasbp, isnum & hasbp], ["human", "bot"], "unknown")
    df = df.sort_values([FK, "epoch", "row_in_file"])
    df["t"] = df.epoch - df.groupby("match_id").epoch.transform("min")
    return df, dbl_files


def apply_conventions(df):
    fd = df[df.event.isin(DEATH)].groupby(FK).epoch.min()
    later = df.epoch > df[FK].map(fd)
    ismove = df.event.isin(["Position", "BotPosition"])
    df["after_death"] = later & ~ismove
    df = df[~(later & ismove)].copy()
    kk = df[df.event.isin(["Kill", "Killed"])].groupby([FK, "epoch"]).event.agg(lambda s: set(s) == {"Kill", "Killed"})
    pk = set(kk[kk].index)
    df["pair"] = [(f, e) in pk and ev in ("Kill", "Killed") for f, e, ev in zip(df[FK], df.epoch, df.event)]
    df["kill"] = df.event.isin(["BotKill", "Kill"]) & ~df.pair
    df["death"] = df.event.isin(DEATH)
    sc = df.map_id.map(lambda m: CAL[m][0])
    ox = df.map_id.map(lambda m: CAL[m][1])
    oz = df.map_id.map(lambda m: CAL[m][2])
    df["u"] = (df.x.astype(float) - ox) / sc
    df["v"] = (df.z.astype(float) - oz) / sc
    mdate = pd.to_datetime(df.groupby("match_id").epoch.min(), unit="s").dt.strftime("%Y-%m-%d")
    df["date"] = df.match_id.map(mdate)
    return df, mdate


def cell(u):
    return np.clip(np.floor(u * G).astype(int), 0, G - 1)


def traffic_sampled(pos, n=400, cutoff=30):
    out = np.zeros((G, G))
    for _, j in pos.groupby(FK):
        t, u, v = j.epoch.values, j.u.values, j.v.values
        for k in range(len(t) - 1):
            dt = t[k + 1] - t[k]
            if dt <= 0 or dt > cutoff:
                continue
            s = (np.arange(n) + 0.5) / n
            np.add.at(out, (cell(u[k] + (u[k + 1] - u[k]) * s), cell(v[k] + (v[k + 1] - v[k]) * s)), dt / n)
    return out


def main():
    df, dbl = load_clean()
    df, mdate = apply_conventions(df)
    res = {"rows_final": len(df), "files": int(df[FK].nunique()), "doubled_files": len(dbl),
           "kinds": df.groupby(FK).kind.first().value_counts().to_dict()}

    # index
    idx = json.load(open(f"{WEB}/index.json", encoding="utf-8"))
    mine = {}
    for m, g in df.groupby("match_id"):
        h = g[g.kind == "human"]
        kinds = g.groupby(FK).kind.first()
        mine[m[:8]] = dict(
            map=g.map_id.iat[0], date=mdate[m], duration_s=int(g.t.max()), humans=int((kinds == "human").sum()),
            bots=int((kinds == "bot").sum()), unknown=int((kinds == "unknown").sum()),
            counts=dict(kill=int(h.kill.sum()), death=int(h.event.isin(["BotKilled", "Killed"]).sum()),
                        storm_death=int((h.event == "KilledByStorm").sum()), loot=int((h.event == "Loot").sum()),
                        kill_killed_pair=int((h.pair & (h.event == "Killed")).sum())))
    diffs = []
    for m in idx["matches"]:
        a = mine.get(m["id"])
        if a is None:
            diffs.append((m["id"], "missing"))
            continue
        for k in ["map", "date", "duration_s", "humans", "bots", "unknown"]:
            if a[k] != m[k]:
                diffs.append((m["id"], k, a[k], m[k]))
        for k, v in a["counts"].items():
            if v != m["counts"][k]:
                diffs.append((m["id"], "counts." + k, v, m["counts"][k]))
    res["index_matches"] = [len(idx["matches"]), len(mine)]
    res["index_diff_count"] = len(diffs)
    res["index_field_diffs"] = diffs[:20]
    res["dates_index"] = {d["date"]: d["matches"] for d in idx["dates"]}

    # match files
    mdiff, max_err = [], 0.0
    for m, g in df.groupby("match_id"):
        doc = json.load(open(f"{WEB}/matches/{m[:8]}.json", encoding="utf-8"))
        mv = g[g.event.isin(["Position", "BotPosition"])]
        pts_pub = sum(len(s) for a in doc["actors"] for s in a["segments"])
        ev_pub = sum(len(a["events"]) for a in doc["actors"])
        seg_pub = sum(len(a["segments"]) for a in doc["actors"])
        segs = sum(int((grp.epoch.diff() > 30).sum()) + 1 for _, grp in mv.groupby(FK))
        if (pts_pub, ev_pub, seg_pub) != (len(mv), len(g) - len(mv), segs):
            mdiff.append((m[:8], pts_pub, len(mv), ev_pub, len(g) - len(mv), seg_pub, segs))
        pub = np.array([p[1] for a in doc["actors"] for s in a["segments"] for p in s])
        if len(pub):
            max_err = max(max_err, float(np.abs(np.sort(pub) - np.sort(mv.u.values)).max()))
    res["match_file_diff_count"] = len(mdiff)
    res["match_file_diffs"] = mdiff[:10]
    res["max_u_rounding_err"] = max_err

    # heatmaps
    hm = {}
    for m in CAL:
        H = json.load(open(f"{WEB}/heatmaps/{m}.json", encoding="utf-8"))
        hum = df[(df.map_id == m) & (df.kind == "human")]
        for key in ["all", *sorted(hum.date.unique())]:
            p = hum if key == "all" else hum[hum.date == key]
            grids = {}
            for lay, sel in (("kills", p.kill), ("deaths", p.death)):
                g = np.zeros((G, G))
                np.add.at(g, (cell(p[sel].u.values), cell(p[sel].v.values)), 1)
                grids[lay] = g
            grids["traffic"] = traffic_sampled(p[p.event == "Position"])
            for lay, grid in grids.items():
                pub = np.zeros((G, G))
                for i, j, val in H["layers"][lay][key]:
                    pub[i, j] = val
                d = np.abs(grid - pub)
                hm[f"{m}|{lay}|{key}"] = dict(mine_total=round(float(grid.sum()), 1), pub_total=H["totals"][lay][key],
                                               max_cell_abs_diff=round(float(d.max()), 3),
                                               cells_mine=int((np.round(grid, 1 if lay == "traffic" else 0) != 0).sum()),
                                               cells_pub=len(H["layers"][lay][key]))
            smp = H["samples"][key]
            exp = {"matches": int(p.match_id.nunique()), "human_journeys": int(p[FK].nunique())}
            if smp != exp:
                hm[f"{m}|samples|{key}"] = [smp, exp]
    res["heatmaps"] = hm

    # headline stats (all dates)
    st = json.load(open(f"{WEB}/stats.json", encoding="utf-8"))
    hu = df[df.kind == "human"]
    jt = hu.groupby(FK).agg(map=("map_id", "first"), user=("user_id", "first"), kills=("kill", "sum"),
                            loot=("event", lambda s: (s == "Loot").sum()),
                            storm=("event", lambda s: (s == "KilledByStorm").sum()), death=("death", "sum"))
    jt["span"] = hu[~hu.after_death].groupby(FK).t.agg(lambda s: s.max() - s.min())
    cmp = {}
    for scope in ["all", *CAL]:
        j = jt if scope == "all" else jt[jt["map"] == scope]
        v = st["slices"][scope]["all"]["values"]
        mineh = dict(human_journeys=len(j), human_players=int(j.user.nunique()), kills=int(j.kills.sum()),
                     loot=int(j.loot.sum()), deaths=int(j.death.sum()), kill_rate=round(j.kills.sum() / len(j), 2),
                     loot_rate=round(j.loot.sum() / len(j), 2), storm_rate=round(100 * j.storm.sum() / len(j), 2),
                     span_median=float(np.median(j.span)))
        pubh = dict(human_journeys=v["human_journeys"]["value"], human_players=v["human_players"]["value"],
                    kills=v["kills"]["value"], loot=v["loot_events"]["value"], deaths=v["deaths"]["value"],
                    kill_rate=v["kill_rate"]["value"], loot_rate=v["loot_rate"]["value"],
                    storm_rate=v["storm_death_rate"]["value"], span_median=v["journey_span_s"]["median"])
        cmp[scope] = {k: (mineh[k], pubh[k]) for k in mineh if mineh[k] != pubh[k]} or "all equal"
        cmp[scope + "_values"] = mineh
    res["stats_cmp"] = cmp

    json.dump(res, open(OUT, "w"), indent=1, default=str)
    print(json.dumps({k: v for k, v in res.items() if k != "heatmaps"}, indent=1, default=str))
    rows = [(k, v) for k, v in hm.items() if isinstance(v, dict)]
    print("heatmap slices compared:", len(rows), " sample mismatches:", [k for k in hm if "|samples|" in k])
    print("kills/deaths total mismatches:", [k for k, v in rows if "traffic" not in k and v["mine_total"] != v["pub_total"]])
    print("kills/deaths max cell diff:", max(v["max_cell_abs_diff"] for k, v in rows if "traffic" not in k))
    tr = [(k, v) for k, v in rows if "traffic" in k]
    print("traffic: max |total diff|:", max(abs(v["mine_total"] - v["pub_total"]) for _, v in tr),
          " max cell diff:", max(v["max_cell_abs_diff"] for _, v in tr),
          " cell-count diffs:", [(k, v["cells_mine"], v["cells_pub"]) for k, v in tr if v["cells_mine"] != v["cells_pub"]][:5])


if __name__ == "__main__":
    main()
