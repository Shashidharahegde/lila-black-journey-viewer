"""D04: does the event evidence support "bots were active in 722 matches", as opposed to "bots recorded in 52"?

1. Per match: recorded bot files vs human-file events whose label names a bot counterpart (BotKill, BotKilled).
2. Label validation where a counterpart could be recorded (the 52 matches with bot files): pair each human BotKill /
   BotKilled with events in *other* files of the match within +-2 s; compare with a null model in which the human file's
   event times are shifted by a random 30-300 s (200 repetitions) to estimate chance pairing.
3. What the counterparts are (bot files, unknown files, other human files).
No lila_pipeline imports. Usage: python d04_bot_presence.py raw_all.parquet files.parquet web_dir out_json
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import c01_reconstruct as c01  # noqa: E402

OUT = sys.argv[4]
COMBAT = ["BotKill", "BotKilled", "Kill", "Killed"]
PARTNER = {"BotKill": "BotKilled", "BotKilled": "BotKill"}  # the counterpart's own event under the owner-view reading


def main():
    df, _ = c01.load_clean()
    files = df.groupby("fname").agg(kind=("kind", "first"), match=("match_id", "first"))
    hum = df[df.kind == "human"]
    per = pd.DataFrame({"bot_files": files[files.kind == "bot"].groupby("match").size(),
                        "human_botkill": hum[hum.event == "BotKill"].groupby("match_id").size(),
                        "human_botkilled": hum[hum.event == "BotKilled"].groupby("match_id").size()}).reindex(df.match_id.unique()).fillna(0)
    per["combat"] = (per.human_botkill + per.human_botkilled) > 0
    res = {"matches": len(per), "with_recorded_bot_files": int((per.bot_files > 0).sum()),
           "with_human_bot_combat_labels": int(per.combat.sum()),
           "with_a_human_killed_by_a_bot_label": int((per.human_botkilled > 0).sum()),
           "with_combat_but_no_bot_file": int((per.combat & (per.bot_files == 0)).sum()),
           "with_neither": int((~per.combat & (per.bot_files == 0)).sum()),
           "with_bot_files_but_no_human_combat": int((~per.combat & (per.bot_files > 0)).sum())}

    # 2. label validation in matches with bot files
    rec = per[per.bot_files > 0].index
    C = df[df.match_id.isin(rec) & df.event.isin(COMBAT)][["fname", "match_id", "kind", "event", "epoch", "x", "z"]]
    rng = np.random.default_rng(11)

    def pair_stats(shift=None):
        out = {"BotKill": [0, 0], "BotKilled": [0, 0]}  # [events, paired with the expected counterpart event]
        kinds = {}
        for m, c in C.groupby("match_id"):
            h = c[c.kind == "human"]
            o_all = c
            for r in h[h.event.isin(PARTNER)].itertuples():
                t = r.epoch + (shift(r) if shift else 0)
                o = o_all[(o_all.fname != r.fname) & ((o_all.epoch - t).abs() <= 2) & (o_all.event == PARTNER[r.event])]
                out[r.event][0] += 1
                if len(o):
                    out[r.event][1] += 1
                    if shift is None:
                        k = o.assign(d=np.hypot(o.x - r.x, o.z - r.z)).sort_values("d").iloc[0]
                        kinds.setdefault(r.event, []).append((k.kind, float(k.d)))
        return out, kinds

    obs, kinds = pair_stats()
    null = [pair_stats(lambda r: int(rng.integers(30, 301)) * int(rng.choice([-1, 1])))[0] for _ in range(200)]
    res["label_validation_in_matches_with_bot_files"] = {
        ev: {"human_events": obs[ev][0], "paired_with_counterpart_event": obs[ev][1],
             "paired_share": round(obs[ev][1] / obs[ev][0], 3) if obs[ev][0] else None,
             "null_paired_share_mean_p95": [round(float(np.mean([n[ev][1] / n[ev][0] for n in null])), 3),
                                            round(float(np.percentile([n[ev][1] / n[ev][0] for n in null], 95)), 3)],
             "counterpart_kinds": pd.Series([k for k, _ in kinds.get(ev, [])]).value_counts().to_dict(),
             "counterpart_distance_median": round(float(np.median([d for _, d in kinds.get(ev, [(None, np.nan)])])), 1)}
        for ev in PARTNER}
    # do human Bot* events ever pair with another human's file?
    res["human_Bot_events_paired_with_another_human_file"] = int(sum(1 for ev in kinds for k, _ in kinds[ev] if k == "human"))
    json.dump(res, open(OUT, "w"), indent=1, default=str)
    print(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main()
