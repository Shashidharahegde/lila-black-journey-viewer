"""D01: what makes a movement row appear, and where is the actor during a gap?

Hypotheses for a gap of g seconds between movement rows A (t0) and B (t1):
  H_tick+change  rows are produced on a fixed ~5 s tick, but only written when the position changed -> g is a multiple of 5
                 (+-1 s rounding), the actor stood at A until the last tick, B is one tick of movement from rest
  H_loss         rows were lost at random while the actor kept moving -> displacement grows with g
  H_loop         the actor moved away and came back near A -> small net displacement, but events logged inside the gap
                 (which carry the owner's position) would be far from A
  H_irregular    rows are emitted at irregular times (event-driven) -> g has no 5 s structure
No lila_pipeline imports. Usage: python d01_emission_rule.py raw_all.parquet files.parquet web_dir out_json
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import c01_reconstruct as c01  # noqa: E402

OUT = sys.argv[4]


def q(s, qs=(.1, .25, .5, .75, .9)):
    return {str(k): round(float(v), 2) for k, v in s.quantile(list(qs)).items()} if len(s) else {}


def main():
    df, _ = c01.load_clean()
    res = {}
    mv_ev = {"human": "Position", "bot": "BotPosition"}
    for kind, ev in mv_ev.items():
        d = df[df.kind == kind]
        P = d[d.event == ev].sort_values(["fname", "epoch", "row_in_file"]).copy()
        P["dt"] = P.groupby("fname").epoch.diff()
        P["dd"] = np.hypot(P.groupby("fname").x.diff(), P.groupby("fname").z.diff())
        P["dd_prev"] = P.groupby("fname").dd.shift(1)  # the step that arrived at A
        g = P.dropna(subset=["dt"])
        r = {}
        # 1. tick lattice: gap lengths relative to multiples of 5 s
        gaps = g[g.dt > 6]
        off = ((gaps.dt + 2) % 5) - 2  # signed distance to the nearest multiple of 5, in -2..2
        r["gaps_over_6s"] = len(gaps)
        r["gap_offset_from_multiple_of_5"] = off.value_counts().sort_index().to_dict()
        r["share_within_1s_of_multiple_of_5"] = round(float((off.abs() <= 1).mean()), 4)
        r["share_expected_if_irregular"] = 0.6  # 3 of 5 residues
        # per-file phase: share of rows whose (t mod 5) is within 1 s of the file's modal residue
        def phase_share(t):
            res5 = t % 5
            mode = res5.mode().iat[0]
            dist = np.minimum((res5 - mode) % 5, (mode - res5) % 5)
            return float((dist <= 1).mean())
        r["rows_on_file_phase_pm1s_median"] = round(float(P.groupby("fname").epoch.apply(phase_share).median()), 4)
        # 2. displacement of the step that ends a gap, vs ordinary 5 s steps, and the step that arrived at A
        r["disp_5s_steps"] = q(g[g.dt == 5].dd)
        r["disp_gap_ending_step_by_gap"] = {f"{lo}-{hi}s": q(g[(g.dt > lo) & (g.dt <= hi)].dd, (.25, .5, .75))
                                            for lo, hi in [(6, 15), (15, 30), (30, 60), (60, 600)]}
        r["disp_step_arriving_at_A_before_gap_gt15s"] = q(g[g.dt > 15].dd_prev.dropna(), (.25, .5, .75))
        # max possible displacement in one tick at the actor's speed cap, for reference
        r["p99_speed_5s_steps"] = round(float((g[g.dt == 5].dd / 5).quantile(.99)), 2)
        res[kind] = r

    # 3. events logged strictly inside a gap: where was the owner? (human files)
    h = df[df.kind == "human"].sort_values(["fname", "epoch", "row_in_file"])
    P = h[h.event == "Position"][["fname", "epoch", "row_in_file", "x", "z"]]
    E = h[h.event.isin(["Loot", "BotKill", "BotKilled", "KilledByStorm"])][["fname", "epoch", "row_in_file", "event", "x", "z"]]
    out = []
    for f, e in E.groupby("fname"):
        p = P[P.fname == f]
        if len(p) < 2:
            continue
        t = p.epoch.values
        for row in e.itertuples():
            k = np.searchsorted(t, row.epoch, side="right") - 1  # last position at or before the event
            if k < 0 or k + 1 >= len(t):
                continue
            g = t[k + 1] - t[k]
            if not (t[k] < row.epoch < t[k + 1]):
                continue  # only events strictly inside an interval
            a = (p.x.values[k], p.z.values[k])
            b = (p.x.values[k + 1], p.z.values[k + 1])
            out.append(dict(event=row.event, gap=int(g), dA=float(np.hypot(row.x - a[0], row.z - a[1])),
                            dB=float(np.hypot(row.x - b[0], row.z - b[1])), AB=float(np.hypot(b[0] - a[0], b[1] - a[1])),
                            exactA=bool(row.x == a[0] and row.z == a[1]), frac=float((row.epoch - t[k]) / g)))
    X = pd.DataFrame(out)
    ins = {}
    for name, sel in [("regular_5s", X.gap == 5), ("gap_6_15", (X.gap > 6) & (X.gap <= 15)), ("gap_15_30", (X.gap > 15) & (X.gap <= 30)),
                      ("gap_over_30", X.gap > 30)]:
        s = X[sel]
        ins[name] = {"events": len(s), "dist_to_A": q(s.dA, (.5, .9, .99)), "dist_to_B": q(s.dB, (.5, .9)),
                     "share_exactly_at_A": round(float(s.exactA.mean()), 4) if len(s) else None,
                     "share_closer_to_A_than_B": round(float((s.dA < s.dB).mean()), 4) if len(s) else None,
                     "share_more_than_AB_plus_5_from_A": round(float((s.dA > s.AB + 5).mean()), 4) if len(s) else None}
    # inside gaps > 6 s: events in the last 5 s of the gap vs earlier (H_tick+change: earlier ones sit exactly at A)
    gg = X[X.gap > 6].copy()
    gg["in_last_tick"] = (1 - gg.frac) * gg.gap <= 5
    ins["gap_over_6_by_position_in_gap"] = {
        str(k): {"events": len(s), "share_exactly_at_A": round(float(s.exactA.mean()), 4), "median_dist_to_A": round(float(s.dA.median()), 2)}
        for k, s in gg.groupby("in_last_tick")}
    res["events_inside_intervals_human"] = ins
    json.dump(res, open(OUT, "w"), indent=1, default=str)
    print(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()
