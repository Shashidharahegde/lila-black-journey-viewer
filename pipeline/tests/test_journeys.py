"""Event categories, Kill/Killed pairs, rows after death (D2) and path segments."""

from __future__ import annotations

import pandas as pd
import pytest

from lila_pipeline.journeys import (
    DEATH_CATEGORIES,
    apply_death_cutoff,
    categorize_events,
    counted_kills,
    path_segments,
)


def rows(events: list[str], seconds: list[int], file: str = "a") -> pd.DataFrame:
    return pd.DataFrame({"file": [file] * len(events), "epoch_s": seconds, "event": events, "row": range(len(events))})


def test_ec12_kill_killed_pair_keeps_both_events() -> None:
    out = categorize_events(rows(["Position", "Kill", "Killed", "BotKill"], [1, 5, 5, 9]))
    assert out["category"].tolist() == ["position", "kill", "death", "kill"]
    assert out["raw"].tolist() == ["Position", "Kill", "Killed", "BotKill"]
    assert out["kill_killed_pair"].tolist() == [False, True, True, False]
    assert counted_kills(out).tolist() == [False, False, False, True]  # the paired Kill isn't counted as a kill


def test_unpaired_kill_and_killed_keep_their_meaning() -> None:
    out = categorize_events(rows(["Kill", "Killed"], [5, 6]))
    assert out["category"].tolist() == ["kill", "death"]
    assert not out["kill_killed_pair"].any() and counted_kills(out).tolist() == [True, False]


def test_kill_and_killed_in_different_files_are_not_a_pair() -> None:
    out = categorize_events(pd.concat([rows(["Kill"], [5], file="a"), rows(["Killed"], [5], file="b")], ignore_index=True))
    assert not out["kill_killed_pair"].any()


def test_unknown_event_is_rejected() -> None:
    with pytest.raises(ValueError, match="unknown event"):
        categorize_events(rows(["Teleport"], [1]))


def test_ec14_positions_after_death_dropped_other_events_flagged() -> None:
    events = categorize_events(
        rows(["Position", "BotKilled", "Position", "Position", "BotKill", "Loot"], [10, 20, 20, 22, 23, 23])
    )
    out, report = apply_death_cutoff(events)
    assert out["event"].tolist() == ["Position", "BotKilled", "Position", "BotKill", "Loot"]  # same-second position stays
    assert out["after_death"].tolist() == [False, False, False, True, True]
    assert (report.positions_dropped, report.journeys_with_dropped_positions) == (1, 1)
    assert report.after_death_events == {"BotKill": 1, "Loot": 1}


def test_journey_without_death_is_untouched() -> None:
    events = categorize_events(rows(["Position", "Loot", "Position"], [1, 2, 3]))
    out, report = apply_death_cutoff(events)
    assert len(out) == 3 and not out["after_death"].any() and report.positions_dropped == 0


def test_ec16_segments_split_only_at_gaps_over_30_s() -> None:
    positions = pd.DataFrame({"epoch_s": [0, 5, 35, 66, 71]})
    assert [s["epoch_s"].tolist() for s in path_segments(positions)] == [[0, 5, 35], [66, 71]]
    assert path_segments(positions.iloc[0:0]) == []


def test_ec12_real_kill_killed_pairs_keep_both_events(prepared, raw_data) -> None:
    events = prepared.events
    paired = events[events["kill_killed_pair"]]
    assert paired["event"].value_counts().to_dict() == {"Kill": 3, "Killed": 3}
    assert paired.groupby(["file", "epoch_s"])["event"].apply(sorted).tolist() == [["Kill", "Killed"]] * 3
    assert set(paired["actor_kind"]) == {"human"} and not paired["after_death"].any()
    # every raw Kill/Killed row survives, with its original time and position
    raw = raw_data[0]
    raw = raw[raw["event"].isin(["Kill", "Killed"])].set_index(["file", "row"])[["event", "ts_raw", "x", "z"]]
    kept = paired.set_index(["file", "row"])[["event", "epoch_s", "x", "z"]].rename(columns={"epoch_s": "ts_raw"})
    pd.testing.assert_frame_equal(kept.sort_index(), raw.sort_index(), check_dtype=False)


def test_ec12_no_self_kill_category_anywhere(prepared) -> None:
    assert "self_kill" not in set(prepared.events["category"]) and "self_kill" not in DEATH_CATEGORIES


def test_ec14_no_path_point_after_first_death(prepared) -> None:
    events = prepared.events
    first_death = events[events["category"].isin(DEATH_CATEGORIES)].groupby("file")["epoch_s"].min()
    positions = events[events["category"] == "position"]
    assert not (positions["epoch_s"] > positions["file"].map(first_death)).any()


def test_ec14_real_post_death_counts(prepared) -> None:
    cutoff = prepared.cutoff
    assert (cutoff.positions_dropped, cutoff.journeys_with_dropped_positions) == (173, 172)
    assert cutoff.after_death_events == {"BotKill": 2}
    late = prepared.events[prepared.events["after_death"]]
    assert len(late) == 2 and set(late["actor_kind"]) == {"human"}
