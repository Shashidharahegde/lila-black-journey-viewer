"""Run the whole pipeline: raw parquet + minimaps in, website data and a build report out.

    uv run python -m lila_pipeline.build            (what `make data` runs)
"""

from __future__ import annotations

import argparse
import json
import shutil
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from lila_pipeline import export
from lila_pipeline.images import export_minimap, source_size, web_size
from lila_pipeline.ingest import DEFAULT_DATA_DIR, IngestReport, load_journeys
from lila_pipeline.journeys import MAX_PATH_GAP_S, DeathCutoffReport, apply_death_cutoff, categorize_events
from lila_pipeline.normalize import DoubledJourney, add_match_clock, classify_actors, remove_doubled_journeys
from lila_pipeline.projection import MAPS, add_uv

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_WEB_DIR = REPO_ROOT / "web" / "public"
DEFAULT_REPORT = REPO_ROOT / "docs" / "evidence" / "build_report.json"


@dataclass
class Prepared:
    """Cleaned events (one row per kept event, with category, flags and UV) and what happened on the way."""

    events: pd.DataFrame
    ingest: IngestReport
    doubled: list[DoubledJourney]
    cutoff: DeathCutoffReport
    rows: dict[str, int]


def prepare(data_dir: Path = DEFAULT_DATA_DIR) -> Prepared:
    raw, ingest = load_journeys(data_dir)
    rows = {"read": len(raw)}
    events = add_match_clock(raw)
    events, doubled = remove_doubled_journeys(events)
    rows["after_removing_doubled_journeys"] = len(events)
    events = categorize_events(classify_actors(events))
    events, cutoff = apply_death_cutoff(events)
    rows["final"] = len(events)
    return Prepared(add_uv(events), ingest, doubled, cutoff, rows)


def build_report(prepared: Prepared, index: dict) -> dict:
    """Every count needed to audit the cleaning. Player IDs are hashed."""
    events = prepared.events
    journeys = events.groupby("file").agg(kind=("actor_kind", "first"), mismatch=("id_mismatch", "first"))
    humans_per_match = (
        events[events["actor_kind"] == "human"].groupby("match_id")["file"].nunique()
        .reindex(events["match_id"].unique(), fill_value=0)
    )
    positions = events[events["category"] == "position"]
    gaps = positions.groupby("file")["epoch_s"].diff()
    return {
        "schema_version": export.SCHEMA_VERSION,
        "files": {
            "found": prepared.ingest.files_found,
            "read": prepared.ingest.files_read,
            "duplicates_skipped": [
                {"skipped": _safe_name(skipped), "identical_to": _safe_name(kept)}
                for skipped, kept in prepared.ingest.duplicates_skipped
            ],
            "failed": [{"file": _safe_name(name), "reason": reason} for name, reason in prepared.ingest.failures],
        },
        "rows": prepared.rows,
        "doubled_journeys": [
            {"journey": export.journey_label(d.file), "rows": d.rows, "removed": d.removed,
             "removed_by_event": d.removed_by_event}
            for d in prepared.doubled
        ],
        "kill_killed_pairs": int((events["kill_killed_pair"] & (events["event"] == "Killed")).sum()),
        "after_death": asdict(prepared.cutoff),
        "journeys": {
            "human": int((journeys["kind"] == "human").sum()),
            "bot": int((journeys["kind"] == "bot").sum()),
            "unknown": int((journeys["kind"] == "unknown").sum()),
            "id_mismatch": int(journeys["mismatch"].sum()),
            "matches_by_human_count": {str(k): int(v) for k, v in humans_per_match.value_counts().sort_index().items()},
        },
        "events_by_category": {str(k): int(v) for k, v in events["category"].value_counts().sort_index().items()},
        "path_gaps_over_limit": {"limit_s": MAX_PATH_GAP_S, "gaps": int((gaps > MAX_PATH_GAP_S).sum())},
        "matches": len(index["matches"]),
        "dates": [{k: d[k] for k in ("date", "matches", "boundary", "partial")} for d in index["dates"]],
    }


def write_outputs(prepared: Prepared, data_dir: Path, web_dir: Path, report_path: Path, images: bool = True) -> dict:
    """Write index, match files, heatmaps, minimaps and the build report. Returns the report.

    Output is deterministic: no timestamps, sorted keys where order comes from the data.
    """
    minimap_dir = data_dir / "minimaps"
    if images:
        sizes = {map_id: export_minimap(minimap_dir, map_id, web_dir / "maps") for map_id in MAPS}
    else:
        sizes = {map_id: web_size(*source_size(minimap_dir, map_id)) for map_id in MAPS}

    events = prepared.events
    index = export.build_index(events, sizes)
    data_dir_out = web_dir / "data"
    matches_dir = data_dir_out / "matches"
    staged = data_dir_out / "matches.staging"
    if staged.exists():  # left over from an interrupted build
        _remove_generated_matches(staged)
    staged.mkdir(parents=True)
    dates = export.match_dates(events)
    for match_id, rows in events.groupby("match_id", sort=True):
        document = export.build_match(str(match_id), rows, dates[match_id])
        _write_json(staged / f"{document['id']}.json", document)
    _check_staged_matches(staged, index)
    _swap_in(staged, matches_dir)  # old match files are deleted only after the new set is complete
    heatmaps = {map_id: export.build_heatmap(map_id, events) for map_id in MAPS}
    for map_id in MAPS:
        _write_json(data_dir_out / "heatmaps" / f"{map_id}.json", heatmaps[map_id])
        _write_json(data_dir_out / "zones" / f"{map_id}.json", export.build_zones(map_id, events))
    _write_json(data_dir_out / "index.json", index)

    report = build_report(prepared, index)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def _check_staged_matches(staged: Path, index: dict) -> None:
    """Every match in the index has exactly one readable file, and nothing else is there."""
    expected = {f"{m['id']}.json" for m in index["matches"]}
    written = {p.name for p in staged.iterdir()}
    if written != expected:
        raise RuntimeError(f"match files don't match the index: {len(written)} written, {len(expected)} expected")
    for path in staged.iterdir():
        document = json.loads(path.read_text(encoding="utf-8"))
        if document["schema_version"] != export.SCHEMA_VERSION or f"{document['id']}.json" != path.name:
            raise RuntimeError(f"bad match file {path.name}")


def _swap_in(staged: Path, target: Path) -> None:
    if not target.exists():
        staged.rename(target)
        return
    _check_generated(target)  # before anything moves, so a refusal leaves the old folder untouched
    retired = target.with_name(target.name + ".old")
    if retired.exists():
        _remove_generated_matches(retired)
    target.rename(retired)
    staged.rename(target)
    _remove_generated_matches(retired)


def _check_generated(folder: Path) -> None:
    """Refuse anything but a folder of generated match files (wrong name, links, sub-folders, other files)."""
    if folder.is_symlink() or folder.parent.name != "data" or not folder.name.startswith("matches"):
        raise RuntimeError(f"refusing to delete {folder}: not a generated match folder")
    unexpected = [p.name for p in folder.iterdir() if p.is_symlink() or not p.is_file() or p.suffix != ".json"]
    if unexpected:
        raise RuntimeError(f"refusing to delete {folder}: it holds files the pipeline didn't write: {unexpected[:3]}")


def _remove_generated_matches(folder: Path) -> None:
    _check_generated(folder)
    shutil.rmtree(folder)


def _safe_name(relative_path: str) -> str:
    """`February_11/<uuid>_<match>.nakama-0` → `February_11/<hash>_<match8>`; other names unchanged."""
    folder, _, name = relative_path.rpartition("/")
    label = export.journey_label(name) if "_" in name else name
    return f"{folder}/{label}" if folder else label


def _write_json(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the website data from the raw LILA BLACK files.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--web-dir", type=Path, default=DEFAULT_WEB_DIR)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--skip-images", action="store_true", help="don't re-encode the minimaps")
    args = parser.parse_args()

    started = datetime.now(UTC)
    prepared = prepare(args.data_dir)
    report = write_outputs(prepared, args.data_dir, args.web_dir, args.report, images=not args.skip_images)
    print(prepared.ingest.summary())
    print(f"rows: {report['rows']}")
    print(f"doubled journeys: {len(report['doubled_journeys'])}, "
          f"rows removed: {sum(d['removed'] for d in report['doubled_journeys'])}")
    print(f"after death: {report['after_death']}")
    print(f"matches: {report['matches']}, journeys: {report['journeys']}")
    print(f"report: {args.report}")
    print(f"built {started:%Y-%m-%d %H:%M:%S} UTC in {(datetime.now(UTC) - started).total_seconds():.0f} s "
          "(printed only; the generated files hold no timestamp)")


if __name__ == "__main__":
    main()
