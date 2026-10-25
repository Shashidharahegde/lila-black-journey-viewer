# Architecture

Live: https://lila-black-journey-viewer.vercel.app/ · Full detail, evidence and every edge case: [TECHNICAL_REPORT.md](docs/reports/TECHNICAL_REPORT.md) · Register: [EDGE_CASES.md](docs/reports/EDGE_CASES.md)

## What I built with and why
| Layer | Choice | Why |
|---|---|---|
| Data pipeline | Python (pandas, pyarrow, numpy, Pillow), run once with `make data`; pytest | The data is small (~8 MB) and fixed, so every query is known in advance. Parsing before deploy means a visitor downloads small, ready-to-draw JSON instead of 1,243 parquet files. |
| Frontend | React + TypeScript + Vite, deck.gl, Zustand, React Router, shadcn/ui; Vitest | deck.gl draws the minimap, paths, icons, playback and heatmaps in one WebGL view. One store holds the selection and playback clock, mirrored in the URL, so every view is a shareable link. |
| Hosting | Vercel, static files, no backend | Nothing to start up or fail on a reviewer's first visit. |

## Data flow
```
data/raw/  1,243 parquet files + 3 minimaps (gitignored)
  → ingest     check schema, decode event bytes (UTF-8), read the one duplicated file once
  → normalize  ts as seconds → match time; stable sort; remove 3 doubled journeys; bot = logs BotPosition
  → journeys   events from the file owner's view; flag Kill/Killed pairs; drop positions after death; split paths at gaps > 30 s
  → project    world (x, z) → UV 0–1                         ← the only coordinate conversion
  → aggregate  64×64 heatmap grids, 16×16 hotspot regions, stats for 28 map × date slices
  → web/public/data/*.json (5.7 MB) + maps/*.webp (1.3 MB)   committed; byte-identical on rebuild
  → browser    index.json on load, one match file when opened; filtering and playback in memory
```
Three pages share one map row (map toggle, date filter): **Overview** (`/stats`, compares the maps), **Journeys** (`/journeys`: match list, routes, markers, playback) and **Heatmaps** (`/heatmaps`: Traffic, Kills or Deaths across matches, with hotspots). On the map, humans are solid blue and drawn on top; bots are dashed amber. Each event type has its own icon; where icons overlap, kills and deaths win over loot. Playback cuts every path at time `t` on each frame. Heatmap cells are painted as small soft bumps (display only: neighbours are never added together). Hotspots are 16×16 regions with events from ≥ 5 matches and ≤ 50 % from any one match, top 6 per layer.

## Coordinate mapping
1. **Formula** (data README, verified): `u = (x − origin_x) / scale`, `v = (z − origin_z) / scale`. `y` is elevation and is ignored.
2. **Real image sizes, not 1024 px:** AmbroseValley 4320², GrandRift 2160×2158, Lockdown 9000². So the pipeline stores **UV, not pixels**; the web images (≤ 4,096 px) can be any size without breaking alignment.
3. **Flip y:** image rows count from the top while world z grows upward, so `px = u·W`, `py = (1 − v)·H`, with W and H separate (GrandRift isn't square).
4. **Worked example** (README row, AmbroseValley, scale 900, origin −370 / −473): x = −301.45, z = −355.55 → u = 0.0762, v = 0.1305 → (78, 890) at 1024 px, as the README says, and (312, 3562) on the 4096 px WebP. Without the flip, y would be 535: mirrored.
5. **One drawing space:** deck.gl draws the image and all data at `X = u·1000`, `Y = (1 − v)·1000·H/W`, so zoom, pan and playback can't drift.
6. **Checked four ways:**
   - maths tests on the production function: README example, corners, centre, axis directions (`test_projection.py`);
   - GrandRift overlays with and without the flip: with it, routes sit on roads and named places; without it, they start in the black area beyond the edge ([evidence](docs/evidence/coordinates/grandrift_validation.md));
   - every exported point sent back to world space through the browser code: error ≤ 0.07 units, which is the JSON rounding ([evidence](docs/evidence/coordinates/reverse_mapping_validation.md));
   - an independent audit: 99.7–100 % of samples land on map content, and every wrong flip scores lower.

   No landmarks with known coordinates exist, so this shows consistency (about ±10 world units), not ground truth.

## Assumptions where the data was ambiguous
| Ran into | Handled by |
|---|---|
| `ts` typed ms, but read as ms the data spans 6.6 min in 1970 | Read as epoch **seconds**; match time = ts − earliest ts in the match; matches then last 13–887 s |
| `event` stored as bytes | Decoded as UTF-8; an unknown event type stops the build |
| README: numeric ID = bot. 17 numeric-ID files never log `BotPosition` and loot like players | **Bot = the file logs `BotPosition`**, else human. The 17 count as humans, flagged `id_mismatch` (≤ 1.63 % of any heatmap total) |
| An event's x/z is the file owner's position | Kill marker = where the killer stood; death marker = where the victim fell |
| `Kill`/`Killed` only as 3 same-file, same-second pairs | Both kept, flagged; cause unknown (not called self-kills); the `Kill` isn't counted as a kill |
| Folders aren't UTC days; one match's files span two folders | Group by `match_id`; date = UTC date of the first event; partial days flagged |
| One file in two folders; 3 journeys logged twice in full | Identical file read once; doubled journeys keep their first half (190 rows). Same-second repeat loots elsewhere are kept |
| 172 journeys log positions after death | Those 173 positions dropped, so no one moves after dying; 2 late `BotKill`s kept, flagged |
| Positions every ~5 s, gaps up to 518 s | Paths and playback break at gaps > 30 s; traffic time is traced along each shorter step |
| No extraction event | Nothing is drawn as an extraction; a journey ends at its "last recorded position" |
| 743 of 796 matches record one file | Figures say "recorded"; every heatmap shows its sample size; under 10 matches is flagged "Few matches" |

## Trade-offs
| Considered | Chose | Because |
|---|---|---|
| FastAPI + DuckDB backend vs static files | Static files | Fixed, small data; fewer moving parts. Revisit if the data goes live. |
| Parse parquet in the browser (DuckDB-WASM) vs a pipeline | Python pipeline | Fast first load; tested and reproducible. |
| Convert coordinates in the browser vs the pipeline | Pipeline, stored as UV | One tested function; paths, markers, playback and heatmaps can't disagree. |
| Bots by ID vs by behaviour | Behaviour, mismatches flagged | Follows what the client logged; the flag keeps it reversible. |
| Hotspots by resampling stability vs simple match guards | ≥ 5 matches, ≤ 50 % from one, top 6 | Explainable to a designer; one match can't make a hotspot. |
| `TripsLayer` fading trail vs paths cut at `t` | Paths cut at `t`, full history visible | Same styling as the static view; testable; ≤ 16 actors per match. |

**Next:** an inferred-extraction layer, loot and storm heatmaps, and per-match heatmaps.
