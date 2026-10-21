"""Read the raw parquet journeys once, decode them, and report anything that was skipped.

Each file is one player's (or bot's) journey through one match. Files have no `.parquet`
extension. Nothing is skipped silently: duplicates and unreadable files are listed in the
returned `IngestReport`.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "raw" / "player_data"
MINIMAP_DIR_NAME = "minimaps"

EXPECTED_SCHEMA = {
    "user_id": pa.string(),
    "match_id": pa.string(),
    "map_id": pa.string(),
    "x": pa.float32(),
    "y": pa.float32(),
    "z": pa.float32(),
    "ts": pa.timestamp("ms"),
    "event": pa.binary(),
}

COLUMNS = [*(name for name in EXPECTED_SCHEMA if name != "ts"), "ts_raw", "file", "folder", "row"]


@dataclass
class IngestReport:
    """What happened to every file found under the data folder."""

    files_found: int = 0
    files_read: int = 0
    duplicates_skipped: list[tuple[str, str]] = field(default_factory=list)  # (skipped, identical to)
    failures: list[tuple[str, str]] = field(default_factory=list)  # (file, reason)

    def summary(self) -> str:
        return (
            f"{self.files_found} files found, {self.files_read} read, "
            f"{len(self.duplicates_skipped)} duplicates skipped, {len(self.failures)} failed"
        )


def find_journey_files(data_dir: Path) -> list[Path]:
    """All journey files, in a stable order (day folders sort chronologically).

    Skips the minimap folder, hidden files such as `.DS_Store`, and anything at the top
    level (the README and stray copies live there, not journeys).
    """
    return sorted(
        path
        for folder in data_dir.iterdir()
        if folder.is_dir() and folder.name != MINIMAP_DIR_NAME
        for path in folder.iterdir()
        if path.is_file() and not path.name.startswith(".")
    )


def load_journeys(data_dir: Path = DEFAULT_DATA_DIR) -> tuple[pd.DataFrame, IngestReport]:
    """Load every journey file into one table with the event bytes decoded.

    Byte-identical files are read once (one journey sits in both February_10 and
    February_11); the first in sorted order is kept. `ts_raw` is the integer stored in
    the `ts` column, left uninterpreted here; see `normalize.add_match_clock` for its unit.
    """
    report = IngestReport()
    kept_by_digest: dict[str, Path] = {}
    frames: list[pd.DataFrame] = []

    for path in find_journey_files(data_dir):
        report.files_found += 1
        name = path.relative_to(data_dir).as_posix()
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in kept_by_digest:
            report.duplicates_skipped.append((name, kept_by_digest[digest].relative_to(data_dir).as_posix()))
            continue
        try:
            table = pq.read_table(path)
            problem = _schema_problem(table.schema)
            if problem:
                report.failures.append((name, problem))
                continue
            frames.append(_to_frame(table, path))
        except (pa.ArrowException, OSError, UnicodeDecodeError) as exc:
            report.failures.append((name, f"{type(exc).__name__}: {exc}"))
            continue
        kept_by_digest[digest] = path
        report.files_read += 1

    events = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=COLUMNS)
    return events, report


def _schema_problem(schema: pa.Schema) -> str | None:
    for column, expected in EXPECTED_SCHEMA.items():
        if column not in schema.names:
            return f"missing column {column!r}"
        actual = schema.field(column).type
        if actual != expected:
            return f"column {column!r} is {actual}, expected {expected}"
    return None


def _to_frame(table: pa.Table, path: Path) -> pd.DataFrame:
    frame = table.drop_columns(["ts", "event"]).to_pandas()
    frame["event"] = [raw.decode("utf-8") for raw in table["event"].to_pylist()]
    frame["ts_raw"] = table["ts"].cast(pa.int64()).to_numpy()
    frame["file"] = path.name
    frame["folder"] = path.parent.name
    frame["row"] = np.arange(len(frame))
    return frame
