# 06 — Heatmaps

## Goal
Show where, across all recorded human journeys on a map, players got kills, died and spent time. Heatmaps are an **overview** tool: they answer "where does this tend to happen?", not "what happened in this match?" (that is the journey view).

Revised after S's review (2026-10-22). Numbers below come from running code on the generated files in `web/public/data/` and are enforced by the tests listed under Implementation.

## The problem in depth
- **Raw counts mislead.** Traffic is very uneven: a few hubs get most of the time. On a linear scale the map is one hot blob. A log scale shows the full range.
- **Counting rows over-weights slow players.** Traffic is therefore *estimated observed player time* (seconds, computed in 02), not row counts.
- **Traffic is an estimate, not a measurement.** Positions arrive about every 5 s. The pipeline (D5) draws a straight line between consecutive positions that are 30 s apart or less and spreads the time over the cells it crosses. The real route between samples is unknown, gaps over 30 s add nothing, and only the recorded human journeys are counted. It is not exact traversal and not total map usage.
- **Kill and death maps often just redraw the traffic map.** More people → more deaths. Designers need the counts and an easy way to flip between a death map and the traffic map on the same view (guidelines task 4).
- **Small samples look like strong patterns.** The telemetry is a sample, not every player (743 of 796 matches have one recorded player). Every heatmap must say how much data it rests on and flag thin selections.
- **Blurred heatmaps invent hotspots.** Cells are drawn as discrete cells, with no smoothing.
- **Human-only coverage** (decision in 02). Bot files exist for only 52 matches, and a bot's death is usually also a human's kill, so adding them would count fights twice. `unknown` journeys (EC-09) are left out too.
- **Absence is not proof.** A cell with no value means *no observed human traffic* (or no recorded event) in this data. It does not mean the area is unreachable, unused, or "ignored" by players overall. The UI and docs never call an area "ignored", and never imply that every cell is walkable.

## Scope: what a heatmap is built from
A heatmap is **one precomputed aggregate per map, per layer, per date key** (`all` or one UTC date), loaded from `heatmaps/<map>.json`.

- It uses **all recorded human journeys** on that map and date. It does **not** use the selected match, the match list, or the playback time. None of them change it.
- The heatmap is the map-and-date aggregate, and it lives only in the Heatmaps tab (see "Stage 6c" at the end; it was briefly drawn under an open match, which Stage 6c replaced). The control that does change it is the date dropdown, and the scope line always says so.
- The scope line is always visible with the heatmap, in plain words, e.g. `All human journeys · AmbroseValley · all dates`. It never says "match" in a way that suggests a single match.
- The match list below the heatmap controls is for browsing. Hovering or selecting a row doesn't change the heatmap.
- **The match list stays usable.** The heatmap controls are compact (layer, scope, evidence, legend, opacity; the longer notes sit under "About this heatmap"), and the list keeps at least 20 rem of height; on a short window the whole overview panel scrolls. Checked at 1440×700 and 1280×620.
- No time-filtered mode in this feature. Aggregates can't change with playback time because a match isn't selected while a heatmap is shown.

**No match-scope mode.** A selected-match heatmap was considered and not built (D4, below).

## Event definitions
All from **human** journeys only (`actor kind = human`), using the Stage 2 categories. Positions are the *file owner's* position at that moment (EC-11): a kill is where the killer stood, a death is where the victim fell. **No victim coordinates are inferred**: a kill cell never shows where the killed bot was, and no `self_kill` is ever derived.

| Layer | Counts | Does not count | Total today (all maps) |
|---|---|---|---|
| **Kills** | Human-file rows with raw `BotKill` (a human killed a bot), plus any human-file `Kill` that is **not** half of a Kill/Killed pair. `after_death` rows count, as in 02 (2 `BotKill`s, one on AmbroseValley and one on Lockdown) | The `Kill` half of each Kill/Killed pair (3 rows); all bot and `unknown` files | 2,223 (all `BotKill`; no unpaired `Kill` exists) |
| **Deaths** | Human-file rows with raw `BotKilled` (a human died, killed by a bot), `KilledByStorm` (storm death), and the `Killed` half of each Kill/Killed pair | Bot and `unknown` files | 442 = 400 `BotKilled` + 39 `KilledByStorm` + 3 paired `Killed` |
| **Traffic** | Estimated seconds of human movement per cell (D5): straight-line tracing between consecutive positions ≤ 30 s apart; positions after a journey's first death are already dropped (D2) | Gaps over 30 s; bot and `unknown` journeys | 297,477 s (about 4,958 min) |

- **Each human storm death counts once.** A storm death is one `KilledByStorm` row, and no human journey has more than one death row, nor a storm death and another death (tested). So the death layer is one cell increment per dead player.
- **The three Kill/Killed pairs stay separate events.** In match files both rows are kept with their original labels, times and positions (EC-12). The heatmap counts the `Killed` as a death and leaves the `Kill` out of kills, and the legend names the paired `Killed` count (3). No cause is claimed.
- **Wording.** Layer names in the UI: "Kills (where humans stood when they killed)", "Deaths (where humans died, storm included)", "Traffic (estimated observed player time)".

## Decisions
| Choice | Decision | Why |
|---|---|---|
| Layers | Kills, deaths, traffic, one at a time, from human journeys only | The three the brief and checklist name |
| Grid | 64 × 64 cells, pre-computed in 02, taken as they are; the site never re-bins | One place for the maths |
| Rendering | Discrete rectangles over the minimap in the shared drawing space (`space.ts`); no blur, no interpolation. **`SolidPolygonLayer`, one rectangle per cell (D1)** | Honest; each cell is exactly the pipeline's cell |
| Colour scale | Viridis. Traffic: `t = log1p(v) / log1p(max)`. Kills/deaths: `t = v / max`. Values `≤ 0` aren't drawn | Colour-blind safe; log for skewed traffic, linear for counts |
| Colour domain | Per **map and layer**, fixed: the maximum over every date key of that layer. The same value has the same colour on every date, so days can be compared | A per-date maximum would make a quiet day look as hot as a busy one |
| Zero cells | Not stored, not drawn, no colour. The legend shows a separate "none observed" swatch that isn't on the ramp | Zero must never look like a low-but-positive hotspot |
| Scope | Map + date only (see "Scope"). Never the match or playback time | Heatmaps are about many matches |
| Evidence shown | Layer events (or traffic minutes), recorded human journeys, contributing matches; low-evidence badge (D3) | Prevents over-reading small samples |
| Hover | Raw value in plain words: "12 deaths", "41 min of estimated player time" | Exact numbers, not just colour |
| Opacity | Slider; default chosen by eye on the three maps in commit 2 | Keep the map visible underneath |
| URL | `layer=kills\|deaths\|traffic`; omitted when it is the default (traffic); invalid → default. Opacity isn't in the URL | Shareable, like `hide=` |
| State | The layer lives in the existing Zustand store and syncs with React Router like `map`/`date` (existing Decision row, feature 3) | No new mechanism |

### Colour details
- **Viridis table:** 256 entries (D2). The ramp runs over `t ∈ [0, 1]` unchanged. If the darkest purples are hard to see on the dark minimaps, report it to S rather than changing the ramp.
- **Clamp:** `t` is clamped to `[0, 1]`. A domain maximum of 0 draws nothing.
- **Legend ticks show raw values, not `t`.** Traffic ticks sit at round raw values (1 s, 10 s, 1 min, 10 min, 1 h, …) placed by the log1p position; count ticks at round raw counts. Both the legend and hover read from the same raw value as the cell.
- **Dates and the domain.** Because the domain is fixed per map and layer, a single-day view uses only part of the ramp. That is intended: say so in the legend ("Scale fixed across dates").

### Rendering details
- A cell `(i, j)` covers `u ∈ [i/64, (i+1)/64)`, `v ∈ [j/64, (j+1)/64)`, with `j` growing north (02). In the drawing space (`X = u·1000`, `Y = (1−v)·1000·H/W`, Y down) its rectangle is
  `x ∈ [i·1000/64, (i+1)·1000/64]`, `y ∈ [(1−(j+1)/64)·h, (1−j/64)·h]` with `h = spaceHeight(map)`.
  One function, `cellRect(i, j, map)`, builds it from `uvToSpace`; nothing else computes cell geometry.
- **GrandRift (2160 × 2158) is not square**, so its cells are 15.625 × 15.61 drawing units. The rectangle approach handles any aspect exactly; the square-only `GridCellLayer` can't (D1).
- Cells are drawn under journey layers' z-order and above the minimap. Journey layers are off while a heatmap is shown.

## Evidence, samples and flags
What the UI shows, and where each number comes from (no new fields needed):

| Number | Source |
|---|---|
| Events behind a kills/deaths layer, or traffic minutes | `totals[layer][key]` |
| Recorded human journeys | `samples[key].human_journeys` |
| Matches with at least one human journey | `samples[key].matches` |
| **Matches contributing to this layer** (kills: ≥ 1 counted kill; deaths: ≥ 1 death or storm death) | Count from `index.json`: `counts.kill`, `counts.death + counts.storm_death` per match, filtered by map and date. Verified equal to `totals` for every map and date (0 mismatches) |
| Traffic contributors | `samples[key].matches` |
| Partial day | `index.dates[].partial` and `observed_to_utc` (EC-24) |

Example scope and evidence lines (all values come from the files at runtime):
- `Deaths · AmbroseValley · all dates · 315 deaths in 314 matches · 554 human journeys in 553 matches`
- `Traffic · GrandRift · 2026-02-13 · about 26 min of estimated player time · 5 human journeys in 5 matches`

**Low-evidence flag** (below 10 contributing matches, D3): a "Few matches" badge, with a tooltip saying what it rests on, when the layer's contributing matches are below the threshold. Raw counts stay visible next to it. The flag says "read with care", never "wrong".

**Coverage note** (one line, also in About this data): "Telemetry covers recorded players only; most matches have one recorded human."

## Empty states
- **No data for the date** (the date key is missing, e.g. GrandRift on 2026-02-09, or a map with no human journeys): no cells, no legend, text "No human journeys recorded on GrandRift on 2026-02-09." and "Choose another date or All dates."
- **Data, but none of this event** (key exists, layer empty, e.g. AmbroseValley deaths on 2026-02-09, total 0 in 1 match): no cells, text "No human deaths recorded in the 1 match on this date." The scope and evidence lines still show.
- **Layer loading or failed to load:** the map shows, no cells, a status line / retry (as the match file does). A stale map's heatmap is never shown on another map.
- Neither state shows the legend ramp: there is nothing on it.

## Implementation
**Commit 1 — `feat: add heatmap layer with kills, deaths and traffic`**
Add `HeatmapFile` types and `loadHeatmap(map)` (loaded when the overview is shown, cached per map). `web/src/heatmap/`: `grid.ts` (`cellRect`, `cellOf`), `viridis.ts` + `scale.ts` (table, domain per map and layer, `t`, colour, "not drawn" for `≤ 0`), and the layer builder. Layer selector (`ToggleGroup`) in the overview panel; cells drawn for the selected map and date key (`all` when no date); journey layers off in the overview. The colour scales move here from the old commit 2 because cells need their final colours (nothing is drawn in a throwaway colour).
Tests, reading the real generated files like the other frontend tests:
- **Kill and death reconciliation:** for every map and date key, `Σ cells = totals` exactly, and `totals` equal both the counts in `index.json` and the counts recomputed from human actors' events in the match files (kills: `type = kill` and not `kill_killed_pair`; deaths: `death` + `storm_death`). By raw label: 400 `BotKilled` + 39 `KilledByStorm` + 3 paired `Killed` = 442 deaths; 2,223 `BotKill`.
- **Storm deaths counted once:** 39 in total; no human journey has more than one death row; each storm death is in exactly one cell.
- **Kill/Killed pairs:** 3 pairs; both rows still in the match files; the `Kill` rows are in no kill cell or total; the `Killed` rows are in the death totals.
- **Traffic conservation:** `Σ cells` equals `totals` within the cell rounding (stored to 0.1 s: tolerance 0.05 s × cell count); and `totals` equals the sum of consecutive-position gaps inside the human segments of the match files, so gaps over 30 s (which split segments) add nothing. The test first checks that a gap over 30 s exists in the data, so it can fail.
- **UTC dates:** every match's `date` equals the UTC date of `start_utc`; heatmap date keys equal the dates of matches with a human journey on that map; match `e325a53a` (starts 2026-02-09 23:58:55 UTC and runs past midnight) is wholly in 2026-02-09 and in no other date; `all = Σ dates` (counts exactly; traffic within 0.2 s per cell).
- **Exclusion:** totals match a recomputation from human actors only, and a recomputation that includes bots and `unknown` actors would differ (bots have 170 kills and 296 deaths, `unknown` 13 kills and 1 death), so the test can fail.
- **Grid alignment:** `cellRect` for cells `(0,0)`, `(63,0)`, `(0,63)`, `(63,63)` on all three maps lands on the corners of `imageBounds`, GrandRift included; the 4,096 rectangles tile the map exactly (no gaps, no overlaps, same shared edges); every kill/death event from the match files lies inside the rectangle of the cell `cellOf` gives it (4-decimal UV can put a few events in a neighbouring cell of the stored grid: tested as ≤ 1 % of events).
- **Colour:** table endpoints and monotone brightness; `t` for log1p and linear scales (0, mid, max, clamped above max); the domain is the same for every date key of a map and layer, and no cell in any date key exceeds it; `v ≤ 0` returns "not drawn"; a layer with maximum 0 draws nothing.

**Commit 2 — `feat: add legend, scope line and hover values`**
Legend (raw-value ticks, "none observed" swatch, unit and "scale fixed across dates"); scope and evidence lines; "Few matches" badge; hover card with the cell's raw value and unit; opacity slider; the coverage note.
Tests: value formatting ("under 1 s", seconds, minutes, plural "1 death" / "2 deaths"); scope and evidence text for the three maps, from the real files; contributing matches from `index.json` equal the matches that have those events in the match files; the low-evidence rule at its boundary; legend tick values map back to their cell colours.

**Commit 3 — `feat: keep heatmap layer in the url and show empty states`**
`layer=` in the URL (parse, serialize, invalid → default, round trip); `setLayer` in the store; switching map keeps the layer and date, switching layer keeps the camera; the two empty states and the loading/failed state; the date dropdown drives the heatmap. (The date key lookup itself is in commit 1; this commit adds the states around it.)
Tests: URL contract; store action; empty state selection for GrandRift 2026-02-09 (missing key), AmbroseValley deaths 2026-02-09 (empty layer) and a normal selection.

## How to verify
1. **Reconciliation:** `npm test` passes the tests above. `Σ` death cells for a map and date key equals the human deaths for that map and date (AmbroseValley 315, GrandRift 30, Lockdown 97 for all dates).
2. **Rendering (headless Chrome, as in feature 3):** on each of the three maps, draw the four corner cells and compare with the image corners; on GrandRift too. Then open a match with a death, note the death marker, go to the overview of the same map and date, and check that marker lies inside a death cell with count ≥ 1. Do it on one match per map.
3. **Traffic:** AmbroseValley traffic: hot cells sit on buildings and roads. The legend says "estimated observed player time".
4. **Evidence:** switch to GrandRift: the scope line shows its smaller counts and the "Few matches" badge appears on its thin days.
5. **Compare layers:** toggle deaths ↔ traffic on the same map and date: the camera doesn't move and the colour domain doesn't change when only the date changes.
6. **Empty states:** GrandRift on 2026-02-09 and AmbroseValley deaths on 2026-02-09 show the right messages.
7. **No match influence:** selecting or hovering a match row doesn't change the heatmap; opening a match turns it off.
8. Guidelines designer tasks 4 and 5.

## Decisions taken (S, 2026-10-22: "go with your recommendations"; each is a row in the CLAUDE.md Decisions table)
- **D1 — Cell layer.** (a) **`SolidPolygonLayer` with one rectangle per cell, built from `cellRect` (chosen):** exact for any aspect ratio, explicit corners that a unit test checks, built-in picking for hover, a few thousand polygons at most (AmbroseValley has 1,619 traffic cells). (b) `GridCellLayer` (the earlier spec): square cells only, so GrandRift's 15.625 × 15.61 cells would be 0.015 units off per edge (about 0.1 px at the highest zoom, so not visible), but it defaults to `offset: [1, 1]` and carries extrusion and lighting options, so where each cell lands under our Y-down view would have to be established by rendering, not by a unit test. (c) A 64 × 64 `BitmapLayer` with nearest-neighbour sampling: also exact, one draw call, but hover needs a separate cursor → cell calculation.
- **D2 — Viridis source.** (a) **A 256-entry table in `viridis.ts`, generated once from matplotlib's Viridis and tested at its endpoints (chosen):** no new dependency. (b) `d3-scale-chromatic`: well known, adds a package for one colour map.
- **D3 — Low-evidence threshold (guidelines P7).** Contributing matches below N. Out of the 57 selections (3 layers × 19 map-and-date keys): N = 5 flags 10, **N = 10 covers 17 (16 with a badge, one with no events, which shows the empty state instead; chosen: AmbroseValley 2026-02-09, Lockdown 2026-02-14, GrandRift kills/deaths from 2026-02-11 and all three GrandRift layers from 2026-02-12; no all-dates view)**, N = 20 flags 25. Events stay visible next to the badge either way. Another rule on event counts (kills/deaths) would flag 9 of 38 below 10 events and 13 below 20.
- **D4 — Selected-match heatmap mode (not built).** Feasibility from the existing match files: kills and deaths could be counted in the browser (`kill` without `kill_killed_pair`, `death` + `storm_death`, human actors), but (1) traffic would need the D5 line-tracing logic written a second time in TypeScript with a parity test, against the "one place" principle; (2) the match files store UV to 4 decimals, so a recount puts about 6 of the 2,665 kill and death events in a neighbouring cell compared with the stored grid; (3) the typical match has few events (780 matches have a human; the median has 2 kills and deaths, the most has 38), so most match grids would be a few lone cells, and the journey view already shows each event exactly. If it is ever wanted: a fourth commit, kills and deaths only, labelled "This match" with its own scope line, never mixed into the aggregate.

## Conflicts with the generated heatmap JSON and the other docs
No pipeline change is needed. These are things to know:
1. **`samples.matches` is "matches with a human journey", not "matches that contributed to this layer".** Contributing matches for kills/deaths come from `index.json` counts (verified equal to `totals`). Spec wording "318 deaths from 566 matches" was a placeholder: the real figures are 315 deaths from 553 matches with human journeys (566 matches exist on AmbroseValley, 13 have no human). GrandRift has 57 matches with a human journey, not 59 (59 exist).
2. **Traffic cells are rounded to 0.1 s,** so `Σ cells` differs from `totals` by up to about a second per map (GrandRift: 21,706.9 s in the cells against 21,708 s in `totals`), and `all` differs from `Σ dates` by up to 0.2 s per cell. `totals` are exact (equal to the summed gaps in the match files). Tests use these tolerances, and the UI shows minutes, never seconds beyond the cell's own value.
3. **Cell-level recounts from match files are not exact:** match files round UV to 4 decimals, the heatmap bins the unrounded value. Totals reconcile exactly; the per-cell comparison differs in a handful of cells (12 cell-count differences across 2,665 events).
4. **There is no per-layer colour domain in the JSON.** It is computed at load as the maximum over all date keys of the layer (`all` is the largest by construction, with a 0.2 s traffic rounding margin).
5. **Missing vs empty keys:** GrandRift has no 2026-02-09 key at all, while the date list (`index.json`) still offers that date; AmbroseValley 2026-02-09 has a key with an empty deaths layer and a total of 0. Both need empty states.
6. **`units.deaths` reads "events (incl. storm deaths)",** which doesn't mention the paired `Killed`. The UI text is written from this spec, not from that string.
7. **FRONTEND_GUIDELINES.md still says** "which areas do they ignore" (§1), "cells drawn as squares" (§4), and lists P7 as pending. Updated to match (S, 2026-10-22): "areas with no observed human traffic", "cells drawn as rectangles in the drawing space", and P7 filled in from D3.
8. **Commit structure:** still three commits. The colour scales move from commit 2 to commit 1 (cells need their final colours), and the date lookup moves into commit 1. Commit subjects 2 and 3 change accordingly.

## Out of scope
Deaths-per-traffic "danger" ratio, inferred extraction layer, playstyle analysis, a time-filtered heatmap, a selected-match heatmap (D4), per-day normalisation of colours, cell-level match counts (not in the data) — good roadmap items, not core.

## Visual pass (S, 2026-10-23)
The first version drew every non-zero cell as an opaque square in Viridis. Why it read as a mosaic: traffic is dense (40 % of AmbroseValley's cells, 31 % of GrandRift's), `log1p` puts the median cell at the middle of the ramp (0.51), one opacity applied to every cell, and 72 % of AmbroseValley's death cells hold a single event, so they were all the same dark square. The grid data was not the problem.

Changes, all display-only (the 64 × 64 grids, totals, reconciliation tests and hover values are untouched):
- **Painted picture** (`heatmap/raster.ts`): each non-zero cell is a soft bump (σ = 1 cell, cut off at 2.4σ). Its peak opacity and colour come from its own value; bumps are combined by taking the stronger opacity, never by adding, so no peak is created.
- **Opacity follows intensity** (`heatmap/scale.ts`): Hotspots (default) fades weak traffic to a faint wash and lets the top stand out; All activity keeps every observed cell clearly visible. Kills and deaths keep a higher floor so a single event stays identifiable, each tuned to its layer.
- **Palettes per layer**, a **master On/Off switch**, compact legend and tooltip, methods under "About this heatmap".
- **Default fit** follows the minimap's content (`map/content.ts`).
- URL: `heatmap=off` and `intensity=all` join `layer=`.
Decisions are rows in the CLAUDE.md table. Evidence: `docs/evidence/heatmap_review/`.

**Match open (S, 2026-10-23; superseded by Stage 6c, where heatmaps have their own tab):** the heatmap switch no longer disappears when a match is selected. The controls sit above the match inspector and the picture is drawn under the journeys; it is still the map-and-date aggregate ("Not filtered by the open match"), the `hide` preferences are untouched, and turning the heatmap off returns the ordinary match view. This replaces the earlier "overview only" scope.

## Stage 6b — Interpretation layer (built; S's decisions 2026-10-23)
**Why.** The visual pass fixed the rendering, but a viewer still couldn't tell where the strongest concentrations are or how much weight to give
them. An evidence-first analysis of the real data came first: `docs/evidence/spatial_analysis/REPORT.md` (data, tests, tables, and the
grid-shift and threshold validation in its section 8), `zone_sensitivity.md`, `count_bands.json`, and `external_references.md` (research, kept
separate). The interpretation layer sits beside the heatmap; it does not replace its renderer or change a recorded value.

### What the data supports (from the report)
- Most kill and death cells at 64 × 64 hold one event (deaths 72% / 93% / 82% of occupied cells; kills 39% / 61% / 60%); the strongest cell holds 1.5–6.7% of a layer. Individual 64 × 64 cells are not stable hotspots (AmbroseValley kills, top-5 split-half overlap 0.0; 0.6 at 32 × 32, 0.8 at 16 × 16).
- Players repeat across matches (AmbroseValley: 217 players in 554 journeys), so matches are not independent evidence of different players; the player-level re-run gives the same picture.
- Kills and deaths partly follow traffic (rank correlation 0.13–0.83). Balance maps, danger scores and deaths-per-visit are not supported (one-sided positions, no opponents beyond bots) and are not built.

### Method (provisional thresholds, S 2026-10-23; code: `pipeline/src/lila_pipeline/zones.py`)
1. **Regions:** the 64 × 64 cells summed into **16 × 16 regions** (4 × 4 cells). The grids, the picture and the hover stay at 64 × 64.
2. **Value:** kills = counted kills; deaths = all death rows (storm deaths included in the layer, counted separately in summaries and region details); traffic = estimated seconds (D5). Humans only.
3. **Contributing match:** a match with a positive value in the region (kills: at least one counted kill there; deaths: at least one death; traffic: at least one traced second). **Contributing player:** a recorded human player with a positive value there (all of one player's journeys in the selection together). **Largest match share:** the largest single match's value over the region's value (its events for kills and deaths, its seconds for traffic). **Journeys through the region** (traffic only): distinct human journeys with traced time there, measured from the same D5 movement as the traffic value and kept apart from event contribution and from estimated time.
4. **Candidates:** the top decile of occupied regions in the selection (at least 3).
5. **Stability:** the share of 300 resamples of the selection's matches (with replacement, fixed seed per map, layer and selection) in which the region is again a candidate. It measures **sampling stability inside this sample**; it is not a significance test and says nothing about other players or builds.
6. **Checks:** stability >= 0.8; at least 5 distinct matches; at least 3 distinct recorded players; no single match over 50% of the region's value.
7. **Grid-boundary check (S's condition):** the analysis is repeated, with the same resamples, on grids shifted by half a region horizontally, vertically and both. A region survives a shift when its **geographic counterpart** (the shifted region that holds most of its value, not the region with the same cell indices) passes the same checks; it must survive all three. The stricter "at least half of its value inside qualifying shifted regions" rule is kept as a sensitivity variant.
8. **Tiers:** **consistent concentration** = every check passed. **Observed concentration** = a candidate that did not; its measurements are kept and shown, with the checks it failed.
9. **Per selection:** all dates and each date are analysed on their own matches; a single-date verdict is never inherited from all dates.

### Result and validation (all dates; per-selection numbers are in `web/public/data/zones/`)
| | Kills | Deaths | Traffic |
|---|---|---|---|
| AmbroseValley | 5 consistent | 1 | 7 |
| GrandRift | 0 | 0 | 3 |
| Lockdown | 0 | 1 | 1 |

Of the candidates that passed stability and support, the shifted grids removed 0 of 5 (AmbroseValley kills), 3 of 4 (deaths), 5 of 12 (traffic), 1 of 1 (GrandRift kills), 5 of 8 (GrandRift traffic), 1 of 1 (Lockdown kills), 1 of 2 (Lockdown deaths) and 7 of 8 (Lockdown traffic). Moving the match, player and one-match thresholds changes no count; the top-decile share and the shift check move them most. A candidate that failed is reported as observed; the which-survives table is section 8.2 of the report.

### Behaviour (built)
For the selected map, date and layer, under the heatmap controls:
- **A compact summary of the strongest consistent regions, at most three at first** ("Show N more" for the rest), each with the layer's value in its own unit, its share of the layer, and the matches and recorded players behind it.
- **Click a region** to open its details (value, share, matches, players, journeys through it for traffic, storm deaths among a death region's value, largest single match, resample stability, shifted-grid result) and to outline its footprint on the map. Clicking it again clears it. The outline is a line, never a fill over the heatmap.
- **No consistent region:** "No consistent concentration detected in this selection." followed by the highest observed regions (up to three), marked as not consistent, each with its measurements and, when opened, the checks it failed.
- Deaths show "incl. N storm deaths" beside the summary; storm deaths stay in the Deaths layer and are not a fourth heatmap.
- The detailed 64 × 64 heatmap and its exact-value hover are unchanged. No balance maps, danger ratios, extra heatmap modes or AI-generated explanations.
- Wording: "recorded", "observed", "concentration"; never "dangerous", "deadliest" or a bare "hotspot".

### Count classes for kills and deaths (decision 5; code `heatmap/scale.ts`, evidence `count_bands.*`)
Kills and deaths are coloured on the 64 × 64 cells by absolute count: **1 / 2–3 / 4–9 / 10 or more**, identical on every date and map, and never applied to the 16 × 16 regions. The classes step in lightness and opacity as well as hue (neighbouring classes >= 18.9 dE apart for kills and >= 7.0 dE for deaths under deuteranopia and protanopia, where the previous continuous ramp was 0.7–8 dE for kills and 0 dE for GrandRift deaths). Hotspots and All activity differ for traffic only.

### Data (pipeline, approved)
`web/public/data/zones/<map>.json`: per selection (all and each date) and layer: total, occupied regions, candidates, consistent count, and the candidate regions with `i`, `j`, `value`, `share`, `matches`, `players`, `largest_match_share`, `stability`, `survived_shifts`, `tier`, plus `journeys` (traffic) and `storm_deaths` (deaths; the layer also carries the selection's storm-death total). The qualification rules used are written into the file. Counts only: no player or match IDs. Built by `make data`, deterministic (seeded), tested in `pipeline/tests/test_zones.py` and `web/src/heatmap/zones.test.ts`.

### Limits
Internal sample stability is not population-level significance. The thresholds are provisional and the top-decile share is a judgement call that moves the counts; region edges are arbitrary (the shifted grids test half a region in each direction, not every alignment); kill and death positions are one-sided (the file owner's own); traffic is an estimate.

### Out of scope (unchanged)
Kill/death balance maps, danger scores, deaths-per-visit, inferred extraction, a selected-match heatmap, extra heatmap modes.

## Stage 6c — Tabs, independent switches, outlines, Focused traffic (S, 2026-10-23)

**Two tabs on one map.** *Journeys & Playback* is the match list, paths, markers and timeline; it has no heatmap and no outlines. *Heatmaps* is the aggregate over the selected map and date (All dates included) as one metric at a time (Traffic, Kills or Deaths); it has no match, path, marker or playback, and says so: "Aggregated recorded human telemetry … Not filtered by the selected match or the playback time". The same `MapView` stays mounted, so the minimap is not reloaded and the camera stays where the user left it.

**State rules.**
- Map and date are shared. The match, its hidden layers and the playback time are kept while the other tab is open. **Leaving Journeys pauses playback** (also a scrub in progress); coming back shows the same moment, paused.
- The heatmap metric, both switches, the Focused / All activity view and the opacity are kept across metric, map, date and tab changes. A selected region and an expanded list are cleared by a new metric, date or map, not by a tab switch.
- URL: `?map=&date=&tab=journeys|heatmaps`, then only that tab's own parameters. Journeys: `match`, `hide`, `t`. Heatmaps: `layer` (not traffic), `density=off`, `outlines=off`, `intensity=all`. So the two sets never conflict. Links without `tab` still work: a `match` means Journeys, anything else Heatmaps; the old `heatmap=off` reads as `density=off`; the earlier `intensity=hotspots` reads as the default. Back and Forward step between tabs and selections (a `t=` update uses a replace).

**Two independent switches** (replacing the master On/Off): *Show density overlay* and *Show hotspot outlines*; all four combinations work, including both off (the bare minimap). Outlines are read from the 16×16 zone analysis only; the density picture is the 64×64 grid. Neither is derived from the other, and nothing is ranked from smoothed pixels.

**Outlines.** A double stroke (dark casing, white line) so it reads on every minimap, drawn in map coordinates so it follows zoom and pan. The shape is a circle through the corners of the region's 4×4-cell footprint, wide enough to contain it: an approximate mark, not a boundary (the panel says so and gives the size: "about 56 world units across" for the 16×16 regions on AmbroseValley). Only regions that passed every check are outlined, numbered 1–3 first (more on request); the number is the same as in the list. Clicking an outline or a list row selects it: the map **zooms in** until the region fills about a third of the view's shorter side (never zooms out; instant, no animation) and a **details card** opens in the map's bottom-right corner (value, share of the layer, matches, recorded players, journeys through it, storm deaths, largest single match, resample stability, shifted-grid result, and the plain statement that the repeat tests use the recorded matches only). Esc, the close button or a click on empty map clears it. When no region qualifies the panel says "No consistent concentration detected in this selection." and the map draws no outline (the highest observed regions are listed, marked not consistent).

**Regions that pass the shifted-grid check (all dates):** AmbroseValley kills 5, deaths 1, traffic 7; GrandRift 0, 0, 3; Lockdown 0, 1, 1.

**Traffic contrast (Focused view, per 64×64 cell, in estimated player-seconds; thresholds are absolute, so a value looks the same on every date of a map).**
- Under 30 s: not drawn. 30 s to under 60 s: a faint trace (opacity 0.03 to 0.06). 60 s and over: opacity = 0.10 + 0.85·x^1.5 with x = ln(v/60) / ln(max/60), where `max` is the map's largest cell over all dates; colour follows x on the traffic palette.
- Why this curve: on AmbroseValley 31 % of cells are under 30 s and 49 % are at 60 s or more, so the 1.5 power keeps the typical visible cell low and makes the few strongest cells far brighter (tests require the top to be over 4× a typical 2-minute cell, and 2–15 % of AmbroseValley's cells to be bright). Recorded values are untouched: hover and the tooltip still read the raw grid, hidden cells included.
- **Decision for S:** the thresholds are absolute, as asked, and that hides most of GrandRift's traffic: 84 % of its cells are under 30 s and only 5 % reach 60 s (Lockdown: 30 % reach 60 s). A single day of GrandRift is almost empty in this view. "All activity" shows everything; a per-map threshold would be a different rule.
- Kills and Deaths keep the count classes (1 / 2–3 / 4–9 / 10+), with slightly stronger opacity steps, and no time threshold.

Code: `heatmap/scale.ts` (`trafficFocusedStyle`, `TRAFFIC_FOCUS`), `heatmap/zones.ts` (`zoneOutline`, `visibleConsistent`), `heatmap/layers.ts` (`outlineLayers`), `ui/RegionCard.tsx`, `map/space.ts` (`focusZoom`), `state/url.ts`, `state/useUrlSync.ts`. Evidence: `docs/evidence/tabs_and_outlines/`.
