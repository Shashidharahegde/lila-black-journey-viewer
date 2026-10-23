"""Overall statistics for the dashboard and the chat (spec 10): every map scope x every date scope, precomputed.

Unique counts and medians can't be combined from parts, so every slice is computed from the journeys themselves and
nothing is summed or averaged across slices. The population is human journeys after cleaning (EC-09, D2, D3); bot
and `unknown` journeys only appear in the match counts and the `excluded` block.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pandas as pd

from lila_pipeline.export import SCHEMA_VERSION, match_dates
from lila_pipeline.heatmaps import GRID
from lila_pipeline.journeys import MAX_PATH_GAP_S, counted_kills
from lila_pipeline.projection import MAPS

METRICS_VERSION = 2  # 2: per-journey rates and the map score
THRESHOLDS = {"few_matches": 10, "few_values": 10}
DEATH_CAUSES = {"BotKilled": "by_bot", "KilledByStorm": "storm", "Killed": "paired_killed"}  # fixed series order
SPAN_EDGES = list(range(0, 901, 60))
DEATH_EDGES = list(range(0, 901, 60))
FIRST_LOOT_EDGES = list(range(0, 301, 15))
DISTANCE_EDGES = list(range(0, 3001, 250))
JOURNEYS_PER_PLAYER_EDGES = [1, 2, 3, 4, 6, 11]  # bins 1, 2, 3, 4-5, 6-10 and 11+ as overflow

_RECORDED = "Recorded journeys only; most matches have one recorded human (EC-25)."
_PSEUDONYMS = "Player pseudonyms, not people; never add this across slices."
_REPEAT = ("Observed repeat activity in this 5-day window, not retention; a single-date slice only sees that day.")


def _metric(label: str, section: str, unit: str, kind: str, definition: str, population: str = "",
            denominator: str = "", limitations: tuple[str, ...] = (), scopes: str = "all") -> dict:
    return {"label": label, "section": section, "unit": unit, "kind": kind, "definition": definition,
            "population": population, "denominator": denominator, "limitations": list(limitations), "scopes": scopes}


METRICS: dict[str, dict] = {
    "human_journeys": _metric(
        "Human journeys", "engagement", "journeys", "count",
        "Count of human journeys (one human file in one match, after cleaning) in the slice.",
        limitations=(_RECORDED,)),
    "human_players": _metric(
        "Players observed", "engagement", "players", "count",
        "Distinct player pseudonyms with a human journey in the slice.", limitations=(_PSEUDONYMS,)),
    "repeat_players": _metric(
        "Players seen more than once", "engagement", "players", "ratio",
        "Players with 2 or more human journeys in the slice.", "Players observed", "human_players",
        (_REPEAT,)),
    "journeys_per_player": _metric(
        "Journeys per player", "engagement", "journeys", "distribution",
        "Human journeys per player; histogram bins 1, 2, 3, 4-5, 6-10 and 11+.", "Players observed", "",
        (_REPEAT,)),
    "players_by_days_observed": _metric(
        "Days a player was seen", "engagement", "players", "histogram",
        "Players by the number of distinct UTC match dates they have a human journey on.",
        "Players observed; all-dates slices only (null for a single date)", "",
        ("Partial boundary days (2026-02-09, 2026-02-14) shorten the window.", _REPEAT)),
    "journey_span_s": _metric(
        "Recorded journey span", "engagement", "seconds", "distribution",
        "Last record minus first record of the journey (positions and events; rows after the death are excluded, "
        "D2). Histogram in 60 s bins from 0 to 900 s.", "Human journeys", "",
        ("Not a session length: recording may start late or stop early.",
         "Differs from estimated movement time whenever a journey has a gap over 30 s.")),
    "kills": _metric(
        "Kills", "combat", "events", "count",
        "Counted kills in human files: kill rows that aren't half of a Kill/Killed pair. Kills logged after the "
        "player's death count, as on the heatmaps and in the match list.",
        limitations=("All counted kills in this data are BotKill events.",
                     "Position is where the killer stood.")),
    "deaths": _metric(
        "Deaths", "combat", "events", "breakdown",
        "Death and storm-death rows in human files: by_bot = BotKilled, storm = KilledByStorm, "
        "paired_killed = the Killed half of a Kill/Killed pair.",
        limitations=("No human journey has more than one death.",
                     "The cause of a paired Killed is unknown.")),
    "kill_killed_pairs": _metric(
        "Kill/Killed pairs", "combat", "pairs", "count",
        "A Kill and a Killed in the same file and the same second (EC-12).",
        limitations=("Cause unknown: the rows can't tell a self-inflicted death from a trade with an unrecorded "
                     "player, so they are neither self-kills nor PvP.",)),
    "journeys_with_death": _metric(
        "Journeys that ended in a death", "combat", "journeys", "ratio",
        "Human journeys with a death row.", "Human journeys", "human_journeys",
        ("The rest are 'no death recorded'. Extraction is not recorded (EC-13), so any extraction label is "
         "inferred.",)),
    "death_time_s": _metric(
        "When deaths happen", "combat", "seconds (match time)", "distribution",
        "Match time of each death. Histogram in 60 s bins from 0 to 900 s, split by cause "
        "(by_bot, storm, paired_killed).", "Deaths", "",
        ("Storm deaths only happen late in a match.",)),
    "kills_per_journey": _metric(
        "Kills per journey", "combat", "events", "distribution",
        "Counted kills per human journey, zeros included; the sum equals Kills.", "Human journeys", "",
        ("The clicked-route card leaves kills logged after the death out, so it can differ by one for those "
         "journeys.",)),
    "matches": _metric(
        "Recorded matches", "maps", "matches", "count",
        "All matches in the match index for the slice, with or without a human journey.",
        limitations=("Includes bot-only and unknown-only matches.",)),
    "matches_with_human": _metric(
        "Matches with a human journey", "maps", "matches", "count",
        "Matches in the slice with at least one human journey; equals the heatmaps' sample.",
        limitations=("The sample every human statistic rests on; sample sizes differ by about 10x between maps.",)),
    "loot_events": _metric(
        "Loot pickups", "loot", "events", "count", "Loot rows in human files.",
        limitations=("Several pickups can share one second (EC-03); none are deduplicated (D3).",)),
    "journeys_with_loot": _metric(
        "Journeys with any loot", "loot", "journeys", "ratio",
        "Human journeys with at least one loot row.", "Human journeys", "human_journeys"),
    "loot_per_journey": _metric(
        "Loot per journey", "loot", "events", "distribution",
        "Loot rows per human journey, zeros included.", "Human journeys"),
    "first_loot_s": _metric(
        "Time to first loot", "loot", "seconds", "distribution",
        "Match time of the journey's first loot row. Histogram in 15 s bins from 0 to 300 s, plus an overflow bin.",
        "Human journeys with loot (the rest have no loot recorded)", "",
        ("Shows when a pickup was logged, not when the player reached the item.",)),
    "movement_time_s": _metric(
        "Estimated movement time", "movement", "seconds", "distribution",
        f"Sum of the gaps between consecutive positions inside path segments (gaps of at most {MAX_PATH_GAP_S} s, "
        "D5). The sum equals the traffic heatmap's total.", "Human journeys", "",
        ("An estimate, not measured playtime.", "Separate from the recorded journey span.")),
    "distance": _metric(
        "Distance travelled", "movement", "world units", "distribution",
        "Sum of straight-line steps between consecutive positions inside path segments, in world units "
        "(UV distance x map scale). Histogram in 250-unit bins from 0 to 3000.", "Human journeys", "",
        ("A lower bound: positions are about 5 s apart and joined by straight lines.",
         f"Gaps over {MAX_PATH_GAP_S} s add nothing.",
         "The clicked-route card computes from rounded positions, so it may differ slightly.")),
    "grid_cells_observed": _metric(
        "Grid cells with observed human traffic", "movement", "cells", "ratio",
        f"Non-zero cells of the published traffic heatmap for the slice, out of the {GRID} x {GRID} grid.",
        "Grid cells", f"{GRID * GRID} cells",
        ("Not '% of map explored': the grid includes unreachable and off-map area.",
         "Cell size differs by map, and coverage grows with the sample, so maps aren't directly comparable.",
         "Per map only (null for all maps)."), scopes="per_map"),
    "kill_rate": _metric(
        "Kills per journey (average)", "combat", "kills per journey", "rate",
        "Counted kills divided by human journeys: the mean of kills per journey.", "Human journeys",
        "human_journeys", ("A rate, so maps with different sample sizes can be compared; the total is Kills.",)),
    "loot_rate": _metric(
        "Loot per journey (average)", "loot", "pickups per journey", "rate",
        "Loot pickups divided by human journeys: the mean of loot per journey.", "Human journeys",
        "human_journeys", ("A rate, so maps with different sample sizes can be compared; the total is Loot pickups.",)),
    "storm_death_rate": _metric(
        "Storm deaths per 100 journeys", "combat", "storm deaths per 100 journeys", "rate",
        "Storm deaths (KilledByStorm) divided by human journeys, times 100.", "Human journeys", "human_journeys",
        ("Storm deaths only happen late in a match.",)),
    "map_score": _metric(
        "Map performance score", "maps", "score (0-1)", "score",
        "The three maps at the same date compared on five parts: human journeys, median recorded journey span, "
        "kills per journey and loot per journey (higher is better), and storm deaths per 100 journeys (lower is "
        "better). Each part is scaled so the best map at that date is 1 and the worst is 0 (all equal: 0.5); the "
        "score is the equal-weight mean of the five parts (S, 2026-10-23).",
        "Maps with a human journey at the date", "",
        ("A comparison between maps, not a measure of quality: with three maps the best and worst always get 1 "
         "and 0 on every part, so small gaps look large.",
         "The weights and directions are a design choice, not a property of the data.",
         "A map with few matches counts like any other; check its sample.",
         "Per map only (null for all maps), and null when fewer than two maps have a human journey."),
        scopes="per_map"),
}

# map_score parts, in display order: the value each part reads, and whether a higher value is better
SCORE_PARTS = {
    "human_journeys": (lambda v: v["human_journeys"]["value"], True),
    "journey_span_s": (lambda v: v["journey_span_s"]["median"], True),
    "kill_rate": (lambda v: v["kill_rate"]["value"], True),
    "loot_rate": (lambda v: v["loot_rate"]["value"], True),
    "storm_death_rate": (lambda v: v["storm_death_rate"]["value"], False),
}


def journey_table(events: pd.DataFrame) -> pd.DataFrame:
    """One row per journey (file) of every kind, with the per-journey values the metrics are built from."""
    dates = match_dates(events)
    first = events.groupby("file", sort=True).agg(
        kind=("actor_kind", "first"), match_id=("match_id", "first"), map_id=("map_id", "first"),
        user_id=("user_id", "first"))
    first["date"] = first["match_id"].map(dates)

    timed = events[~events["after_death"]].groupby("file")["t"]
    first["span_s"] = timed.max() - timed.min()
    first["start_t"] = timed.min()
    first["kills"] = counted_kills(events).groupby(events["file"]).sum()
    loot = events[events["category"] == "loot"].groupby("file")["t"]
    first["loot"] = loot.size()
    first["first_loot_s"] = loot.min()

    deaths = events[events["category"].isin({"death", "storm_death"})]
    if (deaths["event"] == "Killed").gt(deaths["kill_killed_pair"]).any():
        raise ValueError("a Killed row without its Kill: the death breakdown would not add up")
    if deaths["file"].duplicated().any():
        raise ValueError("a journey with more than one death")
    deaths = deaths.set_index("file")
    first["death_s"] = deaths["t"]
    first["death_cause"] = deaths["event"].map(DEATH_CAUSES)

    positions = events[events["category"] == "position"]
    gap = positions.groupby("file")["epoch_s"].diff()
    inside = gap.le(MAX_PATH_GAP_S)  # first position of a journey (NaN) and long gaps add nothing
    step = np.hypot(positions.groupby("file")["u"].diff(), positions.groupby("file")["v"].diff())
    step = step * positions["map_id"].map({m: c.scale for m, c in MAPS.items()})
    first["movement_s"] = gap.where(inside, 0).groupby(positions["file"]).sum()
    first["distance"] = step.where(inside, 0).groupby(positions["file"]).sum()

    first[["kills", "loot", "movement_s", "distance"]] = first[["kills", "loot", "movement_s", "distance"]].fillna(0)
    return first.astype({"kills": int, "loot": int, "movement_s": int})


def fingerprint(data_dir: Path) -> dict:
    """SHA-256 over the bytes of index.json, the heatmaps and every match file, in sorted path order."""
    paths = [data_dir / "index.json", *(data_dir / "heatmaps").glob("*.json"), *(data_dir / "matches").glob("*.json")]
    paths = sorted(paths, key=lambda p: p.relative_to(data_dir).as_posix())
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.read_bytes())
    return {"fingerprint": f"sha256:{digest.hexdigest()[:16]}", "files": len(paths)}


def build_stats(events: pd.DataFrame, index: dict, heatmaps: dict[str, dict], source: dict) -> dict:
    """All map scopes x all date scopes, from the cleaned events; `heatmaps` gives the published traffic cells."""
    journeys = journey_table(events)
    matches = pd.DataFrame(index["matches"], columns=["id", "map", "date"])
    dates = {d["date"]: d for d in index["dates"]}
    slices: dict[str, dict] = {}
    for map_scope in ["all", *MAPS]:
        slices[map_scope] = {}
        for date_scope in ["all", *dates]:
            def chosen(table: pd.DataFrame, map_col: str, date_col: str) -> pd.DataFrame:
                keep = pd.Series(True, index=table.index)
                if map_scope != "all":
                    keep &= table[map_col] == map_scope
                if date_scope != "all":
                    keep &= table[date_col] == date_scope
                return table[keep]

            part = chosen(journeys, "map_id", "date")
            slices[map_scope][date_scope] = _slice(
                part, len(chosen(matches, "map", "date")), map_scope, date_scope, dates, heatmaps, len(dates))
    for date_scope in ["all", *dates]:
        _add_map_scores([slices[m][date_scope] for m in MAPS])
    return {
        "schema_version": SCHEMA_VERSION,
        "metrics_version": METRICS_VERSION,
        "source": source,
        "thresholds": THRESHOLDS,
        "grid": GRID,
        "maps": list(MAPS),
        "dates": [{k: d[k] for k in ("date", "partial", "boundary", "observed_from_utc", "observed_to_utc")}
                  for d in index["dates"]],
        "metrics": METRICS,
        "slices": slices,
    }


def _slice(part: pd.DataFrame, matches: int, map_scope: str, date_scope: str, dates: dict[str, dict],
           heatmaps: dict[str, dict], date_count: int) -> dict:
    humans = part[part["kind"] == "human"]
    with_human = int(humans["match_id"].nunique())
    included = sorted(set(humans["date"])) if date_scope == "all" else [date_scope]
    sample = {
        "matches": matches,
        "matches_with_human": with_human,
        "human_journeys": len(humans),
        "human_players": int(humans["user_id"].nunique()),
        "excluded": {"bot_journeys": int((part["kind"] == "bot").sum()),
                     "unknown_journeys": int((part["kind"] == "unknown").sum())},
    }
    flags = {
        "empty": humans.empty,
        "few_matches": with_human < THRESHOLDS["few_matches"],
        "partial_date": any(dates[d]["partial"] for d in included),
        "boundary_date": any(dates[d]["boundary"] for d in included),
    }
    if humans.empty:
        values = {metric: None for metric in METRICS}
    else:
        traffic = heatmaps[map_scope]["layers"]["traffic"][date_scope] if map_scope != "all" else None
        values = _values(humans, matches, date_scope, traffic, date_count)
    return {"sample": sample, "flags": flags, "values": values}


def _values(humans: pd.DataFrame, matches: int, date_scope: str, traffic: list | None, date_count: int) -> dict:
    journeys = len(humans)
    per_player = humans.groupby("user_id").size()
    deaths = humans.dropna(subset=["death_s"])
    looted = humans.dropna(subset=["first_loot_s"])
    days = humans.groupby("user_id")["date"].nunique()
    return {
        "human_journeys": {"value": journeys},
        "human_players": {"value": len(per_player)},
        "repeat_players": _ratio(int((per_player >= 2).sum()), len(per_player)),
        "journeys_per_player": _distribution(per_player, JOURNEYS_PER_PLAYER_EDGES),
        "players_by_days_observed": (
            _histogram(days, list(range(1, date_count + 2))) if date_scope == "all" else None),
        "journey_span_s": _distribution(humans["span_s"], SPAN_EDGES),
        "kills": {"value": int(humans["kills"].sum())},
        "deaths": {"value": len(deaths),
                   "parts": {cause: int((deaths["death_cause"] == cause).sum()) for cause in DEATH_CAUSES.values()}},
        "kill_killed_pairs": {"value": int((deaths["death_cause"] == "paired_killed").sum())},
        "journeys_with_death": _ratio(len(deaths), journeys),
        "death_time_s": _distribution(deaths["death_s"], DEATH_EDGES, split=deaths["death_cause"]),
        "kills_per_journey": _distribution(humans["kills"]),
        "matches": {"value": matches},
        "matches_with_human": {"value": int(humans["match_id"].nunique())},
        "loot_events": {"value": int(humans["loot"].sum())},
        "journeys_with_loot": _ratio(len(looted), journeys),
        "loot_per_journey": _distribution(humans["loot"]),
        "first_loot_s": _distribution(looted["first_loot_s"], FIRST_LOOT_EDGES),
        "movement_time_s": _distribution(humans["movement_s"]),
        "distance": _distribution(humans["distance"], DISTANCE_EDGES, decimals=1),
        "grid_cells_observed": _ratio(len(traffic), GRID * GRID) if traffic is not None else None,
        "kill_rate": _rate(int(humans["kills"].sum()), journeys),
        "loot_rate": _rate(int(humans["loot"].sum()), journeys),
        "storm_death_rate": _rate(int((deaths["death_cause"] == "storm").sum()), journeys, per=100),
        "map_score": None,  # filled in by _add_map_scores, which compares the map slices of one date
    }


def _add_map_scores(map_slices: list[dict]) -> None:
    """Scale each SCORE_PARTS value between the maps of one date (best 1, worst 0, all equal 0.5) and store the
    equal-weight mean. The slices are compared, never combined: no value is added across them."""
    present = [s for s in map_slices if not s["flags"]["empty"]]
    for s in map_slices:
        s["values"]["map_score"] = None
    if len(present) < 2:
        return
    scaled: list[dict[str, float]] = [{} for _ in present]
    for part, (read, higher_is_better) in SCORE_PARTS.items():
        raw = [float(read(s["values"])) for s in present]
        low, high = min(raw), max(raw)
        for i, x in enumerate(raw):
            share = 0.5 if high == low else (x - low) / (high - low)
            scaled[i][part] = share if higher_is_better else 1 - share
    for s, parts in zip(present, scaled):
        s["values"]["map_score"] = {"value": round(sum(parts.values()) / len(parts), 2),
                                    "parts": {k: round(v, 2) for k, v in parts.items()}, "maps": len(present)}


def _ratio(numerator: int, denominator: int) -> dict:
    return {"numerator": numerator, "denominator": denominator, "value": round(numerator / denominator, 4)}


def _rate(numerator: int, denominator: int, per: int = 1) -> dict:
    """numerator per `per` units of the denominator, e.g. storm deaths per 100 journeys."""
    return {"numerator": numerator, "denominator": denominator, "per": per,
            "value": round(per * numerator / denominator, 2)}


def _distribution(values: pd.Series, edges: list[int] | None = None, decimals: int = 0,
                  split: pd.Series | None = None) -> dict:
    """n, min, quartiles (linear interpolation, numpy's default), max and sum; an optional histogram."""
    data = values.to_numpy(dtype=float)

    def number(x: float) -> float | int:
        return round(float(x), decimals) if decimals else int(round(float(x)))

    if len(data):
        p25, median, p75 = (round(float(q), 1) for q in np.percentile(data, [25, 50, 75]))
        out = {"n": len(data), "min": number(data.min()), "p25": p25, "median": median, "p75": p75,
               "max": number(data.max()), "sum": number(data.sum())}
    else:
        out = {"n": 0, "min": None, "p25": None, "median": None, "p75": None, "max": None, "sum": 0}
    out["few_values"] = len(data) < THRESHOLDS["few_values"]
    if edges is not None:
        out["histogram"] = _histogram(values, edges, split)
    return out


def _histogram(values: pd.Series, edges: list[int], split: pd.Series | None = None) -> dict:
    """Bins [edges[k], edges[k+1]); values at or above the last edge go to `overflow`."""
    data = values.to_numpy(dtype=float)
    if (data < edges[0]).any():
        raise ValueError(f"value below the first histogram edge {edges[0]}")

    def counts(subset: np.ndarray) -> list[int]:
        return [int(c) for c in np.histogram(subset[subset < edges[-1]], bins=edges)[0]]

    out: dict = {"edges": edges, "overflow": int((data >= edges[-1]).sum()), "n": len(data)}
    if split is None:
        out["counts"] = counts(data)
    else:
        labels = split.to_numpy()
        out["series"] = {cause: counts(data[labels == cause]) for cause in DEATH_CAUSES.values()}
    return out
