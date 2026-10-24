"""Clock and ordering, doubled journeys, actor classification."""

from __future__ import annotations

import pandas as pd
import pytest

from lila_pipeline.export import player_hash
from lila_pipeline.normalize import SOURCE_COLUMNS, add_match_clock, classify_actors, remove_doubled_journeys

# Real journeys are named by player pseudonym (`player_hash`) and match prefix, never by raw player ID (EC-27).
# The three journeys logged twice in full (EC-29) → rows removed.
DOUBLED = {("13a425dd", "d3a3297e"): 147, ("da9a800a", "fc797a67"): 39, ("51b60c09", "0954f788"): 4}
# A legitimate same-second double Loot inside each of the two larger doubled journeys.
DOUBLE_LOOT = {("13a425dd", "d3a3297e"): 1770722312, ("da9a800a", "fc797a67"): 1770834863}
# The three numeric IDs whose 17 files log the player-client events `Position`/`Loot` (EC-09) → human, flagged `id_mismatch`.
MISMATCH_PLAYERS = {"85fd66c7", "929d4b9d", "7801beec"}
# Synthetic IDs for made-up journeys (not from the data).
FAKE_UUID = "00000000-0000-4000-8000-000000000001"


def journey(events: list[str], seconds: list[int], file: str = "u1_m1", xs: list[float] | None = None) -> pd.DataFrame:
    n = len(events)
    return pd.DataFrame(
        {
            "user_id": [file.split("_")[0]] * n,
            "match_id": ["m1"] * n,
            "map_id": ["GrandRift"] * n,
            "x": xs if xs is not None else [float(i) for i in range(n)],
            "y": [0.0] * n,
            "z": [0.0] * n,
            "ts_raw": seconds,
            "event": events,
            "file": [file] * n,
            "row": list(range(n)),
        }
    )


def test_ec02_rows_sorted_by_time_then_file_order() -> None:
    events = pd.DataFrame(
        {
            "match_id": ["m1"] * 4,
            "file": ["a"] * 4,
            "ts_raw": [1770700010, 1770700000, 1770700010, 1770700005],
            "row": [0, 1, 2, 3],
        }
    )
    out = add_match_clock(events)
    assert out["row"].tolist() == [1, 3, 0, 2]  # same-second rows keep file order (EC-03)
    assert out["t"].tolist() == [0, 5, 10, 10]


def test_match_time_is_shared_by_all_actors_in_a_match() -> None:
    events = pd.DataFrame(
        {"match_id": ["m1", "m1"], "file": ["human", "bot"], "ts_raw": [1770700007, 1770700002], "row": [0, 0]}
    )
    out = add_match_clock(events).set_index("file")
    assert out.loc["bot", "t"] == 0 and out.loc["human", "t"] == 5


def test_ec01_ts_is_epoch_seconds(clocked_events) -> None:
    durations = clocked_events.groupby("match_id")["t"].max()
    assert durations.between(10, 20 * 60).all()  # read as milliseconds, every match would last < 1 s
    days = pd.to_datetime(clocked_events["epoch_s"], unit="s", utc=True).dt.strftime("%Y-%m-%d")
    assert days.min() == "2026-02-09" and days.max() == "2026-02-14"


def test_ec29_doubled_journey_keeps_first_copy_including_same_second_loot() -> None:
    original = journey(["Position", "Loot", "Loot", "Position"], [100, 105, 105, 110], xs=[1.0, 2.0, 2.0, 3.0])
    copy = original.assign(row=original["row"] + 4)
    events = pd.concat([original, copy], ignore_index=True)

    kept, doubled = remove_doubled_journeys(events)

    assert kept["row"].tolist() == [0, 1, 2, 3]
    assert (kept["event"] == "Loot").sum() == 2  # the legitimate double pickup survives
    assert [(d.rows, d.removed, d.removed_by_event) for d in doubled] == [(8, 4, {"Loot": 2, "Position": 2})]


def test_identical_rows_alone_are_not_removed() -> None:
    events = journey(["Position", "Loot", "Loot", "Position"], [100, 105, 105, 110], xs=[1.0, 2.0, 2.0, 3.0])
    kept, doubled = remove_doubled_journeys(events)
    assert len(kept) == 4 and doubled == []


def test_half_that_differs_in_one_column_is_not_a_copy() -> None:
    original = journey(["Position", "Loot"], [100, 105])
    near_copy = original.assign(row=[2, 3], y=[0.0, 0.5])
    kept, doubled = remove_doubled_journeys(pd.concat([original, near_copy], ignore_index=True))
    assert len(kept) == 4 and doubled == []


def test_ec29_exactly_three_doubled_journeys_lose_190_rows(raw_data) -> None:
    events, _ = raw_data
    kept, doubled = remove_doubled_journeys(events)
    found = {(player_hash(d.user_id), d.match_id[:8]): d.removed for d in doubled}
    assert found == DOUBLED
    assert len(events) - len(kept) == 190
    for d in doubled:
        assert d.removed * 2 == d.rows


def test_ec29_legitimate_double_loot_survives(raw_data) -> None:
    kept, _ = remove_doubled_journeys(raw_data[0])
    for (player, match), second in DOUBLE_LOOT.items():
        rows = kept[(kept["user_id"].map(player_hash) == player) & kept["match_id"].str.startswith(match)]
        assert ((rows["event"] == "Loot") & (rows["ts_raw"] == second)).sum() == 2


def test_ec06_other_same_second_repeats_are_kept(raw_data) -> None:
    kept, _ = remove_doubled_journeys(raw_data[0])
    repeats = kept[kept.duplicated(["file", *SOURCE_COLUMNS])]
    # 1,195 Loot + 30 BotKill in ordinary journeys, plus the 2 double pickups kept inside doubled journeys
    assert repeats["event"].value_counts().to_dict() == {"Loot": 1197, "BotKill": 30}
    assert not (repeats["event"] == "Position").any()


def test_ec09_actor_is_a_bot_only_when_it_logs_botposition() -> None:
    events = pd.concat(
        [
            journey(["BotPosition"], [1], file="900001_m1"),  # numeric ID, bot events
            journey(["Position", "Loot"], [1, 2], file="900002_m1"),  # numeric ID, player-client events
            journey(["Position"], [1], file=f"{FAKE_UUID}_m1"),  # UUID, player-client events
            journey(["BotPosition"], [1], file=f"{FAKE_UUID}_m2"),  # UUID, bot events (not in the data)
        ],
        ignore_index=True,
    )
    out = classify_actors(events).groupby("file")[["actor_kind", "id_mismatch"]].first()
    assert out.loc["900001_m1"].tolist() == ["bot", False]
    assert out.loc["900002_m1"].tolist() == ["human", True]  # numeric ID, but the events say human: flagged
    assert out.loc[f"{FAKE_UUID}_m1"].tolist() == ["human", False]
    assert out.loc[f"{FAKE_UUID}_m2"].tolist() == ["bot", True]


def test_ec09_ec10_real_actor_counts(raw_data) -> None:
    kept, _ = remove_doubled_journeys(raw_data[0])
    journeys = classify_actors(kept).groupby("file").agg(
        kind=("actor_kind", "first"), mismatch=("id_mismatch", "first"), user=("user_id", "first"),
        match=("match_id", "first"),
    )
    assert journeys["kind"].value_counts().to_dict() == {"human": 798, "bot": 444}
    flagged = journeys[journeys["mismatch"]]
    assert (flagged["kind"] == "human").all() and len(flagged) == 17
    assert flagged["user"].str.isdigit().all() and flagged["match"].nunique() == 17
    assert set(flagged["user"].map(player_hash)) == MISMATCH_PLAYERS
    humans_per_match = (
        journeys[journeys["kind"] == "human"].groupby("match").size().reindex(journeys["match"].unique(), fill_value=0)
    )
    assert humans_per_match.value_counts().to_dict() == {1: 794, 2: 2}


@pytest.mark.parametrize("rows", [1, 3])
def test_odd_or_single_row_journeys_are_never_doubled(rows: int) -> None:
    events = journey(["Position"] * rows, list(range(rows)), xs=[0.0] * rows)
    assert remove_doubled_journeys(events)[1] == []
