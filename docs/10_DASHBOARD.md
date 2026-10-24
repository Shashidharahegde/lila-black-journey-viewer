# 10 — Overall statistics dashboard (optional — after feature 8, before the chatbot)

## Goal
One page that answers "what does the whole dataset look like?" across five sections: engagement, combat and survival, map comparison, loot, and movement. It can be scoped to all maps or one map, and to all dates or one date.

The numbers come from **one Python implementation** that runs in `make data` and writes `web/public/data/stats.json`. The dashboard draws that file, and the chatbot (spec 09) will answer statistics questions by reading the same file. Neither one computes a statistic of its own.

Figures in this spec come from running code on the generated files in `web/public/data/` (2026-10-22). Commit 1's tests enforce them.

## The problem in depth
- **Two consumers, one truth.** If the dashboard computed in TypeScript and the chat in its own tools, the two would drift. Python already owns cleaning, coordinates and heatmaps, so it owns statistics too. The site and the chat only read and format.
- **Unique counts and medians don't add up.** 245 human players were observed in total. Counting the unique players on each map separately gives 217 + 29 + 79 = 325, because 62 players were seen on more than one map. Medians and quartiles can't be combined across slices either. So every map × date combination is computed from the journeys themselves, and nothing is ever summed or averaged across slices (by the pipeline, the UI or the chat).
- **"Returning player" isn't retention.** The data is a 5-day sample of recorded journeys, under pseudonyms. A player seen twice is *observed repeat activity in this window*. We don't know about play outside the window, matches that weren't recorded, or whether an account is shared. In a single-date slice, "repeat" means "seen in more than one journey that day".
- **Two different "time played" numbers.**
  - *Recorded span* is the time from a journey's first to its last record.
  - *Movement time* is the time inside path segments (gaps ≤ 30 s). It is exactly what the traffic heatmap counts.

  They differ whenever a journey has a gap over 30 s (median difference 3 s, largest 605 s), so they are kept as separate metrics. Neither one is called "session length" or "playtime".
- **Kills and deaths have exact existing definitions** (spec 06, EC-12): kills = counted kills (the `Kill` of each Kill/Killed pair left out); deaths = `BotKilled` + `KilledByStorm` + the paired `Killed`. The 3 pairs are shown as their own count with "cause unknown". They are never dropped quietly and never called PvP or self-kills.
- **No extraction event** (EC-13). Journeys without a recorded death (339 of 781) are labelled "no death recorded". If a chart calls them extractions at all, it says "inferred".
- **Distance is a lower bound.** It is measured along straight lines between samples about 5 s apart, inside segments only. Gaps over 30 s add nothing.
- **Grid coverage isn't "% of map explored".** The 64 × 64 grid spans the whole minimap square, including off-map and unreachable areas. Cells differ in size by map (14.1 / 9.1 / 15.6 world units), and more journeys reach more cells. Coverage is therefore stated as "grid cells with observed human traffic" and is only computed per map.
- **Thin slices and partial days.**
  - GrandRift has 57 matches with a human journey.
  - Some map × date slices have 1–9 matches; three have none: GrandRift and Lockdown on 2026-02-09 have no human journey, and AmbroseValley on 2026-02-09 has 1.
  - 2026-02-09 and 2026-02-14 are partial boundary days (EC-24).

  Every slice carries its sample size and flags.
- **Stale files.** The dashboard and the chat must be able to prove that they read the same statistics, built from the same generated data.

## Decisions
| Choice | Decision | Why |
|---|---|---|
| Where statistics are computed | Python, `pipeline/src/lila_pipeline/stats.py`, run by `make data`; output `web/public/data/stats.json` (S, 2026-10-22, option A) | One implementation, tested with pytest next to the heatmaps; static site; no analytics API |
| Consumers | Dashboard (this feature) and chatbot tools (feature 9) read `stats.json` as it is | Map, dashboard and chat can't disagree |
| Order | After feature 8 is ready to submit, before the chatbot (S, 2026-10-22) | The chat reads this file |
| Scopes | Every map scope (`all` and each map) × every date scope (`all` and each date in `index.json`) is precomputed. All 28 slices are always present: an empty slice says `empty: true` and has `null` values | Unique counts and medians can't be combined from parts; no missing-key cases (unlike heatmaps, spec 06) |
| Population | Human journeys (EC-09), after cleaning (D2, D3). Bot and `unknown` journeys are left out of every metric except the match counts. The sample block reports the left-out journeys | Same population as `index.json` counts and the heatmaps |
| UI components | shadcn/ui: `Card`, `Tabs`, `Select`, `ToggleGroup`, `Tooltip`, `Skeleton`, `Badge` and shadcn **Chart** (built on Recharts), installed with the shadcn CLI as for every other component (S, 2026-10-22) | Same kit and tokens as the map; no second styling system |
| Chart colours | Chart variables mapped to the existing tokens: human metrics use human blue; kill / death / storm / loot series use the gameplay tokens from `encoding.ts`; single-series charts use `brand`. No per-map colours (maps are named on the axis) | Consistent encoding (guidelines §4) |
| Percentiles | Median = middle value, or the mean of the two middle values when the count is even. Quartiles use linear interpolation (numpy's default). Stored with up to 1 decimal | Standard and documented; the UI never recomputes them |
| Ratios | Stored as `numerator`, `denominator` and `value` (4 decimals). The UI formats `value` as a percentage | The chat can quote the exact stored figures |
| Version | `schema_version` (file format), `metrics_version` (bumped when any definition changes) and `source.fingerprint` (a hash of the generated data files the statistics were built from) | The dashboard and the chat can check that they read the same, current statistics |

## Metrics
Every metric is listed in `stats.json` under `metrics` with these same fields, so the dashboard's info tooltips and the chat's explanations use this text.

**Shared definitions**
- **Human journey:** one human file in one match, after cleaning.
- **Match time `t`:** seconds since the match's first recorded event. Every human journey starts at `t = 0` (all 781; tested), so match time is also journey time for humans.
- **Slice:** one map scope × one date scope. A match's date is its UTC start date (D1).

### Engagement
| ID | Label | Unit | Definition | Population / denominator | Limitations |
|---|---|---|---|---|---|
| `human_journeys` | Human journeys | journeys | Count of human journeys in the slice | — | Recorded journeys only; most matches have one recorded human (EC-25) |
| `human_players` | Players observed | players | Distinct player pseudonyms with a human journey in the slice | — | Pseudonyms, not people; **never add across slices** |
| `repeat_players` | Players seen more than once | ratio | Players with ≥ 2 human journeys in the slice | ÷ `human_players` | Observed repeat activity in this window, **not retention**; a single-date slice only sees that day |
| `journeys_per_player` | Journeys per player | journeys | Distribution and histogram (bins 1, 2, 3, 4–5, 6–10, 11+) | Over `human_players` | Same as above |
| `players_by_days_observed` | Days a player was seen | players | Histogram of distinct UTC dates per player, one bin per day count from 1 to the number of dates in `index.json` (6 today; S, 2026-10-23) | Over `human_players`; date = `all` slices only (`null` for one date) | Partial boundary days shorten the window |
| `journey_span_s` | Recorded journey span | seconds | Last record − first record of the journey (positions and events; rows after death excluded, D2). Distribution + histogram (60 s bins, 0–900 s) | Over `human_journeys` | Not a session length; recording may start late or stop early |

### Combat and survival
| ID | Label | Unit | Definition | Population / denominator | Limitations |
|---|---|---|---|---|---|
| `kills` | Kills | events | Counted kills in human files: `kill` rows that aren't half of a Kill/Killed pair; `after_death` kills count (as in spec 06 and `index.json`) | — | All counted kills are `BotKill` in this data (no unpaired `Kill`); position = where the killer stood |
| `deaths` | Deaths | events | `death` + `storm_death` rows in human files; split into `by_bot` (`BotKilled`), `storm` (`KilledByStorm`) and `paired_killed` (the `Killed` of a pair) | — | No human journey has more than one death (tested) |
| `kill_killed_pairs` | Kill/Killed pairs | pairs | Same-file, same-second `Kill` + `Killed` (EC-12) | — | Cause unknown: never called self-kills or PvP |
| `journeys_with_death` | Journeys that ended in a death | ratio | Human journeys with a death row | ÷ `human_journeys` | The rest are "no death recorded"; extraction is not recorded (EC-13), so any extraction label says "inferred" |
| `death_time_s` | When deaths happen | seconds (match time) | Distribution + histogram (60 s bins) split by cause | Over deaths | Storm deaths fall at 655–887 s (10:55–14:47) |
| `kills_per_journey` | Kills per journey | events | Distribution | Over `human_journeys` (zeros included) | Sums to `kills`. The clicked-route card leaves the 2 `after_death` kills out, so it can differ by one for those two journeys |

### Map comparison
Read from the three single-map slices at the chosen date. **There is no comparison metric that sums or combines slices.**
| ID | Label | Unit | Definition | Limitations |
|---|---|---|---|---|
| `matches` | Recorded matches | matches | All matches in `index.json` for the slice, with or without a human | 16 matches have no human journey (bot-only or `unknown`-only) |
| `matches_with_human` | Matches with a human journey | matches | Equals heatmap `samples.matches` | The sample every human metric rests on |
| Per-map values of the other metrics | — | — | The same metric read from each map's slice | Sample sizes differ by about 10× (AmbroseValley 553 vs GrandRift 57 matches with a human); always shown next to each bar |

### Loot
| ID | Label | Unit | Definition | Population / denominator | Limitations |
|---|---|---|---|---|---|
| `loot_events` | Loot pickups | events | `loot` rows in human files | — | Several pickups can share one second (EC-03); none are deduplicated (D3) |
| `journeys_with_loot` | Journeys with any loot | ratio | Human journeys with ≥ 1 loot row | ÷ `human_journeys` | — |
| `loot_per_journey` | Loot per journey | events | Distribution | Over `human_journeys` | — |
| `first_loot_s` | Time to first loot | seconds | `t` of the journey's first loot row. Distribution + histogram (15 s bins, 0–300 s, plus an overflow bin) | Over journeys with loot only; the count without loot is shown beside it | Shows when a pickup was logged, not when the player reached the item |

### Movement and exploration
| ID | Label | Unit | Definition | Population / denominator | Limitations |
|---|---|---|---|---|---|
| `movement_time_s` | Estimated movement time | seconds | Sum of gaps between consecutive positions inside segments (≤ 30 s, D5). Total + per-journey distribution | Over `human_journeys` | Equals the traffic heatmap `totals` exactly; an estimate, not measured playtime; separate from `journey_span_s` |
| `distance` | Distance travelled | world units | Sum of straight-line steps inside segments, `hypot(Δu, Δv) × map scale`, from unrounded UV. Total + distribution + histogram (250-unit bins, 0–3000) | Over `human_journeys` | A lower bound (5 s sampling, straight lines); gaps over 30 s add nothing; the clicked-route card computes from 4-decimal UV, so it may differ slightly (at most 0.81 world units per journey, measured 2026-10-23; tests allow 1) |
| `grid_cells_observed` | Grid cells with observed human traffic | ratio | Non-zero cells of the published traffic layer for the slice | ÷ 4,096 (the 64 × 64 grid); **per-map slices only** (`null` for all maps) | The grid includes unreachable and off-map area; cell size differs by map; grows with sample size, so maps with different samples aren't directly comparable. Today: AmbroseValley 1,619 (39.5 %), GrandRift 1,258 (30.7 %), Lockdown 1,100 (26.9 %) |

### Level-design KPIs (metrics_version 2; S, 2026-10-23)
The stats pages show only the KPIs below plus human journeys, players and the median journey span. The movement, repeat-player and days-seen metrics above stay in the file (the chat reads them) but are no longer shown.
| ID | Label | Unit | Definition | Population / denominator | Limitations |
|---|---|---|---|---|---|
| `kill_rate` | Kills per journey (average) | kills per journey | `kills` ÷ `human_journeys` | `human_journeys` | A rate, so maps of different sample sizes compare; the total is `kills` |
| `loot_rate` | Loot per journey (average) | pickups per journey | `loot_events` ÷ `human_journeys` | `human_journeys` | Same |
| `storm_death_rate` | Storm deaths per 100 journeys | storm deaths per 100 journeys | `deaths.parts.storm` × 100 ÷ `human_journeys` | `human_journeys` | Storm deaths only happen late in a match |
| `map_score` | Map performance score | score 0–1 | The maps with a human journey at the same date, compared on human journeys, median `journey_span_s`, `kill_rate`, `loot_rate` (higher is better) and `storm_death_rate` (lower is better). Each part is scaled best map = 1, worst = 0 (all equal: 0.5); the score is their equal-weight mean | Per map only; `null` for all maps and when fewer than two maps have a human journey | A ranking between maps, not a quality measure: with three maps the extremes always get 0 and 1; the weights are a design choice. Today (all dates): AmbroseValley 0.77, GrandRift 0.49, Lockdown 0.25 |

Value shapes: `rate` is `{ "numerator", "denominator", "per", "value" }` (value = per × numerator ÷ denominator, 2 decimals); `score` is `{ "value", "parts": { <part>: 0–1 }, "maps" }`. The score compares map slices of one date and never adds their values together.

### Sample block and flags (every slice)
| Field | Meaning |
|---|---|
| `matches`, `matches_with_human`, `human_journeys`, `human_players` | As above |
| `excluded.bot_journeys`, `excluded.unknown_journeys` | Journeys in the slice left out of human metrics |
| `flags.empty` | No human journey in the slice; all values `null` |
| `flags.few_matches` | `matches_with_human` < 10 (the existing "Few matches" rule, guidelines P7) |
| `flags.partial_date`, `flags.boundary_date` | Copied from `index.json` dates (EC-24); for date = `all`, true if any included date is partial |
| Per-metric `n` | Distributions carry their own `n`; a distribution with `n` < 10 is marked `few_values` (e.g. GrandRift death times on 2026-02-13, n = 4) |

## Data contract: `web/public/data/stats.json`
```
{
  "schema_version": 1,
  "metrics_version": 2,
  "source": { "fingerprint": "sha256:<16 hex>", "files": <count of generated files hashed> },
  "thresholds": { "few_matches": 10, "few_values": 10 },
  "grid": 64,
  "maps": ["AmbroseValley", "GrandRift", "Lockdown"],
  "dates": [ { "date", "partial", "boundary", "observed_from_utc", "observed_to_utc" } ],   (copied from index.json)
  "metrics": {
    "<metric id>": { "label", "section", "unit", "kind": "count|ratio|rate|distribution|histogram|breakdown|score",
                     "definition", "population", "denominator", "limitations": [ "..." ], "scopes": "all|per_map" }
  },
  "slices": {
    "<all|map>": { "<all|date>": {
        "sample": { "matches", "matches_with_human", "human_journeys", "human_players",
                    "excluded": { "bot_journeys", "unknown_journeys" } },
        "flags":  { "empty", "few_matches", "partial_date", "boundary_date" },
        "values": { "<metric id>": <value or null> } } } }
}
```
Value shapes by `kind`:
- `count`: `{ "value": 2223 }`
- `ratio`: `{ "numerator": 442, "denominator": 781, "value": 0.5659 }`
- `distribution`: `{ "n", "min", "p25", "median", "p75", "max", "sum", "few_values" }`. A metric with bins (span, journeys per player, death time, first loot, distance) also has `"histogram": { <histogram shape> }` inside its distribution (S, 2026-10-23). With `n` = 0 the statistics are `null` and `sum` is 0
- `histogram`: `{ "edges": [0, 60, ...], "counts": [...], "overflow": 0, "n" }`. A split histogram has `"series": { "by_bot": [...], "storm": [...], "paired_killed": [...] }` in place of `counts`
- `breakdown`: `{ "value": 442, "parts": { "by_bot": 400, "storm": 39, "paired_killed": 3 } }`

Rules:
- Deterministic like every other generated file: no build timestamps, sorted keys, the same input gives byte-identical output.
- **Fingerprint:** SHA-256 over the bytes of `index.json`, the three heatmap files and every match file, in sorted path order. `stats.json` itself isn't included. A test recomputes it from disk, so a stale `stats.json` fails `make test`.
- **Version check by consumers:** the dashboard and the chat each declare the `metrics_version` they were written for. On a mismatch the dashboard shows an error state ("Statistics are out of date: run `make data`"), and the chat tool returns an error rather than an answer. Both show the fingerprint's first 8 characters (dashboard: in its About popover; chat: in its evidence).
- Player pseudonyms never appear in `stats.json` (covered by the existing EC-27 output scan, which reads every JSON file).
- Size: 28 slices × 25 metrics, 86,410 bytes (2026-10-23, metrics_version 2; the build report records it).
- Keys are sorted, so in the file `all` comes after the map names; order only matters for display.

### How the chatbot will use it (feature 9; recorded here so the contract fits)
- A `get_stat(metric, map?, date?)` tool returns the metric definition, its value, the slice's `sample` and `flags`, `metrics_version` and the fingerprint. The answer quotes those fields; it never computes across slices.
- `compare_maps` reads the three map slices for a date and returns each map's sample next to its value.
- The chat's "Small sample" warning uses `flags.few_matches` and each slice's `sample`, not its own threshold. There is no second "Limited sample" level (O2), so spec 09's "GrandRift: 59 matches must be flagged" check is replaced by quoting the sample size.
- Spec 09 gets these changes when feature 9 starts.

## Dashboard (UI)
- **Route:** `/stats?map=&date=&section=` (O1, decided below). It is the landing page: `/` and unknown paths open the all-maps Overview (a `/` link with a query string is a legacy map link and goes to Explore). The scope lives in the URL (guidelines P16), and Back/Forward work. Invalid values are corrected with a replace, as on the map. Legacy `tab=` links still work (`statsUrl.ts`).
- **Navigation** (same bar on every page): "LILA BLACK" on the left; Overview · Explore · AI Chat in the centre; the page's date filter and the theme toggle on the right. The map filter sits in the row below, because it sets the data context. Explore's Heatmaps and Journeys & Playback tabs are the level under that. The nav's Overview link keeps the date and never opens a single map.
- **Scope controls:**
  - Map: `ToggleGroup` with All maps · AmbroseValley · GrandRift · Lockdown. Four exclusive options, so it follows the segmented-control rule in guidelines §6.
  - Date: `Select` with All dates and each date, partial dates labelled "Partial".
  - Map comparison ignores the map control: every map always shows.
- **Overview (all maps):** a cinematic hero with a modest title and the scope line ("781 human journeys in 780 matches · 245 players observed · all dates", plus a "Few matches" badge when it applies); six compact KPI tiles with icons (human journeys, players observed, median recorded span, kills and items looted per human journey, storm deaths as % of human journeys; wording from `stats/terms.ts`), each with its reference point; map comparison cards compared on matches played by default, marked "Leading" / "Needs improvement" ("Compare on" switches the KPI; a card selects, its chevron opens the report); Key insights (who leads and who has the most room to improve and on which measures, where the storm catches players most, where players find the least loot), each a finding plus something to check, without the card values; a strip of small charts (donut: share of matches played per map, valid because each match played belongs to one map; bars: kills, items and storm deaths per map, selected map highlighted); the map scorecard (per map: standing, relative score out of 100 with its scale, rank, and the measures it leads on or has room to improve on).
- **Map report (`?map=`):** a hero banner with "Explore this map" (no Share or Copy link); the same six KPI tiles; a section sidebar (vertical from 1024 px, a scrolling row below it): Overview · Combat & survival · Loot.
  - Overview: the map's standing (relative score out of 100, rank, measures it leads on or has room to improve on; no values repeated from the tiles), recorded span histogram, and a link to Explore → Heatmaps (there are no named locations to list).
  - Combat & survival: deaths and human journeys ending in a recorded death (kills and storm deaths are in the tiles); death causes; when deaths happen. Loot: human journeys with any loot, median time to first loot; its histogram.
  - Every chart has axis titles with units.
  - Each figure and chart has an info `Tooltip` with the definition, population, denominator and limitations from `metrics`.
  - The reference designs' "return rate", "% in combat" and "survival time" have no stored metric, so they are never shown or approximated; the nearest stored metric is shown under its own name.
- **Charts** (shadcn `ChartContainer` + Recharts):
  - Journey span histogram; journeys-per-player bars; days-observed bars.
  - Death timing as a stacked histogram by cause.
  - Matches per map (recorded vs with a human, side by side, sample next to each bar).
  - Time to first loot histogram.
  - Distance histogram.
  - Grid coverage as a per-map figure, not a chart (it isn't comparable as a bar).
  - No pie charts; no smoothing; bins exactly as stored.
- **Accessibility:** every chart has a visually hidden data table with the same numbers, and an `aria-label` summary. Colour is never the only way to tell series apart: series are named in the legend and tooltip, and stacked series keep a fixed order.
- **States:** a `Skeleton` while loading (reserved size, no layout shift); an error state for a load failure or a `metrics_version` mismatch; an empty state for an `empty` slice ("No human journeys recorded on GrandRift on 2026-02-09").
- **Formatting only in the UI:** seconds → mm:ss or minutes, ratios → percentages, thousands separators. All of it is pure functions with Vitest tests; no statistic is computed in the browser.

## Implementation
**Commit 1 — `data: add overall statistics to the pipeline`**
- `pipeline/src/lila_pipeline/stats.py` (new): per-journey table from `prepared.events`, slice builder, metric definitions, fingerprint.
- `build.py`: write `stats.json` after the other files, and add its size and slice count to the build report.
- `docs/02_DATA_PIPELINE.md`: add `stats.json` to the output-format list, with a pointer to this spec.
- `pipeline/tests/test_stats.py`:
  - **Contract:** every key in the contract above; 28 slices; every metric in `metrics` has every documented field; value shapes by kind; byte-identical rebuild.
  - **Definitions on small synthetic journeys:** median for odd and even counts; a Kill/Killed pair counts as a pair and its `Killed` as a death; a gap over 30 s adds no distance or movement time; an `after_death` kill counts; an empty slice has `null` values.
  - **Reconciliation against `index.json`:** for every slice, `matches`, `kills`, `deaths` (with `storm` and `paired_killed`), `loot_events` and `kill_killed_pairs` equal the sums of `index.json` `counts` for the matches in that slice.
  - **Reconciliation against the heatmaps:** for every map × date key, `kills` and `deaths` equal heatmap `totals`; `movement_time_s.sum` equals traffic `totals` (within the 0.1 s rounding); `matches_with_human` and `human_journeys` equal `samples`; `grid_cells_observed.numerator` equals the number of traffic cells; a map × date slice with no heatmap key is `empty`.
  - **Reconciliation against the match files:**
    - Every distribution is recomputed from the human actors in the match files and must match: span, kills, loot, first loot and death times exactly (integer seconds); distance within the measured UV-rounding tolerance.
    - Histogram counts plus overflow equal `n`.
    - `kills_per_journey.sum` equals `kills`.
    - Every human journey starts at `t = 0`.
  - **Non-additivity guard:** the all-maps `human_players` (245) is recomputed from the journeys and differs from the sum of the map slices (325), so a version that adds slices fails. The all-dates median is recomputed from journeys, not from the date medians.
  - **Population:** a recount that includes bot and `unknown` journeys gives different totals, so the human-only filter is tested to matter.
  - **Freshness:** the fingerprint recomputed from the files on disk equals `source.fingerprint`.

**Commit 2 — `chore: add shadcn tabs and chart components`**
- Check the current setup first: shadcn's `chart` brings in Recharts, which isn't installed yet. Install the version the shadcn CLI installs for our React 19 / Vite setup and report it.
- `npx shadcn@latest add tabs chart`, following the shadcn Vite instructions already used for `components.json`.
- Map `--chart-1…5` to our tokens in `src/index.css` for both themes (theme through variables, guidelines §6).
- Add rows for `Tabs` and `Chart` to the guidelines §6 table, and a §11 entry.

**Commit 3 — `feat: add statistics page with scope filters`**
- `/stats` route; `loadStats()` and `StatsFile` types in `src/data/`; `metrics_version` check.
- URL parsing for `map`, `date` and `tab` (`src/state/statsUrl.ts`); top-bar navigation; scope controls; header line with badges.
- Loading, error and empty states; the About popover shows the version and fingerprint.
- The **Map comparison** tab, so the page ships with real content (no empty tabs, rule 3).
- Tests: URL parse and serialize (invalid → default, round trip); slice lookup; flag → badge text; formatting helpers; every metric ID the UI uses exists in the real `stats.json`.

**Commit 4 — `feat: add engagement and combat statistics`**
- Engagement and Combat and survival tabs.
- Tests: histogram → chart rows (edges become labels; overflow bin labelled "300 s +"); death series order fixed; every figure in these tabs read from the real file.

**Commit 5 — `feat: add loot and movement statistics`**
- Loot and Movement tabs; grid coverage figure (per map only, explained in its tooltip when All maps is selected).
- Tests: as in commit 4; `null` values render "—" with their reason.

**Commit 6 — `docs: document overall statistics`**
- README (what the page shows, `make data` regenerates it); ARCHITECTURE (one line in data flow).
- FRONTEND_GUIDELINES §3 (stats page layout) and §7 (where limits show on the dashboard).

## How to verify
1. `make data` then `make test`: all of commit 1's reconciliation tests pass, and the fingerprint matches.
2. Rebuild twice: `stats.json` is byte-identical.
3. In the browser (headless Chrome, as in feature 3):
   - All maps · all dates shows 781 human journeys, 780 matches with a human, 245 players and 139 seen more than once.
   - Map comparison shows 566 / 171 / 59 recorded matches and 553 / 170 / 57 with a human.
   - Deaths show 442 = 400 by bots + 39 storm + 3 paired, and Kill/Killed pairs show 3 with "cause unknown".
4. Switch to GrandRift on 2026-02-13: "Few matches" badge. Switch to 2026-02-09: the empty state for GrandRift; for AmbroseValley, 1 journey with "Few matches" and "Partial day".
5. Select AmbroseValley, then all maps: grid coverage reads "per map only", never a summed figure.
6. Edit `metrics_version` in a local copy of `stats.json`: the page shows the out-of-date error, and the map page still works.
7. Keyboard: tabs, scope controls and info tooltips reachable with Tab; charts have screen-reader tables.
8. Cross-check with the map: the AmbroseValley deaths on the dashboard equal the death heatmap's total for the same date (spec 06 shows 315 for all dates).

## Decided (S, 2026-10-23)
- **O1 — Where the page lives:** path `/stats`. Feature 7's `vercel.json` already rewrites every path to `index.html` (spec 07), so `/stats` deep links work once it is deployed.
- **O2 — "Limited sample" threshold:** no second level. Only "Few matches" (< 10 matches with a human) is flagged; every statistic is computed from the full data, and each slice carries its sample size.

## Notes for S
- **Storm death timing:** the CLAUDE.md data facts say "11–15 min". The data gives 655–887 s, so the earliest is 10:55. I'd change the fact to "about 11–15 min (10:55–14:47)". Not changed yet.
- **Two kill scopes:** `kills_per_journey` follows `index.json` and the heatmaps (the 2 late kills count). The clicked-route card leaves them out (guidelines §7, M4). Both are labelled, so this is a known difference rather than a disagreement.

## Out of scope
- Bot-side statistics beyond the excluded counts.
- Per-player profiles or leaderboards (pseudonyms would become identifying).
- Time-of-day patterns.
- Danger ratio (deaths per traffic minute).
- An inferred-extraction layer on the map.
- Statistical significance tests.
- Any new API: the page is static, like the rest of the core.
