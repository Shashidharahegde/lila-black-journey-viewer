# E. Recommended UX improvements

Grouped into **foundational** changes (they fix a root cause and later work builds on them) and **secondary refinements**.
Effort is a rough relative estimate for this codebase: S = hours, M = a day or two, L = several days.

## Foundational

| # | Change | Fixes | Effort | Depends on | Trade-offs |
|---|---|---|---|---|---|
| E1 | **One glossary and unit-bearing formatters.** Define *match* (session), *player journey* (one player in one match), *player*. Every rate names its denominator ("kills per player journey"). One precision per metric. Glossary section in About | UX-01, UX-13, UX-19, UX-08 (wording) | M | — | Labels get slightly longer. Reverses the "match played" wording decision. Copy in `stats.json` (tooltips) must change too |
| E2 | **Describe, then evaluate.** No badges on volume metrics. "Highest/Lowest" plus the size of the gap instead of "Leading/Needs improvement". A visible one-line caveat under the composite score. Remove "Player activity" from "Room to improve" | UX-02, UX-15 | S–M | E1 (to name things right) | Less "verdict" at a glance. That is the point: the insight cards keep the "where to look" guidance |
| E3 | **A keyboard path to everything on the map.** Hotspot list (or select) on Heatmaps, journey select on Journeys, both running the same action as a map click. Remove the unnamed canvas tab stop | UX-03, UX-21 (part) | M | — | A little more panel content. Reverses "no region list". A select keeps it to one row |
| E4 | **Preserve view state across the core loop.** Remember the camera per page (or share one camera); refit only when the map changes. While playing, draw markers only up to the playback time | UX-04, UX-06 | M | — | A shared camera means a Heatmaps zoom carries into Journeys, which is usually wanted for W5. Reverses the Full-paths default |
| E5 | **A third disclosure level.** Click/tap popovers for ⓘ and badges. Show the key caveat as visible text where a judgement is made. Strip internal text ("Stored as", author and date tags, "null") | UX-09, UX-08, UX-12 (render `explain`) | S–M | E1 | Popovers need a click instead of a hover, so mouse users take one extra click |

## Secondary refinements

| # | Change | Fixes | Effort | Notes |
|---|---|---|---|---|
| E6 | Per-map date counts on map pages; disable or mark empty dates | UX-05 | S | Data is already in `index.json` |
| E7 | Heatmap legend titled with metric and unit "per cell"; group overlay switches, mode and opacity with the legend (or the legend with the metric) | UX-07 | S–M | Pick one owner for "how the layer looks" |
| E8 | Rename Focused → "Main routes (≥ 30 s)"; note "Cells under 30 s hidden"; fix the About note | UX-08 | S | Pure copy |
| E9 | One map-selection model on the Overview: a card click opens the report; drop the local card selection | UX-10 | S | The cross-chart highlight can move to hover or focus |
| E10 | Rename nav "Overview" → "Statistics" (or "Maps"); report section "Overview" → "Summary" | UX-11 | S | Update `document.title` and headings |
| E11 | Match list: rank across days when a metric sort is chosen (or a visible "within each day" note); show the sort explanations | UX-12 | S–M | Optional "Group by day" toggle |
| E12 | Merge legend and match overview into one card with scoped counts | UX-13 | S | |
| E13 | Phone: wrap row 2 or use a Map select; drawer header padding; labelled nav icons; metric toggle on the map card | UX-14 | M | |
| E14 | Focus order (panel before map, or a skip link); chart `accessibilityLayer` off on the decorative donut; headings on the Overview | UX-21, UX-22 | S | |
| E15 | Wire the match-file retry | UX-16 | S | |
| E16 | Formatting: `plural()` in ScopeLine; one duration format | UX-19 | S | |
| E17 | Page-aware shortcut list | UX-20 | S | |
| E18 | Hover card suppressed over fixed overlays | UX-23 | S | |
| E19 | Respect reduced motion in CountUp | UX-26 | S | Reverses a recorded exception |

## Worth testing before building (hypotheses)

| # | Idea | Hypothesis | Fixes |
|---|---|---|---|
| T-a | One scrolling map report with a sticky section index instead of tabs | Fewer clicks; easier to compare combat and loot | UX-17 |
| T-b | "Dim map" control under heatmaps | Sparse layers become readable on busy minimaps (GrandRift) | UX-18 |
| T-c | On-map "Pick a match" hint, or auto-select the top match | Faster first success on Journeys | UX-24 |
| T-d | Crosshair-only kill icon | Fewer kill/death misreads at default zoom | UX-25 |
| T-e | "Matches through this hotspot" link from hotspot details to a filtered Journeys list | Directly supports W5, the product's core loop | D5 |

T-e is the largest opportunity in this audit. It needs a mapping from regions to matches. Building that is a data and
pipeline question, outside this audit's scope, so it is listed as a candidate, not a recommendation.

## Suggested order

1. **E1 → E2 → E5** (meaning and trust). These are mostly copy and small component changes, and everything downstream
   uses the vocabulary.
2. **E3, E4** (the core loop and accessibility).
3. **E6–E10** (quick wins in navigation and filters).
4. **E11–E19** (polish), then the hypothesis tests.
