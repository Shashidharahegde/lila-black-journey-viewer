# H. Validation plan

## 1. Can be validated by code inspection or automated checks

| Check | Covers | How | Pass criterion |
|---|---|---|---|
| V1 Glossary lint | UX-01, UX-19 | Unit test over the label and formatter modules (`stats/figures.ts`, `heatmap/evidence.ts`, `state/matches.ts`): each metric id maps to one label and one precision | One noun and one precision per metric across pages |
| V2 Forbidden strings | UX-09 | CI grep over `src/` and the user-facing fields of `public/data/stats.json` | No `Stored as`, `(S, 20`, `null` in user-visible text |
| V3 Pluralisation and duration | UX-19 | Formatter unit tests with 0, 1, 2 and 600 s | "1 match played", one duration style |
| V4 Per-map date counts | UX-05 | Unit test: date options for map M equal the per-map counts from `index.json` | Equal; 0-count dates disabled |
| V5 Camera round trip | UX-04 | Playwright: pick a match, read the view state, go to Heatmaps and back, read it again | Same target and zoom (± 1 %) |
| V6 Playback visibility | UX-06 | Unit test on the layer builder: markers with t > time aren't drawn (or are drawn faded) while playing | No future markers at full opacity |
| V7 Accessible names and focus | UX-03, UX-21 | axe-core in Playwright on all three pages; tab-order snapshot | 0 "focusable element without name"; side panel before map controls |
| V8 Keyboard-only flow | UX-03 | Playwright, keyboard only: open a journey's statistics; open hotspot 2's details | Both reachable |
| V9 Heading outline | UX-22 | Snapshot of `h1–h3` on `/stats` | Scorecard and charts are headings |
| V10 Reflow | UX-14 | Playwright at 360/390/414 px: every control's bounding box inside the viewport; no overlap between drawer close and header buttons | None outside; no overlap |
| V11 Retry wiring | UX-16 | Playwright with `/data/matches/*` blocked | A Retry button appears and recovers after unblocking |
| V12 Reduced motion | UX-26 | Emulate `prefers-reduced-motion`; read the KPI text at 50 ms | Final value at once |

## 2. Needs usability testing with representative users

**Participants:** 5–6 level or game designers (or the closest available proxy), each session about 45 min, think-aloud.
Run once on the current build as a baseline, then again after E1–E5.

| Task | Covers | Script | Success criteria |
|---|---|---|---|
| T1 First impression | A, overall | "You have 2 minutes. What can this tool tell you about the maps?" | Names all three lenses (stats, where, how) unprompted |
| T2 Same number, two pages | UX-01 | On Statistics: "How many matches were recorded on AmbroseValley?" Then on Journeys: "How many matches are in this list?" Then: "Why are they different?" | Baseline: expect confusion. Target: ≥ 5/6 explain the difference correctly |
| T3 Where to act | UX-02 | "Which map should get design attention first, and why?" | Failure = cites "matches played", "player activity" or a badge alone as a design problem. Target ≤ 1/6 |
| T4 State at a time | UX-06 | Open match b3c04fcc: "At 03:00, how many kills had this player made?" | ≥ 90 % correct within 60 s |
| T5 Hotspot to matches | UX-04, D5 | "Kills cluster at hotspot 1 on AmbroseValley. Find a match where the player fought there and replay that fight." | Completion and time. Count re-zooms after page switches (target 0) |
| T6 Read the legend | UX-07, UX-08, UX-18 | "What does the brightest colour mean on this map?" Then: "Is the north-west corner unused?" | Names metric and unit; doesn't claim "unused" without checking All activity. Repeat on GrandRift |
| T7 Find the extreme | UX-12 | "Find the match with the most kills on AmbroseValley across all dates." | ≤ 60 s, correct match |
| T8 Open a map's details | UX-10, UX-11 | First-click test from the Statistics landing: "See GrandRift's death causes." | First click reaches the GrandRift report; ≤ 3 clicks to Combat |
| T9 Keyboard only (with a keyboard user or an AT user if possible) | UX-03, UX-21 | T4 and "open hotspot 2's details" without a mouse | Completed without help |
| T10 Phone glance | UX-14 | On a phone: "Show Lockdown kills on Feb 12." | Finds both the date and the metric without help |

**Measures:** task success, time on task, errors (wrong figure quoted, wrong page), SEQ (single ease question, 1–7)
after each task, and quotes on terminology.

## 3. Acceptance criteria for the foundational changes

| Change | Acceptance criteria |
|---|---|
| E1 Glossary | V1 and V3 pass. T2 ≥ 5/6. The About panel lists the three terms. No page shows a count labelled "matches" that isn't sessions |
| E2 Describe, then evaluate | No evaluative badge on volume metrics. The score shows a visible caveat. T3 failure ≤ 1/6 |
| E3 Keyboard path | V7 and V8 pass. T9 completed. A list or select selection and a map click produce identical store state (unit test) |
| E4 View state | V5 and V6 pass. T4 ≥ 90 %. T5 shows no forced re-zoom |
| E5 Disclosure | V2 passes. Every ⓘ opens on tap (manual device check). The key caveat is visible without interaction where a judgement is shown |

## 4. What this audit couldn't establish (open questions for research)

- Whether designers actually use the composite score or the badges to choose what to work on (frequency of the UX-02
  risk).
- How often the Heatmaps ↔ Journeys loop (W5) happens in practice, which sets the priority of UX-04 and T-e.
- Whether phones are used at all (sets the priority of UX-14).
- How touch-screen and screen-reader users experience the map (section G untested items).
