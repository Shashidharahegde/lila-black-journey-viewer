# Part 2 — Reconciliation evidence (after reading the README, pipeline, tests, docs and outputs)

Order of work: the data README (`AUDIT/README.md`), then the pipeline code and tests, then the generated outputs, then `EDGE_CASES.md`, `docs/specs/02_DATA_PIPELINE.md`, `ARCHITECTURE.md`, `INSIGHTS.md` and `docs/evidence/`.
Part 1 is not edited. Where this part corrects Part 1, it says so (§9).
Labels: **F** fact · **I** inference · **C** convention · **A** unresolved ambiguity · **E** error.

## 1. The data README's claims

| README claim | Verdict | Evidence |
|---|---|---|
| 1,243 files, ~89,000 rows, 339 players, 796 matches | Confirmed (F) | 1,243 / 89,104 / 339 / 796 (b02) |
| Feb 10–14, 2026; Feb 14 partial | Mostly. 1 match starts 2026-02-09 23:58:55 UTC; Feb 14 data ends 15:01:40 UTC (F) | b02 |
| Each file = one player (or bot) in one match | Confirmed, except 1 byte-identical copy and 3 files holding their content twice (F) | a02, a04 |
| "A match with 10 humans and 40 bots produces 50 files" | **Contradicted for this dataset.** 743 of 796 matches have one file; bot files exist in 52 matches (F) | a06 |
| UUID = human, numeric = bot | Holds for 1,225 of 1,242 files. 17 numeric-ID files behave like the player client (A) | a03, a06, a07 |
| `ts` is ms of time elapsed within the match, not wall-clock | **Contradicted.** The integers are Unix epoch seconds of wall-clock time (I, very strong) | a02, a03 |
| `event` is UTF-8 bytes | Confirmed (F) | a02 |
| `BotKill` = "a human killed a bot"; `BotKilled` = "a human was killed by a bot" | **Incomplete.** Bot files log both from the bot's point of view, including bot-on-bot kills (43 pairs) (I) | a07 |
| Humans generate Position, Kill, Killed, Loot, KilledByStorm | Incomplete: UUID files also hold 2,223 `BotKill` and 400 `BotKilled` (F) | a12 |
| Minimaps are 1024×1024 | **Contradicted:** 4320², 2160×2158, 9000² (F) | a09 |
| Scale/origin table and formula, y flipped | Supported by independent registration (§2) (I) | b01 |
| Worked example (78, 890) | Reproduces: (77.99, 890.37); both sample rows exist in the data (F) | b02 |
| `y` is elevation | Consistent (narrow per-map band) (I) | a02 |
| "Position events are ~85%+" | **Contradicted:** Position + BotPosition = 82.0 %, Position alone = 57.6 % (F) | b02 |
| "Reconstruct the full match by combining files" | Only the *recorded* actors can be reconstructed. 690 matches have human–bot combat but no bot file (F) | c03 (f) |

## 2. Coordinate transform — independent registration test

Test (b01): map every movement sample with the README parameters and check whether its pixel is map content. Content = not the pure-black background (blurred luma > 6 on a 1024² resample). I then scanned scale ±10 %, shifts ±30 world units and all four axis flips.

| Map | On content (README params) | Best alternative flip | Best scanned (saturated) |
|---|---|---|---|
| AmbroseValley | 100.00 % | 95.7 % (no z-flip) | 100.00 % at dx=0, dz=0, ×1.00 |
| GrandRift | 99.69 % | 95.7 % (x mirrored) | 100.00 % (flat optimum) |
| Lockdown | 99.99 % | 97.4 % (x mirrored) | 100.00 % (flat optimum) |

With a stricter mask (luma > 30) the scan prefers small shifts on GrandRift (dz = +18, ×1.09). That comes from GrandRift's dark roads, which players walk on (EC-19). Visual overlays: samples trace roads and interiors, and avoid Lockdown's boulders and sea.
**Judgment (I):** the README transform and orientation are supported. A content mask cannot detect errors below roughly ±10 world units, and zero rotation is assumed, not tested. The project's own validation (overlays with and without the flip) is consistent with this. ARCHITECTURE.md is right that no ground-truth landmarks exist.

## 3. Implementation trace (`ingest.py` → `build.py`)

| Stage | What it does (verified by reading and by reconstruction) | Assessment |
|---|---|---|
| `ingest.load_journeys` | Reads day folders in sorted order, skips byte-identical files by SHA-256 (keeps `February_10`), validates schema, decodes `event`, keeps `ts` as an int64 | Correct (F). Journeys are keyed by **basename** (`file`) from here on. Safe on this data, where (user, match) is unique after dedupe; a latent risk if two differing files ever shared a name |
| `normalize.add_match_clock` | `epoch_s = ts int`; `t = epoch_s − min(epoch_s in match)`; sorts by (match, file, epoch_s, row) | Correct (F). The only out-of-order files are the 3 doubled files, so EC-02 is EC-29 seen from another side |
| `normalize.remove_doubled_journeys` | Drops the second half when it equals the first half on all 8 columns | Correct; exactly the 3 files and 190 rows I found independently (F) |
| `normalize.classify_actors` | human = UUID ∧ no BotPosition; bot = numeric ∧ BotPosition; else unknown | Same rule I chose independently: 781 / 444 / 17 (C, justified) |
| `journeys.categorize_events` | Owner-perspective categories; flags same-file, same-second Kill+Killed pairs | Correct (F) |
| `journeys.apply_death_cutoff` | Drops positions in a **later second** than the first death; flags later non-positions `after_death` | Behaves as documented: 173 positions dropped, 2 BotKills flagged. 33 positions in the *same* second after the death stay (≤ 1.65 units from the death point), so "nobody moves after dying" holds only to second resolution (F, negligible) |
| `journeys.path_segments` | Splits paths at gaps > 30 s | Correct to spec. Its rationale is contradicted (§7.1) |
| `projection` | README formula, UV, never clamped | Correct; all positions fall inside [0,1] (F) |
| `heatmaps.trace_step / traffic_grid` | Exact line–cell intersection; step time spread by length; steps > 30 s dropped | Arithmetic exact (an independent sampled tracer agrees to ≤ 0.205 s per cell and totals to 0.0). The model is questionable (§7.1) |
| `export` | index, match files, heatmaps (humans only), zones | All values reproduced independently (§4) |
| `zones` | 16×16 regions, top decile, 300 match bootstraps with one fixed seed, support checks, 3 shifted grids | Implemented as described. Results depend on the seed (§7.2) |
| `stats` | 28 slices, rates, distributions, `map_score` | Values reproduced. `map_score` scales **rounded** rates (2 dp): AmbroseValley 0.7648 unrounded becomes 0.77 published (E, negligible). Validity of `map_score` is in §7.3 |
| `images` | WebP ≤ 4096 px, alpha dropped | Byte-identical on rebuild |

## 4. Calculation reconciliation (independent code, `scripts/c01_reconstruct.py`)

My own implementation of the pipeline's *stated* conventions, with no `lila_pipeline` imports, compared with the committed `web/public/data`:

| Output | Granularity | Result |
|---|---|---|
| Rows | dataset | 88,653 final = build report (89,016 → 88,826 → 88,653) |
| Actors | journey | 781 human / 444 bot / 17 unknown, the same files |
| `index.json` | 796 matches × 11 fields (map, date, duration, humans, bots, unknown, 5 counts) | **0 differences** |
| Dates | date | 1 / 287 / 197 / 162 / 112 / 37, identical |
| Match files | 796 matches: path points, events, segments | **0 differences**; UV rounding error ≤ 5e-5 |
| Kill and death heatmaps | 38 map × date × layer grids, cell by cell | **0 differences** |
| Traffic heatmaps | 19 grids | Totals identical to 0.1 s; per-cell difference ≤ 0.205 s (my sampling approximation); 7 near-zero cells differ only through rounding at 0.05 s |
| Heatmap `samples` | 19 | 0 differences |
| `stats.json` headline values (all dates, 4 map scopes; `c01`) | journeys, players, kills, loot, deaths, three rates, median span | **All equal**, e.g. all maps: 781 journeys, 245 players, 2,223 kills, 12,714 loot, 442 deaths; kills / loot per journey 2.85 / 16.28; storm deaths 4.99 per 100; median span 367 s |
| **`stats.json`, every value** (`c05`, added after a follow-up question) | All 28 map × date slices: `sample`, `flags`, every metric including quartiles, min/max/sum, every histogram bin and overflow, death-time series by cause, ratios, rates, `grid_cells_observed` (from an independently written exact traffic tracer), `map_score` and its parts; plus the `dates` block and the `source` fingerprint | **7,792 of 7,792 values equal, 0 differences.** Negative control: three planted changes (a histogram bin, a quartile, a flag) in a copy were all detected |

Conservation checks that hold: kill and death grid totals equal the human event counts. Traffic totals equal the sum of step durations ≤ 30 s ("movement_time_s"). Zone values add up to grid totals (tested by the project, and implied by the identical grids).
**Judgment:** the pipeline is *mathematically consistent*: it computes exactly what its documents say. No transformation or aggregation defect was found.

## 5. Reproducibility

- Rebuild at HEAD `4d5ed57` into a scratch folder (`python -m lila_pipeline.build --web-dir … --report …`, 127 s): **every generated JSON, all three WebP minimaps and `build_report.json` are byte-identical** to the committed files.
- Environment: Python 3.12.9, numpy 2.5.4, pandas 3.0.6, pyarrow 26.0.0, Pillow 13.0.0. These match `uv.lock`, which lists numpy 2.4.6 and 2.5.4 under environment markers. uv 0.7.13.
- Minor: README says `make data` takes ~45 s; it took 127 s here.

## 6. Existing tests

- `pytest`: **125 passed** (437 s).
- **What they establish:** ingest robustness on synthetic folders, line-tracing geometry, projection corners and orientation, contract keys, deterministic output, stale-file safety, cross-file reconciliation (stats ↔ index ↔ heatmaps ↔ match files), and the absence of real IDs.
- **Circularity.** Most data assertions are counts taken from the same data the pipeline reads, for example `{"Loot": 1197, "BotKill": 30}`, `(173, 172)`, `[0.77, 0.49, 0.25]`. They detect *regressions*, not *errors*. My independent counts agree with all of them, which is the external check they lack.
- **Blind spots:**
  1. Nothing tests the sampling model behind gaps (§7.1). `test_ec28_traffic_spreads_step_time_and_skips_long_gaps` encodes the assumption itself.
  2. Nothing varies the bootstrap seed. `tools/zone_sensitivity.py` varies thresholds and shift rules only, so the seed dependence in §7.2 is invisible.
  3. No uncertainty is computed for `map_score` or the rates.
  4. The 0.8 stability rule sits close to bootstrap noise (SE ≈ 0.023 at 300 resamples), and nothing tests for that.
  5. Same-second post-death positions are allowed by a test (`same-second position stays`) without measuring how many exist (33).
  6. The alignment tests are self-consistency tests (formula ↔ formula). Content registration (§2) is the only empirical alignment check.

## 7. Sensitivity and root causes

### 7.1 Gaps are stationary periods; traffic treats them as missing data
- **Root cause:** an interpretation, not a code defect. Part 1 §6 shows that movement rows are written only when the position changed. Median displacement across a gap stays at 6–9 units whether the gap lasts 10 s or 10 min, and no step has zero displacement. The documents say the opposite: "Longer gaps add nothing: where the player went is unknown" (`traffic_grid`), "Straight lines across long gaps would draw movement that never happened" (spec 02, point 7), and "Sampling gaps" (EC-16).
- **Alternative model (DWELL):** a step of *g* > 6 s = (*g* − 5) s standing at A, then 5 s along A→B, with no cut-off. Results from `c02`, human journeys, all dates:

| Map | Traffic total D5 → DWELL | Spearman (cells) | Top-10 / top-50 cells kept | Cells > 2× (≥ 60 s) | Max cell ratio | Consistent traffic regions D5 → DWELL |
|---|---|---|---|---|---|---|
| AmbroseValley | 208,625 → 218,075 s (+4.5 %) | 0.992 | 9 / 46 | 17 | 7.2× | 7 → 6 (loses (6,3)) |
| GrandRift | 21,708 → 22,644 s (+4.3 %) | 0.983 | **7** / 39 | 9 | 11.7× | 3 → 3 |
| Lockdown | 67,144 → 69,849 s (+4.0 %) | 0.992 | 10 / 45 | 2 | 16.1× | **1 → 2** (gains (3,6)) |

  Keeping D5 with a longer cut-off (60 s, ∞) changes less (top-10 = 10/10 except GrandRift ∞ 9/10). So *where the time is put* matters more than the cut-off.
- **Impact:** the broad traffic picture survives. Places where players **stand** (holds, camps, waits) are under-counted, by up to 7–16× in individual cells. The 1-region traffic hotspot list on Lockdown doubles. The stats metric "Estimated movement time" is not movement time: it counts standing time inside gaps ≤ 30 s and omits standing time in longer gaps. Downstream, a stationary player's path is cut and playback hides the player during the stop (ARCHITECTURE.md: "isn't shown in a gap"), though the evidence says they were standing at A.
- **Identifiability:** H_change against random row loss is decided by the data (displacement doesn't grow with gap length). The exact rule (tick phase, movement threshold) and the reason for stillness are not.
- **Judgment:** a documented interpretation is contradicted by evidence. The implementation follows its spec. The effect is bounded but material for "where do players hold" questions.

### 7.2 Hotspot regions depend on the bootstrap seed
`c03 (d)`: the published "consistent" regions recomputed with 10 other seeds, rules unchanged:

| Map / layer | Published | Counts under 10 other seeds | Same set as published |
|---|---|---|---|
| AmbroseValley kills | 5 | 5,5,5,4,5,5,5,5,5,5 | 9 / 10 |
| **AmbroseValley deaths** | **1** | **0**,1,**0**,**0**,**0**,**0**,1,1,**0**,**0** | **3 / 10** |
| AmbroseValley traffic | 7 | all 7 | 10 / 10 |
| GrandRift traffic | 3 | 3,4,3,4,3,3,5,3,4,3 | 6 / 10 |
| Lockdown traffic | 1 | 1 ×9, 2 ×1 | 9 / 10 |
| Lockdown deaths | 1 | all 1 | 10 / 10 |
| GrandRift kills/deaths, Lockdown kills | 0 | all 0 | 10 / 10 |

- **Root cause:** a hard 0.8 stability cut-off estimated from 300 resamples, with one fixed seed. A region whose true resample frequency is near 0.8 passes or fails by chance. Determinism makes the output *reproducible*, not *stable*.
- **Judgment (methodological defect, E-class for the AmbroseValley death region):** the only AmbroseValley death hotspot is not robust. It is a seed artefact, present in 3 of 10 alternative seeds. Kills on AmbroseValley and deaths on Lockdown are robust. GrandRift's traffic hotspot count is uncertain (3–5).

### 7.3 Map performance score
`c03 (c)`: 2,000 bootstraps of human journeys within each map, the same five parts and min–max scaling.
- Published order AmbroseValley > GrandRift > Lockdown appears in **81.4 %** of resamples (AmbroseValley > Lockdown > GrandRift 14.8 %, GrandRift first 3.8 %).
- Without the "human journeys" part, AmbroseValley 0.71 / GrandRift 0.61 / Lockdown 0.25, and the AmbroseValley–GrandRift order becomes **55 % against 34 %**.
- 95 % intervals on GrandRift (57 journeys) are wide: storm deaths 1.75–15.8 per 100, kills per journey 2.22–4.08, median span 302–467 s.
- **Judgment (C, weakly supported):** "human journeys, higher is better" measures how often a map was played (the README calls AmbroseValley "the primary/most played map"), not its design. "Longer span is better" is a choice of direction. With three maps, min–max scaling turns sampling noise into 0/1 extremes. The metric's limitations text admits the design choices but not the sampling uncertainty.

### 7.4 Other choices (bounded)
| Choice | Alternative tested | Effect | Judgment |
|---|---|---|---|
| Exclude 17 unknown journeys | Include as human | Totals +0.0–1.66 % (the docs' "1.63 %" uses the with-unknown total as denominator; the two agree); top-10 cells unchanged | Justified (C) |
| Keep identical same-second Loot/BotKill rows | Deduplicate | Loot per journey: AmbroseValley 17.67→16.04, GrandRift 15.37→13.14 (−14.5 %), Lockdown 12.04→11.12; kills −1 to −2 % | Not identifiable. Keeping them is reasonable (Part 1 2.4), but the loot rate and its map-score part carry this uncertainty (A) |
| Date = UTC start | Folder date | 4 matches change date (02-09: 1 vs 0; 02-10: 287 vs 285; 02-11: 197 vs 200) | Convention; negligible (C) |
| Death cutoff by later second | By row order | 33 more positions dropped, all ≤ 1.65 units from the death point | Negligible (C) |
| Bots counted as "in the match" | Bots present by combat evidence | Recorded bot files: 52 matches. Human–bot combat: **722** matches | See §8, documentation |

## 8. Edge cases, decisions and documented facts

| Item | Reproduced? | Explanation supported? | Resolution justified? | Notes |
|---|---|---|---|---|
| EC-01 seconds | Yes | Yes | Yes | |
| EC-02 out of order | Yes | Partly | Yes | The 3 out-of-order files are exactly the doubled files (EC-29); after un-doubling every file is in time order |
| EC-03 1 s resolution | Yes | Yes | Yes | |
| EC-04 / EC-05 | Yes | Yes | Yes | |
| EC-29 doubled | Yes (3 files, 190 rows, 147/39/4) | Yes | Yes | |
| EC-06 other repeats | Yes (1,195 + 30 outside, 1,227 including 2 inside first halves) | Plausible, not proven | Reasonable | Impact on loot rates not documented (§7.4) |
| EC-07 / EC-08 | Yes | Yes | Yes | |
| EC-09 / EC-10 / D6 | Yes, every figure | Yes; matches my independent finding | Yes | Ambiguity properly preserved |
| EC-11 owner perspective | Yes | Yes | Yes | The docs don't note bot-on-bot kills; no output depends on it |
| EC-12 / D7 | Yes (pairs end 0/1/2 s before journey end, no other file; 2 of 400 BotKilled seconds have a BotKill) | Yes | Yes (conservative) | |
| EC-13 | Yes (339, shortest 86 s) | Yes | Yes | **Spec 02 point 15 says "355, shortest 25 s"**, which counts the 16 unknown journeys as human (E, documentation) |
| EC-14 / D2 | Yes (174 journeys; 173 positions + 2 BotKill after cleaning; spec point 8 gives raw-level counts, 176 rows) | Yes | Yes | 33 same-second positions remain (§3) |
| EC-15 | Yes | Yes | Yes | |
| **EC-16 / D5 / EC-28** | Counts yes (312 gaps > 30 s, longest 518 s; median step 13 units) | **No.** Gaps are stationary periods, not unknown movement | **Questionable** | §7.1 |
| EC-17 / EC-18 / EC-21 / EC-22 | Yes | Yes | Yes | §2 adds independent support |
| EC-19 | Yes in substance | Yes | Yes | |
| EC-20 | **No**: 1,194 AmbroseValley pixels have alpha < 255 (min 191) | — | Immaterial | (E, documentation) |
| EC-23 / D1 | Yes (4 matches, the 6 date counts) | Yes | Yes (C) | |
| EC-24 | Yes | Yes | Yes | |
| EC-25 | Yes | Yes | Yes for heatmaps | Doesn't say bots were present in ≥ 722 matches |
| EC-26 | Yes (59 matches, 30 deaths) | Yes | Yes | |
| EC-27 / EC-30 | Yes | Yes | Accepted risk | My deliverables contain no IDs (scanner clean) |
| CLAUDE.md Data fact "Storm deaths (39) all happen 11–15 min" | 655–887 s | Nearly | — | One storm death at 10 min 55 s (minor E) |
| CLAUDE.md "gaps up to 8 min" | Human max 302 s, bot max 518 s | Nearly | — | Minor |
| CLAUDE.md Decisions "with bots in only 6.5 % of matches" | **No** | **No.** 6.5 % is matches with *recorded* bot files; human–bot combat occurs in 722 of 796 matches (90.7 %) | — | (E, documentation/interpretation) |
| ARCHITECTURE "≤ 1.63 % of any total" | Yes (different denominator) | Yes | Yes | |
| INSIGHTS.md | Numbers are stale (pre-cleaning, e.g. 568 vs 554 AmbroseValley journeys), as the file itself says | Insight 1's direction holds on cleaned data: storm deaths per 100 journeys AmbroseValley 3.07 (95 % CI 1.8–4.5) vs Lockdown 10.0 (5.9–14.7); the intervals don't overlap | — | Must be regenerated before submission |

## 9. Corrections to Part 1 (justified by new evidence)

- Part 1 §8 item 7 said 2 matches change date between the UTC-start and folder conventions. The match-level computation (c03 e) gives **4**. Part 1 §4.4's per-date counts were already right (285→287, 200→197, +1 on 02-09). Only the summary sentence was wrong.
- Part 1 §8 item 4 expected bot-based outputs. The pipeline publishes **no** bot heatmaps or bot statistics; bots appear only in match views and the `bots` count. That hypothesis is moot, and the coverage point moves to documentation (§8).
- No other Part 1 finding needed revision. Every count in `independent_counts.json` matches the pipeline's equivalent.
