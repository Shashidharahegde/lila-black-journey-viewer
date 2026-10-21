"""Turn raw rows into a consistent timeline: clock and ordering, actor kinds."""

from __future__ import annotations

import pandas as pd

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
