# Reverse coordinate mapping: validation (all three maps)

**Verdict:** no bug found, and nothing in the code was changed.
- **Formulas:** the forward mapping (pipeline) and the reverse mapping (browser hover readout) are exact inverses on all three maps.
- **Dimensions:** each map uses its own image size, and GrandRift's non-square image is handled with separate width and height.
- **Real data:** all 72,676 exported path points go back to their parquet x/z within the JSON's rounding.
- **Not proven:** a real browser hover (deck.gl `BitmapLayer` placement) was not exercised. See "What this does not prove".

The earlier check ([grandrift_validation.md](grandrift_validation.md), decision D4) covered GrandRift's forward mapping only. This one covers the reverse direction and all three maps.

## How to reproduce
```
cd pipeline
uv run python validate_reverse_mapping.py     # pictures + reverse_mapping_metrics.json in docs/evidence/
uv run pytest tests/test_projection.py        # existing forward tests (16 passed)
cd ../web && npx vitest run src/map/space.test.ts   # existing reverse tests (27 passed)
```
Every number below is in `reverse_mapping_metrics.json`. The script runs the real `web/src/map/space.ts` with node, so the browser code is tested, not a copy of it. Its own independent formulas (`world_to_pixel`, `pixel_to_world`) are written out in the script and don't import the code under test.

## The two directions
| Step | Where | Formula |
|---|---|---|
| world → UV | `pipeline/.../projection.py` | `u = (x − origin_x) / scale`, `v = (z − origin_z) / scale` |
| UV → image pixel | site (`space.ts`, via `index.json` width/height) | `px = u·W`, `py = (1 − v)·H` |
| image pixel → UV | `spaceToUv` | `u = px/W`, `v = 1 − py/H` |
| UV → world (hover) | `uvToWorld` | `x = u·scale + origin_x`, `z = v·scale + origin_z` |

`y` (height) plays no part. The browser's drawing space is 1000 units wide and `1000·H/W` tall, so the `H/W` factor keeps GrandRift in proportion.

## 1. Dimensions and scaling
| Map | Original | Exported WebP | `index.json` | World square | World units per pixel (WebP, x / z) |
|---|---|---|---|---|---|
| AmbroseValley | 4320 × 4320 | 4096 × 4096 | 4096 × 4096 | x −370…530, z −473…427 | 0.21973 / 0.21973 |
| GrandRift | 2160 × 2158 | 2160 × 2158 | 2160 × 2158 | x, z −290…291 | 0.26898 / 0.26923 |
| Lockdown | 9000 × 9000 | 4096 × 4096 | 4096 × 4096 | x, z −500…500 | 0.24414 / 0.24414 |

- `index.json` size and calibration match the real WebP files and the pipeline's `MAPS` on all three maps.
- The aspect ratio is preserved in every export (AmbroseValley and Lockdown are square before and after).
- Because the pipeline stores UV, the same world point lands at the same fraction of the image on the original and the WebP. The largest difference over 5 test points per map is 1.11e-16 (AmbroseValley), 0 (GrandRift), 0 (Lockdown). Example: Lockdown world (−400, 400) is pixel (900, 900) on the 9000 px original and (409.6, 409.6) on the 4096 px WebP.
- **GrandRift is the only map where width ≠ height.** One pixel is 0.0926 % taller than it is wide in world units. Treating the image as square would put the south edge 2 px off. The code uses `W` and `H` separately, so there is no error.

## 2. Extent of the real data
All recorded positions (human and bot, 72,996 rows) fall inside their map's calibrated square, so no position is clamped or lost.

| Map | Positions | Outside square | u range | v range |
|---|---|---|---|---|
| AmbroseValley | 48,691 | 0 | 0.05 – 0.7464 | 0.1033 – 0.9264 |
| GrandRift | 5,728 | 0 | 0.1103 – 0.9408 | 0.1652 – 0.7919 |
| Lockdown | 18,577 | 0 | 0.0934 – 0.8484 | 0.2149 – 0.829 |

Players use only part of each image, which is expected: the minimaps have black margins.

## 3. Round trip on real data
Each exported path point (`u`, `v` rounded to 4 decimals) was sent through `space.ts`: UV → drawing space → UV → world. The result was compared with the original parquet `x`, `z`, matched on match, hashed player and match time.

| Map | Points | Max error (world units) | Mean error | Largest possible error from the 4-decimal rounding |
|---|---|---|---|---|
| AmbroseValley | 48,457 | 0.0636 | 0.0345 | 0.0636 |
| GrandRift | 5,712 | 0.0409 | 0.0223 | 0.0411 |
| Lockdown | 18,507 | 0.0707 | 0.0381 | 0.0707 |

- All 72,676 points found a parquet row (0 unmatched), and every one is within the rounding limit.
- The maximum error equals the limit, so the only error is the 4-decimal rounding in the JSON. The formulas add none.
- The worst case, 0.0707 units, is about 0.29 of one WebP pixel on Lockdown.
- The export has fewer points than the 72,996 rows in section 2 because after-death positions are dropped from paths (D2).

## 4. Pixel probes on the exported WebP
For each map, 5 edge/centre points and 2,000 random pixels were turned into the drawing-space coordinate the hover handler would receive, then through `space.ts` to world x/z. This was compared with the independent formula in the script.

| Map | Probes | Max difference (world units) | Max pixel → world → pixel error (px) | All inside map |
|---|---|---|---|---|
| AmbroseValley | 2,005 | 1.17e-13 | 9.1e-13 | yes |
| GrandRift | 2,005 | 1.27e-13 | 5.12e-13 | yes |
| Lockdown | 2,005 | 1.14e-13 | 6.43e-13 | yes |

These are floating-point noise. The image corners come back as exactly the calibrated world square: for example, AmbroseValley top-left is (−370, 427) and bottom-right is (530, −473). GrandRift's centre pixel (1080, 1079) is world (0.5, 0.5).

## 5. Pictures
Each overlay draws every exported position on the exported minimap (humans yellow, bots blue, the 17 `unknown` journeys white; EC-09), a labelled world grid every 100 units, world (0, 0) in red, and nine cursor probes. Each probe label shows the world x/z that `space.ts` returns for that pixel, and the label sits on the grid line with the same value.

| Map | Overlay | Controls |
|---|---|---|
| AmbroseValley | [reverse_ambrosevalley_overlay.png](reverse_ambrosevalley_overlay.png) | [reverse_ambrosevalley_controls.png](reverse_ambrosevalley_controls.png) |
| GrandRift | [reverse_grandrift_overlay.png](reverse_grandrift_overlay.png) | [reverse_grandrift_controls.png](reverse_grandrift_controls.png) |
| Lockdown | [reverse_lockdown_overlay.png](reverse_lockdown_overlay.png) | [reverse_lockdown_controls.png](reverse_lockdown_controls.png) |

Each controls image shows human positions three ways on the same map: the production mapping, a control with the y-flip removed, and a control with x and z swapped. What the pictures show:
- **Production:** positions stay on the playable land on all three maps. On Lockdown they follow the island's roads, buildings and rivers, and are not out on the black margin. On GrandRift they cluster on the labelled areas (Mine Pit, Engineer's Quarters, Gas Station, Labour Quarters).
- **Both controls:** positions spill out of the playable area into the black margins (clearest on Lockdown's south and GrandRift's edges) and no longer follow roads or the island outline. This was judged by eye, not counted.

This is a visual check and not a pass/fail test, in line with D4 (no pixel-colour threshold). The maths in sections 3–4 is the pass/fail part.

## What this does not prove
- **No landmark ground truth.** No known world coordinates of landmarks were available. The pictures show the mapping fits the art, and the maths shows the two directions agree. Neither proves the README's calibration numbers (`scale`, `origin`) are what the game uses. GrandRift's labelled areas, which line up with player clusters, are the closest independent evidence.
- **Browser placement not exercised.** The hover test starts from the coordinate deck.gl would give. It assumes `BitmapLayer` stretches the image exactly over `imageBounds`, which is how it is configured but was not checked in a running browser.
- **Rounding.** Reverse mapping from the JSON can be off by up to 0.0707 world units (section 3). That is the cost of 4-decimal storage, and it is far below one pixel.
