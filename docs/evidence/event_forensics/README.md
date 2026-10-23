# Event forensics

## Why this was done
Two Stage 2 rules contradicted the data README, so both were re-checked on the raw parquet rows before the classification and event handling were approved:

- **A.** The README says numeric IDs are bots and that bots log `BotPosition`. 17 journeys have numeric IDs but log `Position` and `Loot`. The pipeline had classified them as human.
- **B.** The README says `Kill`/`Killed` are human-vs-human events. The pipeline had merged the 3 same-second `Kill`/`Killed` pairs into single "self-kill" events.

## Findings and decisions
| | Finding | Decision |
|---|---|---|
| A (EC-09, EC-10, D6) | 17 journeys (3 actors, 17 matches) log player-client events, not bot events. The data doesn't show whether a person played them, and one of the actors is a bot in 3 other matches | Classified **unknown**: kept and labelled in match views; left out of human counts and human heatmaps |
| B (EC-12, D7) | Each pair is two rows from one human file in the same second. The rows don't show whether this was a self-inflicted death or a trade with an unrecorded player | Both events kept, flagged `kill_killed_pair`; no self-kill category, and no cause claimed |

## Files
| File | Purpose | What it shows |
|---|---|---|
| [actor_classification.md](actor_classification.md) | Investigation A | The README's two rules, how the 17 journeys break one of them, the evidence for and against "human", and why `unknown` was chosen |
| [actor_classification.csv](actor_classification.csv) | One row per unknown journey (U01–U17) | Map, date, raw and kept event counts, duration, speed and death flags, who else is in the match, final class and reason |
| [kill_killed_pairs.md](kill_killed_pairs.md) | Investigation B | The three pairs, why "self-kill" was unsupported, and how the pairs are now stored and shown |
| [kill_killed_pairs.csv](kill_killed_pairs.csv) | One row per event (P1–P3, two events each) | Raw label, match time, same second / same position as the partner, rows and seconds left in the file, and how the pipeline types and counts each event |
| [heatmap_impact.md](heatmap_impact.md) | Effect of decision A | Human heatmap totals per map and layer, with and without the unknown journeys |
| [forensics_summary.json](forensics_summary.json) | Every number used in these pages | Ownership checks, event profiles by group, behaviour, match shapes, bot spawn delays, pair base rates, heatmap comparison |

No file holds a player ID, a match ID or a shortened or hashed form of either. Journeys are case IDs (U01–U17, P1–P3), and the three unknown actors are letters A–C. No raw parquet rows are included.

## Reproducing
The raw data (`data/raw/player_data/`, not in git) has to be unzipped first. Then:

```
cd pipeline
uv run python tools/event_forensics.py          # rewrites the .csv and .json files here
uv run pytest tests/test_event_forensics.py     # fails if the files here are stale or hold an ID
```

`tools/event_forensics.py` reads the parquet files with the pipeline's reader (`ingest.load_journeys`, no cleaning). It then groups the files on its own by ID format and by whether they log `BotPosition`, and asserts that this grouping matches the pipeline's `unknown` class. The heatmap comparison reuses the pipeline's grid functions (`heatmaps.count_grid`, `heatmaps.traffic_grid`). The `.md` pages are written by hand from `forensics_summary.json` and the CSVs.

Counts here are from the raw rows as read: 1,242 files and 89,016 rows after the one byte-identical duplicate file is skipped (EC-04). The cleaned pipeline counts are in [`../build_report.json`](../build_report.json).
