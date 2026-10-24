"""Region statistics for the interpretation layer (spec 06, Stage 6b): definitions, rules, shifted-grid check, generated files."""

from __future__ import annotations

import json
import re
from dataclasses import replace

import numpy as np
import pandas as pd
import pytest

from lila_pipeline import export, zones
from lila_pipeline.heatmaps import GRID, traffic_grid
from lila_pipeline.journeys import DEATH_CATEGORIES, counted_kills
from lila_pipeline.projection import MAPS

UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


# --- synthetic selections ------------------------------------------------------------------------------------------

def selection(n_matches: int, hot: dict[int, list[tuple[int, int, int]]] | None = None, background: bool = True, players: list[int] | None = None):
    """One journey per match. `hot[match]` = [(i, j, count), ...] events; every match also gets one background event in
    its own random cell, so there are many occupied regions."""
    rng = np.random.default_rng(7)
    tensor = np.zeros((n_matches, GRID, GRID))
    for m in range(n_matches):
        if background:
            tensor[m, rng.integers(0, GRID), rng.integers(0, GRID)] += 1
        for i, j, count in (hot or {}).get(m, []):
            tensor[m, i, j] += count
    match_ids = np.arange(n_matches)
    player_ids = np.array(players) if players is not None else np.arange(n_matches)
    return tensor, match_ids, player_ids


def classify_synthetic(tensor, match_ids, player_ids, key="synthetic", rules=zones.RULES, **kwargs):
    return zones.classify(zones.collect(tensor, match_ids, player_ids, key=key, rules=rules, **kwargs), rules)


def hot_zone(result: dict, i: int, j: int) -> dict:
    return next(z for z in result["zones"] if (z["i"], z["j"]) == (i, j))


# --- the rules and the grid ------------------------------------------------------------------------------------------

def test_the_approved_provisional_rules() -> None:
    r = zones.RULES
    assert (r.top_share, r.min_candidates, r.min_stability, r.min_matches, r.min_players, r.max_one_match_share) == (0.10, 3, 0.8, 5, 3, 0.5)
    assert (r.survival_rule, r.required_shifts) == ("dominant", 3)
    assert zones.ZONE_CELLS == 4 and zones.ZONES == 16 and zones.SHIFTS[0] == (0, 0)
    assert set(zones.SHIFTS) == {(0, 0), (2, 0), (0, 2), (2, 2)}  # half a region horizontally, vertically, both


@pytest.mark.parametrize("shift", zones.SHIFTS)
def test_every_cell_is_in_exactly_one_region_and_regions_have_the_right_size(shift) -> None:
    zone, ni, nj = zones.zone_of_cell(shift)
    assert zone.shape == (GRID * GRID,) and zone.min() == 0 and zone.max() == ni * nj - 1
    sizes = np.bincount(zone, minlength=ni * nj)
    assert sizes.sum() == GRID * GRID and sizes.min() > 0
    if shift == (0, 0):
        assert (ni, nj) == (16, 16) and set(sizes) == {16}  # 16 x 16 regions of 4 x 4 cells
    else:
        assert max(sizes) == 16 and min(sizes) in (4, 8)  # the shifted grid's edge regions are partial


def test_the_shifted_grid_moves_every_boundary_by_half_a_region() -> None:
    base, _, _ = zones.zone_of_cell((0, 0))
    shifted, _, nj = zones.zone_of_cell((2, 0))
    # cells 2 and 3 of the first row of cells share a region on the baseline grid, and not with cell 4
    assert base[2 * GRID] == base[3 * GRID] != base[4 * GRID]
    # on the grid shifted by 2 cells in i, cells 2..5 are one region
    assert len({shifted[i * GRID] for i in (2, 3, 4, 5)}) == 1 and shifted[1 * GRID] != shifted[2 * GRID]


@pytest.mark.parametrize("shift", zones.SHIFTS)
def test_region_values_add_up_to_the_cell_totals(shift) -> None:
    tensor, m, p = selection(12, {k: [(10, 10, 3), (30, 41, 2)] for k in range(12)})
    ev = zones.collect(tensor, m, p, key="sums")
    grid = next(g for g in ev.grids if g.shift == shift)
    assert grid.value.sum() == pytest.approx(tensor.sum())
    assert ev.cell_total.sum() == pytest.approx(tensor.sum())


# --- definitions: contributing matches, players, largest share, journeys --------------------------------------------

def test_matches_and_players_are_counted_from_the_source_not_from_totals() -> None:
    # region (5, 5) holds cells 20..23: events from 6 matches; matches 0-2 are one player, 3-5 are three more
    hot = {m: [(20 + m % 4, 20, 2)] for m in range(6)}
    tensor, m, _ = selection(10, hot, players=[0, 0, 0, 1, 2, 3, 4, 5, 6, 7])
    ev = zones.collect(tensor, m, np.array([0, 0, 0, 1, 2, 3, 4, 5, 6, 7]), key="counts")
    z = next(k for k in range(256) if ev.grids[0].value[k] >= 12)
    assert ev.grids[0].matches[z] == 6 and ev.grids[0].players[z] == 4  # 6 matches, but only 4 distinct players


def test_one_player_across_many_matches_is_not_many_players() -> None:
    hot = {m: [(20, 20, 3)] for m in range(30)}
    tensor, mids, _ = selection(30, hot, players=[0, 1] * 15)  # two players play all 30 matches
    result = classify_synthetic(tensor, mids, np.array([0, 1] * 15))
    z = hot_zone(result, 5, 5)
    assert (z["matches"], z["players"]) == (30, 2) and z["tier"] == "observed"  # fails the 3-player rule


def test_largest_match_share_and_the_one_match_cap() -> None:
    hot = {0: [(20, 20, 9)], **{m: [(20, 20, 1)] for m in range(1, 6)}}  # 6 matches, one gives 9 of 14
    tensor, mids, pids = selection(30, hot)
    z = hot_zone(classify_synthetic(tensor, mids, pids), 5, 5)
    assert z["largest_match_share"] == pytest.approx(9 / 14, abs=0.05) and z["matches"] == 6
    assert z["tier"] == "observed"  # over half from one match


def test_a_region_seen_in_one_match_is_never_consistent_however_large() -> None:
    tensor, mids, pids = selection(30, {0: [(20, 20, 80)]})
    z = hot_zone(classify_synthetic(tensor, mids, pids), 5, 5)
    assert z["matches"] == 1 and z["largest_match_share"] == 1.0 and z["tier"] == "observed"


def test_a_widely_supported_concentration_is_consistent() -> None:
    hot = {m: [(20, 20, 3), (21, 21, 2)] for m in range(30)}
    tensor, mids, pids = selection(30, hot)
    result = classify_synthetic(tensor, mids, pids)
    z = hot_zone(result, 5, 5)
    assert (z["matches"], z["players"]) == (30, 30) and z["stability"] >= 0.99 and z["survived_shifts"] == 3 and z["tier"] == "consistent"
    assert result["consistent"] == 1 and z["share"] > 0.7


def test_the_journey_count_is_distinct_journeys_with_value_in_the_region() -> None:
    # 5 journeys of the same match, in one region: matches = 1, journeys = 5
    tensor = np.zeros((5, GRID, GRID))
    tensor[:, 20, 20] = 4
    ev = zones.collect(tensor, np.zeros(5, dtype=int), np.arange(5), key="journeys", count_journeys=True)
    z = int(np.argmax(ev.grids[0].value))
    assert ev.grids[0].journeys[z] == 5 and ev.grids[0].matches[z] == 1
    assert zones.collect(tensor, np.zeros(5, dtype=int), np.arange(5), key="no journeys").grids[0].journeys is None


def test_storm_deaths_are_counted_inside_the_region_details() -> None:
    hot = {m: [(20, 20, 2)] for m in range(30)}
    tensor, mids, pids = selection(30, hot)
    storm = np.zeros((GRID, GRID))
    storm[20, 20] = 7
    result = classify_synthetic(tensor, mids, pids, storm=storm)
    assert hot_zone(result, 5, 5)["storm_deaths"] == 7
    assert "storm_deaths" not in hot_zone(classify_synthetic(tensor, mids, pids), 5, 5)


# --- stability, candidates, empty and tiny selections ----------------------------------------------------------------

def test_candidates_are_the_top_decile_of_occupied_regions_and_at_least_three() -> None:
    tensor, mids, pids = selection(40, {m: [(20, 20, 3)] for m in range(40)})
    ev = zones.collect(tensor, mids, pids, key="candidates")
    base = ev.grids[0]
    occupied = int((base.value > 0).sum())
    assert zones.candidate_count(base, zones.RULES) == max(3, -(-occupied // 10))
    assert zones.candidate_count(base, replace(zones.RULES, top_share=0.5)) > zones.candidate_count(base, zones.RULES)
    assert list(zones.top_regions(base, 1)) == [int(np.argmax(base.value))]


def test_stability_is_the_share_of_resamples_in_which_a_region_stays_a_candidate() -> None:
    tensor, mids, pids = selection(40, {m: [(20, 20, 3)] for m in range(40)})
    ev = zones.collect(tensor, mids, pids, key="stability")
    base = ev.grids[0]
    freq = zones.stability(base, zones.candidate_count(base, zones.RULES))
    hot = int(np.argmax(base.value))
    assert freq[hot] == 1.0 and freq.max() <= 1.0 and freq.min() >= 0.0
    assert freq[base.value == 0].sum() == 0  # an empty region is never a candidate
    assert zones.stability(base, 0).sum() == 0


def test_an_empty_layer_has_no_regions() -> None:
    result = classify_synthetic(np.zeros((6, GRID, GRID)), np.arange(6), np.arange(6))
    assert (result["total"], result["occupied_zones"], result["candidates"], result["consistent"], result["zones"]) == (0, 0, 0, 0, [])


def test_a_single_match_selection_cannot_be_consistent() -> None:
    tensor = np.zeros((1, GRID, GRID))
    tensor[0, 20, 20] = 30
    result = classify_synthetic(tensor, np.array([0]), np.array([0]))
    assert result["consistent"] == 0 and result["zones"][0]["matches"] == 1


# --- the shifted-grid check ----------------------------------------------------------------------------------------

def test_a_concentration_on_a_region_boundary_survives_because_shifted_grids_recentre_it() -> None:
    # cells 23 and 24 straddle the baseline boundary between regions (5, 5) and (6, 5)
    hot = {m: [(23, 20, 2), (24, 20, 2)] for m in range(30)}
    tensor, mids, pids = selection(30, hot)
    result = classify_synthetic(tensor, mids, pids)
    halves = [hot_zone(result, 5, 5), hot_zone(result, 6, 5)]
    assert all(z["value"] == 60 for z in halves)  # the baseline splits it in two equal halves
    assert all(z["tier"] == "consistent" for z in halves)  # and each half's counterpart on a shifted grid is established


def test_survival_rules_on_recorded_checks() -> None:
    strong = {"established_share": 0.9, "dominant_established": True}
    spread = {"established_share": 0.3, "dominant_established": True}
    weak = {"established_share": 0.9, "dominant_established": False}
    dominant, majority = zones.RULES, replace(zones.RULES, survival_rule="majority")
    assert zones.survives(strong, dominant) and zones.survives(strong, majority)
    assert zones.survives(spread, dominant) and not zones.survives(spread, majority)  # the stricter rule needs half the value
    assert not zones.survives(weak, dominant) and zones.survives(weak, majority)


def test_consistent_always_means_every_check_passed() -> None:
    hot = {m: [(20, 20, 3)] for m in range(30)} | {m: [(40, 40, 3)] for m in range(0, 30, 6)} | {0: [(50, 12, 40)]}
    tensor, mids, pids = selection(30, hot)
    r = zones.RULES
    for z in classify_synthetic(tensor, mids, pids)["zones"]:
        if z["tier"] == "consistent":
            assert z["stability"] >= r.min_stability and z["matches"] >= r.min_matches and z["players"] >= r.min_players
            assert z["largest_match_share"] <= r.max_one_match_share and z["survived_shifts"] >= r.required_shifts
        else:
            assert not (z["passes_stability_and_support"] and z["survived_shifts"] >= r.required_shifts)


def test_loosening_or_tightening_the_rules_moves_regions_as_expected() -> None:
    hot = {m: [(20, 20, 3)] for m in range(30)} | {m: [(40, 40, 3)] for m in range(4)}  # second spot: 4 matches only
    tensor, mids, pids = selection(30, hot)
    base = classify_synthetic(tensor, mids, pids)
    loose = classify_synthetic(tensor, mids, pids, rules=replace(zones.RULES, min_matches=3, min_stability=0.5))
    strict = classify_synthetic(tensor, mids, pids, rules=replace(zones.RULES, min_matches=40))
    assert hot_zone(base, 10, 10)["tier"] == "observed"  # 4 matches: below the 5-match minimum
    assert loose["consistent"] >= base["consistent"] >= strict["consistent"] == 0


# --- determinism ---------------------------------------------------------------------------------------------------

def test_the_same_inputs_give_the_same_regions_and_the_seed_comes_from_the_key() -> None:
    tensor, mids, pids = selection(30, {m: [(20, 20, 3)] for m in range(30)} | {m: [(33, 8, 2)] for m in range(0, 30, 3)})
    a = classify_synthetic(tensor, mids, pids, key="same")
    b = classify_synthetic(tensor, mids, pids, key="same")
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    other = classify_synthetic(tensor, mids, pids, key="other")
    assert [(z["i"], z["j"], z["value"]) for z in a["zones"]] == [(z["i"], z["j"], z["value"]) for z in other["zones"]]  # values don't depend on the seed


# --- hotspots (S, 2026-10-24) ---------------------------------------------------------------------------------------------

def hotspots_synthetic(tensor, match_ids, player_ids, rules=zones.HOTSPOT_RULES):
    evidence = zones.collect(tensor, match_ids, player_ids, key="synthetic", rules=zones.HOTSPOT_EVIDENCE["rules"], shifts=zones.HOTSPOT_EVIDENCE["shifts"])
    return zones.hotspots(evidence, rules)


def test_the_hotspot_rules() -> None:
    r = zones.HOTSPOT_RULES
    assert (r.min_matches, r.max_one_match_share, r.max_hotspots) == (5, 0.5, 6)


def test_a_region_with_events_from_five_matches_is_a_hotspot_and_one_from_four_is_not() -> None:
    hot = {m: [(8, 8, 2)] for m in range(5)} | {m: [(40, 40, 2)] for m in range(5, 9)}
    tensor, matches, players = selection(10, hot, background=False)
    zones_found = {(z["i"], z["j"]) for z in hotspots_synthetic(tensor, matches, players)["zones"]}
    assert zones_found == {(2, 2)}  # cell (8, 8) is region (2, 2); region (10, 10) has four matches


def test_a_region_one_match_dominates_is_not_a_hotspot() -> None:
    hot = {0: [(8, 8, 20)]} | {m: [(8, 8, 1)] for m in range(1, 6)}
    tensor, matches, players = selection(6, hot, background=False)
    assert hotspots_synthetic(tensor, matches, players)["zones"] == []  # match 0 supplies 20 of 25


def test_a_layer_with_too_little_support_has_no_hotspots_rather_than_weak_ones() -> None:
    tensor, matches, players = selection(3, {m: [(8, 8, 3)] for m in range(3)}, background=False)
    result = hotspots_synthetic(tensor, matches, players)
    assert result["zones"] == [] and result["hotspots"] == 0 and result["occupied_zones"] == 1


def test_at_most_six_hotspots_strongest_first() -> None:
    hot = {m: [(4 * k, 4 * k, k + 1) for k in range(8)] for m in range(6)}
    tensor, matches, players = selection(6, hot, background=False)
    zones_found = hotspots_synthetic(tensor, matches, players)["zones"]
    assert len(zones_found) == 6 and [z["value"] for z in zones_found] == sorted((z["value"] for z in zones_found), reverse=True)
    assert zones_found[0]["value"] == 48 and zones_found[-1]["value"] == 18  # regions with 8 down to 3 events per match, the two weakest left out


# --- real data -----------------------------------------------------------------------------------------------------

def zones_file(out, map_id: str) -> dict:
    return json.loads((out / "web" / "data" / "zones" / f"{map_id}.json").read_text(encoding="utf-8"))


def heatmap_file(out, map_id: str) -> dict:
    return json.loads((out / "web" / "data" / "heatmaps" / f"{map_id}.json").read_text(encoding="utf-8"))


def test_zones_files_match_the_documented_contract(built) -> None:
    out, _ = built
    for map_id in MAPS:
        f = zones_file(out, map_id)
        assert set(f) == {"schema_version", "map", "grid", "zone_cells", "zones_per_side", "rules", "selections"}
        assert (f["map"], f["grid"], f["zone_cells"], f["zones_per_side"]) == (map_id, 64, 4, 16) and f["rules"] == zones.rules_as_dict() == {"min_matches": 5, "max_one_match_share": 0.5, "max_hotspots": 6}
        heat = heatmap_file(out, map_id)
        assert set(f["selections"]) == set(heat["samples"])  # the same selections as the heatmap: all dates and each date
        for key, selection_ in f["selections"].items():
            assert set(selection_) == {"matches", "players", "layers"} and set(selection_["layers"]) == set(zones.LAYERS)
            assert selection_["matches"] == heat["samples"][key]["matches"]
            for layer, result in selection_["layers"].items():
                assert set(result) == {"total", "occupied_zones", "hotspots", "zones"} | ({"storm_deaths"} if layer == "deaths" else set())
                assert result["hotspots"] == len(result["zones"]) <= f["rules"]["max_hotspots"]
                values = [z["value"] for z in result["zones"]]
                assert values == sorted(values, reverse=True)  # strongest first
                for z in result["zones"]:
                    required = {"i", "j", "value", "share", "matches", "players", "largest_match_share"}
                    required |= {"journeys"} if layer == "traffic" else set()
                    required |= {"storm_deaths"} if layer == "deaths" else set()
                    assert set(z) == required and 0 <= z["i"] < 16 and 0 <= z["j"] < 16
                    assert 0 < z["share"] <= 1 and z["value"] > 0


def test_region_totals_reconcile_with_the_heatmap_grids_for_every_selection(built) -> None:
    out, _ = built
    for map_id in MAPS:
        f, heat = zones_file(out, map_id), heatmap_file(out, map_id)
        for key, selection_ in f["selections"].items():
            for layer, name in (("kills", "kills"), ("deaths", "deaths"), ("traffic", "traffic")):
                total = selection_["layers"][layer]["total"]
                assert total == pytest.approx(heat["totals"][name][key], abs=0.5 if layer == "traffic" else 0)


def test_the_regions_listed_for_a_layer_never_add_up_to_more_than_the_layer(built) -> None:
    out, _ = built
    for map_id in MAPS:
        for selection_ in zones_file(out, map_id)["selections"].values():
            for result in selection_["layers"].values():
                assert sum(z["share"] for z in result["zones"]) <= 1.0001


def test_every_hotspot_meets_the_published_rules_and_none_is_skipped_for_a_weaker_one(built) -> None:
    out, _ = built
    for map_id in MAPS:
        f = zones_file(out, map_id)
        rules = f["rules"]
        for selection_ in f["selections"].values():
            for result in selection_["layers"].values():
                for z in result["zones"]:
                    assert z["matches"] >= rules["min_matches"] and z["largest_match_share"] <= rules["max_one_match_share"]


def test_contributing_matches_and_players_match_an_independent_count_from_the_events(prepared, built) -> None:
    """Kills and deaths: group the cleaned events by region with pandas (no grids, no tensors) and compare."""
    out, _ = built
    events = prepared.events
    humans = events[events["actor_kind"] == "human"]
    for map_id in ("GrandRift", "Lockdown"):
        part = humans[humans["map_id"] == map_id]
        for layer, rows in (("kills", part[counted_kills(part)]), ("deaths", part[part["category"].isin(DEATH_CATEGORIES)])):
            i = np.clip(np.floor(rows["u"].to_numpy(dtype=float) * GRID).astype(int), 0, GRID - 1) // 4
            j = np.clip(np.floor(rows["v"].to_numpy(dtype=float) * GRID).astype(int), 0, GRID - 1) // 4
            by_region = rows.assign(zi=i, zj=j).groupby(["zi", "zj"])
            for z in zones_file(out, map_id)["selections"]["all"]["layers"][layer]["zones"]:
                group = by_region.get_group((z["i"], z["j"]))
                assert z["value"] == len(group)
                assert z["matches"] == group["match_id"].nunique() and z["players"] == group["user_id"].nunique()
                assert z["largest_match_share"] == pytest.approx(group.groupby("match_id").size().max() / len(group), abs=0.001)


def test_traffic_journeys_matches_and_largest_share_match_the_traced_journeys(prepared, built) -> None:
    out, _ = built
    events = prepared.events
    part = events[(events["map_id"] == "GrandRift") & (events["actor_kind"] == "human") & (events["category"] == "position")]
    grids, match_of = [], []
    for _, journey in part.groupby("file", sort=False):
        grids.append(traffic_grid(journey))
        match_of.append(journey["match_id"].iat[0])
    stack = np.stack(grids)
    for z in zones_file(out, "GrandRift")["selections"]["all"]["layers"]["traffic"]["zones"]:
        block = stack[:, z["i"] * 4 : z["i"] * 4 + 4, z["j"] * 4 : z["j"] * 4 + 4].sum(axis=(1, 2))
        assert z["journeys"] == int((block > 0).sum())
        assert z["matches"] == len({m for m, v in zip(match_of, block) if v > 0})
        assert z["value"] == pytest.approx(block.sum(), abs=0.1)
        assert z["players"] == part.assign(v=part["file"].map(dict(zip(part["file"].unique(), block)))).query("v > 0")["user_id"].nunique()


def test_storm_deaths_in_the_region_details_never_exceed_the_storm_deaths_recorded(prepared, built) -> None:
    out, _ = built
    storm = prepared.events[(prepared.events["actor_kind"] == "human") & (prepared.events["category"] == "storm_death")]
    assert len(storm) == 39
    for map_id in MAPS:
        recorded = int((storm["map_id"] == map_id).sum())
        deaths = zones_file(out, map_id)["selections"]["all"]["layers"]["deaths"]
        assert deaths["storm_deaths"] == recorded  # the layer's own count, kept inside the deaths
        assert sum(z["storm_deaths"] for z in deaths["zones"]) <= recorded
        assert all(z["storm_deaths"] <= z["value"] for z in deaths["zones"])


def test_a_region_file_rebuilt_from_the_cleaned_events_is_the_shipped_file(prepared, built) -> None:
    out, _ = built
    fresh = export.build_zones("GrandRift", prepared.events)
    assert json.loads(json.dumps(fresh)) == zones_file(out, "GrandRift")


def test_no_player_or_match_identifier_in_the_zone_files(prepared, built) -> None:
    out, _ = built
    real = {u for u in prepared.events["user_id"].astype(str).unique() if UUID.fullmatch(u)}  # numeric bot IDs are short numbers that occur anywhere
    for map_id in MAPS:
        text = (out / "web" / "data" / "zones" / f"{map_id}.json").read_text(encoding="utf-8")
        assert not UUID.search(text) and not any(user in text for user in real)
        assert "match_id" not in text and "user_id" not in text
