"""Overall statistics (spec 10): contract, definitions, and reconciliation with index, heatmaps and match files."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from lila_pipeline.build import REPO_ROOT
from lila_pipeline.stats import (
    DEATH_CAUSES, METRICS, METRICS_VERSION, SCORE_PARTS, _distribution, build_stats, fingerprint, journey_table,
)

DISTANCE_TOLERANCE = 1.0  # world units per journey; measured 0.81 between unrounded and 4-decimal UV (2026-10-23)
KINDS = {"count", "ratio", "rate", "distribution", "histogram", "breakdown", "score"}
METRIC_FIELDS = {"label", "section", "unit", "kind", "definition", "population", "denominator", "limitations", "scopes"}
DISTRIBUTION_KEYS = {"n", "min", "p25", "median", "p75", "max", "sum", "few_values"}
TOP_KEYS = {"schema_version", "metrics_version", "source", "thresholds", "grid", "maps", "dates", "metrics", "slices"}
MAPS = ["AmbroseValley", "GrandRift", "Lockdown"]


def _data(built) -> Path:
    return built[0] / "web" / "data"


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def stats(built) -> dict:
    return _load(_data(built) / "stats.json")


@pytest.fixture(scope="module")
def index(built) -> dict:
    return _load(_data(built) / "index.json")


def _slices(stats: dict):
    for map_scope, by_date in stats["slices"].items():
        for date_scope, part in by_date.items():
            yield map_scope, date_scope, part


# --- contract -------------------------------------------------------------------------------------------------------

def _check_histogram(value: dict) -> None:
    assert {"edges", "overflow", "n"} <= set(value) and ("counts" in value) != ("series" in value)
    series = [value["counts"]] if "counts" in value else [value["series"][c] for c in DEATH_CAUSES.values()]
    assert all(len(counts) == len(value["edges"]) - 1 for counts in series)
    assert sum(map(sum, series)) + value["overflow"] == value["n"]


def _check_value(kind: str, value: dict) -> None:
    if kind == "count":
        assert set(value) == {"value"} and isinstance(value["value"], int)
    elif kind == "ratio":
        assert set(value) == {"numerator", "denominator", "value"}
        assert value["value"] == round(value["numerator"] / value["denominator"], 4)
    elif kind == "rate":
        assert set(value) == {"numerator", "denominator", "per", "value"}
        assert value["value"] == round(value["per"] * value["numerator"] / value["denominator"], 2)
    elif kind == "score":
        assert set(value) == {"value", "parts", "maps"} and list(value["parts"]) == list(SCORE_PARTS)
        assert all(0 <= p <= 1 for p in value["parts"].values()) and value["maps"] >= 2
        assert value["value"] == pytest.approx(sum(value["parts"].values()) / len(value["parts"]), abs=0.01)
    elif kind == "breakdown":
        assert set(value) == {"value", "parts"} and sum(value["parts"].values()) == value["value"]
    elif kind == "histogram":
        _check_histogram(value)
    else:
        assert set(value) - {"histogram"} == DISTRIBUTION_KEYS and value["few_values"] == (value["n"] < 10)
        if "histogram" in value:
            _check_histogram(value["histogram"])
            assert value["histogram"]["n"] == value["n"]


def test_stats_file_matches_the_documented_contract(stats, index) -> None:
    assert set(stats) == TOP_KEYS
    assert stats["schema_version"] == 1 and stats["metrics_version"] == METRICS_VERSION and stats["grid"] == 64
    assert stats["thresholds"] == {"few_matches": 10, "few_values": 10}
    assert stats["maps"] == MAPS
    assert stats["dates"] == [{k: d[k] for k in ("date", "partial", "boundary", "observed_from_utc", "observed_to_utc")}
                              for d in index["dates"]]
    assert set(stats["source"]) == {"fingerprint", "files"} and len(stats["source"]["fingerprint"]) == 7 + 16
    for metric in stats["metrics"].values():
        assert set(metric) == METRIC_FIELDS and metric["kind"] in KINDS and metric["scopes"] in {"all", "per_map"}
        assert metric["label"] and metric["definition"] and isinstance(metric["limitations"], list)

    dates = [d["date"] for d in index["dates"]]
    assert set(stats["slices"]) == {"all", *MAPS}  # keys are sorted in the file, so "all" comes last
    assert all(set(by_date) == {"all", *dates} for by_date in stats["slices"].values())
    assert sum(1 for _ in _slices(stats)) == 28
    for map_scope, date_scope, part in _slices(stats):
        assert set(part) == {"sample", "flags", "values"}
        assert set(part["sample"]) == {"matches", "matches_with_human", "human_journeys", "human_players", "excluded"}
        assert set(part["sample"]["excluded"]) == {"bot_journeys", "unknown_journeys"}
        assert set(part["flags"]) == {"empty", "few_matches", "partial_date", "boundary_date"}
        assert set(part["values"]) == set(stats["metrics"])
        for metric, value in part["values"].items():
            per_map_only = stats["metrics"][metric]["scopes"] == "per_map" and map_scope == "all"
            all_dates_only = metric == "players_by_days_observed" and date_scope != "all"
            maps_present = sum(not stats["slices"][m][date_scope]["flags"]["empty"] for m in MAPS)
            unscored = metric == "map_score" and maps_present < 2
            if part["flags"]["empty"] or per_map_only or all_dates_only or unscored:
                assert value is None, (map_scope, date_scope, metric)
            else:
                _check_value(stats["metrics"][metric]["kind"], value)


def test_slice_flags(stats, index) -> None:
    dates = {d["date"]: d for d in index["dates"]}
    for map_scope, date_scope, part in _slices(stats):
        sample, flags = part["sample"], part["flags"]
        assert flags["empty"] == (sample["human_journeys"] == 0)
        assert flags["few_matches"] == (sample["matches_with_human"] < 10)
        if date_scope != "all":
            assert flags["partial_date"] == dates[date_scope]["partial"]
            assert flags["boundary_date"] == dates[date_scope]["boundary"]
    empty = {(m, d) for m, d, part in _slices(stats) if part["flags"]["empty"]}
    assert empty == {("GrandRift", "2026-02-09"), ("Lockdown", "2026-02-09")}
    av = stats["slices"]["AmbroseValley"]["2026-02-09"]
    assert av["sample"]["human_journeys"] == 1 and av["flags"]["few_matches"] and av["flags"]["partial_date"]
    assert stats["slices"]["GrandRift"]["2026-02-13"]["flags"]["few_matches"]


def test_headline_figures(stats) -> None:
    """The figures spec 10 quotes (its "How to verify" list) come from this file."""
    whole = stats["slices"]["all"]["all"]
    assert whole["sample"] == {"matches": 796, "matches_with_human": 796, "human_journeys": 798, "human_players": 248,
                               "excluded": {"bot_journeys": 444, "unknown_journeys": 0}}
    values = whole["values"]
    assert values["repeat_players"] == {"numerator": 141, "denominator": 248, "value": 0.5685}
    assert values["deaths"] == {"value": 443, "parts": {"by_bot": 401, "storm": 39, "paired_killed": 3}}
    assert values["kill_killed_pairs"] == {"value": 3}
    assert values["journeys_with_death"]["numerator"] == 443
    assert [stats["slices"][m]["all"]["values"]["matches"]["value"] for m in MAPS] == [566, 59, 171]
    assert [stats["slices"][m]["all"]["values"]["matches_with_human"]["value"] for m in MAPS] == [566, 59, 171]
    assert [stats["slices"][m]["all"]["values"]["grid_cells_observed"]["numerator"] for m in MAPS] == [1621, 1261, 1101]
    assert stats["slices"]["AmbroseValley"]["all"]["values"]["deaths"]["value"] == 316
    storm = np.array(values["death_time_s"]["histogram"]["series"]["storm"])
    assert storm.sum() == 39 and storm[:10].sum() == 0  # no storm death before 600 s


def test_rates_and_map_score(stats) -> None:
    """Per-journey rates compare maps of different sample sizes; the score compares the map slices of one date."""
    by_map = {m: stats["slices"][m]["all"]["values"] for m in MAPS}
    assert [by_map[m]["kill_rate"] for m in MAPS] == [
        {"numerator": 1669, "denominator": 568, "per": 1, "value": 2.94},
        {"numerator": 179, "denominator": 59, "per": 1, "value": 3.03},
        {"numerator": 388, "denominator": 171, "per": 1, "value": 2.27}]
    assert [by_map[m]["loot_rate"]["value"] for m in MAPS] == [17.43, 14.92, 11.97]
    assert [by_map[m]["storm_death_rate"]["value"] for m in MAPS] == [2.99, 8.47, 9.94]
    for m in MAPS:  # the rates agree with the totals they are built from
        assert by_map[m]["kill_rate"]["numerator"] == by_map[m]["kills"]["value"]
        assert by_map[m]["loot_rate"]["numerator"] == by_map[m]["loot_events"]["value"]
        assert by_map[m]["storm_death_rate"]["numerator"] == by_map[m]["deaths"]["parts"]["storm"]
    assert [by_map[m]["map_score"]["value"] for m in MAPS] == [0.78, 0.44, 0.24]
    assert by_map["AmbroseValley"]["map_score"]["parts"] == {
        "human_journeys": 1.0, "journey_span_s": 0.0, "kill_rate": 0.88, "loot_rate": 1.0, "storm_death_rate": 1.0}
    assert stats["slices"]["all"]["all"]["values"]["map_score"] is None  # never a score for the all-maps scope
    # 2026-02-09: only AmbroseValley has a human journey, so there is nothing to compare it with
    assert stats["slices"]["AmbroseValley"]["2026-02-09"]["values"]["map_score"] is None


# --- definitions on small synthetic journeys ------------------------------------------------------------------------

def _rows(file: str, user: str, match: str, rows: list[tuple], kind: str = "human", map_id: str = "Lockdown"):
    """rows: (t, event, u, v[, after_death])"""
    out = []
    for row in rows:
        t, event, u, v, *rest = row
        category = {"Position": "position", "BotPosition": "position", "BotKill": "kill", "Kill": "kill",
                    "BotKilled": "death", "Killed": "death", "KilledByStorm": "storm_death", "Loot": "loot"}[event]
        out.append({"file": file, "user_id": user, "match_id": match, "map_id": map_id, "actor_kind": kind,
                    "t": t, "epoch_s": 1_770_681_600 + t, "event": event, "raw": event, "category": category,
                    "u": u, "v": v, "after_death": bool(rest and rest[0])})
    return out


def _synthetic() -> pd.DataFrame:
    rows = [
        # a: moves 0.01 u (10 world units on Lockdown) in 5 s, then a 31 s gap that adds nothing, a pair, a late kill
        *_rows("a", "p1", "m1", [(0, "Position", 0.5, 0.5), (5, "Position", 0.51, 0.5), (36, "Position", 0.9, 0.9),
                                 (40, "Kill", 0.9, 0.9), (40, "Killed", 0.9, 0.9), (41, "BotKill", 0.9, 0.9, True)]),
        *_rows("b", "p1", "m2", [(0, "Position", 0.1, 0.1), (10, "Loot", 0.1, 0.1), (20, "Loot", 0.1, 0.1),
                                 (30, "Position", 0.1, 0.13)]),
        *_rows("c", "p2", "m2", [(0, "Position", 0.2, 0.2), (8, "BotKill", 0.2, 0.2), (12, "KilledByStorm", 0.2, 0.2)]),
        *_rows("d", "9001", "m2", [(0, "BotPosition", 0.3, 0.3), (5, "BotKilled", 0.3, 0.3)], kind="bot"),
    ]
    events = pd.DataFrame(rows)
    pair = events["event"].isin(["Kill", "Killed"]) & (events["file"] == "a") & (events["t"] == 40)
    return events.assign(kill_killed_pair=pair)


def _synthetic_index(events: pd.DataFrame) -> dict:
    dates = [{"date": "2026-02-10", "partial": False, "boundary": True,
              "observed_from_utc": "2026-02-10T00:00:00Z", "observed_to_utc": "2026-02-11T00:00:00Z"},
             {"date": "2026-02-11", "partial": False, "boundary": True,
              "observed_from_utc": "2026-02-11T00:00:00Z", "observed_to_utc": "2026-02-12T00:00:00Z"}]
    matches = [{"id": m, "map": "Lockdown", "date": "2026-02-10"} for m in sorted(events["match_id"].unique())]
    return {"dates": dates, "matches": matches}


def test_median_and_quartiles() -> None:
    assert _distribution(pd.Series([3, 1, 2]))["median"] == 2.0
    assert _distribution(pd.Series([4, 1, 3, 2]))["median"] == 2.5  # mean of the two middle values
    odd = _distribution(pd.Series([1, 2, 3, 4, 10]))
    assert (odd["p25"], odd["p75"], odd["sum"], odd["few_values"]) == (2.0, 4.0, 20, True)
    assert _distribution(pd.Series([1, 2, 3, 4]))["p25"] == 1.8  # linear interpolation (numpy's default)


def test_definitions_on_synthetic_journeys() -> None:
    events = _synthetic()
    table = journey_table(events)
    a = table.loc["a"]
    assert a["movement_s"] == 5 and a["distance"] == pytest.approx(10.0)  # the 31 s gap adds nothing
    assert a["kills"] == 1  # the after_death BotKill counts; the paired Kill doesn't
    assert a["death_cause"] == "paired_killed" and a["span_s"] == 40  # the late kill is outside the span
    assert table.loc["b", "first_loot_s"] == 10 and table.loc["b", "loot"] == 2

    heatmaps = {m: {"layers": {"traffic": {"all": [[0, 0, 1.0]], "2026-02-10": [[0, 0, 1.0]]}}} for m in MAPS}
    stats = build_stats(events, _synthetic_index(events), heatmaps, {"fingerprint": "sha256:x", "files": 0})
    values = stats["slices"]["Lockdown"]["2026-02-10"]["values"]
    assert values["kills"] == {"value": 2}
    assert values["kill_killed_pairs"] == {"value": 1}
    assert values["deaths"] == {"value": 2, "parts": {"by_bot": 0, "storm": 1, "paired_killed": 1}}  # bot left out
    assert values["human_players"] == {"value": 2} and values["repeat_players"]["numerator"] == 1
    assert values["matches"] == {"value": 2} and values["matches_with_human"] == {"value": 2}
    assert values["first_loot_s"]["n"] == 1 and values["grid_cells_observed"]["numerator"] == 1
    assert stats["slices"]["all"]["2026-02-10"]["values"]["grid_cells_observed"] is None
    assert stats["slices"]["Lockdown"]["2026-02-10"]["sample"]["excluded"] == {"bot_journeys": 1, "unknown_journeys": 0}

    empty = stats["slices"]["Lockdown"]["2026-02-11"]
    assert empty["flags"]["empty"] and all(v is None for v in empty["values"].values())
    assert stats["slices"]["GrandRift"]["all"]["flags"]["empty"]


def test_an_unpaired_killed_is_refused() -> None:
    events = _synthetic()
    events.loc[events["event"] == "Killed", "kill_killed_pair"] = False
    with pytest.raises(ValueError, match="without its Kill"):
        journey_table(events)


# --- reconciliation with the other generated files -------------------------------------------------------------------

def _summed_counts(index: dict, map_scope: str, date_scope: str) -> dict:
    total: dict = defaultdict(int)
    total["matches"] = 0
    for match in index["matches"]:
        if map_scope in ("all", match["map"]) and date_scope in ("all", match["date"]):
            total["matches"] += 1
            for kind, count in match["counts"].items():
                total[kind] += count
    return total


def test_slices_reconcile_with_index_counts(stats, index) -> None:
    for map_scope, date_scope, part in _slices(stats):
        counts = _summed_counts(index, map_scope, date_scope)
        assert part["sample"]["matches"] == counts["matches"]
        values = part["values"]
        if part["flags"]["empty"]:
            assert counts["kill"] == counts["death"] == counts["loot"] == 0
            continue
        assert values["matches"]["value"] == counts["matches"]
        assert values["kills"]["value"] == counts["kill"]
        assert values["deaths"]["value"] == counts["death"] + counts["storm_death"]
        assert values["deaths"]["parts"]["storm"] == counts["storm_death"]
        assert values["deaths"]["parts"]["paired_killed"] == counts["kill_killed_pair"]
        assert values["kill_killed_pairs"]["value"] == counts["kill_killed_pair"]
        assert values["loot_events"]["value"] == counts["loot"]


def test_slices_reconcile_with_heatmaps(stats, index, built) -> None:
    for map_id in MAPS:
        heatmap = _load(_data(built) / "heatmaps" / f"{map_id}.json")
        for date_scope in ["all", *(d["date"] for d in index["dates"])]:
            part = stats["slices"][map_id][date_scope]
            if date_scope not in heatmap["samples"]:
                assert part["flags"]["empty"]
                continue
            values, sample = part["values"], heatmap["samples"][date_scope]
            assert values["kills"]["value"] == heatmap["totals"]["kills"][date_scope]
            assert values["deaths"]["value"] == heatmap["totals"]["deaths"][date_scope]
            assert values["movement_time_s"]["sum"] == pytest.approx(heatmap["totals"]["traffic"][date_scope], abs=0.1)
            assert part["sample"]["matches_with_human"] == values["matches_with_human"]["value"] == sample["matches"]
            assert part["sample"]["human_journeys"] == sample["human_journeys"]
            assert values["grid_cells_observed"]["numerator"] == len(heatmap["layers"]["traffic"][date_scope])


def _journeys_from_match_files(built, index: dict) -> pd.DataFrame:
    """Every human journey recomputed from the published match files, independently of `stats.py`."""
    scale = {m: v["scale"] for m, v in index["maps"].items()}
    rows = []
    for summary in index["matches"]:
        match = _load(_data(built) / "matches" / f"{summary['id']}.json")
        for actor in (a for a in match["actors"] if a["kind"] == "human"):
            events = actor["events"]
            times = [p[0] for s in actor["segments"] for p in s] + [e["t"] for e in events if not e["after_death"]]
            loot = [e["t"] for e in events if e["type"] == "loot"]
            deaths = [e for e in events if e["type"] in ("death", "storm_death")]
            steps = [(p, q) for s in actor["segments"] for p, q in zip(s, s[1:])]
            rows.append({
                "map": match["map"], "date": match["date"], "player": actor["id"], "start": min(times),
                "span": max(times) - min(times),
                "kills": sum(e["type"] == "kill" and not e["kill_killed_pair"] for e in events),
                "loot": len(loot), "first_loot": min(loot) if loot else None,
                "deaths": len(deaths), "death_t": deaths[0]["t"] if deaths else None,
                "movement": sum(q[0] - p[0] for p, q in steps),
                "distance": sum(math.hypot(q[1] - p[1], q[2] - p[2]) for p, q in steps) * scale[match["map"]],
            })
    return pd.DataFrame(rows)


@pytest.fixture(scope="module")
def recomputed(built, index) -> pd.DataFrame:
    return _journeys_from_match_files(built, index)


def _scope(table: pd.DataFrame, map_scope: str, date_scope: str) -> pd.DataFrame:
    keep = pd.Series(True, index=table.index)
    if map_scope != "all":
        keep &= table["map"] == map_scope
    if date_scope != "all":
        keep &= table["date"] == date_scope
    return table[keep]


def _expected(values: pd.Series) -> dict:
    return _distribution(values.dropna())


def test_distributions_reconcile_with_match_files(stats, recomputed) -> None:
    assert len(recomputed) == 798 and (recomputed["start"] == 0).all()  # every human journey starts at t = 0
    assert recomputed["deaths"].max() == 1
    exact = {"journey_span_s": "span", "kills_per_journey": "kills", "loot_per_journey": "loot",
             "first_loot_s": "first_loot", "death_time_s": "death_t", "movement_time_s": "movement"}
    for map_scope, date_scope, part in _slices(stats):
        if part["flags"]["empty"]:
            continue
        journeys = _scope(recomputed, map_scope, date_scope)
        values = part["values"]
        for metric, column in exact.items():
            stored = {k: v for k, v in values[metric].items() if k != "histogram"}
            assert stored == _expected(journeys[column]), (map_scope, date_scope, metric)
        assert values["kills_per_journey"]["sum"] == values["kills"]["value"]
        assert values["human_players"]["value"] == journeys["player"].nunique()

        distance, expected = values["distance"], _distribution(journeys["distance"], decimals=1)
        assert distance["n"] == expected["n"]
        for key in ("min", "p25", "median", "p75", "max"):
            assert distance[key] == pytest.approx(expected[key], abs=DISTANCE_TOLERANCE + 0.05)
        assert distance["sum"] == pytest.approx(expected["sum"], abs=DISTANCE_TOLERANCE * expected["n"])


def test_unique_counts_and_medians_are_not_combined_across_slices(stats, recomputed) -> None:
    whole = stats["slices"]["all"]["all"]["values"]
    by_map = [stats["slices"][m]["all"]["values"]["human_players"]["value"] for m in MAPS]
    assert whole["human_players"]["value"] == recomputed["player"].nunique() == 248
    assert sum(by_map) == 328 != 248  # 80 players were seen on more than one map

    median = whole["journey_span_s"]["median"]
    assert median == float(np.median(recomputed["span"]))
    by_date = [p["values"]["journey_span_s"]["median"] for d, p in stats["slices"]["all"].items() if d != "all"]
    assert median not in (float(np.median(by_date)), round(float(np.mean(by_date)), 1))


def test_bot_journeys_are_left_out(prepared, stats) -> None:
    table = journey_table(prepared.events)
    whole = stats["slices"]["all"]["all"]["values"]
    assert int(table["kills"].sum()) != whole["kills"]["value"] == int(table.loc[table["kind"] == "human", "kills"].sum())
    assert int(table["loot"].sum()) >= whole["loot_events"]["value"]
    assert table["user_id"].nunique() > whole["human_players"]["value"]


# --- freshness --------------------------------------------------------------------------------------------------------

def test_fingerprint_matches_the_files_it_was_built_from(built, stats) -> None:
    assert fingerprint(_data(built)) == stats["source"]
    assert stats["source"]["files"] == 1 + 3 + 796


def test_published_stats_are_current() -> None:
    """The committed `web/public/data/stats.json` was built from the committed data files: run `make data` if not."""
    data = REPO_ROOT / "web" / "public" / "data"
    published = _load(data / "stats.json")
    assert published["source"] == fingerprint(data), "stats.json is stale: run `make data`"
    assert published["metrics_version"] == METRICS_VERSION
