# Frontend ↔ data verification (2026-10-24)

Does the web app show the numbers the pipeline produced? The forensic audit (`../forensic_audit/`) reproduced the generated
files. This check covers the step after that: what the browser renders from them.

## Method
1. **Sources agree with each other** (`crosscheck_sources.js` → `sources_report.json`). For every map × date: index.json
   counts vs stats.json samples and totals; heatmap totals and samples vs stats.json; heatmap cells sum to their totals;
   zone totals, shares and hotspot order vs the heatmaps; every match file vs its index row. **8,011 checks, 0 mismatches.**
   Traffic cells are stored to 0.1 s and totals to 1 s, so cell sums may differ by the rounding (≤ 0.05 s per cell).
2. **Where each visible value comes from.**
   - The stats pages read `stats.json` and only format (`stats/comparison.ts`, `figures.ts`, `slices.ts`).
   - The Heatmaps summary *derives* its ratios from the heatmap file and `index.json` (`heatmap/evidence.ts`).
   - The Journeys list counts `index.json` rows. The match card shows the match's index row; the legend counts markers in
     the match file (`map/journeys.ts`).
3. **Rendered text vs independent expectation** (`verify_rendered.mjs` → `rendered_report.json`). Headless Chrome against
   the dev server, 1440 × 900, every map × date. Each expected string is computed from the JSON by the script itself, with
   no frontend code imported. **815 checks, 0 mismatches, 0 page exceptions** (after the fix below).
4. Regression tests: `web/src/stats/crosspage.test.ts` checks, for all 21 map × date slices, that the Heatmaps summary and
   the stats pages give the same text for the same metric, that rounding matches `stats.py`, and that the Journeys list
   counts `matches`.

## Defect found and fixed
| | Before | After |
|---|---|---|
| Heatmaps "kills per match" | kills ÷ matches with a human, 1 decimal: AmbroseValley all dates **3** | "kills per human journey", kills ÷ human journeys, 2 decimals: **2.99**, equal to the stats pages' kill rate |
| Heatmaps "deaths per match" | deaths ÷ matches, 1 decimal: **0.6** | "of human journeys ended in a recorded death": **56.9%**, equal to the stats pages' figure |
| Heatmaps percentages | whole percent (57%) | one decimal, as on the stats pages |
| Stats pages | "Matches played" = human journeys; "Kills per match"; "avg per player" | "Human journeys"; "Kills per human journey"; "mean over human journeys" |

The calculation was right in both places. The defect was one label used for two different denominators at two
precisions. No pipeline value changed.

## Matrix (AmbroseValley, all dates, unless named; all rows: displayed = expected)
| Metric / component | Data source | Expected | Displayed | Result |
|---|---|---|---|---|
| Overview tile: Human journeys (all maps) | stats.json `all/all` human_journeys | 781 | 781 | match |
| Overview scope line (all maps) | stats.json sample | 781 human journeys in 780 matches · 245 players observed · all dates | same | match |
| Overview tile: Kills per human journey (all maps) | stats.json kill_rate | 2.85 | 2.85 | match |
| Overview tile: Storm deaths (all maps) | stats.json storm_death_rate | 4.99% | 4.99% | match |
| Map report scope line | stats.json sample | 554 human journeys in 553 matches · 217 players observed · all dates | same | match |
| Map report: journeys ending in a recorded death | stats.json journeys_with_death | 56.9% | 56.9% | match |
| Map report: median time to first loot | stats.json first_loot_s.median | 0:41 | 0:41 | match |
| Heatmaps traffic: estimated player time | heatmap total = stats.json movement_time_s.sum | 3,477 min | 3,477 min | match |
| Heatmaps kills: kills per human journey | stats.json kill_rate | 2.99 | 2.99 | match |
| Heatmaps kills: share of matches with a kill | index.json (423 of 553) | 76.5% | 76.5% | match |
| Heatmaps deaths: storm deaths | stats.json deaths.parts.storm | 17 (5.4%) | 17 (5.4%) | match |
| Journeys list | index.json matches = stats.json matches | Matches 566 | Matches 566 | match |
| GrandRift 2026-02-13 kills per human journey (few matches) | stats.json kill_rate | 1.40 | 1.40 | match |
| Match card + legend, 15 sample matches (top kills, bots, pairs, unknown, storm, two humans per map) | index.json row; match file | 183 values | 183 values | match |

| Page | Checks | Map × date scopes | Mismatches |
|---|---|---|---|
| Overview (tiles, scope line, map cards, comparison strip) | 196 | 7 dates × (all maps + 3 maps) | 0 |
| Map report (tiles, scope line, Combat, Loot, empty states) | 223 | 21 | 0 |
| Heatmaps summary (3 layers, empty states) | 213 | 21 | 0 |
| Journeys (list count, match card, legend) | 183 | 21 + 15 matches | 0 |

**Populations that differ on purpose** (and are now named apart): AmbroseValley, all dates, has 566 *matches* (the
Journeys list), 553 *matches with a human journey* and 554 *human journeys* (one match has two humans).

## Not covered
- Hotspot detail values were checked at the source level (zone shares, totals and order vs the heatmaps), not by
  clicking each outline in the browser.
- Heatmap colour classes and thresholds are covered by the existing unit tests (`heatmap/scale.test.ts`,
  `legend.test.ts`), not by this script.
- Journey-card statistics (distance, recorded window) are computed in the browser from the match file
  (`actorStats`) and covered by `map/journeys.test.ts`.
- First-load count-up: on the first Overview load, headless Chrome caught the 900 ms count-up mid-run. The screen-reader
  copy already held the final value, and the visible value matched once the animation finished. The script waits for
  it (a timing artefact, not a defect).
