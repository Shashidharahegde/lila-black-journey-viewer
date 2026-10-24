# Edge cases

Every data issue found so far and how the tool handles it. Tests are named after the IDs where possible.

**Status:** **Found** = verified in the data, handling agreed, not built yet · **Decide** = needs S's call · **Handled** = built and covered by a test (named in brackets; files under `pipeline/tests/`) · **Resolved** = reviewed by S and accepted as it is, with the reason given.
**Evidence** is measured on `data/raw/player_data/` (1,243 files; 1,242 after skipping the duplicate file; 89,016 rows). The pipeline's own counts are in `docs/evidence/build_report.json` (`make data`).
Journeys are named `player_match`: the player's pseudonym (`sha1(user_id)[:8]`, the same one used in the generated files) and the match ID prefix. Raw player IDs never appear in this file.

## Clock and ordering
| ID | Edge case | Evidence | Handling | Status |
|---|---|---|---|---|
| EC-01 | `ts` is Unix **seconds** stored in a `timestamp[ms]` column | Read as ms, the whole dataset spans 6.6 min in Jan 1970. Read as s: 2026-02-09 23:58:55 → 02-14 15:01:40 UTC; matches last 13–890 s | `epoch_s = ts as int64`; `t = epoch_s − min(epoch_s in match)` | Handled (`test_ec01_ts_is_epoch_seconds`) |
| EC-02 | Rows aren't always stored in time order | 3 files have out-of-order rows | Sort by `(epoch_s, original row)` before any path or "first death" logic | Handled (`test_ec02_rows_sorted_by_time_then_file_order`) |
| EC-03 | 1 s resolution: several events can share a second | Loot bursts at one spot in one second | Stable sort keeps file order within a second | Handled (same test) |

## Files and duplicates
| ID | Edge case | Evidence | Handling | Status |
|---|---|---|---|---|
| EC-04 | One file is in two date folders | One human journey of match `ac049b28` is byte-identical in `February_10/` and `February_11/` | Read identical content once; the skip is listed in the build report | Handled (`test_ec04_duplicate_file_is_read_once`) |
| EC-05 | Files from one match can sit in different folders | Match `ac049b28` runs 02-10 23:51–23:57 UTC; its 6 bot files are only in `February_11/` | Everything groups by `match_id`, never by folder | Handled (by design; `test_ec23_real_dates_are_generated_from_data`) |
| EC-29 | Three journeys were logged twice in full | `13a425dd_d3a3297e` (294 rows), `da9a800a_fc797a67` (78), `51b60c09_0954f788` (8): in file order, the second half equals the first half on all 8 source columns. No other file does | D3: keep the complete first half, discard the copy. Removes 190 rows (147 / 39 / 4); the two legitimate double `Loot`s inside the first halves survive | Handled (`test_ec29_exactly_three_doubled_journeys_lose_190_rows`, `test_ec29_legitimate_double_loot_survives`, `test_ec29_doubled_journey_keeps_first_copy_including_same_second_loot`) |
| EC-06 | Other exact duplicate rows | 1,225 repeats outside doubled journeys (1,195 `Loot`, 30 `BotKill`), all within one second at one spot. No duplicate positions | D3: no row is removed just because it looks identical to another | Handled (`test_ec06_other_same_second_repeats_are_kept`, `test_identical_rows_alone_are_not_removed`) |
| EC-07 | Non-data files in the data folder | `.DS_Store`, `minimaps/`, top-level files | Read only files inside day folders; skip hidden files and `minimaps/`; list every unreadable file | Handled (`test_synthetic_folder_reports_everything`) |
| EC-08 | `event` is bytes | `b'Position'` in every row | Decode as UTF-8; unknown event types stop the build | Handled (`test_ec08_events_are_decoded_text`, `test_unknown_event_is_rejected`) |

## Actors and events
| ID | Edge case | Evidence | Handling | Status |
|---|---|---|---|---|
| EC-09 | A numeric ID doesn't always mean a bot | 17 numeric-ID files (17 journeys, 3 actors, 17 matches; cases U01–U17) never log `BotPosition`; all log `Position` and 14 log `Loot`, which no `BotPosition` file ever does. 12 of them move faster than the bot speed cap (5.0 units/s, never exceeded in 444 bot files); all start at their match's first event, and bots appear 0 or 5 s later, as in UUID-led matches. Against "human": numeric IDs, one actor is a `BotPosition` bot in 3 other matches, 1 of 17 dies. All 444 `BotPosition` files have numeric IDs; all 781 UUID files log `Position`; no file has both. Rows always match their file's user, match and map ([evidence](docs/evidence/event_forensics/actor_classification.md)) | `bot` = the file logs `BotPosition`, else `human`; the 17 numeric-ID journeys are counted as humans and flagged `id_mismatch` (changed 2026-10-24 from `unknown`, which kept them out of human counts and heatmaps; `test_ec09_*`) | Handled (`test_ec09_actor_is_a_bot_only_when_it_logs_botposition`, `test_ec09_ec10_real_actor_counts`, `test_ec09_flagged_journeys_are_kept_whole_in_match_files`, `test_ec09_flagged_journeys_are_counted_as_humans_in_heatmaps`, `test_ec09_evidence_lists_the_17_unknown_journeys`) |
| EC-10 | One unknown journey shares its match with a UUID human | Case U09: 1 UUID human, 1 unknown, 14 bots. The other 16 unknown journeys are in matches with no UUID human | Result: 781 human, 444 bot, 17 unknown journeys; 779 matches with 1 human, 1 with 2, 16 with none | Handled (`test_ec09_ec10_real_actor_counts`, `test_build_report_counts`) |
| EC-11 | An event's meaning depends on who owns the file | In bot files, `BotKilled` = this bot died and `BotKill` = this bot killed someone. x/z is always the owner's position | Categories are from the owner's view: `kill` = owner killed, `death` = owner died | Handled (`journeys.categorize_events`); tooltip wording in Stage 4 |
| EC-12 | `Kill`/`Killed` only appear as same-second pairs; cause unknown | 3 `Kill` and 3 `Killed` rows in the whole dataset, as 3 pairs (cases P1–P3), each in one UUID file: adjacent rows, same second, identical x/y/z, journey ends 0–2 s later, no other recorded file in the match. No `Kill` occurs without a same-second `Killed`; by comparison, 2 of 400 human `BotKilled` seconds have a `BotKill` in the same second. Identical x/y/z proves nothing (every event carries the owner's position, EC-11), and 743 of 796 matches record one file, so an unrecorded opponent can't be ruled out ([evidence]({E}kill_killed_pairs.md)) | Both rows kept with original label, time and position, flagged `kill_killed_pair`. `Killed` → death; the paired `Kill` is shown on the map but left out of kill counts and the kill heatmap; pairs are counted separately. Tooltips say the cause is unknown | Handled (`test_ec12_kill_killed_pair_keeps_both_events`, `test_ec12_real_kill_killed_pairs_keep_both_events`, `test_ec12_no_self_kill_category_anywhere`, `test_ec12_paired_kills_are_in_match_files_but_not_in_kill_totals`, `test_ec12_evidence_lists_both_events_of_each_pair`) |
| EC-13 | No extraction event | 339 of 781 human journeys end without a death (shortest 86 s); 16 of the 17 unknown journeys also end without one | Any extraction layer is labelled **inferred** | Found (Stage 3+) |

## Journeys and paths
| ID | Edge case | Evidence | Handling | Status |
|---|---|---|---|---|
| EC-14 | Rows after death | 174 human journeys log rows 1–6 s after their first death, almost always at the death spot. After removing doubled journeys: 173 positions in 172 journeys, plus 2 `BotKill`s | D2: positions after the first death dropped from paths, playback and traffic; same-second rows kept; the 2 late `BotKill`s kept with `after_death: true` | Handled (`test_ec14_positions_after_death_dropped_other_events_flagged`, `test_ec14_no_path_point_after_first_death`, `test_ec14_real_post_death_counts`) |
| EC-15 | Duplicate death rows | Two identical `BotKilled` rows in `da9a800a_fc797a67` and `51b60c09_0954f788`, both doubled journeys | Removed with the copied halves (EC-29) | Handled (EC-29 tests) |
| EC-16 | Sampling gaps | Positions mostly every 5 s; 312 gaps > 30 s in the raw data (311 after cleaning); longest 518 s | Paths split at gaps > 30 s; traffic isn't traced across them | Handled (`test_ec16_segments_split_only_at_gaps_over_30_s`, `test_one_file_per_match_and_paths_inside_map`) |
| EC-28 | A player covers about one heatmap cell between samples | Median 13 units per 5 s step vs 64×64 cells of 14.1 (AV), 9.1 (GR), 15.6 (LD) units | D5: each step's time is spread along its straight line across the cells it crosses. An approximation: the real route is unknown | Handled (`test_ec28_traffic_spreads_step_time_and_skips_long_gaps`, `test_ec28_diagonal_step_visits_every_crossed_cell`) |

## Maps and coordinates
| ID | Edge case | Evidence | Handling | Status |
|---|---|---|---|---|
| EC-17 | Minimaps aren't 1024 px | AmbroseValley 4320², GrandRift 2160×2158, Lockdown 9000² | Store UV (0–1). WebP at `min(original, 4096)` px: 4096², 2160×2158, 4096² | Handled (`test_ec17_real_minimap_sizes`, `test_web_size_never_upscales`, `test_ec17_minimap_written_as_webp_without_upscaling`) |
| EC-18 | Image y runs downward | GrandRift overlays with and without the flip in `docs/evidence/` | `py = (1 − v)·H` | Handled (`test_world_corners_land_on_image_corners`, `test_orientation_x_right_z_up`) |
| EC-19 | GrandRift has dark artwork inside the map | Roads and some building art are near-black; 4.0 % of positions sit on near-black pixels with the correct mapping | D4: production mapping kept while the maths tests pass; overlays are reviewed evidence; no pixel-colour threshold; final rendered check in Stage 3 | Handled (`test_projection.py`; `docs/evidence/grandrift_validation.md`) |
| EC-20 | The minimaps have no transparency | Alpha is 255 on every pixel; the off-map area is opaque black | No alpha- or colour-based test; WebP drops the alpha channel | Handled (by design) |
| EC-21 | GrandRift isn't square | 2160×2158 with one scale for both axes | Width and height scaled separately; ≤ 0.1 % y-stretch accepted | Handled (`test_ec21_grandrift_non_square_image_scales_axes_separately`) |
| EC-22 | `y` is elevation | Each map has its own height band | `world_to_uv` takes only x and z | Handled (by design) |

## Dates and samples
| ID | Edge case | Evidence | Handling | Status |
|---|---|---|---|---|
| EC-23 | Folders aren't strict UTC days | 4 matches start before their folder's day; 3 cross UTC midnight. Match `e325a53a` is one continuous journey starting 2026-02-09 23:58:55 (verified) | D1: date = UTC date of the match's first event. Dates generated from the data: 02-09 (1), 02-10 (287), 02-11 (197), 02-12 (162), 02-13 (112), 02-14 (37) | Handled (`test_ec23_real_dates_are_generated_from_data`, `test_ec23_match_crossing_midnight_has_one_date`) |
| EC-24 | Partial days | The observed collection window runs 02-09 23:58:55 → 02-14 15:01:40; the data README says Feb 14 is partial | `boundary` (first/last date) and `partial` (window covers < 24 h of the day) are separate flags, each with the observed window. Both boundaries are partial here | Handled (`test_ec23_boundary_dates_are_partial_only_when_the_window_cuts_the_day`) |
| EC-25 | Most matches have one recorded player | 743 of 796 single-file; only 52 matches have bot files | Heatmaps from human journeys only; match picker sorts busiest first (Stage 3) | Handled for heatmaps (`test_heatmap_death_totals_equal_human_deaths`) |
| EC-26 | Small samples on GrandRift | 59 matches, 30 human deaths | Heatmap files carry `samples` per date: matches and human journeys (journeys, not rows; definition in spec 02). Event counts are in `totals`. The UI must show them | Found (pipeline part done; display in Stage 6) |
| EC-27 | Player IDs are real account IDs | 245 UUIDs | 8-character pseudonym in every output, the build report, docs and tests | Handled (`test_ec27_short_ids_are_unique`, `test_ec27_no_real_player_id_in_any_output`, `test_ec27_no_numeric_player_id_or_uuid_prefix_in_any_output`) |
| EC-30 | Remaining identifiers in outputs and docs | Pseudonyms are unsalted `sha1(user_id)[:8]`, so the 94 numeric IDs (4-digit) can be recovered by trying each; match files and the index carry the full match UUID (`full_id`); EC-04, EC-05, EC-23 and EC-29 name journeys by pseudonym and match prefix | Kept as they are: no salting, `full_id` stays, rows unchanged | Resolved: S decided privacy hardening is out of scope for this assignment. Raw player UUIDs still never leave the pipeline (EC-27) |

## Decisions (all approved by S)
| # | Question | Decision |
|---|---|---|
| D1 | What does "date" mean? | UTC date of the match's first recorded event, shown as the observed start date. Dates, boundary and partial flags are generated from the data (spec 03 reads them from `index.json`) |
| D2 | Rows after death | Exclude post-death `Position` rows from paths and traffic; keep death markers. Keep the 2 late `BotKill`s, flagged `after_death` |
| D3 | Duplicates | Read identical files once. For journeys whose second half is an exact copy of the first, keep the first half (190 rows removed). Never remove a row only because it looks identical to another |
| D4 | Alignment checks | Maths tests are mandatory pass/fail; the production mapping is kept while they pass. Overlays are reviewed evidence. No near-black threshold. Final rendered check in Stage 3 |
| D5 | Traffic between samples | Trace straight lines between samples ≤ 30 s apart and spread the time across crossed cells |
| D6 | Numeric-ID journeys with player-client events (EC-09) | Counted as `human`, flagged `id_mismatch` (2026-10-24; was `unknown`, left out of human counts and heatmaps) |
| D7 | Same-second `Kill`/`Killed` pairs (EC-12) | Keep both events, flagged `kill_killed_pair`; no self-kill category and no claim about the cause |
