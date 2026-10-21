"""Turn raw rows into a consistent timeline: clock and ordering, doubled journeys, actor kinds."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

# Every column that came from the parquet file; two rows are copies only if all of these match.
SOURCE_COLUMNS = ["user_id", "match_id", "map_id", "x", "y", "z", "ts_raw", "event"]
UUID_PATTERN = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"


def add_match_clock(events: pd.DataFrame) -> pd.DataFrame:
    """Add `epoch_s` and match time `t`, and sort every journey into time order.

    `ts` is typed `timestamp[ms]` in the parquet files, but the integer inside is Unix epoch
    *seconds* (EC-01): read as milliseconds the whole dataset spans 6.6 minutes in January
    1970; read as seconds every event falls on its folder's date and matches last 13–890 s.

    Match time is measured from the earliest event of any actor in the match, so all actors
    share one clock. Some files store rows out of time order (EC-02), and the clock has
    1-second resolution (EC-03), so rows are sorted by time and then by their original
    position in the file.
    """
    out = events.copy()
    out["epoch_s"] = out["ts_raw"].astype("int64")
    out["t"] = out["epoch_s"] - out.groupby("match_id")["epoch_s"].transform("min")
    return out.sort_values(["match_id", "file", "epoch_s", "row"], kind="stable").reset_index(drop=True)


@dataclass(frozen=True)
class DoubledJourney:
    """A journey whose file holds the same sequence twice; the second copy was removed."""

    file: str
    user_id: str
    match_id: str
    rows: int
    removed: int
    removed_by_event: dict[str, int]


def remove_doubled_journeys(events: pd.DataFrame) -> tuple[pd.DataFrame, list[DoubledJourney]]:
    """Drop the repeated second half of journeys that were logged twice in full (EC-29, D3).

    A journey counts as doubled only when, in file order, its second half equals its first
    half on every source column. The first half is kept intact, including legitimate
    same-second repeats inside it (two `Loot` rows in one second). Rows are never dropped
    just because they look identical to another row.
    """
    dropped: list[int] = []
    doubled: list[DoubledJourney] = []
    for file, journey in events.groupby("file", sort=True):
        rows = len(journey)
        if rows < 2 or rows % 2:
            continue
        ordered = journey.sort_values("row")
        first = ordered.iloc[: rows // 2][SOURCE_COLUMNS].reset_index(drop=True)
        second = ordered.iloc[rows // 2 :]
        if not first.equals(second[SOURCE_COLUMNS].reset_index(drop=True)):
            continue
        dropped.extend(second.index)
        doubled.append(
            DoubledJourney(
                file=str(file),
                user_id=str(ordered["user_id"].iat[0]),
                match_id=str(ordered["match_id"].iat[0]),
                rows=rows,
                removed=len(second),
                removed_by_event={str(k): int(v) for k, v in second["event"].value_counts().sort_index().items()},
            )
        )
    return events.drop(index=dropped), doubled


def classify_actors(events: pd.DataFrame) -> pd.DataFrame:
    """Add `actor_kind` ("human" or "bot") and `id_mismatch` to every row.

    A journey is a bot when its file contains any `BotPosition` event (EC-09). The data
    README's rule (numeric ID = bot) is wrong for 17 files that record `Position` and `Loot`
    like humans; `id_mismatch` flags every file where the ID format disagrees with behaviour.
    """
    out = events.copy()
    bot_files = set(out.loc[out["event"] == "BotPosition", "file"])
    is_bot = out["file"].isin(bot_files)
    id_says_bot = ~out["user_id"].str.fullmatch(UUID_PATTERN)
    out["actor_kind"] = is_bot.map({True: "bot", False: "human"})
    out["id_mismatch"] = is_bot != id_says_bot
    return out
