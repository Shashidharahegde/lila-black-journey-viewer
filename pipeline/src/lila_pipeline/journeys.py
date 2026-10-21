"""Designer-facing events and drawable paths for each journey.

Every event is read from the file owner's point of view (EC-11): `BotKilled` in a human's
file means the human died; in a bot's file it means the bot died. Either way it is the
owner's death, at the owner's position.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

MAX_PATH_GAP_S = 30  # positions further apart than this are not joined (EC-16)

POSITION_EVENTS = {"Position", "BotPosition"}
CATEGORIES = {
    "Position": "position",
    "BotPosition": "position",
    "BotKill": "kill",
    "Kill": "kill",
    "BotKilled": "death",
    "Killed": "death",
    "KilledByStorm": "storm_death",
    "Loot": "loot",
}
DEATH_CATEGORIES = {"death", "storm_death", "self_kill"}
SELF_KILL_RAW = "Kill+Killed"


@dataclass(frozen=True)
class DeathCutoffReport:
    positions_dropped: int
    journeys_with_dropped_positions: int
    after_death_events: dict[str, int]


def categorize_events(events: pd.DataFrame) -> pd.DataFrame:
    """Add `category` and `raw` (the original label), merging self-kills first (EC-12).

    A `Kill` and a `Killed` in the same file and second are one self-inflicted death, not a
    fight between players: they become a single `self_kill` row at the `Killed` row's place.
    Only then do the remaining `Kill` rows count as kills.
    """
    out = events.copy()
    unknown = set(out["event"]) - CATEGORIES.keys()
    if unknown:
        raise ValueError(f"unknown event types: {sorted(unknown)}")
    out["category"] = out["event"].map(CATEGORIES)
    out["raw"] = out["event"]

    keys = ["file", "epoch_s"]
    kill_keys = pd.MultiIndex.from_frame(out.loc[out["event"] == "Kill", keys])
    killed_keys = pd.MultiIndex.from_frame(out.loc[out["event"] == "Killed", keys])
    pair_keys = kill_keys.intersection(killed_keys)
    in_pair = pd.MultiIndex.from_frame(out[keys]).isin(pair_keys) & out["event"].isin(["Kill", "Killed"])
    out.loc[in_pair & (out["event"] == "Killed"), ["category", "raw"]] = ["self_kill", SELF_KILL_RAW]
    return out[~(in_pair & (out["event"] == "Kill"))]


def apply_death_cutoff(events: pd.DataFrame) -> tuple[pd.DataFrame, DeathCutoffReport]:
    """End each journey's movement at its first death (EC-14, D2).

    Positions logged after the first death are dropped, so paths, playback and traffic never
    show a dead player moving. Other events after the death are kept but marked
    `after_death`: their timing is uncertain, but they aren't assumed to be false. "After"
    means a later second; rows in the same second as the death stay.
    """
    is_death = events["category"].isin(DEATH_CATEGORIES)
    first_death = events.loc[is_death].groupby("file")["epoch_s"].min()
    after = events["epoch_s"] > events["file"].map(first_death)  # NaN (no death) → False
    is_position = events["category"] == "position"
    drop = after & is_position

    out = events[~drop].copy()
    out["after_death"] = (after & ~is_position)[~drop]
    report = DeathCutoffReport(
        positions_dropped=int(drop.sum()),
        journeys_with_dropped_positions=int(events.loc[drop, "file"].nunique()),
        after_death_events={str(k): int(v) for k, v in out.loc[out["after_death"], "raw"].value_counts().sort_index().items()},
    )
    return out, report


def path_segments(positions: pd.DataFrame) -> list[pd.DataFrame]:
    """Split one journey's time-ordered positions wherever the gap exceeds MAX_PATH_GAP_S."""
    if positions.empty:
        return []
    new_segment = positions["epoch_s"].diff().gt(MAX_PATH_GAP_S)
    return [segment for _, segment in positions.groupby(new_segment.cumsum(), sort=True)]
