# 02 — Data pipeline

## Goal
Turn the raw parquet files into small, correct, ready-to-draw files that the website loads directly. All the data's traps are handled here, once, so the frontend never deals with raw data.

## The problem in depth
The README that ships with the data is wrong or incomplete in several places. Each item below was verified against the data. `data/raw/player_data/` holds 1,243 files (89,104 rows); after skipping the duplicate file, 1,242 files and 89,016 rows. Every issue has a row in `EDGE_CASES.md` (EC-xx) with its evidence and status.

1. **Timestamps are seconds, not milliseconds** (EC-01). `ts` is typed `timestamp[ms]`, but the integer inside is Unix epoch **seconds**. Read as milliseconds, the whole dataset spans 6.6 minutes in January 1970. Read as seconds, events run 2026-02-09 23:58:55 → 02-14 15:01:40 UTC and matches last 13–890 s. Resolution is 1 second, so several events can share a timestamp. 3 files store their rows out of time order (EC-02).
2. **The event column is bytes** (`b'Position'`) and must be decoded to text (EC-08).
3. **Some journeys are neither clearly human nor clearly bot** (EC-09, EC-10). The README gives two rules: humans have UUIDs and log `Position`; bots have numeric IDs and log `BotPosition`. 17 files (17 journeys, 3 actors, 17 matches) have numeric IDs but log `Position` and never `BotPosition`; 14 of them log `Loot`, which no `BotPosition` file does. They are in matches with 6–14 bot files; in 16 of them there is no UUID human, and in the 17th they share the match with one. One of the three actors is an ordinary bot (with `BotPosition`) in 3 other matches, so they may be internal or test clients. The data shows player-client events, not that a person played, so these journeys are **unknown** ([evidence](../evidence/event_forensics/actor_classification.md)). Result: 781 human, 444 bot and 17 unknown journeys; 779 matches with one human, 1 with two, 16 with none.
4. **Event meaning depends on whose file it's in** (EC-11). Both humans and bots record `BotKill` / `BotKilled`. In a bot's file, `BotKilled` means *that bot* died. Every event's x/z is the **file owner's** position: a kill marker shows where the killer stood, a death marker where the victim fell.
5. **`Kill`/`Killed` only appear as same-second pairs, cause unknown** (EC-12). Only 3 `Kill` and 3 `Killed` events exist, and each pair is in the *same* file, in adjacent rows, at the same second and identical x/y/z. All three are single-file matches, and each journey ends 0–2 s later. Identical x/y/z is expected either way (every event carries the owner's position), and most matches record only one player, so the rows can't tell a self-inflicted death from a trade with an unrecorded player. Both events are kept ([evidence](../evidence/event_forensics/kill_killed_pairs.md)).
6. **Most matches have one recorded player** (EC-25). 743 of 796 matches are a single file. 53 matches have several files: 52 of them include bot files (5–16 files each), and 1 (`a71c3aa8`) has two humans and no bots. Maps: AmbroseValley 566 matches, Lockdown 171, GrandRift 59.
7. **Positions are sampled every ~5 s** (EC-16), with 312 gaps over 30 s in 237 journeys; the longest is 518 s. Straight lines across long gaps would draw movement that never happened.
8. **Rows after death** (EC-14). 174 human journeys have rows logged 1–6 s after their first death, almost always at the death spot. In 172 there is one trailing row: a `Position` in 170 and a `BotKill` in 2. The other 2 have two trailing `Position` rows.
9. **One file is in two folders** (EC-04, EC-05). One human journey is byte-identical in `February_10/` and `February_11/`. Its match (`ac049b28`) runs 02-10 23:51–23:57 UTC and doesn't cross midnight, and its 6 bot files sit only in `February_11/`. Files from one match can therefore be split across folders.
10. **Three journeys were logged twice in full** (EC-29). In these journeys (player pseudonym_match: `13a425dd_d3a3297e`, 294 rows; `da9a800a_fc797a67`, 78; `51b60c09_0954f788`, 8), the second half of the file is an exact copy of the first half, comparing all 8 source columns in file order. No other file has this pattern. The copies account for all 147 duplicate `Position` rows and both duplicate `BotKilled` rows. Each of the two larger journeys also holds a legitimate same-second double `Loot` inside its original half.
11. **Other exact duplicate rows are plausible events** (EC-06). Outside those three journeys, 1,225 rows are exact repeats: 1,195 `Loot` and 30 `BotKill`, all within one second at one spot (several items picked up or several kills at once). None are positions.
12. **Minimaps are not 1024×1024** (EC-17, EC-20, EC-21). AmbroseValley 4320×4320 PNG, GrandRift 2160×2158 PNG (not square), Lockdown 9000×9000 JPG (11.8 MB). None has transparent pixels: the off-map area is opaque black. GrandRift's roads and some building art are also near-black, so a dark pixel doesn't mean "off the map" (EC-19).
13. **Coordinates** (EC-18, EC-22). The README formula is correct (its example reproduces exactly), `y` is elevation and is ignored, and no position falls outside its map.
14. **Folders aren't strict UTC days** (EC-23). 4 matches start on the day before their folder's day and 3 cross UTC midnight. Match `e325a53a` starts at 2026-02-09 23:58:55 UTC: a single continuous journey (161 rows, sampled every 5 s) that runs into Feb 10.
15. **No extraction event** (EC-13). 355 human journeys end without a death. Some may be disconnects (the shortest is 25 s), so any extraction view is inferred.
16. **A player covers about one heatmap cell between samples** (EC-28). The median step is 13 world units per 5 s, while 64×64 cells are 14.1 (AmbroseValley), 9.1 (GrandRift) and 15.6 (Lockdown) units wide. Counting time only at sample points leaves cells the player crossed empty.

## Decisions
| Choice | Decision | Why |
|---|---|---|
| Clock | `epoch_s = ts as int64`; match time `t = epoch_s − min(epoch_s in match)` | Point 1 |
| Ordering | Sort each journey by `(epoch_s, original row order)` | Point 1: rows can be out of order; same-second events keep their recorded order |
| Actor kind | `human` = UUID ID and `Position`; `bot` = numeric ID and `BotPosition`; anything else `unknown`, with `id_mismatch` set | Point 3 |
| Event categories | `BotKill`, `Kill` → **kill**; `BotKilled`, `Killed` → **death**; `KilledByStorm` → **storm_death**; `Loot` → **loot**; positions → path. Keep the raw label. Flag both rows of each same-file, same-second `Kill`+`Killed` pair `kill_killed_pair`; the paired `Kill` isn't counted in kill totals or the kill heatmap | Points 4–5; designer-friendly names |
| Duplicate files (D3) | Read byte-identical files once and list each skip | Point 9 |
| Doubled journeys (D3) | A journey is doubled only if, in file order, the second half of its file equals the first half on all 8 source columns. Keep the complete first half (the original sequence) and discard the repeated half. Report the removed counts | Point 10. Removes 190 rows: `13a425dd_d3a3297e` 147 (110 `Position`, 34 `Loot`, 3 `BotKill`), `da9a800a_fc797a67` 39 (34 `Position`, 3 `Loot`, 1 `BotKill`, 1 `BotKilled`), `51b60c09_0954f788` 4 (3 `Position`, 1 `BotKilled`). The two legitimate double `Loot`s survive |
| Other duplicate rows (D3) | No row is removed just because it has the same values as another row | Point 11. Repeated same-second pickups and kills can be real; the data has no duplicate positions outside doubled journeys |
| Rows after death (D2) | Drop `Position` rows after a journey's first death from paths, playback and traffic. Keep the death marker. Keep other events after death, but mark them `after_death: true` (timing and causality uncertain). Count everything in the build report | Point 8. A dead player must not keep moving; the 2 late `BotKill`s aren't assumed invalid. After removing doubled journeys: 173 positions dropped in 172 journeys |
| Path gaps | Split a path into segments where the gap is > 30 s | Point 7 |
| Coordinates | Store **UV (0–1)**, rounded to 4 decimals; the frontend scales to the image | UV doesn't depend on image size, so resizing images can't break alignment |
| Date (D1) | A match's date = UTC date of its first recorded event, described in the UI as the match's observed start date. The list of dates is generated from the data, never hardcoded | Point 14. A match crossing midnight appears under one date. Result: 2026-02-09 (1 match), 02-10 (287), 02-11 (197), 02-12 (162), 02-13 (112), 02-14 (37) |
| Boundary and partial dates | Computed from the data, never hardcoded. `boundary` = the first or last date with matches. `partial` = the observed collection window (first to last recorded event in the whole dataset) covers less than the full UTC day. Each date also records the observed window (`observed_from_utc`, `observed_to_utc`) as evidence | Separate claims: a boundary date is only partial if the window cuts it. Here both boundaries are cut. 2026-02-09 is observed from 23:58:55 only. 2026-02-14 is observed until 15:01:40, which matches the data README's note that collection was still ongoing |
| Player IDs | Replace `user_id` with an 8-character pseudonym, `sha1(user_id)[:8]`, everywhere: generated files, the build report, docs and tests | Not needed by the tool; avoids publishing IDs. Stable, so docs can name the same journey the data shows |
| Reproducible output | No timestamps in generated files; keys and lists in a fixed order; the same raw data gives byte-identical files (tested). The build time is only printed | Rebuilding must not create a git diff unless the data or code changed |
| Rebuilding `matches/` | Write the new match files to `matches.staging/`, check that every match in the index has exactly one valid file, then swap folders and delete the old one. A folder is only deleted if it is named `matches*` inside `data/` and holds nothing but `.json` files | No stale match files survive; nothing outside the generated output can be deleted (tested) |
| Heatmaps | Built from **human** journeys only | Only 52 matches have bot files, so mixing them in would skew the maps |
| Traffic (D5) | Trace a straight line between consecutive positions (≤ 30 s apart) and spread the step's time across the cells it crosses, in proportion to the distance inside each cell | Point 16. Still an approximation: the real route between samples is unknown |
| Images | WebP, longest side `min(original, 4096)` px | Keeps Lockdown from being an 11.8 MB download without upscaling GrandRift (2160 px) |
| Alignment checks (D4) | Mathematical tests are the pass/fail check. Diagnostic overlays are supporting evidence that S reviews. No pixel-colour threshold | Point 12: dark map art makes pixel colour unreliable. Final rendered alignment is checked in feature 3 |

## Output format (every later feature depends on this)
```
web/public/data/index.json
{
  "schema_version": 1,
  "maps": { "AmbroseValley": { "image": "maps/AmbroseValley.webp", "width": 4096, "height": 4096,
                               "scale": 900, "origin_x": -370, "origin_z": -473 }, ... },
  "dates": [ { "date": "2026-02-09", "matches": 1, "boundary": true, "partial": true,
               "observed_from_utc": "2026-02-09T23:58:55Z", "observed_to_utc": "2026-02-10T00:00:00Z" }, ... ],
  "matches": [ { "id": "b71aaad8", "full_id": "...", "map": "AmbroseValley", "date": "2026-02-10",
                 "start_utc": "2026-02-10T18:09:03Z", "duration_s": 512, "humans": 1, "bots": 0, "unknown": 0,
                 "counts": { "kill": 4, "death": 1, "storm_death": 0, "loot": 12, "kill_killed_pair": 0 } }, ... ]
}

web/public/data/matches/<id>.json            (one per match in index.json; <id> = its "id")
{
  "schema_version": 1, "id": "b71aaad8", "full_id": "...", "map": "...", "date": "2026-02-10", "duration_s": 512,
  "actors": [ { "id": "a1b2c3d4", "kind": "human", "id_mismatch": false,      (humans, then unknown, then bots; then by id)
                "segments": [ [ [t, u, v], [t, u, v], ... ], ... ],
                "events": [ { "t": 233, "type": "kill", "raw": "BotKill", "u": 0.31, "v": 0.62,
                              "after_death": false, "kill_killed_pair": false }, ... ] } ]
}

web/public/data/heatmaps/<map>.json
{ "schema_version": 1, "map": "...", "grid": 64,
  "cells": "<how to read a cell>", "units": { "kills": "events", "deaths": "...", "traffic": "seconds" },
  "layers": { "kills": { "all": [[i, j, value], ...], "2026-02-10": [...] }, "deaths": {...}, "traffic": {...} },
  "totals": { "kills": { "all": 1234, ... }, ... },
  "samples": { "all": { "matches": 553, "human_journeys": 554 }, "2026-02-10": {...} } }
  (i = column along u, west → east; j = row along v, south → north; cell i covers u ∈ [i/64, (i+1)/64))

web/public/data/zones/<map>.json             (interpretation layer, spec 06 Stage 6b; counts only, no player or match IDs)
{ "schema_version": 1, "map": "...", "grid": 64, "zone_cells": 4, "zones_per_side": 16, "rules": { ...the qualification rules used... },
  "selections": { "all": { "matches": 553, "players": 217,
                           "layers": { "kills": { "total": 1656, "occupied_zones": 79, "candidates": 8, "consistent": 5,
                                                  "zones": [ { "i": 8, "j": 7, "value": 139, "share": 0.084, "matches": 57, "players": 44,
                                                               "largest_match_share": 0.151, "stability": 1.0, "survived_shifts": 3,
                                                               "tier": "consistent" }, ... ] },
                                       "deaths": { ... "storm_deaths": 17, "zones": [ { ..., "storm_deaths": 3 } ] },
                                       "traffic": { ... "zones": [ { ..., "journeys": 31 } ] } } },
                  "2026-02-10": { ... } } }
  (region (i, j) covers cells i*4 .. i*4+3 and j*4 .. j*4+3 of the heatmap grid; candidates only, strongest first; definitions in lila_pipeline/zones.py)

web/public/data/stats.json                   (overall statistics for the dashboard and the chat; full contract in docs/specs/10_DASHBOARD.md)
{ "schema_version": 1, "metrics_version": 1, "source": { "fingerprint": "sha256:<16 hex>", "files": 800 },
  "thresholds": { "few_matches": 10, "few_values": 10 }, "grid": 64, "maps": [...], "dates": [...],
  "metrics": { "<metric id>": { "label", "section", "unit", "kind", "definition", "population", "denominator", "limitations", "scopes" } },
  "slices": { "<all|map>": { "<all|date>": { "sample": {...}, "flags": {...}, "values": { "<metric id>": <value or null> } } } } }
  (all 28 map x date scopes; written last, because the fingerprint hashes index.json, the heatmaps and the match files on disk)

docs/evidence/build_report.json   (not loaded by the site; player IDs hashed)
{ "schema_version": 1, "files": { "found", "read", "duplicates_skipped": [...], "failed": [...] },
  "rows": { "read", "after_removing_doubled_journeys", "final" },
  "doubled_journeys": [ { "journey": "<hash>_<match8>", "rows", "removed", "removed_by_event" } ],
  "kill_killed_pairs", "after_death": { "positions_dropped", "journeys_with_dropped_positions", "after_death_events" },
  "journeys": { "human", "bot", "unknown", "id_mismatch", "matches_by_human_count" },
  "events_by_category", "path_gaps_over_limit", "matches", "dates", "stats": { "bytes", "slices" } }
```
Numbers in these examples are placeholders, not real values. `test_generated_files_match_the_documented_contract` checks every key above.

Field meanings that aren't obvious:
- `t` is seconds since the match's first recorded event (any actor); `duration_s` is the largest `t`. Points are `[t, u, v]`; `u`, `v` are 0–1 with 4 decimals.
- `counts` in `index.json` are events recorded in **human** files only (a bot's death is usually also a human's kill, so adding bot files would count fights twice).
- A heatmap date key exists only if that map has human data on that date (GrandRift has none on 2026-02-09). A missing key means no data, not an error.
- `samples` (per date key) counts **journeys, not rows**, after cleaning: `matches` = matches on this map and date with at least one human journey; `human_journeys` = human journeys (files) in them; `unknown` journeys are never included. It counts neither positions, events nor path segments. The number of events behind a kills/deaths layer is its `totals` value; for traffic, `totals` is seconds.

Heatmap values:
- **Kills / deaths** = event counts per cell. Storm deaths and the `Killed` half of each Kill/Killed pair count as deaths; the paired `Kill` isn't a kill here. `after_death` events are counted like any other. Only human journeys count, never `unknown` ones.
- **Traffic** = seconds of human movement per cell, using the line-tracing rule from the Decisions table (D5).

Store only non-zero cells.

## Implementation
All steps are built (not yet committed). Tests are in `pipeline/tests/`, named after the EDGE_CASES IDs where one applies.

**Commit 1 — `data: load parquet files and decode events`** *(built)*
`ingest.py`: read every file once, decode `event`, attach file name, folder and original row number. Validate the schema. List skipped duplicates and files that fail to load (never skip silently).

**Commit 2 — `data: read timestamps as seconds and compute match time`** *(built)*
`normalize.add_match_clock`: clock and ordering rules above. Tests: match durations fall between 10 s and 20 min; out-of-order rows are sorted.

**Commit 3 — `data: classify bots by behaviour instead of id format`** *(built)*
`normalize.classify_actors`: actor kind + `id_mismatch`. Tests: the 17 known files are `unknown` and flagged; 781 human, 444 bot and 17 unknown journeys; 779 matches with 1 human, 1 with 2, 16 with none.

**Commit 4 — `data: remove journeys that were logged twice`** *(built)*
`normalize.remove_doubled_journeys` (D3). Regression tests:
- Exactly the 3 known journeys are found, with 147 / 39 / 4 rows removed (190 in total).
- The two legitimate double `Loot`s survive.
- The other same-second repeats are kept.
- Synthetic: identical rows alone are never removed, and a half that differs in one column isn't a copy.

**Commit 5 — `data: map raw events to designer categories`** *(built)*
`journeys.py`: categories, Kill/Killed pair flag, rows after death (D2), path segments at gaps > 30 s. Tests: all 3 `Kill` and 3 `Killed` rows kept with their original time and position, flagged as 3 pairs, no `self_kill` category; no path point later than its journey's first death; 173 positions dropped in 172 journeys; the 2 late `BotKill`s kept and marked `after_death`.

**Commit 6 — `data: convert world coordinates to minimap uv`** *(built)*
`projection.py`: the only place coordinates are converted. Tests: README example gives (78, 890) at 1024 px; corners, centre and orientation for all three maps; GrandRift's non-square size; every position lands inside 0–1.

**Commit 7 — `data: write match index, match files and heatmap grids`** *(built)*
`heatmaps.py` (grids, line tracing), `export.py` (file contents), `build.py` (`make data`): writes the file types above with hashed IDs, generated dates, path-traced traffic (D5) and `build_report.json`. Tests:
- Dates: boundary vs partial on synthetic windows; the six real dates.
- Line tracing: horizontal, diagonal and through-the-corner steps; gaps over 30 s add nothing.
- Death-cell totals equal human deaths per map and date.
- One file per match, with paths inside 0–1 and no joins across gaps.
- No real player ID (UUID, UUID prefix or numeric ID) in any output.
- Generated files match the output format above; two builds are byte-identical; a rebuild removes stale match files and refuses to delete a folder holding files it didn't write.

**Commit 8 — `perf: convert minimaps to webp`** *(built)*
`images.py`: resize to `min(original, 4096)` px on the longest side, WebP quality 85, alpha dropped (images are opaque). Output: AmbroseValley 4096², GrandRift 2160×2158, Lockdown 4096²; 1.3 MB in total.

**Commit 9 — `test: validate minimap alignment`** *(built)*
Mandatory pass/fail: the mathematical tests in `test_projection.py`. Supporting evidence, reviewed by S: `pipeline/validate_map_alignment.py` draws real journeys with the production mapping and with the y-flip removed (`docs/evidence/coordinates/grandrift_*`). No pixel-colour threshold.

## How to verify
1. `make data` runs end to end and prints file counts (1,243 found, 1,242 read, 1 duplicate skipped, 0 failed), rows (89,016 read → 88,826 after doubled journeys → 88,653 final), 190 rows removed from 3 doubled journeys, and 173 post-death positions dropped.
2. `make test` passes.
3. Run `make data` twice: `git status` shows no change after the second run.
4. Review `docs/evidence/coordinates/grandrift_validation.md` and its images.
5. Open one match file and compare a few events with the raw parquet rows for that file.

## Out of scope
Any frontend code. Final rendered alignment on screen (feature 3). Extra analytics (backtracing, sequences): those belong to the optional chatbot work.
