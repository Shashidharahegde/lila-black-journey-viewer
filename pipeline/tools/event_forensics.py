"""Regenerate the event forensics evidence (docs/evidence/event_forensics/) from the raw parquet files.

    cd pipeline && uv run python tools/event_forensics.py

Two questions, checked on the raw rows rather than the generated JSON:
  A. the numeric-ID journeys that log player-client events (`Position`, `Loot`): who are they?
  B. the same-second `Kill`/`Killed` pairs: what do the rows actually show?

The raw-data checks classify journeys on their own (ID format and event vocabulary), and
the result is compared with the pipeline's `prepare()` output. Heatmap grids reuse the
pipeline's own functions. Output holds no player or match IDs: journeys get case IDs
(U01…, P1…) and the three actors get letters.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

from lila_pipeline.build import Prepared, prepare
from lila_pipeline.export import match_dates
from lila_pipeline.heatmaps import count_grid, traffic_grid
from lila_pipeline.ingest import DEFAULT_DATA_DIR, load_journeys
from lila_pipeline.journeys import DEATH_CATEGORIES, MAX_PATH_GAP_S, counted_kills
from lila_pipeline.projection import MAPS

OUT_DIR = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "event_forensics"
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
EVENT_ORDER = ["Position", "BotPosition", "Loot", "BotKill", "BotKilled", "Kill", "Killed", "KilledByStorm"]
GROUPS = ["uuid", "numeric_with_botposition", "numeric_without_botposition"]


def raw_groups(raw: pd.DataFrame) -> pd.Series:
    """Each file's group from its ID format and whether it logs `BotPosition` (independent of the pipeline)."""
    files = raw.groupby("file").agg(user=("user_id", "first"))
    has_botposition = raw.groupby("file")["event"].apply(lambda e: bool((e == "BotPosition").any()))
    is_uuid = files["user"].str.fullmatch(UUID.pattern)
    return pd.Series(
        np.where(is_uuid, "uuid", np.where(has_botposition, "numeric_with_botposition", "numeric_without_botposition")),
        index=files.index,
    )


def ownership_checks(raw: pd.DataFrame) -> dict:
    """Every row belongs to the file it's in: same user, match and map throughout."""
    per_file = raw.groupby("file").agg(
        users=("user_id", "nunique"), user=("user_id", "first"), matches=("match_id", "nunique"),
        match=("match_id", "first"), maps=("map_id", "nunique"),
    )
    owner = per_file.index.str.split("_", n=1).str[0]
    file_match = per_file.index.str.split("_", n=1).str[1].str.removesuffix(".nakama-0")
    return {
        "files_with_more_than_one_user_id": int((per_file["users"] > 1).sum()),
        "files_whose_user_id_differs_from_file_name": int((per_file["user"] != owner).sum()),
        "files_with_more_than_one_match_id": int((per_file["matches"] > 1).sum()),
        "files_whose_match_id_differs_from_file_name": int((per_file["match"].str.removesuffix(".nakama-0") != file_match).sum()),
        "files_with_more_than_one_map": int((per_file["maps"] > 1).sum()),
    }


def step_speeds(journey: pd.DataFrame) -> np.ndarray:
    """Ground speed (world units per second) between consecutive positions no more than MAX_PATH_GAP_S apart."""
    pos = journey[journey["event"].isin(["Position", "BotPosition"])].sort_values(["ts_raw", "row"])
    dt = np.diff(pos["ts_raw"].to_numpy())
    distance = np.hypot(np.diff(pos["x"].to_numpy(dtype=float)), np.diff(pos["z"].to_numpy(dtype=float)))
    ok = (dt > 0) & (dt <= MAX_PATH_GAP_S)
    return distance[ok] / dt[ok]


def event_counts(events: pd.Series) -> str:
    counts = events.value_counts()
    return ";".join(f"{e}={int(counts[e])}" for e in EVENT_ORDER if e in counts)


def investigate_actors(raw: pd.DataFrame, group: pd.Series, prepared: Prepared) -> tuple[dict, list[dict]]:
    raw = raw.assign(group=raw["file"].map(group))
    files = raw.groupby("file").agg(
        group=("group", "first"), user=("user_id", "first"), match=("match_id", "first"), map=("map_id", "first"),
        start=("ts_raw", "min"), end=("ts_raw", "max"), rows=("event", "size"),
    )
    match_start = raw.groupby("match_id")["ts_raw"].min()

    profile = {
        g: {
            "files": int((files["group"] == g).sum()),
            "events": {
                e: {"files_with": int(part.loc[part["event"] == e, "file"].nunique()), "rows": int((part["event"] == e).sum())}
                for e in EVENT_ORDER if (part["event"] == e).any()
            },
        }
        for g, part in ((g, raw[raw["group"] == g]) for g in GROUPS)
    }

    speeds = {file: step_speeds(journey) for file, journey in raw.groupby("file")}
    bot_cap = float(max(speeds[f].max() for f in files.index[files["group"] == "numeric_with_botposition"] if len(speeds[f])))
    died = raw[raw["event"].isin(["BotKilled", "Killed", "KilledByStorm"])].groupby("file").size()
    behaviour = {}
    for g in GROUPS:
        in_group = files[files["group"] == g]
        duration = in_group["end"] - in_group["start"]
        behaviour[g] = {
            "journeys": len(in_group),
            "journeys_faster_than_bot_cap": int(sum((speeds[f] > bot_cap).any() for f in in_group.index)),
            "journeys_with_a_death": int(in_group.index.isin(died.index).sum()),
            "median_duration_s": float(duration.median()),
            "journeys_starting_at_match_start": int((in_group["start"] == in_group["match"].map(match_start)).sum()),
        }

    composition = files.groupby("match")["group"].value_counts().unstack(fill_value=0).reindex(columns=GROUPS, fill_value=0)
    shapes = composition.assign(has_bots=composition["numeric_with_botposition"] > 0).groupby(
        ["uuid", "numeric_without_botposition", "has_bots"]).size()
    delays: dict[str, dict[str, int]] = {"uuid_led": {}, "unknown_led": {}}
    for match, part in files.groupby("match"):
        leads, bots = part[part["group"] != "numeric_with_botposition"], part[part["group"] == "numeric_with_botposition"]
        if len(leads) and len(bots):
            kind = "uuid_led" if (leads["group"] == "uuid").any() else "unknown_led"
            for delay in bots["start"] - leads["start"].min():
                delays[kind][str(int(delay))] = delays[kind].get(str(int(delay)), 0) + 1

    anomalies = files[files["group"] == "numeric_without_botposition"].copy()
    actor_sizes = anomalies.groupby("user").size().sort_values(ascending=False, kind="stable")
    letters = {user: chr(ord("A") + i) for i, user in enumerate(actor_sizes.index)}
    bot_ids = files.loc[files["group"] == "numeric_with_botposition", "user"].astype(int)
    actors = {}
    for user, letter in letters.items():
        mine = files[files["user"] == user]
        actors[letter] = {
            "unknown_journeys": int((mine["group"] == "numeric_without_botposition").sum()),
            "bot_journeys_elsewhere": int((mine["group"] == "numeric_with_botposition").sum()),
            "bot_journeys_elsewhere_share_a_match_with_a_uuid_human": int(sum(
                (composition.loc[m, "uuid"] > 0) for m in mine.loc[mine["group"] == "numeric_with_botposition", "match"])),
            "maps": sorted(mine.loc[mine["group"] == "numeric_without_botposition", "map"].unique().tolist()),
            "id_inside_bot_id_range": bool(bot_ids.min() <= int(user) <= bot_ids.max()),
        }

    # the pipeline must agree: its `unknown` journeys are exactly this group
    final = prepared.events.groupby("file")["actor_kind"].first()
    assert set(final.index[final == "unknown"]) == set(anomalies.index), "pipeline unknown ≠ raw anomaly group"
    kept = prepared.events[prepared.events["actor_kind"] == "unknown"]

    dates = match_dates(prepared.events)
    anomalies["actor"] = anomalies["user"].map(letters)
    anomalies = anomalies.sort_values(["actor", "start"])
    rows = []
    for n, (file, j) in enumerate(anomalies.iterrows(), start=1):
        mates = composition.loc[j["match"]]
        journey = raw[raw["file"] == file]
        rows.append({
            "case_id": f"U{n:02d}",
            "actor": j["actor"],
            "map": j["map"],
            "match_date_utc": dates[j["match"]],
            "id_format": "numeric",
            "raw_event_counts": event_counts(journey["event"]),
            "pipeline_event_counts": event_counts(kept.loc[kept["file"] == file, "event"]),
            "duration_s": int(j["end"] - j["start"]),
            "faster_than_bot_cap": bool((speeds[file] > bot_cap).any()),
            "died": bool(file in died.index),
            "other_journeys_in_match": f"uuid={int(mates['uuid'])};bot={int(mates['numeric_with_botposition'])}",
            "observed_event_class": "player-client (Position, no BotPosition)",
            "final_classification": str(final[file]),
            "classification_reason": "numeric ID says bot; Position/Loot events say player client; no evidence of a person",
        })

    summary = {
        "raw_files_read": int(raw["file"].nunique()),
        "raw_rows_read": len(raw),
        "ownership": ownership_checks(raw),
        "files_with_both_position_and_botposition": int(
            raw.groupby("file")["event"].apply(lambda e: {"Position", "BotPosition"} <= set(e)).sum()),
        "event_profile": profile,
        "bot_speed_cap_units_per_s": round(bot_cap, 3),
        "behaviour": behaviour,
        "match_shapes": [
            {"uuid_journeys": int(u), "unknown_journeys": int(a), "has_bots": bool(b), "matches": int(n)}
            for (u, a, b), n in shapes.items()
        ],
        "bot_start_delay_after_first_non_bot_s": {k: dict(sorted(v.items(), key=lambda kv: int(kv[0]))) for k, v in delays.items()},
        "unknown": {
            "files": len(anomalies),
            "journeys": int(anomalies.groupby(["user", "match"]).ngroups),
            "actors": len(letters),
            "matches": int(anomalies["match"].nunique()),
            "actors_detail": actors,
        },
        "pipeline_journeys_by_kind": {k: int(v) for k, v in final.value_counts().sort_index().items()},
    }
    return summary, rows


def investigate_pairs(raw: pd.DataFrame, group: pd.Series, prepared: Prepared) -> tuple[dict, list[dict]]:
    kk = raw[raw["event"].isin(["Kill", "Killed"])]
    files_per_match = raw.groupby("match_id")["file"].nunique()
    match_start = raw.groupby("match_id")["ts_raw"].min()
    kept = prepared.events[prepared.events["kill_killed_pair"]].set_index(["file", "row"])
    journeys = kk.groupby("file").agg(start=("ts_raw", "min")).sort_values("start")
    rows = []
    for n, file in enumerate(journeys.index, start=1):
        journey = raw[raw["file"] == file].sort_values("row")
        pair = journey[journey["event"].isin(["Kill", "Killed"])]
        end = journey["ts_raw"].max()
        for order, (_, e) in enumerate(pair.iterrows(), start=1):
            after = journey[journey["row"] > e["row"]]
            partner = pair[pair["row"] != e["row"]].iloc[0]
            cleaned = kept.loc[(file, e["row"])]
            rows.append({
                "case_id": f"P{n}",
                "map": e["map_id"],
                "file_group": group[file],
                "event_in_pair": order,
                "raw_event": e["event"],
                "rows_apart_from_partner": int(abs(partner["row"] - e["row"])),
                "t_match_s": int(e["ts_raw"] - match_start[e["match_id"]]),
                "same_second_as_partner": bool(partner["ts_raw"] == e["ts_raw"]),
                "same_xyz_as_partner": bool((partner[["x", "y", "z"]] == e[["x", "y", "z"]]).all()),
                "rows_after_in_file": len(after),
                "seconds_to_journey_end": int(end - e["ts_raw"]),
                "other_recorded_files_in_match": int(files_per_match[e["match_id"]] - 1),
                "pipeline_type": cleaned["category"],
                "pipeline_kill_killed_pair": bool(cleaned["kill_killed_pair"]),
                "counted_in_kill_totals": bool(counted_kills(cleaned.to_frame().T).iat[0]),
                "counted_in_death_totals": bool(cleaned["category"] in DEATH_CATEGORIES),
            })

    # base rate: how often a human file logs a BotKill in the same second as its own BotKilled
    human = raw[raw["file"].map(group) == "uuid"]
    kills = human.loc[human["event"] == "BotKill", ["file", "ts_raw"]].drop_duplicates()
    deaths = human.loc[human["event"] == "BotKilled", ["file", "ts_raw"]].drop_duplicates()
    summary = {
        "raw_kill_rows": int((raw["event"] == "Kill").sum()),
        "raw_killed_rows": int((raw["event"] == "Killed").sum()),
        "files_with_kill_or_killed": int(kk["file"].nunique()),
        "kill_rows_without_same_second_killed": int(sum(
            not ((kk["file"] == r.file) & (kk["ts_raw"] == r.ts_raw) & (kk["event"] == "Killed")).any()
            for r in kk[kk["event"] == "Kill"].itertuples())),
        "pipeline_rows_flagged_kill_killed_pair": int(prepared.events["kill_killed_pair"].sum()),
        "pipeline_self_kill_rows": int((prepared.events["category"] == "self_kill").sum()),
        "base_rate_human_botkill_rows": int((human["event"] == "BotKill").sum()),
        "base_rate_human_botkilled_seconds": len(deaths),
        "base_rate_botkilled_seconds_with_same_second_botkill": len(kills.merge(deaths, on=["file", "ts_raw"])),
        "matches_with_one_recorded_file": int((files_per_match == 1).sum()),
        "matches": int(files_per_match.size),
    }
    return summary, rows


def top_cells(grid: np.ndarray, n: int = 10) -> set[int]:
    """The n busiest non-empty cells (ties broken by cell order)."""
    flat = grid.ravel()
    top = np.argsort(-flat, kind="stable")[:n]
    return set(top[flat[top] > 0].tolist())


def heatmap_impact(prepared: Prepared) -> dict:
    """Each human heatmap layer with the unknown journeys added back, compared with the published (human-only) one."""
    events = prepared.events
    result = {}
    for map_id in MAPS:
        on_map = events[events["map_id"] == map_id]
        published = on_map[on_map["actor_kind"] == "human"]
        with_unknown = on_map[on_map["actor_kind"].isin(["human", "unknown"])]
        layers = {}
        for layer, grid in (
            ("kills", lambda d: count_grid(d[counted_kills(d)])),
            ("deaths", lambda d: count_grid(d[d["category"].isin(DEATH_CATEGORIES)])),
            ("traffic", lambda d: traffic_grid(d[d["category"] == "position"])),
        ):
            a, b = grid(with_unknown), grid(published)
            changed = np.abs(a - b) > 1e-9
            layers[layer] = {
                "total_with_unknown": round(float(a.sum()), 1),
                "total_published": round(float(b.sum()), 1),
                "share_from_unknown_pct": round(100 * float((a.sum() - b.sum()) / a.sum()), 2) if a.sum() else 0.0,
                "cells_changed": int(changed.sum()),
                "cells_lit_only_by_unknown": int(((a > 0) & (b == 0)).sum()),
                "cells_lit_published": int((b > 0).sum()),
                "top10_cells_shared": len(top_cells(a) & top_cells(b)),
                "pearson_r": round(float(np.corrcoef(a.ravel(), b.ravel())[0, 1]), 4) if b.sum() else None,
            }
        result[map_id] = {
            "human_journeys": int(published["file"].nunique()),
            "unknown_journeys": int(on_map.loc[on_map["actor_kind"] == "unknown", "file"].nunique()),
            "layers": layers,
        }
    return result


def build_evidence(data_dir: Path = DEFAULT_DATA_DIR, prepared: Prepared | None = None) -> dict[str, str]:
    """File name → contents for every generated evidence file."""
    raw, _ = load_journeys(data_dir)
    prepared = prepared or prepare(data_dir)
    group = raw_groups(raw)
    actors, actor_rows = investigate_actors(raw, group, prepared)
    pairs, pair_rows = investigate_pairs(raw, group, prepared)
    summary = {"actors": actors, "kill_killed_pairs": pairs, "heatmap_impact": heatmap_impact(prepared)}
    return {
        "actor_classification.csv": _csv(actor_rows),
        "kill_killed_pairs.csv": _csv(pair_rows),
        "forensics_summary.json": json.dumps(summary, indent=2) + "\n",
    }


def _csv(rows: list[dict]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for name, text in build_evidence(args.data_dir).items():
        (args.out_dir / name).write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {args.out_dir / name}")


if __name__ == "__main__":
    main()
