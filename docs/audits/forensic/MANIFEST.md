# Audit manifest

> Paths in this audit are as they were when it was written (2026-10-24). Since 2026-10-25: `AUDIT/taskOverview.md` → `docs/source/ASSIGNMENT_BRIEF.md`, `AUDIT/README.md` → `docs/source/DATA_README.md`, `docs/evidence/forensic_audit/` → `docs/audits/forensic/`, feature specs `docs/NN_…` → `docs/specs/NN_…`. Index: [docs/README.md](../../README.md).

## Revision and inputs
- Repository: HEAD `4d5ed57e782045190ccb0363c2bd0cd7a64378a1`. `pipeline/` had no local changes during the audit.
- Raw parquet set: 1,243 files in `data/raw/player_data/February_{10..14}/`, 89,104 rows. Set fingerprint = SHA-256 of the sorted `sha256sum` list of the files: `0b4a35dd5fa0d54c72adb01276efd325aff8f3ab5cba0ed558d4509f41a073e3`.
- Minimaps (SHA-256):
  - AmbroseValley_Minimap.png `22f7a8a4f686bfbfa7f1951da02d3efeb8cf9a30c70bbb8b095977315124671e`
  - GrandRift_Minimap.png `debc09ebbd1250c567aaf2397b079eb7a1aafdf6e5a562d52e556fcf1c3b2137`
  - Lockdown_Minimap.jpg `5d3b25674121138689e0e0926115edc7629b0e12e94284c7272e047fdf8d61ee`
- Task files read first: `AUDIT/taskOverview.md`. The data README (`AUDIT/README.md`) was read only after Part 1 was sealed.

## Environment
Windows 11, Python 3.12.9 (`pipeline/.venv`), numpy 2.5.4, pandas 3.0.6, pyarrow 26.0.0, Pillow 13.0.0 (all consistent with `pipeline/uv.lock`), pytest from the dev group, uv 0.7.13.

## Seal of Part 1
Sealed 2026-10-24T07:29:41Z, before any project decision, test, spec or output was opened. Re-verified unchanged at the end of the audit.
```
3c0bf855dd8080a956709916e1c640308594a22724c3b38369c6bce63b4eca5b  01_independent/INDEPENDENT_EVIDENCE.md
828fa727494ec9387dd25643c7fb5d579387745ee4c04a40defe1e3f9703d014  01_independent/independent_counts.json
```
Scripts `a00`–`a12` were hashed in the same seal. They are unchanged since.

## Commands
Run from the repository root. `$S` is a scratch folder outside git: intermediate tables contain raw IDs and never go in the repo.
```sh
PY=pipeline/.venv/Scripts/python      # or: cd pipeline && uv run python
A=docs/audits/forensic/scripts
# Part 1 (independent; reads raw files with pyarrow only)
$PY $A/a00_schema.py data/raw/player_data
$PY $A/a01_load.py data/raw/player_data $S/raw_all.parquet
$PY $A/a02_explore.py $S/raw_all.parquet
$PY $A/a03_events_time.py $S/raw_all.parquet
$PY $A/a04_files_matches.py $S/raw_all.parquet $S/files.parquet
for s in a05_dates_loot a06_matches_actors a07_pairing a08_deaths a10_change_only a11_identity_overlap; do $PY $A/$s.py $S/raw_all.parquet $S/files.parquet; done
$PY $A/a09_gaps_minimaps.py $S/raw_all.parquet $S/files.parquet data/raw/player_data/minimaps
$PY $A/a12_counts.py $S/raw_all.parquet $S/files.parquet docs/audits/forensic/01_independent/independent_counts.json
# Part 2: README claims
T=6 $PY $A/b01_registration.py $S/raw_all.parquet data/raw/player_data/minimaps $S   # also T=30 (default)
$PY $A/b02_readme_claims.py $S/raw_all.parquet
# Part 2: existing tests, rebuild, reconciliation, sensitivity
(cd pipeline && .venv/Scripts/python -m pytest -q)                                     # 125 passed
(cd pipeline && .venv/Scripts/python -m lila_pipeline.build --web-dir $S/rebuild/web --report $S/rebuild/build_report.json)
diff -rq web/public/data $S/rebuild/web/data; cmp web/public/maps/*.webp …             # identical
$PY $A/c01_reconstruct.py $S/raw_all.parquet $S/files.parquet web/public/data docs/audits/forensic/02_reconciliation/c01_reconstruction.json
(cd pipeline && .venv/Scripts/python ../$A/c02_traffic_sensitivity.py ../docs/audits/forensic/02_reconciliation/c02_traffic_sensitivity.json)
(cd pipeline && .venv/Scripts/python ../$A/c03_other_sensitivity.py ../docs/audits/forensic/02_reconciliation/c03_other_sensitivity.json)
$PY $A/c04_doc_claims.py $S/raw_all.parquet $S/files.parquet data/raw/player_data/minimaps
$PY $A/c05_verify_stats.py $S/raw_all.parquet $S/files.parquet web/public/data docs/audits/forensic/02_reconciliation/c05_stats_verification.json   # 7,792 values, 0 differences
# negative control: plant 3 changes in a copy ($S/rebuild/web/data/stats.json) and rerun c05 against it -> 3 differences
# Part 3 (follow-up): d01, d04, d05 audit code only; d02, d03 vary inputs/seeds of production zones rules
$PY $A/d01_emission_rule.py $S/raw_all.parquet $S/files.parquet web/public/data docs/audits/forensic/03_followup/d01_emission_rule.json
(cd pipeline && .venv/Scripts/python ../$A/d02_allocation_models.py ../docs/audits/forensic/03_followup/d02_allocation_models.json)
(cd pipeline && .venv/Scripts/python ../$A/d03_zone_robustness.py ../docs/audits/forensic/03_followup/d03_zone_robustness.json)   # ~45 min
$PY $A/d04_bot_presence.py $S/raw_all.parquet $S/files.parquet web/public/data docs/audits/forensic/03_followup/d04_bot_presence.json
$PY $A/d05_map_score.py $S/raw_all.parquet $S/files.parquet web/public/data docs/audits/forensic/03_followup/d05_map_score.json
(cd pipeline && .venv/Scripts/python tools/check_ids.py)                               # nothing found in this folder
```

## Independence of the scripts
- `a*`, `b*`, `c01`, `c04` and `c05` never import `lila_pipeline` (`c05` reuses this audit's own `c01` loader).
- `c02` and `c03` import it on purpose. They vary one input or parameter (the traffic model, the seed, a threshold, the actor set, dedupe) while keeping every other production rule. That is a sensitivity test, not an expected answer. `c02` asserts that its own D5 driver equals the production traffic tensor before comparing models.
- `c03` changes `zones.SEED` in memory only and restores it afterwards.
