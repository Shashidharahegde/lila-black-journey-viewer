# Part 3 — Follow-up on four review points

A reviewer challenged four conclusions of the audit (2026-10-24). They argued that some were stated with more certainty than the evidence supports, and asked for specific further tests. This part runs those tests (`scripts/d01`–`d05`, outputs in this folder). Where the result changes a conclusion, the report was reworded (see §5). Parts 1 and 2 are left as they were.
Labels: **F** fact · **I** inference · **C** convention · **A** unresolved ambiguity · **E** error.

## 1. Traffic gaps: what triggers a row, where gap time belongs, and how much it matters

### 1.1 What makes a movement row appear (`d01`)
| Test | Human | Bot | Reading |
|---|---|---|---|
| Gaps > 6 s within ±1 s of a multiple of 5 s | **99.92 %** of 6,377 | 99.43 % of 1,059 | Irregular emission would give 60 % (3 of 5 residues). Rows sit on a fixed tick (F) |
| Rows on their file's own 5 s phase (±1 s), median file | 100 % | 100 % | One tick clock per file; gaps are skipped ticks (F) |
| Displacement of the step that **ends** a gap (median) | 8.2 / 8.1 / 9.0 / 6.8 units for gaps 6–15 / 15–30 / 30–60 / 60–600 s | 8.7 / 4.8 / 3.4 / 7.7 | Ordinary 5 s steps: 13.1 (human), 15.9 (bot). The gap-ending step looks like one tick of movement from rest, whatever the gap length (F) |
| Displacement of the step that **arrived** at A before a gap > 15 s (median) | 6.8 | 5.3 | Actors slow down before a gap (F) |

**Rejected:** irregular, event-driven emission (tick structure), and random row loss (displacement does not grow with gap length; Part 1 §6.3).
**Corrected:** Part 1 §6.4 called the rule "a row only when the position changed". That is too strong. Events logged inside gaps carry the owner's position, and only 21–23 % of them sit *exactly* at A (median 0.85–1.7 units away, §1.2). So the actor shuffles slightly without a row being written. The rule is closer to *at each tick, write a row if the actor is moving at that instant (or has moved more than some threshold)*. The exact condition is **not identifiable** from this data (A).

### 1.2 Where the actor is during a gap: events as witnesses (`d01`)
Loot, kill and death rows carry the owner's position at their own time. 4,033 such human events fall strictly inside a movement interval:

| Interval | Events | Distance to A: median / p90 / p99 | Distance to B: median | Closer to A than B | Further from A than \|AB\| + 5 units |
|---|---|---|---|---|---|
| Regular 5 s step | 8,245 | 3.4 / 11.0 / 17.9 | 4.1 | 52.9 % | 0.42 % |
| Gap 6–15 s | 3,182 | 1.7 / 6.4 / 13.7 | 7.3 | 82.0 % | 0.25 % |
| Gap 15–30 s | 639 | 1.1 / 4.1 / 13.0 | 7.2 | 87.2 % | 0.16 % |
| Gap > 30 s | 212 | **0.85 / 3.0 / 10.5** | 7.1 | **94.3 %** | **0 %** |

Within gaps > 6 s, events *before* the final tick are a median 1.06 units from A (23 % exactly at A). Events in the final 5 s are 2.98 units away (6 % exactly at A). Both fit "near A until the last tick, then moving".

- **Rejected:** "moved away and came back" (H_loop). No witness event in a gap > 30 s is further from A than the A→B distance plus 5 units.
- **Caveat (A):** witnesses exist only for gaps that contain an event (selection). Gaps without events are assumed similar. The displacement test (Part 1 §6.3) covers all gaps and agrees.

### 1.3 Can standing time be estimated, or only bounded?
- **Time:** for a gap of *g* s, time near A is (*g* − 5) s within about ±1 s of tick rounding. Under every model the data allows, the total is fixed: all gap time belongs to the journey. Only its *location* is uncertain.
- **Place:** near A, median about 1 unit, p99 about 10–14 units. That is less than one heatmap cell (14.1 / 9.1 / 15.6 units on AmbroseValley / GrandRift / Lockdown), so the cell is usually A's cell or a neighbour.
- **Answer:** estimable at cell resolution, with a bounded spatial error. It is **not** exact: the actor may move a few units without a row, and the reason for stopping (holding, looting, AFK, menu) is unknown (A).
- **The production rule (D5, 30 s cut-off)** is a lower bound on total time. It omits 3.9–4.3 % of human time, but the place where it puts the remaining time is not the best estimate.

### 1.4 Sensitivity to six allocation models (`d02`)
Models:
- `D5_30`: production.
- `D5_inf`: no cut-off.
- `DWELL_A`: (*g* − 5) at A; best supported.
- `SPLIT`: half at A, half at B.
- `DWELL_B`: bound; contradicted by §1.2.
- `POINT`: 5 s per row; the naive alternative.

Regions use the production rules unchanged.

| | AmbroseValley | GrandRift | Lockdown |
|---|---|---|---|
| Spearman of cells vs production: D5_inf / DWELL_A / SPLIT | 0.996 / 0.992 / 0.994 | 0.994 / 0.983 / 0.985 | 0.996 / 0.992 / 0.995 |
| Top-10 cells kept: D5_inf / DWELL_A / SPLIT | 10 / 9 / 10 | 9 / 7 / 8 | 10 / 10 / 10 |
| Cells ≥ 60 s where the plausible models (D5_inf, DWELL_A, SPLIT) differ by > 1.5× | 37 of 816 | 11 of 86 | 16 of 343 |
| **Strongest traffic region** | (8,3) under all six models | (7,6) under all six | (8,11) under all six |
| Published region values, range over plausible models | 1–10 % per region | 5–16 % | 7 % |
| Published consistent regions kept: D5_inf / DWELL_A / SPLIT | 6/7 · 6/7 · 6/7 | 2/3 · 3/3 · 2/3 | 1/1 · 1/1 · 1/1 |
| New consistent regions under the alternatives | none | (7,8) under D5_inf | (3,6) under all three |
| Order of published regions (Kendall τ vs production) | 0.905 (one swap) | 1.0 to 0.33 (#2 and #3 swap; overlapping value ranges 656–711 vs 621–720 s) | — |

Across all 19 map × date selections, the consistent-region set is identical under the four models (D5_30, D5_inf, DWELL_A, SPLIT) in **11**. It differs by about one region in **8**. Some differences come from the cut-off alone (D5_30 against D5_inf), so the region *classification* reacts to small value changes. That links this point to §2.

### 1.5 Judgment
- **Robust:** the traffic picture, the per-region magnitudes (±~10 %) and the strongest region on each map.
- **Fragile:** which regions pass as "consistent", and the order of close-valued regions.
- **Implication for the Heatmaps UX** (out of this audit's scope; noted for S): "estimated player time" can stay as a *magnitude* with its range. Treat it as a measurement with stated uncertainty, not as the authority that decides membership and rank.

## 2. Hotspot seed sensitivity: unstable or false? (`d03`)

All-dates selection, production rules. Three tests:
- **(a)** each candidate's stability re-estimated from 5,000 resamples instead of 300, with a Wilson 95 % interval;
- **(b)** 100 seeds at the production setting (300 resamples), with spatial tolerance: a region counts as found if a consistent region lies within one region;
- **(c)** rank by value across the 5,000 resamples.

| Map / layer | Published consistent | Same set with 5,000 resamples? | Share of 100 seeds in which each published region is consistent | Mean Jaccard vs published (min) |
|---|---|---|---|---|
| AmbroseValley kills | 5 | Yes | 1.00, 1.00, 1.00, 0.98, **0.63** (8,3) | 0.92 (0.60) |
| **AmbroseValley deaths** | 1: (8,6) | **No, 0 regions** | **0.39** | 0.39 (0.00) |
| AmbroseValley traffic | 7 | Yes | 1.00 ×6, 0.94 (6,3) | 0.98 (0.86) |
| GrandRift traffic | 3 | Yes | 1.00, 0.98, 0.97; also (7,8) in 33 % and (7,7) in 24 % of runs | 0.85 (0.40) |
| Lockdown deaths | 1 | Yes | 1.00 | 1.00 |
| Lockdown traffic | 1 | Yes | 1.00; (3,6) in 9 % of runs | 0.95 (0.50) |
| GrandRift kills/deaths, Lockdown kills | 0 | Yes (0) | — | 1.00 |

Spatial tolerance changes nothing: no published region that disappears in a run reappears one region away. The instability is about classification, not position.

**What the precise estimates show:**
- **AmbroseValley deaths (8,6): it fails the project's own rule.** Stability with 5,000 resamples is **0.779 [95 % CI 0.767–0.790]**, below the 0.8 threshold. The published 300-resample estimate crossed 0.8 by chance. It is **not shown to be false**: it ranks 4th among death regions (median rank 5, 5–95 % range 1–9) and is a real concentration with moderate stability. Meanwhile two *more* stable death regions, (5,7) at 0.896 and (8,7) at 0.845, pass the support checks but fail the grid-shift check. So the death layer's single published "hotspot" is the less stable of the three.
- **AmbroseValley kills (8,3): stable, but its shift check is borderline.** Stability is 0.99, yet it is consistent in only 63 % of seed runs. The flipping comes from the *grid-shift* check: its shifted counterpart's stability sits near 0.8. Seed dependence therefore also enters through the shift check, not only through the stability threshold.
- **The others are robust:**
  - GrandRift traffic (12,6), stability 0.841 [0.831–0.851], is the closest call that passes.
  - AmbroseValley traffic, AmbroseValley kills (except (8,3)), Lockdown deaths and Lockdown traffic all pass with stability ≥ 0.91 in ≥ 94 % of runs.
- **Rank stability:**
  - Top regions hold their rank: for example, AmbroseValley kills #1 has a 5–95 % rank range of 1–3, and Lockdown deaths #1 has 1–3.
  - Lower-ranked regions are loose: AmbroseValley traffic (5,2) is ranked 12 with range 7–15, and GrandRift traffic (12,6) is ranked 7 with range 2–19.
  - Ranks below the top 2–3 are not reliable labels.

**Judgment:**
- Most published regions are robust under the tested resampling. One, AmbroseValley deaths (8,6), is mislabelled "consistent" by the rule's own standard, because of Monte Carlo error in a 300-resample estimate (E, a methodological defect). A second, AmbroseValley kills (8,3), depends on a borderline shift check.
- The checks reproduce, but they have not been validated:
  - a hard threshold applied to a noisy estimate;
  - a shift check that rejects more stable regions while accepting a less stable one.
- Passing the checks should not be described as "statistically robust".
- **Fix direction (S decides):**
  - Estimate stability with enough resamples that the interval clears the threshold (≥ 2,000), or require the lower confidence bound to exceed it.
  - Report borderline regions as such.
  - Validate the shift rule on known cases before relying on it to hide regions.

## 3. Map performance score (`d05`)

| Variant | Scores AV / GR / LD | Order | Same order in 1,000 bootstraps | AV first |
|---|---|---|---|---|
| Published (5 parts, min–max) | 0.76 / 0.49 / 0.25 | AV > GR > LD | 82.2 % | 97.3 % |
| Rank-based instead of min–max | 1.4 / 1.0 / 0.6 | same | 82.7 % | 97.7 % |
| z-score instead of min–max | 0.62 / −0.03 / −0.59 | same | 81.8 % | 97.2 % |
| Without human journeys | 0.71 / 0.61 / 0.25 | same | 56.5 % | **66.4 %** |
| Without median span | 0.96 / 0.44 / 0.06 | same | 97.1 % | 99.9 % |
| Without kills per journey | 0.75 / 0.36 / 0.31 | same | 57.7 % | 99.5 % |
| Without loot per journey | 0.71 / 0.46 / 0.31 | same | 67.1 % | 95.2 % |
| Without storm deaths | 0.71 / 0.56 / 0.31 | same | 57.2 % | 77.2 % |

- The **"human journeys" part has no sampling variance** in a bootstrap (each resample keeps the map's journey count). It is a fixed bonus for the most-played map, and it inflates the published 82 % stability. Without it, AmbroseValley ranks first in two thirds of resamples.
- **The five parts with 95 % intervals:**
  - Kills per journey: AV 2.99 [2.70–3.32], GR 3.14 [2.26–4.12], LD 2.28 [1.91–2.74].
  - Loot per journey: 17.67 [16.6–18.8], 15.37 [12.5–18.5], 12.04 [10.7–13.5].
  - Storm deaths per 100: 3.07 [1.8–4.5], 8.77 [1.8–17.5], 10.0 [5.3–14.7].
  - Median span: 354.5 [333–382], 403 [302–467], 427 [353–470] s.
  - Only some comparisons separate: AV against LD on loot, storm deaths and kills (marginally). GrandRift overlaps both other maps on every part.
- Higher kills per journey, longer spans or more journeys are not better design in themselves. The directions are choices, not facts (C).
- **Judgment:** the score is arithmetically correct, and its order is insensitive to the normalisation method. But it is not a measure of map quality: a sample-size part drives part of the order, and most of its parts cannot separate the maps. The UX audit's finding about "Leading" / "Needs improvement" points the same way, from a separate line of evidence. **Recommendation (for S):** drop the evaluative standings. Either remove the composite, or keep it only as an explicitly relative index. Show the five measures descriptively with their intervals and sample sizes.

## 4. Bot presence: recorded bots vs evidence of bot activity (`d04`)

| Matches (of 796) | Count |
|---|---|
| With recorded bot files | **52** (6.5 %) |
| With at least one human-file event labelled as combat with a bot (`BotKill`/`BotKilled`) | **722** (90.7 %) |
| … of which a human was killed by a bot (`BotKilled`) | 399 |
| Bot-combat labels but no bot file | 690 |
| Bot files but no human bot-combat label | 20 |
| Neither (no evidence either way) | 54 |

Do the labels really point to bots? This can be tested only in the 52 matches where a counterpart could be recorded. The test pairs each human event with the expected counterpart event in another file within ±2 s. The null model shifts the human event times by a random 30–300 s, 200 times:

| Human event | Events | Paired with the counterpart event | Chance (null mean / p95) | Counterpart files | Median distance |
|---|---|---|---|---|---|
| `BotKill` → bot's `BotKilled` | 104 | **25 %** | 3.2 % / 6.7 % | 26 of 26 are bot files | 12.8 units |
| `BotKilled` → bot's `BotKill` | 20 | **25 %** | 1.6 % / 5.0 % | 5 of 5 are bot files | 11.8 units |

No human `Bot*` event pairs with another human's file.

- **What this establishes:** where a counterpart can be recorded, the labels pair with bot files about 8–15× more often than chance, and never with humans. 75 % stay unpaired even in matches with bot files, so bot recording is partial there as well.
- **Wording that holds:** "bots were *recorded* in 52 matches; human files show combat with bots in 722". That bots were *active* in those 722 matches is an **inference** (I, supported by the pairing test). It rests on the event names meaning what the README says. It is not an observation of the bots themselves.
- **Unknowable:** in 54 matches, bot presence has no evidence either way.
- **What the docs should do:** keep "recorded bot journeys" and "evidence of bot activity" separate. The Decisions-table phrase "bots in only 6.5 % of matches" should read "bot journeys recorded in 6.5 % of matches".

## 5. Changes to the report's conclusions
See `FORENSIC_AUDIT_REPORT.md`, §A–C (reworded 2026-10-24 after this part):
- **A1** now says stationary time is *mis-allocated and partly omitted*, estimable at cell resolution. It no longer says "every gap is standing at a known point". The emission rule is "tick + moving at the tick", with the exact condition unidentifiable.
- **A2** now says *unstable under the tested resampling procedure*. It no longer says "seed artefact", and it adds the precise-stability and spatial-overlap results.
- **B1** adds the leave-one-out and fixed-variance findings and the recommendation.
- **C1** adds the label-validation test.
