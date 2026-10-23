# GrandRift coordinate mapping: validation (decision D4)

**Verdict:** no bug found, and the production mapping is unchanged.
- **Maths:** the production functions correctly implement the README formula, including GrandRift's non-square image (tests below).
- **Pictures:** with the production mapping, real journeys line up with the map. With the y-flip removed, they clearly don't.
- **Not proven:** alignment has **not** been checked against ground truth (known world coordinates of landmarks), because none is available.

## How to reproduce
```
cd pipeline
uv run python validate_map_alignment.py      # images + grandrift_metrics.json in docs/evidence/
uv run pytest tests/test_projection.py       # automated coordinate tests
```
The script uses the production code throughout: `ingest.load_journeys`, `normalize.add_match_clock`, `projection.world_to_uv` and `projection.uv_to_pixel`. Its only local maths is the deliberately wrong control, `py = v·H`. Every number below is in `grandrift_metrics.json`.

## Inputs
| Item | Value |
|---|---|
| Data | 1,243 files found, 1,242 read, 1 duplicate skipped, 0 failed |
| Image | `GrandRift_Minimap.png`, **2160 × 2158**, RGBA, used at original size (no resize, stretch or rotation) |
| Transparency | Alpha is 255 on every pixel, so the image has no meaningful transparency |
| Calibration (data README) | scale 581, origin_x −290, origin_z −290; the world square x, z ∈ [−290, 291] covers the image |
| Mapping | `u = (x + 290)/581`, `v = (z + 290)/581`; `px = u·2160`, `py = (1 − v)·2158` |

## Journeys inspected
**Selection rule:**
- Human journeys only, meaning files with `Position` rows (bots record `BotPosition`).
- At least 30 positions.
- Score = path length ÷ max + total turning ÷ max. Only steps within a 30 s gap count.
- Highest score first, ties broken by file name.
- At most one journey per player and per match.

47 of 59 GrandRift human journeys qualified, and 10 were drawn: **1,046 positions** in total. Lines are never drawn across gaps over 30 s; journeys 3, 6, 7 and 8 have such gaps.

| # | Colour | Player (hash) | Match | Positions | Segments | Path length (world units) | Longest gap (s) |
|---|---|---|---|---|---|---|---|
| 1 | red | c3c2dee5 | 5955ad0c | 125 | 1 | 1709 | 25 |
| 2 | green | 13a425dd | 4930d515 | 126 | 1 | 2038 | 26 |
| 3 | blue | 4452e1fd | a0599e40 | 110 | 2 | 1601 | 35 |
| 4 | yellow | 93b855f8 | 1d360601 | 109 | 1 | 1544 | 30 |
| 5 | magenta | 9b2783cf | c3a6fc96 | 112 | 1 | 1249 | 25 |
| 6 | teal | a2d8b9fd | b084348a | 106 | 2 | 1250 | 40 |
| 7 | orange | 5a8a3683 | 9b049757 | 94 | 3 | 1163 | 35 |
| 8 | violet | 08289848 | 46a1ace9 | 90 | 2 | 1491 | 126 |
| 9 | lime | cbb0558d | 61a3159e | 90 | 1 | 1394 | 25 |
| 10 | white | 248ee9af | faa11b06 | 84 | 1 | 1003 | 25 |

**Markers:**
- White-filled ring with a number = start of the journey.
- Filled square = end of the journey.
- Small dots = recorded positions.

## Mathematical checks (production functions)
| Check | Result |
|---|---|
| README example (AmbroseValley, 1024 px) → (78, 890) | (77.995, 890.368) ✅ |
| World SW / SE / NW / NE corner → image bottom-left / bottom-right / top-left / top-right | (0, 2158) / (2160, 2158) / (0, 0) / (2160, 0) ✅ |
| World centre → image centre (non-square) | (1080, 1079) ✅ |
| Orientation: +10 in x → right; +10 in z → up | (1117.2, 1079) and (1080, 1041.9) ✅ |
| Out-of-bounds input isn't clamped; unknown map is rejected | ✅ (pytest) |

`tests/test_projection.py` runs these checks for all three maps (24 pipeline tests pass in total).

## Quantitative results
| Measure | Production mapping | No-flip control |
|---|---|---|
| Positions outside UV [0, 1]: selected 1,046 / all 3,740 GrandRift human positions | 0 / 0 | 0 / 0 (flipping can't push UV out of range) |
| Positions over transparent pixels | 0 % (not meaningful: no transparency) | 0 % |
| *Descriptive only:* positions over near-black pixels (RGB sum < 30), selected / all | 4.2 % / 4.0 % | 11.5 % / 12.1 % |

The near-black share is **not** a pass/fail measure. The map's roads and some building art are near-black, and players walk on roads, so a few percent is expected even with a perfect mapping. It only shows that the control lands on dark pixels about three times as often.

## Visual observations
| Image | Production mapping | No-flip control |
|---|---|---|
| `grandrift_correct.png` / `grandrift_no_flip.png` (full map) | Every start and end marker sits inside the map outline. Dense clusters of samples sit on named places: Labour Quarters, Mine Pit, Engineer's Quarters, Gas Station, Burnt Zone. Long routes follow the south-west ring road. | Several start and end markers sit in the black area beyond the map edge. Clusters land on unnamed ground (e.g. north of Mine Pit). |
| `grandrift_area_A_burnt_zone_*` (px 1440–1980, py 300–840) | Journeys 2, 6, 7 and 10 start together in the north-east corner on map ground, then head south through the Burnt Zone. | The same window has none of those journeys; the Burnt Zone is empty. |
| `grandrift_area_B_south_east_*` (px 1440–1980, py 1380–1920) | Mostly the black area beyond the map edge; only a few paths cross the map part in the top-left corner. | Starts of journeys 2, 7 and 10 (at py ≈ 1640–1694) and dense paths sit in the black area outside the map. |
| `grandrift_area_C_engineers_quarters_*` (px 1620–2160, py 800–1340) | Journey 8 starts on map ground at the east edge (2009, 1234) and its activity centres on the Engineer's Quarters building. | Journey 8's start (2009, 924) and journey 6's end lie in the black area beyond the east edge; activity shifts north, away from the building. |

**Pattern:** with the production mapping, several journeys share start points at the map's edges (north-east corner, east edge, west edge). That is consistent with fixed spawn points. In the control, those shared starts move into the void.

## Limitations
- **No ground truth.** The labels on the minimap are artwork, not coordinates. Without landmark world coordinates (e.g. from the level editor), this shows the mapping is *consistent* with the map, not that it is exact.
- **Only y is controlled.** The control removes the y-flip. A mirrored x axis isn't drawn separately; the corner and orientation tests cover x mathematically.
- **Small errors are invisible.** Paths are straight lines between samples taken about 5 s apart, so they cut corners and cross buildings even when the mapping is correct. An error of a few pixels in scale or origin couldn't be seen this way.
- **The midline can't discriminate.** Areas near the map's horizontal centre (Labour Quarters, Mine Pit) move little under a flip. That's why the crops use the top and bottom edges.
- **The ~2 px non-square difference can't be tested visually.** One scale covers both axes, while the image is 2 px shorter than it is wide. The ≤ 0.1 % y-stretch (≈ 0.5 world units) is below what this method can detect.
- **Selection bias.** The 10 journeys are long, twisting human journeys, chosen to show routes. They are not a random sample.

## Decision D4 (approved by S)
- **Pass/fail:** the mathematical tests in `pipeline/tests/test_projection.py` are mandatory: README example, corners, centre, orientation, non-square image. The production mapping is kept for Stage 2 as long as they pass.
- **No pixel-colour criterion:** the near-black threshold was removed.
- **Evidence:** this report and its overlays are supporting evidence, reviewed by S.
- **Final check:** rendered alignment on screen is verified in Stage 3 (`docs/03_MAP_AND_FILTERS.md`, "How to verify" step 5).

If LILA can provide world coordinates for two or three landmarks, a landmark test would turn "consistent" into "verified".
