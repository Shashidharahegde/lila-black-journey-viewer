"""Shape the cleaned events into the files the website loads (format: docs/02_DATA_PIPELINE.md)."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime

import numpy as np
import pandas as pd

from lila_pipeline.heatmaps import GRID, count_grid, sparse_cells, traffic_grid
from lila_pipeline.journeys import DEATH_CATEGORIES, path_segments
from lila_pipeline.projection import MAPS

SCHEMA_VERSION = 1
UV_DECIMALS = 4
COUNT_TYPES = ["kill", "death", "storm_death", "loot", "self_kill"]
DAY_S = 86_400


def player_hash(user_id: str) -> str:
    """8-character stand-in for a player ID; real account IDs never leave the pipeline (EC-27)."""
    return hashlib.sha1(user_id.encode("utf-8")).hexdigest()[:8]


def match_key(match_id: str) -> str:
    """Short match ID used in file names and URLs (unique on this data; checked by a test)."""
    return match_id[:8]


def journey_label(file_name: str) -> str:
    """A file name with the player ID hashed, e.g. `3f2a9c1e_b71aaad8`."""
    user_id, rest = file_name.split("_", 1)
    return f"{player_hash(user_id)}_{rest[:8]}"


def utc_iso(epoch_s: int) -> str:
    return datetime.fromtimestamp(int(epoch_s), UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def match_starts(events: pd.DataFrame) -> pd.Series:
    """First recorded second of each match, over all its actors."""
    return events.groupby("match_id")["epoch_s"].min()


def match_dates(events: pd.DataFrame) -> pd.Series:
    """A match's date is the UTC date of its first recorded event (D1)."""
    return pd.to_datetime(match_starts(events), unit="s", utc=True).dt.strftime("%Y-%m-%d")


def build_dates(events: pd.DataFrame) -> list[dict]:
    """Every date that has at least one match, from the data (never a hardcoded list).

    `boundary` marks the first and last dates of the data. `partial` is a separate claim:
    the observed collection window (first to last recorded event) covers only part of that
    day, so matches outside it were not recorded.
    """
    dates = match_dates(events)
    window_start, window_end = int(events["epoch_s"].min()), int(events["epoch_s"].max())
    ordered = sorted(dates.unique())
    result = []
    for date in ordered:
        day_start = int(datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=UTC).timestamp())
        observed_from = max(day_start, window_start)
        observed_to = min(day_start + DAY_S, window_end)
        result.append(
            {
                "date": date,
                "matches": int((dates == date).sum()),
                "boundary": date in (ordered[0], ordered[-1]),
                "partial": observed_to - observed_from < DAY_S,
                "observed_from_utc": utc_iso(observed_from),
                "observed_to_utc": utc_iso(observed_to),
            }
        )
    return result


def build_index(events: pd.DataFrame, map_sizes: dict[str, tuple[int, int]]) -> dict:
    """No build timestamp: the same data must give byte-identical files."""
    starts, dates = match_starts(events), match_dates(events)
    matches = []
    for match_id, rows in events.groupby("match_id", sort=True):
        actors = rows.groupby("file")["actor_kind"].first()
        human_events = rows[rows["actor_kind"] == "human"]
        counts = human_events["category"].value_counts()
        matches.append(
            {
                "id": match_key(str(match_id)),
                "full_id": str(match_id),
                "map": str(rows["map_id"].iat[0]),
                "date": dates[match_id],
                "start_utc": utc_iso(starts[match_id]),
                "duration_s": int(rows["t"].max()),
                "humans": int((actors == "human").sum()),
                "bots": int((actors == "bot").sum()),
                "counts": {kind: int(counts.get(kind, 0)) for kind in COUNT_TYPES},  # recorded by humans
            }
        )
    return {
        "schema_version": SCHEMA_VERSION,
        "maps": {
            map_id: {
                "image": f"maps/{map_id}.webp",
                "width": map_sizes[map_id][0],
                "height": map_sizes[map_id][1],
                "scale": cal.scale,
                "origin_x": cal.origin_x,
                "origin_z": cal.origin_z,
            }
            for map_id, cal in MAPS.items()
        },
        "dates": build_dates(events),
        "matches": matches,
    }


def build_match(match_id: str, rows: pd.DataFrame, date: str) -> dict:
    """One match: every actor's path segments and events, humans first."""
    actors = []
    order = rows.groupby("file").agg(kind=("actor_kind", "first"), user=("user_id", "first"))
    order["hash"] = order["user"].map(player_hash)
    for file, actor in order.sort_values(["kind", "hash"], ascending=[False, True]).iterrows():
        journey = rows[rows["file"] == file]
        positions = journey[journey["category"] == "position"]
        others = journey[journey["category"] != "position"]
        actors.append(
            {
                "id": actor["hash"],
                "kind": actor["kind"],
                "id_mismatch": bool(journey["id_mismatch"].iat[0]),
                "segments": [_points(segment) for segment in path_segments(positions)],
                "events": [
                    {
                        "t": int(e.t),
                        "type": e.category,
                        "raw": e.raw,
                        "u": round(float(e.u), UV_DECIMALS),
                        "v": round(float(e.v), UV_DECIMALS),
                        "after_death": bool(e.after_death),
                    }
                    for e in others.itertuples()
                ],
            }
        )
    return {
        "schema_version": SCHEMA_VERSION,
        "id": match_key(match_id),
        "full_id": match_id,
        "map": str(rows["map_id"].iat[0]),
        "date": date,
        "duration_s": int(rows["t"].max()),
        "actors": actors,
    }


def _points(segment: pd.DataFrame) -> list[list[float]]:
    return [
        [int(t), round(float(u), UV_DECIMALS), round(float(v), UV_DECIMALS)]
        for t, u, v in zip(segment["t"], segment["u"], segment["v"])
    ]


def build_heatmap(map_id: str, events: pd.DataFrame) -> dict:
    """Kills, deaths and traffic for one map, from human journeys only, for all dates and each date.

    `samples` says how much data each date's layers rest on, counted after cleaning:
    `matches` = matches on this map and date with at least one human journey;
    `human_journeys` = human journeys (files) in them, including the 17 `id_mismatch` ones.
    It counts journeys, not rows: the number of events behind a layer is in `totals`.
    """
    humans = events[(events["map_id"] == map_id) & (events["actor_kind"] == "human")]
    dates = humans["match_id"].map(match_dates(events))
    layers: dict[str, dict] = {"kills": {}, "deaths": {}, "traffic": {}}
    totals: dict[str, dict] = {"kills": {}, "deaths": {}, "traffic": {}}
    samples: dict[str, dict] = {}
    for key in ["all", *sorted(dates.unique())]:
        part = humans if key == "all" else humans[dates == key]
        grids = {
            "kills": count_grid(part[part["category"] == "kill"]),
            "deaths": count_grid(part[part["category"].isin(DEATH_CATEGORIES)]),
            "traffic": traffic_grid(part[part["category"] == "position"]),
        }
        for layer, values in grids.items():
            decimals = 1 if layer == "traffic" else 0
            layers[layer][key] = sparse_cells(values, decimals)
            total = float(np.round(values.sum(), decimals))
            totals[layer][key] = total if decimals else int(total)
        samples[key] = {"matches": int(part["match_id"].nunique()), "human_journeys": int(part["file"].nunique())}
    return {
        "schema_version": SCHEMA_VERSION,
        "map": map_id,
        "grid": GRID,
        "cells": "[i, j, value]; i = column along u (west to east), j = row along v (south to north)",
        "units": {"kills": "events", "deaths": "events (incl. storm and self-kills)", "traffic": "seconds"},
        "layers": layers,
        "totals": totals,
        "samples": samples,
    }
