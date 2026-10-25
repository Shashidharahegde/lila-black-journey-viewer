# Technical report: LILA BLACK Player Journey Viewer

The long version of [ARCHITECTURE.md](../../ARCHITECTURE.md): what the data turned out to be, every edge case found and how it is handled, how coordinates are mapped and checked, and how the result was verified. The register with one row per data issue is [EDGE_CASES.md](EDGE_CASES.md); the story of how it was built is [ARTICLE.md](ARTICLE.md); every assumption with its evidence is [`docs/evidence/README.md`](../evidence/README.md).

Every number here comes from running code on the data: the pipeline's own [`build_report.json`](../evidence/build_report.json), the generated files in `web/public/data/`, the evidence reports linked beside each figure, or the test runs listed in section 9.

**Contents:** 1 What was built · 2 The data · 3 The four nuances the brief names · 4 Every other edge case · 5 Pipeline · 6 Coordinate mapping · 7 Drawing events accurately · 8 Frontend · 9 Verification · 10 Trade-offs · 11 Limits and open items · 12 Walkthrough script

---

## 1. What was built

A static website for Level Designers with three pages that share one map row (map toggle and date filter):

| Page | What a designer does there |
|---|---|
| **Overview** (`/stats`, the landing page) | Compare the three maps: human journeys, players, median journey span, kills, loot and storm deaths per journey, and a relative map score. Pick a map for its report. |
| **Journeys** (`/journeys`) | Pick a match from a list grouped by date and sorted by duration, kills, deaths or loot. See every recorded route on the minimap with event markers, then press play to watch the match unfold (0.5×–8×). |
| **Heatmaps** (`/heatmaps`) | Traffic, Kills or Deaths across all matches of a map and date, with up to six numbered hotspots. Click a hotspot to zoom in and read its figures. |

The page, map, date, match, playback time and heatmap layer are all in the address, so a copied link opens the same view.

| Brief requirement | Where it is met |
|---|---|
| Load and parse the parquet data | `pipeline/` (Python) reads all 1,243 files at build time (section 5) |
| Journeys on the correct minimap | One projection function, tested and checked on images (section 6) |
| Humans vs bots visually distinct | Humans solid blue and drawn on top; bots dashed amber (section 7) |
| Kills, deaths, loot, storm deaths as distinct markers | One icon per category on a badge; storm deaths have their own (section 7) |
| Filter by map, date, match | Map toggle and date filter on every page; match list on Journeys |
| Timeline / playback | Playback dock on Journeys: play, scrub, speed, step between events |
| Heatmaps: kills, deaths, traffic | Heatmaps page, one layer at a time, with hotspot outlines |
| Hosted, shareable link | Vercel, https://lila-black-journey-viewer.vercel.app/; every view is a URL |

## 2. The data

| | Count | Source |
|---|---|---|
| Parquet files found / read | 1,243 / 1,242 (one byte-identical copy skipped) | `build_report.json` |
| Rows read → kept after cleaning | 89,016 → 88,653 | `build_report.json` |
| Matches | 796: AmbroseValley 566, Lockdown 171, GrandRift 59 | `index.json` |
| Journeys (one actor in one match) | 798 human (568 / 171 / 59), 444 bot (268 / 124 / 52) | `index.json` |
| Matches by recorded humans | 794 with one, 2 with two | `build_report.json` |
| Match length (first to last event) | 13–887 s | match files |
| Observed window (UTC) | 2026-02-09 23:58:55 → 2026-02-14 15:01:40 | `index.json` |
| Events kept, all actors | 72,676 positions, 12,829 loot, 2,409 kills, 700 deaths, 39 storm deaths | `build_report.json` |
| Human events | 12,829 loot, 2,236 counted kills, 404 deaths, 39 storm deaths | match files |

Each file holds one actor in one match. Columns: `user_id`, `match_id`, `map_id`, `x`, `y`, `z`, `ts`, `event`. Event types: `Position`, `BotPosition`, `Loot`, `BotKill`, `BotKilled`, `Kill`, `Killed`, `KilledByStorm`.

## 3. The four nuances the brief names

### 3.1 Timestamps (EC-01, EC-02, EC-03)
- **What I found:** `ts` is typed `timestamp[ms]`. Read as milliseconds, the whole dataset spans 6.6 minutes in January 1970. Read as **seconds**, every event falls between 2026-02-09 23:58:55 and 2026-02-14 15:01:40 UTC, and matches last 13 s to about 15 min, which is what an extraction shooter match should look like.
- **Handling:** `epoch_s = ts cast to int64` (seconds). Match time `t = epoch_s − earliest epoch_s in the match` (`normalize.add_match_clock`), so every actor in a match shares one clock and playback starts at 0.
- **Ordering:** 3 files have rows out of time order, and the 1 s resolution puts several events in one second (loot bursts). Rows are sorted by `(epoch_s, original row)`, a stable sort, so file order is kept within a second.
- **Dates:** folders aren't UTC days. 4 matches start before their folder's day, 3 cross midnight, and the files of one match can sit in two folders (EC-05, EC-23). A match is dated by the UTC date of its first event, the date list is generated from the data, and the two edge days are flagged partial (EC-24). Everything groups by `match_id`, never by folder.
- **Tests:** `test_ec01_ts_is_epoch_seconds`, `test_ec02_rows_sorted_by_time_then_file_order`, `test_ec23_*`.

### 3.2 Bytes encoding (EC-08)
- **What I found:** `event` is a binary column (`b'Position'` in every row).
- **Handling:** decoded as UTF-8 in `ingest._to_frame`. Any event type outside the eight known ones stops the build (`journeys.categorize_events` raises), so a new type can't be silently dropped or miscounted. The parquet schema is also checked per file; a file with the wrong schema is listed as failed in the build report (0 failed on this data).
- **Tests:** `test_ec08_events_are_decoded_text`, `test_unknown_event_is_rejected`.

### 3.3 Bot detection (EC-09, EC-10)
- **What the README says:** UUID `user_id` = human, numeric `user_id` = bot.
- **What I found:** the event types disagree with that rule for 17 files. All 444 files that log `BotPosition` have numeric IDs, and no file logs both `BotPosition` and `Position`. But 17 numeric-ID files (3 actors, 17 matches) never log `BotPosition`. They log `Position` like the player client, and 14 of them log `Loot`, which no `BotPosition` file ever does. 12 of them move faster than the bot speed cap (5.0 units/s, never exceeded in 444 bot files). Against counting them as human: one of the three actors is a `BotPosition` bot in 3 other matches. Evidence: [`actor_classification.md`](../evidence/event_forensics/actor_classification.md).
- **Handling:** classify by **behaviour**. A file that logs `BotPosition` is a bot; every other file is human (`normalize.classify_actors`). The 17 are counted as humans and flagged `id_mismatch` in the match files and the build report, so they can be found and excluded again. Result: 798 human and 444 bot journeys, and every match has a human.
- **Why behaviour:** the events show what the client logged. The ID rule would label 17 journeys that loot and move like players as bots. The cost is that nothing proves a person played them; including them moved any heatmap total by at most 1.63 % ([`heatmap_impact.md`](../evidence/event_forensics/heatmap_impact.md)).
- **Tests:** `test_ec09_actor_is_a_bot_only_when_it_logs_botposition`, `test_ec09_ec10_real_actor_counts`, `test_ec09_flagged_journeys_are_counted_as_humans_in_heatmaps`.

### 3.4 Coordinate mapping (EC-17 to EC-22)
Summarised here and covered in full in section 6.
- **What I found:** the README formula is right, but its image size (1024 px) is not. The real minimaps are AmbroseValley 4320², GrandRift 2160×2158 (not square) and Lockdown 9000². Image rows count downward while world z grows upward, so v must be flipped. `y` is elevation.
- **Handling:** one function converts world (x, z) to UV in 0–1 (`projection.world_to_uv`). The site only receives UV. Pixels are `u·W` and `(1 − v)·H` using each image's own width and height.

## 4. Every other edge case

Full evidence and test names are in [EDGE_CASES.md](EDGE_CASES.md). Of its 30 rows, 27 are Handled and 1 is Resolved. Two are still marked Found. EC-13: no extraction layer is drawn, so there's nothing to label yet. EC-26: the pipeline part is done and the UI shows sample sizes and the "Few matches" badge, but the row hasn't been updated.

| ID | Ran into | How it is handled |
|---|---|---|
| EC-04 | One file is byte-identical in `February_10/` and `February_11/` | Content hash; read once; the skip is listed in the build report |
| EC-05 | Files of one match in different folders | Group by `match_id`, never by folder |
| EC-06 | 1,225 exact repeat rows (1,195 `Loot`, 30 `BotKill`) within one second at one spot | **Kept.** Several pickups in one second are plausible; no row is removed just because it looks identical to another |
| EC-07 | `.DS_Store`, `minimaps/` and stray files in the data folder | Only files inside day folders are read; anything unreadable is listed |
| EC-11 | An event's x/z is the **file owner's** position; `BotKilled` in a bot file means the bot died | Categories from the owner's view: `kill` = owner killed, `death` = owner died. Kill marker = where the killer stood; death marker = where the victim fell |
| EC-12 | `Kill`/`Killed` appear only 3 times each, always as a pair in one file in the same second | Both rows kept with their labels, flagged `kill_killed_pair`. The `Killed` counts as a death; the `Kill` is left out of kill totals and the kill heatmap. The cause (self-inflicted, or a trade with an unrecorded player) is unknown and never claimed |
| EC-13 | No extraction event | Nothing is drawn as an extraction. A journey's end is "last recorded position"; any extraction figure would be labelled *inferred* |
| EC-14 | 172 journeys log positions 1–6 s after their first death | The 173 post-death positions are dropped, so playback never shows a dead player moving. The 2 later `BotKill`s are kept, flagged `after_death` |
| EC-15 | Duplicate death rows | Both are inside doubled journeys and go with EC-29 |
| EC-16 | Positions every ~5 s, with 311 gaps over 30 s (longest 518 s) | Paths split at gaps over 30 s; playback and traffic don't draw across a gap |
| EC-19 | GrandRift has near-black roads and building art inside the map | The alignment check is maths tests plus reviewed overlays, never a pixel-colour threshold |
| EC-20 | Minimaps have no transparency (alpha 255 everywhere) | No alpha-based check; WebP drops the channel |
| EC-25 | 743 of 796 matches record only one file | Heatmaps are built from human journeys; the match list shows humans and bots per match |
| EC-26 | Small samples (GrandRift: 59 matches) | Every heatmap and statistic carries its sample size; under 10 matches shows a "Few matches" badge |
| EC-27 / EC-30 | `user_id` holds real account IDs | 8-character `sha1` pseudonyms in every output; tests and `make check-ids` scan for raw IDs. Unsalted, so the 94 four-digit numeric IDs could be recovered by trial (accepted, out of scope) |
| EC-28 | A player crosses about one 64×64 heatmap cell per 5 s sample | Traffic time is spread along the straight line between samples ≤ 30 s apart, across every cell crossed, rather than given to the sample's cell only |
| EC-29 | 3 journeys were logged twice in full: the second half of the file repeats the first on all 8 columns | First half kept, copy discarded: 190 rows. The legitimate same-second double loots inside the first halves survive |

## 5. Pipeline

```
data/raw/player_data/  1,243 parquet files + 3 minimaps (gitignored)
  ingest.py      find day-folder files, check schema, decode event bytes, skip identical files
  normalize.py   seconds clock + match time, sort, remove doubled journeys, classify actors by behaviour
  journeys.py    categorise events (owner's view), flag Kill/Killed pairs, cut positions after death, split paths at gaps > 30 s
  projection.py  world (x, z) → UV 0–1: the only coordinate conversion in the project
  heatmaps.py    64×64 grids per map × date: traffic (time traced along each step), kills, deaths
  zones.py       16×16 regions (4×4 cells) and hotspot rules
  stats.py       every statistic for 28 map × date slices → stats.json
  images.py      minimaps → WebP at min(original, 4096) px, never upscaled
  export.py      index.json, one JSON per match, heatmaps/<map>.json, zones/<map>.json
  build.py       runs the stages above; writes docs/evidence/build_report.json
→ web/public/data (5.7 MB) + web/public/maps (1.3 MB), committed
→ Vercel builds web/ only
```

- **Run:** `make data` (about 45 s). The output is byte-identical on a rebuild, so `git status` stays clean when the pipeline hasn't changed.
- **Why at build time:** the data is fixed and small, so every query is known in advance. A visitor downloads `index.json` and then one small match file when they open a match, instead of 1,243 parquet files.
- **The data contract:** positions are stored as `[t, u, v]` triples grouped into path segments, and events as `{t, type, raw, u, v, flags}`. Heatmaps are sparse `[i, j, value]` cells with their sample sizes. The frontend never sees world coordinates or raw IDs.

## 6. Coordinate mapping

### 6.1 Approach
1. **Formula** (data README): `u = (x − origin_x) / scale`, `v = (z − origin_z) / scale`. `y` is height and is ignored.

   | Map | scale | origin_x | origin_z | Original image | Web image |
   |---|---|---|---|---|---|
   | AmbroseValley | 900 | −370 | −473 | 4320 × 4320 | 4096 × 4096 |
   | GrandRift | 581 | −290 | −290 | 2160 × 2158 | 2160 × 2158 |
   | Lockdown | 1000 | −500 | −500 | 9000 × 9000 | 4096 × 4096 |

2. **Store UV, not pixels.** UV doesn't depend on image size, so shrinking a 9000 px image to 4096 px can't break alignment. The same world point lands at the same fraction of the original and the WebP (largest difference over 5 test points per map: 1.1e-16).
3. **Flip v when drawing:** `px = u·W`, `py = (1 − v)·H`. Image rows count from the top; world z grows the other way.
4. **Width and height separately.** GrandRift is 2160×2158; treating it as square would put the south edge 2 px off.
5. **One drawing space in the browser.** deck.gl draws the minimap and every path, marker, playback dot and heatmap at `X = u·1000`, `Y = (1 − v)·1000·H/W`, so zooming and panning can't make them drift apart. Playback positions are interpolated between points already in that space.
6. **Nothing is clamped.** Out-of-range values are returned unchanged so they can be counted. All 72,996 recorded positions fall inside their map's square.

### 6.2 Worked example
The README's sample row: AmbroseValley, x = −301.45, z = −355.55. Computed with the production functions:
- u = (−301.45 + 370) / 900 = **0.07617**, v = (−355.55 + 473) / 900 = **0.1305**
- at 1024 px: (78.0, 890.4), matching the README's (78, 890)
- on the real 4320 px image: (329.0, 3756.2); on the 4096 px WebP: (312.0, 3561.5)
- without the flip, the WebP y would be 534.5: the same point mirrored to the other half of the map.

### 6.3 How it was checked
| Check | Result | Evidence |
|---|---|---|
| Maths tests on the production functions: README example, the four world corners → image corners, centre → centre (GrandRift 1080, 1079), +x right / +z up, no clamping, unknown map rejected | Pass | `pipeline/tests/test_projection.py` |
| Browser drawing space against the Python projection | Pass | `web/src/map/space.test.ts` |
| GrandRift overlays, with and without the flip, for 10 varied journeys (1,046 positions) | With the flip, every start and end sits on the island and clusters sit on named places (Labour Quarters, Mine Pit, Engineer's Quarters). Without it, starts land in the black area beyond the edge | [`grandrift_validation.md`](../evidence/coordinates/grandrift_validation.md) and its images |
| Round trip on real data: every exported path point → browser code → world, compared with the parquet x/z | Max error 0.04–0.07 world units on each map, equal to the 4-decimal rounding in the JSON | [`reverse_mapping_validation.md`](../evidence/coordinates/reverse_mapping_validation.md) |
| Independent audit: samples projected onto image content, compared with wrong flips, shifts and scales | 99.7–100 % land on map content; every wrong flip scores 2.6–24 points lower. Trusted to about ±10 world units | [`FORENSIC_AUDIT_REPORT.md`](../audits/forensic/FORENSIC_AUDIT_REPORT.md) |

**Limit:** no landmarks with known world coordinates exist, so these checks show consistency, not proof against ground truth.

## 7. Drawing events accurately

- **Humans vs bots:** humans are solid blue `#2589F5`, wider, with a casing, drawn on top, with start and end markers. Bots are dashed amber `#E99124`. Both stay visible; humans get priority. The match list has a "With bots" filter, and every match with a bot journey (52 of 796) has an amber "N bots" chip.
- **Markers:** one icon per category on a badge: kill, death, storm death and loot, plus bot kills and deaths on amber. Every marker sits at the owner's position (EC-11). Where markers overlap, kills, deaths and storm deaths win over loot (deck.gl `CollisionFilterExtension`); zooming in reveals the rest. Tooltips give the event, time and actor; Kill/Killed pairs say their cause is unknown.
- **Paths:** one line per segment; no line is drawn across a gap over 30 s, and nothing moves after a death.
- **Playback:** one match clock `t`. Paths are cut at `t` on every frame, so the route so far stays visible. Each actor's dot is interpolated between two samples of one segment, and hidden in a gap or after its last sample. Events appear at their time. `t=` in the URL opens that moment.
- **Heatmaps:** the 64×64 grids are the numbers. Each cell is painted as a small soft bump for display only; neighbours are never added together, so no peak is invented. Hovering reads the grid, not pixels. Traffic uses a log scale per map. Kills and deaths use fixed count classes (1 / 2–3 / 4–9 / 10+), the same on every map and date, so a colour always means the same count.
- **Hotspots:** 16×16 regions with events from at least 5 different matches, where no single match supplies over 50 % of the value; at most 6 per layer, strongest first. One match can't make a hotspot. When none qualifies, the panel says so. Regions are used because a 64×64 kill cell usually holds a single event: AmbroseValley kills have a split-half overlap of 0.0 at 64×64 and 0.8 at 16×16 ([spatial report](../evidence/spatial_analysis/REPORT.md)).

## 8. Frontend

- **Stack:** React 19, TypeScript, Vite, deck.gl 9 (WebGL: minimap image, paths, icons and heatmap bitmap in one view), Zustand (one store for the selection and the playback clock), React Router (synced with the URL), shadcn/ui on Radix with Tailwind v4, Recharts for the Overview charts, Vitest.
- **Loading:** `index.json` on start; a match file when a match opens; heatmap and zone files per map while Heatmaps is open. Minimaps are WebP.
- **Map behaviour:** zoom-out stops at the whole map and panning stops at its edge. The map frame never changes size when the side panel or playback dock opens. Camera moves the app makes are eased over 700 ms (instant with reduced motion).
- **Hosting:** Vercel builds `web/` only. `web/vercel.json` sends every path except `/assets/`, `/data/` and `/maps/` to `index.html`, so deep links work.

## 9. Verification

| What | Result (run 2026-10-24) |
|---|---|
| Pipeline tests (`make test`) | 130 passed |
| Web tests (`npx vitest run` in `web/`) | 476 passed in 28 files |
| Rebuild reproducibility | Byte-identical output from the same raw data |
| Independent forensic audit (`docs/audits/forensic/`) | Separate code reproduced all 796 index rows, every match file, every kill and death grid cell, and all 7,792 values in `stats.json`. Run before the 2026-10-24 actor and hotspot rule changes; its counts use the earlier "unknown" class |
| Frontend figures against the source data | `web/src/stats/crosspage.test.ts`; browser checks in `docs/evidence/frontend_verification/` |
| Privacy scan (`make check-ids`) | Scans every trackable file for raw player IDs and key-like secrets |

## 10. Trade-offs

| Considered | Chose | Why |
|---|---|---|
| A backend (FastAPI + DuckDB) vs static files | Static files on Vercel | Fixed ~8 MB data means every query is known in advance; nothing can fail to start on a reviewer's first visit. Revisit if the data goes live |
| Parse parquet in the browser (DuckDB-WASM) vs a Python pipeline | Python pipeline before deploy | Fast first load; the pipeline is tested and reproducible with `make data` |
| Convert coordinates in the browser vs in the pipeline | Pipeline, stored as UV | One tested function; paths, markers, playback and heatmaps can't disagree; images can be resized |
| Bots by ID (README) vs by behaviour | Behaviour (`BotPosition`), with the 17 mismatches flagged | The events show what the client logged; the flag keeps the choice reversible |
| Merge the Kill/Killed pairs into "self-kills" vs keep both rows | Keep both, flagged, cause unknown | The rows can't tell a self-kill from a trade with an unrecorded player |
| Drop all rows after a death vs only positions | Only positions | Nobody moves after dying, but a late kill isn't assumed false |
| Remove every duplicate row vs only proven copies | Only the byte-identical file and the 3 doubled journeys | Several pickups in one second are real |
| Traffic counted at samples only vs traced along each step | Traced (≤ 30 s steps) | Players cross about a cell per sample, so sample-only counting leaves the cells they crossed empty |
| Hotspots by resampling stability vs simple match guards | ≥ 5 matches, ≤ 50 % from one match, top 6 | Easy to explain to a designer; stops one match making a hotspot |
| deck.gl `TripsLayer` with a fading trail vs paths cut at `t` | Paths cut at `t`, full history visible | Same styling as the static view, testable on the CPU; at most 16 actors per match keeps it cheap |
| Real IDs vs hashes | 8-character hashes | The tool doesn't need identities |

## 11. Limits and open items
- **Coverage:** 743 of 796 matches record only one file, so the tool shows recorded actors, not everyone in the match. An empty heatmap cell means "no recorded human activity", not "unvisited".
- **Traffic is estimated.** The real route between two samples is unknown. The audit found movement is logged on a 5 s tick only while the actor moves, so long gaps are probably standing still. Hotspot values move by 1–16 % under other allocation models, though the strongest region on each map stays the same (audit follow-up D02).
- **No extraction event:** journeys that end without a death may have extracted, disconnected or not been recorded further.
- **Coordinates:** consistent across every check, but trusted to about ±10 world units, not pixel-perfect.
- **Repo housekeeping:**
  - `web/package.json` still lists `@anthropic-ai/sdk`, which nothing imports since the chat was removed.
  - The walkthrough video (section 12) isn't recorded yet.

## 12. Walkthrough script (3–5 min recording)
1. Open the live URL: the Overview compares the three maps; pick AmbroseValley for its report.
2. Go to **Journeys**, set a date, and sort the match list by Kills. Open the top match: the camera eases to it.
3. Point out humans (solid blue) vs bots (dashed amber), the marker icons, and a tooltip. Click a route for its statistics.
4. Press play at 4×, scrub, and step to the next event. Show that nobody moves after dying and that no line crosses a gap.
5. Turn on **With bots** to show the bot-match filter.
6. Go to **Heatmaps**: switch Traffic → Kills → Deaths, toggle Focused / All activity, click a numbered hotspot.
7. Switch to Lockdown and GrandRift to show the same view on each map.
8. Copy the link, open it in a new tab: the same view comes back.
