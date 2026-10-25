# Forensic audit of the LILA BLACK data pipeline — verdict

Scope: `data/raw/` → `pipeline/src/lila_pipeline/` (ingest → build) → `web/public/data/*.json`, `web/public/maps/*.webp`. The frontend is out of scope.
Revision `4d5ed57`. Inputs, environment and commands: [MANIFEST.md](MANIFEST.md).
Evidence comes in two separately recorded bodies:
- [Part 1 — independent evidence](01_independent/INDEPENDENT_EVIDENCE.md). Written from the raw bytes before any project decision was consulted, and hashed. It discloses that `CLAUDE.md` was in context from the start.
- [Part 2 — reconciliation evidence](02_reconciliation/RECONCILIATION_EVIDENCE.md). The README, code, tests, outputs and docs, examined afterwards.
- [Part 3 — follow-up](03_followup/FOLLOWUP_EVIDENCE.md). Further tests requested by a reviewer on the four findings below. They refined A1, A2, B1 and C1.

Scripts are in [`scripts/`](scripts/): `a*` independent, `b*` README tests, `c*` reconciliation and sensitivity.

## Verdict in one paragraph

**Mathematically, the pipeline is sound.** An independent reimplementation reproduces every published number exactly: all 796 index rows, every match file, all kill and death grids cell by cell, traffic totals, and all 7,792 values in `stats.json` (28 slices, including every quartile, histogram bin and flag). A rebuild is byte-identical to the committed artifacts, and the 125 tests pass. **Analytically, most of it is sound too.** The cleaning rules (seconds clock, duplicate file, doubled journeys, actor classes with an honest "unknown", owner-perspective events, Kill/Killed pairs, the post-death cutoff, UTC dates) were all re-derived independently and survive scrutiny. So does the coordinate transform, which an independent content-registration test supports. Four conclusions do **not** fully survive:
1. The traffic layer treats sampling gaps as missing data. The evidence says they are near-stationary time close to the earlier position, which can be estimated at cell resolution.
2. One published hotspot (AmbroseValley deaths) fails the project's own 0.8 stability rule when estimated precisely (0.779), and the hotspot checks themselves are unvalidated.
3. The map performance score ranks sample size and noise as much as design.
4. The docs conflate bots *recorded* (52 matches) with evidence of bot *activity* (722 matches).

None of these is a coding error. Each is an interpretation or method choice that the data either contradicts or does not support.

## What can be trusted, and why

| Output / rule | Status | Basis |
|---|---|---|
| Decoding, `ts` as Unix seconds, match clock | Trust (I, very strong) | Folder dates, 5 s cadence, 13–890 s spans (Part 1 2.1) |
| Duplicate file read once; 3 doubled journeys halved (190 rows) | Trust (F) | Exact byte and row equality; independently found |
| Actor classes 781 human / 444 bot / 17 unknown | Trust (C, justified) | Behaviour and ID agree for 1,225 files; the 17 are genuinely ambiguous (Part 1 3.3–3.5). Excluding them moves totals ≤ 1.66 % |
| Event x/z = owner's position; kill marker = killer's spot | Trust (I, strong) | Loot ↔ Position identity; cross-file kill pairing 12–18 units apart (Part 1 5.1–5.3) |
| Kill/Killed pairs kept, no cause claimed | Trust (A, preserved correctly) | Not identifiable from the rows |
| Death cutoff (173 positions, 2 flagged BotKills) | Trust | Post-death rows move ≤ 1.65 units; 33 same-second positions remain, which is negligible |
| World → minimap transform | Trust to about ±10 world units | 99.7–100 % of samples land on map content; wrong flips score 2.6–24 points lower (Part 2 §2) |
| Index counts, match files, kill and death heatmaps | Trust (exactly reproduced) | Part 2 §4 |
| `stats.json` (all 28 slices, every value) | Trust as computed; read GrandRift with its sample size in mind | 7,792 / 7,792 values reproduced independently, with a passing negative control (Part 2 §4); intervals in §7.3 |
| Reproducibility | Trust | Byte-identical rebuild, including the WebP files |

## Prioritised conclusions

### A. Findings that undermine a specific output

**A1. The traffic heatmap mis-places near-stationary time and partly omits it.**
- *Inference, strong; contradicts the documented interpretation in EC-16, D5, EC-28 and spec 02 point 7.* Refined in [Part 3 §1](03_followup/FOLLOWUP_EVIDENCE.md).
- **Emission rule.** Movement rows come on a fixed 5 s tick: 99.9 % of gaps are within ±1 s of a multiple of 5. A tick writes no row when the actor isn't moving. The exact condition (moving at the tick, or a movement threshold) cannot be identified.
- **Where the actor is during a gap.** Displacement across a gap does not grow with its length. Loot, kill and death events logged inside gaps sit a median 0.85–1.7 units from the earlier point A. For gaps over 30 s, 94 % are closer to A than to B, and none is further than |AB| + 5 units. This rules out both random row loss and "moved away and came back".
- **What can be estimated.** The time is (*g* − 5) s near A, at cell resolution, with a bounded spatial error (median about 1 unit). It is not exact: the actor shuffles slightly without a row being written.
- **What the pipeline does.** It spreads gap time along the A→B line and drops gaps over 30 s, which makes it a lower bound.
- **Effect:**
  - 3.9–4.3 % of human time is omitted.
  - A few standing-spot cells are under-counted by up to 7–16×.
  - Region magnitudes move ±1–16 % across the plausible models.
  - The strongest region on each map is unchanged under all six models.
  - The *consistent* region set changes in 8 of 19 map × date selections.
  - "Estimated movement time" in `stats.json` is misnamed.
- *Fix direction (not applied; S decides):*
  - Allocate (*g* − 5) s to A with no cut-off.
  - Rename the metric.
  - Present region time as a magnitude with a range, not as the criterion that decides membership and rank.

**A2. One published hotspot fails its own rule, and the checks themselves are unvalidated.**
- *Methodological defect.* Details in [Part 3 §2](03_followup/FOLLOWUP_EVIDENCE.md): 100 seeds, 5,000-resample estimates, spatial tolerance, rank stability.
- **AmbroseValley deaths (8,6):** the only "consistent" death region on AmbroseValley.
  - Its precise stability is **0.779 [0.767–0.790]**, below the 0.8 threshold.
  - It is consistent in only 39 % of seed runs.
  - The published 300-resample estimate crossed the threshold by chance.
  - It is *not shown to be false*: it is the 4th-ranked death region.
  - Two *more* stable death regions (0.90, 0.85) are rejected by the grid-shift check.
- **AmbroseValley kills (8,3):** stability 0.99, but consistent in only 63 % of runs, because its grid-shift check is borderline.
- **Everything else is robust:** every other published region is consistent in ≥ 94 % of runs. Lockdown and AmbroseValley traffic are near-certain.
- **Ranks:** below the top 2–3 regions, they are loose (for example, rank 7 with a 5–95 % range of 2–19).
- **Cause:** a hard threshold applied to a noisy 300-resample estimate under one fixed seed. That makes the result reproducible, not robust. The project's sensitivity study varied thresholds but never the seed.
- **What not to claim:** passing the checks should not be described as statistical robustness.
- *Fix direction (S decides):*
  - Use ≥ 2,000 resamples, or require the lower confidence bound to clear the threshold.
  - Flag borderline regions.
  - Validate the shift rule before using it to hide regions.

### B. Findings that add bounded, mostly undisclosed uncertainty

- **B1. Map performance score: conceptually questionable as a quality measure.**
  - *Convention, weakly supported.* Details in [Part 3 §3](03_followup/FOLLOWUP_EVIDENCE.md).
  - **The order is insensitive to normalisation:** min–max, rank and z-score each give it in ~82 % of resamples.
  - **The order depends on which parts are included:** leaving out any one part drops its stability to 57–67 %.
  - **The 82 % is inflated:** the "human journeys" part measures how often a map was played and has no sampling variance. Without it, AmbroseValley ranks first in only 66 % of resamples.
  - **Most parts can't separate the maps:** their 95 % intervals overlap. GrandRift overlaps both other maps on every part.
  - **The directions are choices:** "higher is better" for kills, span and journeys is a design decision, not a fact.
  - **Two lines of evidence agree:** the UX audit flagged the "Leading" / "Needs improvement" labels separately.
  - **Recommendation (S decides):** remove the evaluative standings. Drop the composite, or keep it only as a labelled relative index. Show the five measures descriptively with intervals and sample sizes.
- **B2. Identical same-second Loot/BotKill rows (1,227) are kept.** This is plausible (pickup bursts form a smooth continuum) but not identifiable. If they were logging repeats, loot per journey would fall 7.6–14.5 %, most on GrandRift, and that feeds the score's loot part.
- **B3. Per-match figures are per recorded player.** 743 of 796 matches hold one file. The project mostly handles this in its wording.
- **B4. "Alive at end" is not "extracted."** 339 human journeys end alive, some after only 86 s. This is correctly labelled "inferred" in the docs.
- **B5. Date convention.** UTC start date versus folder date moves 4 matches. This is negligible.

### C. Documentation errors and minor issues

- **C1. Recorded bots and evidence of bot activity are conflated.**
  - Both figures are correct but measure different things:
    - **52 matches** (6.5 %) have recorded bot files.
    - **722 matches** (90.7 %) have human-file events labelled as combat with a bot. In 399 of them a human was killed by a bot.
  - **The labels check out.** In the 52 matches where a counterpart could be recorded, those events pair with a bot file's matching event in 25 % of cases, against 1.6–3.2 % by chance. Every pairing is with a bot file and none with another human (Part 3 §4).
  - **What follows:** "bots were active in 722 matches" is a supported inference, not an observation.
  - **Unknowable:** 54 matches have no evidence either way.
  - **The error:** the Decisions table reads "bots in only 6.5 % of matches". It should say "bot journeys recorded in 6.5 % of matches".
  - **The index field:** `bots` in `index.json` counts recorded bot files.
- **C2. Spec 02 point 15 is wrong.** It says "355 journeys without a death, shortest 25 s", which includes the 16 unknown journeys. The correct human figures are 339 and 86 s, as EC-13 says.
- **C3. EC-20 is wrong.** It says "alpha 255 on every pixel", but 1,194 AmbroseValley pixels have alpha < 255. This is immaterial.
- **C4. Storm timing is slightly misquoted.** The Data facts say storm deaths happen "11–15 min" into a match; one happens at 10 min 55 s. They also say "gaps up to 8 min"; the human maximum is 5 min, and 8.6 min is a bot gap.
- **C5. EC-02 duplicates EC-29.** EC-02 is presented as its own phenomenon, but its 3 out-of-order files are exactly the doubled journeys.
- **C6. `map_score` rounds before scaling.** It scales rates already rounded to 2 dp. Effect ≤ 0.0003: AmbroseValley 0.7648 is published as 0.77.
- **C7. Journeys are keyed by file basename.** This is safe on this data, but it is a latent risk.
- **C8. `INSIGHTS.md` is stale.** It is still pre-cleaning, as the file says. Insight 1's direction survives on cleaned data, with non-overlapping intervals: storm deaths per 100 journeys are 3.07 on AmbroseValley and 10.0 on Lockdown.
- **C9. Build time.** The README says `make data` takes ~45 s; it took 127 s here.

## Tests: what a pass does and doesn't mean

- **What a pass means:** the 125 passing tests show conformity and regression safety. That covers geometry, contracts, determinism, cross-file reconciliation and ID hygiene.
- **What it doesn't mean:** most data expectations are counts read from the same data, so they cannot detect a wrong assumption. My independent counts confirm all of them.
- **Untested:**
  - the sampling model behind gaps;
  - seed stability of the hotspot regions;
  - uncertainty of the rates and the score;
  - empirical alignment beyond formula self-consistency.

## Mathematical consistency vs analytical validity

| | Mathematical consistency | Analytical validity |
|---|---|---|
| Cleaning and classification | Exact | Justified; ambiguity preserved |
| Coordinates | Exact | Supported (±10 units) |
| Kill and death heatmaps | Exact | Valid as "where the human stood when it happened" |
| Traffic heatmap | Exact | Magnitudes robust (±1–16 %); standing time mis-placed and 3.9–4.3 % omitted (A1) |
| Hotspot regions | Exact, reproducible | Most robust; AmbroseValley deaths fails its own rule, AmbroseValley kills (8,3) is borderline; classification sensitive to small value changes (A1, A2) |
| Rates and distributions | Exact | Valid with sample-size caveats (B2, B3) |
| Map performance score | Exact (±0.0003) | Not a quality measure (B1) |

No source record, production file, expected value or test was modified by this audit. All audit output lives in `docs/audits/forensic/` and holds no raw account identifiers (`tools/check_ids.py` reports nothing in it).
