"""The committed event forensics evidence (docs/evidence/event_forensics/) matches the pipeline's output."""

from __future__ import annotations

import csv
import importlib.util
import io
import json
from pathlib import Path

import pytest

TOOL = Path(__file__).resolve().parents[1] / "tools" / "event_forensics.py"
EVIDENCE = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "event_forensics"


@pytest.fixture(scope="module")
def generated(prepared) -> dict[str, str]:
    spec = importlib.util.spec_from_file_location("event_forensics", TOOL)
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    return tool.build_evidence(prepared=prepared)


def rows(text: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(text)))


def test_committed_evidence_is_up_to_date(generated) -> None:
    for name, text in generated.items():
        assert (EVIDENCE / name).read_text(encoding="utf-8") == text, f"{name} is stale: run tools/event_forensics.py"


def test_ec09_evidence_lists_the_17_unknown_journeys(generated, prepared) -> None:
    actors = rows(generated["actor_classification.csv"])
    journeys = prepared.events.groupby("file").agg(kind=("actor_kind", "first"), map=("map_id", "first"))
    unknown = journeys[journeys["kind"] == "unknown"]
    assert len(actors) == len(unknown) == 17
    assert {r["final_classification"] for r in actors} == {"unknown"}
    assert sorted(r["map"] for r in actors) == sorted(unknown["map"])
    assert len({r["actor"] for r in actors}) == 3
    summary = json.loads(generated["forensics_summary.json"])
    assert summary["actors"]["pipeline_journeys_by_kind"] == journeys["kind"].value_counts().to_dict()


def test_ec12_evidence_lists_both_events_of_each_pair(generated, prepared) -> None:
    pairs = rows(generated["kill_killed_pairs.csv"])
    assert len(pairs) == 2 * 3 == int(prepared.events["kill_killed_pair"].sum())
    for case in {r["case_id"] for r in pairs}:
        events = [r for r in pairs if r["case_id"] == case]
        assert sorted(r["raw_event"] for r in events) == ["Kill", "Killed"]
        assert {r["pipeline_type"] for r in events} == {"kill", "death"}
        assert all(r["same_second_as_partner"] == "True" for r in events)


def test_evidence_holds_no_player_or_match_ids(generated, prepared) -> None:
    from lila_pipeline.export import match_key, player_hash

    users = set(prepared.events["user_id"])
    matches = set(prepared.events["match_id"])
    forbidden = users | {player_hash(u) for u in users} | {u[:8] for u in users} | matches | {match_key(m) for m in matches}
    forbidden -= {f for f in forbidden if f.isdigit()}  # raw numeric IDs can't be told apart from counts; their hashes are checked
    for name, text in generated.items():
        assert not [f for f in forbidden if f in text], f"{name} contains an identifier"
