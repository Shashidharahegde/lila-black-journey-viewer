"""Loading raw journey files: decoding, duplicates, failures and non-data files."""

from __future__ import annotations

import shutil
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from lila_pipeline.ingest import load_journeys

KNOWN_EVENTS = {"Position", "BotPosition", "Kill", "Killed", "BotKill", "BotKilled", "KilledByStorm", "Loot"}


def write_journey(path: Path, events: list[bytes], seconds: list[int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = len(events)
    table = pa.table(
        {
            "user_id": pa.array(["u1"] * n, pa.string()),
            "match_id": pa.array(["m1.nakama-0"] * n, pa.string()),
            "map_id": pa.array(["GrandRift"] * n, pa.string()),
            "x": pa.array([1.0] * n, pa.float32()),
            "y": pa.array([2.0] * n, pa.float32()),
            "z": pa.array([3.0] * n, pa.float32()),
            "ts": pa.array(seconds, pa.int64()).cast(pa.timestamp("ms")),
            "event": pa.array(events, pa.binary()),
        }
    )
    pq.write_table(table, path)


def test_synthetic_folder_reports_everything(tmp_path: Path) -> None:
    journey = tmp_path / "February_10" / "u1_m1.nakama-0"
    write_journey(journey, [b"Position", b"Loot"], [1770700000, 1770700005])
    (tmp_path / "February_11").mkdir()
    shutil.copy(journey, tmp_path / "February_11" / journey.name)  # EC-04
    (tmp_path / "February_10" / "broken.nakama-0").write_bytes(b"not parquet")
    (tmp_path / "February_10" / ".DS_Store").write_bytes(b"\0")  # EC-07
    (tmp_path / "minimaps").mkdir()
    (tmp_path / "minimaps" / "map.png").write_bytes(b"\0")
    (tmp_path / "README.md").write_text("top-level files are not journeys")

    events, report = load_journeys(tmp_path)

    assert report.files_found == 3
    assert report.files_read == 1
    assert report.duplicates_skipped == [("February_11/u1_m1.nakama-0", "February_10/u1_m1.nakama-0")]
    assert [name for name, _ in report.failures] == ["February_10/broken.nakama-0"]
    assert events["event"].tolist() == ["Position", "Loot"]  # EC-08
    assert events["ts_raw"].tolist() == [1770700000, 1770700005]
    assert events["row"].tolist() == [0, 1]


def test_wrong_schema_is_reported_not_loaded(tmp_path: Path) -> None:
    path = tmp_path / "February_10" / "odd.nakama-0"
    path.parent.mkdir()
    pq.write_table(pa.table({"user_id": ["u1"]}), path)
    events, report = load_journeys(tmp_path)
    assert events.empty
    assert report.failures == [("February_10/odd.nakama-0", "missing column 'match_id'")]


def test_ec04_duplicate_file_is_read_once(raw_data) -> None:
    _, report = raw_data
    assert (report.files_found, report.files_read, len(report.failures)) == (1243, 1242, 0)
    assert [(skipped.split("/")[0], kept.split("/")[0]) for skipped, kept in report.duplicates_skipped] == [
        ("February_11", "February_10")
    ]


def test_ec08_events_are_decoded_text(raw_data) -> None:
    events, _ = raw_data
    assert set(events["event"].unique()) == KNOWN_EVENTS
    assert len(events) == 89_016
