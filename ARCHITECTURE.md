# Architecture

> Covers features 1–6 (pipeline, map and filters, journeys, playback, heatmaps). Deploy (7) is added when built.

## What I built with and why
| Layer | Choice | Why |
|---|---|---|
| Data pipeline | Python (pandas, pyarrow, Pillow) run once with `make data`; pytest | The data is ~8 MB and fixed, so every query is known in advance. Parsing before deploy means a visitor downloads small, ready-to-draw JSON instead of 1,243 parquet files. |
| Frontend | React + TypeScript + Vite, deck.gl, Zustand, shadcn/ui; Vitest | deck.gl draws the minimap, paths, markers and grids in one WebGL view with zoom and pan. One store holds the selection and the playback clock and is mirrored in the URL, so every view is a shareable link and Back works. |
| Hosting | Vercel, static files, no backend | Nothing to start up or fail on a reviewer's first visit. |

## Data flow
```
data/raw/  1,243 parquet files + 3 minimaps
  → ingest     read each file once, decode event bytes, skip identical copies
  → normalize  ts → seconds → match time; sort; human / bot / unknown; drop rows after death; split paths at gaps > 30 s
  → project    world (x, z) → UV 0–1                ← the only coordinate conversion
  → aggregate  index.json, one JSON per match, 64×64 heatmap grids and 16×16 region statistics per map × date
  → web/public/data/*.json + maps/*.webp            committed; minimaps at most 4,096 px
  → browser    index on load, a match file when opened; filtering and playback run in memory
```
On screen:
- **Map:** one deck.gl canvas for all three maps; the minimap and all data share one drawing space (below).
- **Journeys:** a line per path piece, an icon badge per event. Humans blue and solid, bots amber and dashed, unknown grey, each with its own shape. Where markers overlap, the rarer event wins; zooming in reveals the rest.
- **Playback:** one match time `t` in the store; the loaded match is cut at `t`. Paths run up to `t`; each actor's position is estimated on the straight line between two samples of one path piece, and isn't shown in a gap or after its last sample; events appear at their time. A link with `t=` opens at that moment.

## Coordinate mapping
1. **Formula** (data README, verified): `u = (x − origin_x) / scale`, `v = (z − origin_z) / scale`. `y` is elevation and is ignored.
2. **Store UV, not pixels.** The README says 1024 px, but the real images are 4320², 2160×2158 and 9000². UV doesn't depend on image size, so resizing images can't break alignment.
3. **Flip y at draw time.** Image rows count from the top, while world z increases the other way: `pixel_y = (1 − v) · H`.
4. **Worked example** (README row, AmbroseValley, scale 900, origin −370/−473): x = −301.45, z = −355.55 → u = 0.0762, v = 0.1305 → (78, 890) at 1024 px, as the README says, and (329, 3756) on the real 4320 px image.
5. **One drawing space.** deck.gl draws the image and all data at `X = u·1000`, `Y = (1 − v)·1000·H/W`, so zoom and pan can't make them drift. Playback positions are interpolated between points already in this space, so they can't drift either. GrandRift's 2160×2158 image gives a ≤ 0.1 % stretch.
6. **Validation.** Tests on the production functions (`pipeline/tests/test_projection.py`): the README example, corners → image corners, centre → centre (GrandRift: 1080, 1079), +x right / +z up, no position off the map. The browser's drawing space is tested against values from the Python projection (`web/src/map/space.test.ts`). Ten GrandRift journeys start inside the map with the flip and outside it without ([report](docs/evidence/grandrift_validation.md)). No ground-truth landmarks exist, so this shows consistency, not independent proof.

## Assumptions where the data was ambiguous
Full list with evidence: [EDGE_CASES.md](EDGE_CASES.md).

| Ran into | Handled by |
|---|---|
| `ts` is typed ms but holds epoch seconds | Read as seconds; match time = ts − earliest ts in the match |
| 17 numeric-ID journeys (3 actors) log player-client events (`Position`, `Loot`) | **Unknown** unless both README rules agree (UUID + `Position` = human, numeric ID + `BotPosition` = bot). Shown, but left out of human counts and heatmaps (≤ 1.63 % of any total; [evidence](docs/evidence/event_forensics/README.md)) |
| `Kill`/`Killed` only as same-file, same-second pairs (3) | Both kept and flagged; no cause claimed; the paired `Kill` isn't counted as a kill |
| An event's x/z and meaning depend on whose file it is | Kill marker = where the killer stood, death = where the victim fell. Counts say their scope (human files, markers on the map, one journey) |
| 743 of 796 matches have one recorded player | Heatmaps from human journeys; the match list shows humans and bots per match |
| Position gaps up to 518 s | Paths break at gaps > 30 s; playback draws no movement across them |
| No extraction event | Nothing is shown as an extraction; a journey's last point is labelled "last recorded position" |
| 3 journeys logged twice in full | First half kept, copy discarded (190 rows); identical-looking rows elsewhere kept |
| Rows logged after death (174 journeys) | Positions dropped, so nobody moves after dying; 2 late kills kept and flagged |
| Matches crossing midnight; folders aren't UTC days | Date = UTC date of the first event; dates generated from the data; partial days flagged |
| A player crosses ~1 heatmap cell per 5 s sample | Traffic time traced along each step, not only at sample points |

### Heatmap architecture

Kills, deaths, and traffic heatmaps are precomputed in Python as 64×64 grids per map and date, then served as static JSON. This avoids repeated aggregation in the browser and keeps the application backend-free.

Only confirmed human journeys contribute to these aggregates; bots and ambiguous actors are excluded. Traffic uses segment-traced movement with a 30-second discontinuity threshold rather than relying solely on sampled positions.

The frontend renders unsmoothed cells using the same UV coordinate mapping as player journeys. Heatmaps are map/date-level aggregates, independent of the selected match and playback time.

Because the supplied telemetry does not necessarily represent complete match populations, empty cells mean **no observed human activity**, not that the area was never used.


## Trade-offs
| Considered | Chose | Because |
|---|---|---|
| FastAPI/DuckDB backend vs static files | Static files | Fixed, small data; fewer moving parts. Revisit if the data goes live. |
| Convert coordinates in the browser vs the pipeline | Pipeline (UV) | One tested function; paths, markers, playback and heatmaps can't disagree. |
| Actor kind by ID, by behaviour, or only when both agree | Both must agree, else `unknown` | Each single rule forces a label on 17 journeys that the data can't support. |
| Blurred heatmap vs grid cells | Grid cells, log scale for traffic | No invented hotspots; skewed traffic stays readable. |
| Playback: GPU `TripsLayer` with a 30 s fading trail vs paths cut in code with full history | Cut in code ⏳ *awaiting S's confirmation* | Testable, keeps the route styling, final journeys stay inspectable; ≤ 16 actors and 1,174 samples per match keep it cheap. |
| Real player IDs vs hashes | Short unsalted hashes | The tool doesn't need identities. The 94 numeric IDs are recoverable by trial; accepted (EC-30). |

### Interpretation layer

A heatmap shows where things were recorded, not how much weight the pattern deserves, so a separate layer of **16×16 regions** (blocks of 4×4 grid cells) says which concentrations are supported. The pipeline computes, per map, date and layer, each candidate region's value, share of the layer, contributing matches and recorded players, and how stable it is when the matches are resampled; a region only counts as a *consistent concentration* if it also holds when the grid is shifted by half a region. The rest are reported as *observed*, with their measurements kept. The numbers are precomputed with fixed seeds into static `zones/<map>.json`, because the browser has no per-cell match information, and they are tested for reconciliation with the heatmap totals. The 64×64 grids stay the numerical source and the detailed picture; the stability figures describe this sample only and are not population-level significance. Method, results and validation: [spec 06](docs/06_HEATMAPS.md) and the [evidence report](docs/evidence/spatial_analysis/REPORT.md).

## Tabs and the shared map (feature 6c)

One `MapView` (one deck.gl canvas, one minimap) serves two tabs. `MapStage` chooses the layers from the `tab` in the Zustand store: journey layers on Journeys & Playback; the 64×64 density picture and/or the 16×16 outlines on Heatmaps. The URL is written by `useUrlSync` with `tab` and only that tab's parameters; heatmap and region files load only while the Heatmaps tab is open. Leaving Journeys pauses playback in the store (`setTab`), keeping the match and time. Clicking a region sets `selectedZone`; `MapStage` passes a `focus` to `MapView`, which moves the camera, and `RegionCard` reads the same record. See `docs/06_HEATMAPS.md`, Stage 6c.
