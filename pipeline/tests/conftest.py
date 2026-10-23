"""Shared fixtures. Tests that need LILA's raw data skip when `data/raw/` hasn't been unzipped."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from lila_pipeline.build import Prepared, prepare, write_outputs
from lila_pipeline.ingest import DEFAULT_DATA_DIR, IngestReport, load_journeys
from lila_pipeline.normalize import add_match_clock


def require_raw_data() -> None:
    if not DEFAULT_DATA_DIR.is_dir():
        pytest.skip(f"raw data not found at {DEFAULT_DATA_DIR}")


@pytest.fixture(scope="session")
def raw_data() -> tuple[pd.DataFrame, IngestReport]:
    require_raw_data()
    return load_journeys(DEFAULT_DATA_DIR)


@pytest.fixture(scope="session")
def clocked_events(raw_data: tuple[pd.DataFrame, IngestReport]) -> pd.DataFrame:
    return add_match_clock(raw_data[0])


@pytest.fixture(scope="session")
def prepared() -> Prepared:
    require_raw_data()
    return prepare(DEFAULT_DATA_DIR)


@pytest.fixture(scope="session")
def built(prepared: Prepared, tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict]:
    """The full pipeline written to a temporary folder (minimaps not re-encoded)."""
    out = tmp_path_factory.mktemp("build")
    report = write_outputs(prepared, DEFAULT_DATA_DIR, out / "web", out / "build_report.json", images=False)
    return out, report
