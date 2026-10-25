"""Generated files: dates (D1), index, match files, heatmaps, build report, privacy."""

from __future__ import annotations

import json
import re

import pandas as pd
import pytest
from PIL import Image

from lila_pipeline.build import write_outputs
from lila_pipeline.export import build_dates, journey_label, match_key, player_hash
from lila_pipeline.heatmaps import traffic_grid
from lila_pipeline.images import export_minimap, web_size
from lila_pipeline.ingest import DEFAULT_DATA_DIR
from lila_pipeline.journeys import DEATH_CATEGORIES, counted_kills
from lila_pipeline.projection import MAPS

UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
EXPECTED_DATES = {
    "2026-02-09": (1, True, True),
    "2026-02-10": (287, False, False),
    "2026-02-11": (197, False, False),
    "2026-02-12": (162, False, False),
    "2026-02-13": (112, False, False),
    "2026-02-14": (37, True, True),
}


def at(iso: str) -> int:
    return int(pd.Timestamp(iso).timestamp())


def test_ec23_boundary_dates_are_partial_only_when_the_window_cuts_the_day() -> None:
    events = pd.DataFrame(
        {
            "match_id": ["m1", "m1", "m2", "m3"],
            # m1 starts at midnight exactly; m3 ends one second before midnight
            "epoch_s": [at("2026-03-01T00:00:00Z"), at("2026-03-01T00:10:00Z"),
                        at("2026-03-02T12:00:00Z"), at("2026-03-03T23:59:59Z")],
        }
    )
    dates = {d["date"]: (d["matches"], d["boundary"], d["partial"]) for d in build_dates(events)}
    assert dates == {"2026-03-01": (1, True, False), "2026-03-02": (1, False, False), "2026-03-03": (1, True, True)}


def test_ec23_match_crossing_midnight_has_one_date() -> None:
    events = pd.DataFrame({"match_id": ["m1", "m1"], "epoch_s": [at("2026-03-01T23:58:00Z"), at("2026-03-02T00:05:00Z")]})
    assert [d["date"] for d in build_dates(events)] == ["2026-03-01"]


def test_ids_are_short_and_stable() -> None:
    assert player_hash("abc") == player_hash("abc") and len(player_hash("abc")) == 8
    assert match_key("b71aaad8-aa62-4b3a-8534-927d4de18f22.nakama-0") == "b71aaad8"
    fake = "00000000-0000-4000-8000-000000000001"  # not a real player ID
    assert journey_label(f"{fake}_b71aaad8-aa62.nakama-0") == f"{player_hash(fake)}_b71aaad8"


def test_web_size_never_upscales() -> None:
    assert web_size(9000, 9000) == (4096, 4096)
    assert web_size(4320, 4320) == (4096, 4096)
    assert web_size(2160, 2158) == (2160, 2158)


def test_ec17_minimap_written_as_webp_without_upscaling(tmp_path) -> None:
    source = tmp_path / "minimaps"
    source.mkdir()
    Image.new("RGBA", (216, 215), (120, 80, 40, 255)).save(source / MAPS["GrandRift"].minimap_file)
    size = export_minimap(source, "GrandRift", tmp_path / "maps")
    with Image.open(tmp_path / "maps" / "GrandRift.webp") as written:
        assert size == written.size == (216, 215) and written.format == "WEBP"


def test_ec27_short_ids_are_unique(prepared) -> None:
    events = prepared.events
    assert events["match_id"].map(match_key).nunique() == events["match_id"].nunique()
    assert events["user_id"].map(player_hash).nunique() == events["user_id"].nunique()


def test_ec23_real_dates_are_generated_from_data(built) -> None:
    out, _ = built
    index = json.loads((out / "web" / "data" / "index.json").read_text(encoding="utf-8"))
    assert {d["date"]: (d["matches"], d["boundary"], d["partial"]) for d in index["dates"]} == EXPECTED_DATES
    assert sum(d["matches"] for d in index["dates"]) == len(index["matches"]) == 796


def test_index_maps_use_web_image_sizes(built) -> None:
    out, _ = built
    index = json.loads((out / "web" / "data" / "index.json").read_text(encoding="utf-8"))
    sizes = {name: (m["width"], m["height"]) for name, m in index["maps"].items()}
    assert sizes == {"AmbroseValley": (4096, 4096), "GrandRift": (2160, 2158), "Lockdown": (4096, 4096)}


def test_one_file_per_match_and_paths_inside_map(built) -> None:
    out, _ = built
    files = list((out / "web" / "data" / "matches").glob("*.json"))
    assert len(files) == 796
    for path in files:
        match = json.loads(path.read_text(encoding="utf-8"))
        for actor in match["actors"]:
            for segment in actor["segments"]:
                times = [p[0] for p in segment]
                assert times == sorted(times)
                assert all(0 <= p[1] <= 1 and 0 <= p[2] <= 1 for p in segment)
                assert all(b - a <= 30 for a, b in zip(times, times[1:]))


def test_heatmap_death_totals_equal_human_deaths(prepared, built) -> None:
    out, _ = built
    events = prepared.events
    deaths = events[(events["actor_kind"] == "human") & events["category"].isin(DEATH_CATEGORIES)]
    starts = events.groupby("match_id")["epoch_s"].min()
    deaths = deaths.assign(date=pd.to_datetime(deaths["match_id"].map(starts), unit="s", utc=True).dt.strftime("%Y-%m-%d"))
    for map_id, by_map in deaths.groupby("map_id"):
        heatmap = json.loads((out / "web" / "data" / "heatmaps" / f"{map_id}.json").read_text(encoding="utf-8"))
        assert heatmap["totals"]["deaths"]["all"] == len(by_map)
        assert sum(cell[2] for cell in heatmap["layers"]["deaths"]["all"]) == len(by_map)
        for date, by_date in by_map.groupby("date"):
            assert heatmap["totals"]["deaths"][date] == len(by_date)


def _heatmap(out, map_id: str) -> dict:
    return json.loads((out / "web" / "data" / "heatmaps" / f"{map_id}.json").read_text(encoding="utf-8"))


def test_ec09_flagged_journeys_are_kept_whole_in_match_files(prepared, built) -> None:
    out, _ = built
    events = prepared.events
    flagged = events[events["id_mismatch"]]
    assert flagged["file"].nunique() == 17
    for file, journey in flagged.groupby("file"):
        match = json.loads((out / "web" / "data" / "matches" / f"{match_key(journey['match_id'].iat[0])}.json")
                           .read_text(encoding="utf-8"))
        actor = next(a for a in match["actors"] if a["id"] == player_hash(journey["user_id"].iat[0]))
        assert actor["kind"] == "human" and actor["id_mismatch"]
        positions = journey[journey["category"] == "position"]
        assert sum(len(s) for s in actor["segments"]) == len(positions)
        assert sorted(e["raw"] for e in actor["events"]) == sorted(journey.loc[journey["category"] != "position", "raw"])


def test_ec09_flagged_journeys_are_counted_as_humans_in_heatmaps(prepared, built) -> None:
    out, _ = built
    events = prepared.events
    for map_id in MAPS:
        heatmap = _heatmap(out, map_id)
        on_map = events[events["map_id"] == map_id]
        humans = on_map[on_map["actor_kind"] == "human"]
        assert heatmap["samples"]["all"]["human_journeys"] == humans["file"].nunique()
        assert heatmap["totals"]["kills"]["all"] == int(counted_kills(humans).sum())
        assert heatmap["totals"]["deaths"]["all"] == int(humans["category"].isin(DEATH_CATEGORIES).sum())
        positions = on_map[on_map["category"] == "position"]
        traffic = traffic_grid(positions[positions["actor_kind"] == "human"]).sum()
        without_flagged = traffic_grid(positions[(positions["actor_kind"] == "human") & ~positions["id_mismatch"]]).sum()
        assert heatmap["totals"]["traffic"]["all"] == round(traffic, 1) >= round(without_flagged, 1)


def test_ec12_paired_kills_are_in_match_files_but_not_in_kill_totals(prepared, built) -> None:
    out, _ = built
    index = json.loads((out / "web" / "data" / "index.json").read_text(encoding="utf-8"))
    paired = []
    for summary in index["matches"]:
        match = json.loads((out / "web" / "data" / "matches" / f"{summary['id']}.json").read_text(encoding="utf-8"))
        events = [e for a in match["actors"] for e in a["events"]]
        assert all(e["type"] != "self_kill" and e["raw"] != "Kill+Killed" for e in events)
        pairs = [e for e in events if e["kill_killed_pair"]]
        paired += pairs
        assert summary["counts"]["kill_killed_pair"] == len(pairs) // 2
        assert summary["counts"]["kill"] == sum(e["type"] == "kill" and not e["kill_killed_pair"]
                                                for a in match["actors"] if a["kind"] == "human" for e in a["events"])
    assert sorted((e["raw"], e["type"]) for e in paired) == [("Kill", "kill")] * 3 + [("Killed", "death")] * 3


def test_build_report_counts(built) -> None:
    _, report = built
    assert report["files"]["found"] == 1243 and report["files"]["read"] == 1242
    assert len(report["files"]["duplicates_skipped"]) == 1 and report["files"]["failed"] == []
    assert sum(d["removed"] for d in report["doubled_journeys"]) == 190
    assert report["rows"] == {"read": 89016, "after_removing_doubled_journeys": 88826, "final": 88653}
    assert report["journeys"]["human"] == 798 and report["journeys"]["bot"] == 444
    assert report["journeys"]["unknown"] == 0 and report["journeys"]["id_mismatch"] == 17
    assert report["journeys"]["matches_by_human_count"] == {"1": 794, "2": 2}
    assert report["kill_killed_pairs"] == 3 and "self_kills_merged" not in report


def test_ec27_no_real_player_id_in_any_output(built, prepared) -> None:
    out, _ = built
    uuids = set(prepared.events["user_id"]) - {u for u in prepared.events["user_id"] if u.isdigit()}
    for path in [*out.rglob("*.json")]:
        text = path.read_text(encoding="utf-8")
        found = {m for m in UUID.findall(text) if m in uuids}
        assert not found, f"{path.name} contains player IDs"


def _json_strings(value):
    """Every string in a JSON document, keys included."""
    if isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield from _json_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _json_strings(item)
    elif isinstance(value, str):
        yield value


def test_ec27_no_numeric_player_id_or_uuid_prefix_in_any_output(built, prepared) -> None:
    out, _ = built
    user_ids = set(prepared.events["user_id"])
    uuid_prefixes = {u[:8] for u in user_ids if not u.isdigit()}
    for path in out.rglob("*.json"):
        document = json.loads(path.read_text(encoding="utf-8"))
        strings = set(_json_strings(document))
        assert not strings & user_ids, f"{path.name} contains a player ID"
        assert not {s.split("_")[0] for s in strings} & uuid_prefixes, f"{path.name} contains a player ID prefix"


# The frontend data contract (docs/specs/02_DATA_PIPELINE.md, "Output format"). A change here is a change for every later feature.
INDEX_KEYS = {"schema_version", "maps", "dates", "matches"}
MAP_KEYS = {"image", "width", "height", "scale", "origin_x", "origin_z"}
DATE_KEYS = {"date", "matches", "boundary", "partial", "observed_from_utc", "observed_to_utc"}
INDEX_MATCH_KEYS = {"id", "full_id", "map", "date", "start_utc", "duration_s", "humans", "bots", "unknown", "counts"}
COUNT_KEYS = {"kill", "death", "storm_death", "loot", "kill_killed_pair"}
MATCH_KEYS = {"schema_version", "id", "full_id", "map", "date", "duration_s", "actors"}
ACTOR_KEYS = {"id", "kind", "id_mismatch", "segments", "events"}
EVENT_KEYS = {"t", "type", "raw", "u", "v", "after_death", "kill_killed_pair"}
EVENT_TYPES = {"kill", "death", "storm_death", "loot"}
ACTOR_KINDS = ["human", "unknown", "bot"]  # the order actors appear in a match file
HEATMAP_KEYS = {"schema_version", "map", "grid", "cells", "units", "layers", "totals", "samples"}
LAYERS = {"kills", "deaths", "traffic"}


def test_generated_files_match_the_documented_contract(built) -> None:
    out, _ = built
    data = out / "web" / "data"
    index = json.loads((data / "index.json").read_text(encoding="utf-8"))
    assert set(index) == INDEX_KEYS and index["schema_version"] == 1
    assert set(index["maps"]) == set(MAPS) and all(set(m) == MAP_KEYS for m in index["maps"].values())
    assert all(set(d) == DATE_KEYS for d in index["dates"])
    for summary in index["matches"]:
        assert set(summary) == INDEX_MATCH_KEYS and set(summary["counts"]) == COUNT_KEYS
        assert summary["map"] in MAPS and summary["date"] in {d["date"] for d in index["dates"]}

    for summary in index["matches"]:
        match = json.loads((data / "matches" / f"{summary['id']}.json").read_text(encoding="utf-8"))
        assert set(match) == MATCH_KEYS
        assert {k: match[k] for k in ("id", "full_id", "map", "date", "duration_s")} == {
            k: summary[k] for k in ("id", "full_id", "map", "date", "duration_s")}
        kinds = [actor["kind"] for actor in match["actors"]]
        assert kinds == sorted(kinds, key=ACTOR_KINDS.index)
        assert [kinds.count(k) for k in ACTOR_KINDS] == [summary["humans"], summary["unknown"], summary["bots"]]
        for actor in match["actors"]:
            assert set(actor) == ACTOR_KEYS and len(actor["id"]) == 8
            assert all(len(point) == 3 for segment in actor["segments"] for point in segment)
            for event in actor["events"]:
                assert set(event) == EVENT_KEYS and event["type"] in EVENT_TYPES
                assert 0 <= event["u"] <= 1 and 0 <= event["v"] <= 1 and 0 <= event["t"] <= match["duration_s"]

    for map_id in MAPS:
        heatmap = json.loads((data / "heatmaps" / f"{map_id}.json").read_text(encoding="utf-8"))
        assert set(heatmap) == HEATMAP_KEYS and heatmap["map"] == map_id and heatmap["grid"] == 64
        dates = set(heatmap["samples"])
        assert "all" in dates and dates - {"all"} <= {d["date"] for d in index["dates"]}
        for part in ("layers", "totals"):
            assert set(heatmap[part]) == LAYERS and all(set(by_date) == dates for by_date in heatmap[part].values())
        assert all(set(s) == {"matches", "human_journeys"} for s in heatmap["samples"].values())
        for cells in (c for layer in heatmap["layers"].values() for c in layer.values()):
            assert all(0 <= i < 64 and 0 <= j < 64 and value > 0 for i, j, value in cells)


def test_two_builds_are_byte_identical(prepared, built, tmp_path) -> None:
    out, _ = built
    write_outputs(prepared, DEFAULT_DATA_DIR, tmp_path / "web", tmp_path / "build_report.json", images=False)
    first = {p.relative_to(out).as_posix(): p.read_bytes() for p in out.rglob("*") if p.is_file()}
    second = {p.relative_to(tmp_path).as_posix(): p.read_bytes() for p in tmp_path.rglob("*") if p.is_file()}
    assert first.keys() == second.keys()
    assert [name for name in first if first[name] != second[name]] == []


def test_rebuild_replaces_match_files_and_refuses_foreign_files(prepared, tmp_path) -> None:
    web = tmp_path / "web"
    stale = web / "data" / "matches" / "stale0000.json"
    stale.parent.mkdir(parents=True)
    stale.write_text("{}", encoding="utf-8")
    write_outputs(prepared, DEFAULT_DATA_DIR, web, tmp_path / "report.json", images=False)
    assert not stale.exists() and len(list(stale.parent.glob("*.json"))) == 796
    assert not (web / "data" / "matches.staging").exists() and not (web / "data" / "matches.old").exists()

    foreign = stale.parent / "notes.txt"
    foreign.write_text("not generated", encoding="utf-8")
    with pytest.raises(RuntimeError, match="didn't write"):
        write_outputs(prepared, DEFAULT_DATA_DIR, web, tmp_path / "report.json", images=False)
    assert foreign.exists() and len(list(stale.parent.glob("*.json"))) == 796  # nothing deleted
