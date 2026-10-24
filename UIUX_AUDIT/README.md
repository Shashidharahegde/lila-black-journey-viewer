# UI/UX Audit: LILA BLACK web application

Independent UX, interaction and accessibility audit of `/web` (the running app plus its source).
Audit date: 2026-10-24. No production code was changed.

## Contents

| File | Deliverable |
|---|---|
| [A_product_and_ux_architecture.md](A_product_and_ux_architecture.md) | A. What the product does, for whom, its workflows, navigation and information hierarchy |
| [B_screen_by_screen.md](B_screen_by_screen.md) | B. Each page and view: what works, what doesn't |
| [C_issue_register.md](C_issue_register.md) | C. Prioritised issue register (UX-01 … UX-26) with evidence, root cause, recommendation and verification |
| [D_cross_cutting_problems.md](D_cross_cutting_problems.md) | D. Systemic problems behind several issues |
| [E_recommended_improvements.md](E_recommended_improvements.md) | E. Improvements ordered by impact and dependency |
| [F_proposed_architecture.md](F_proposed_architecture.md) | F. Proposed information and interaction architecture (only where evidence supports it) |
| [G_accessibility_and_responsive.md](G_accessibility_and_responsive.md) | G. Accessibility and responsive findings, verified vs untested |
| [H_validation_plan.md](H_validation_plan.md) | H. How to validate each recommendation: automated checks and usability tasks |
| [screenshots/](screenshots/) | 30 screenshots captured from the running app (numbering has gaps where duplicates were removed) |

## Executive summary

The tool works. Every main workflow ran end to end in the browser: comparing maps on the Overview, reading a map report,
finding hotspots on the Heatmaps page, and opening, replaying and inspecting a match on the Journeys page. Loading, empty
and error states are handled with care, sample size is shown honestly ("Few matches"), and the map never jumps when panels
open or close. Many of these decisions are good, and section B and the "Effective design decisions" list in section D
name them.

The highest-impact problems are about meaning, not looks:

1. **The same word means different things on different pages.** For AmbroseValley, "matches" is 554 on the Overview
   (it means one human player in one match), 553 on Heatmaps, and 566 in the Journeys list. "Kills per match" is 2.99 on
   the Overview and "3" on Heatmaps, divided by a different denominator. A designer comparing pages can't tell whether
   these are the same figure. (UX-01)
2. **Neutral comparisons are labelled as judgements.** The Overview's default comparison is "Matches played" (a count of
   recorded sessions), and the map with the fewest is badged "Needs improvement". The scorecard lists "Player activity" as
   GrandRift's "Room to improve". The score's own info tooltip says it is "a comparison between maps, not a measure of
   quality". (UX-02)
3. **Map content can only be reached with a pointer.** Journeys, event markers and hotspots can only be selected by
   clicking on the WebGL canvas. The canvas is a tab stop with no name that does nothing, so a keyboard user can't open
   journey statistics or hotspot details. (UX-03)
4. **Context is lost between Heatmaps and Journeys,** the pair of pages a designer most needs to compare. Returning to
   Journeys zooms out to the whole map, and the match is not framed again. (UX-04)
5. **The data filters can lead to empty views.** The date list on the map pages shows counts for all maps, so it offers
   dates that have no matches on the selected map. (UX-05)

Most other findings come from three systemic causes (section D): there is no shared glossary for the data model, each
page decides alone which controls it owns, and important definitions live only in hover tooltips.

### Counts

| Classification | Count |
|---|---|
| Verified usability defects | 14 |
| Evidence-supported UX concerns | 8 |
| Usability hypotheses (need testing) | 4 |
| Subjective preferences (kept out of the register) | 3 |
| Effective design decisions recognised | 14 |

By priority: Critical 0, High 3, Medium 12, Low 11.

## Method

1. **Discovery from the interface first.** The app was opened cold at `/` (it redirects to `/stats`). Every page, tab,
   filter, toggle and panel reachable from the UI was used before the source was read in detail.
2. **Running app.** Vite dev server (`web/`) driven by headless Chrome 155 over the DevTools Protocol, using
   SwiftShader WebGL. Viewports: 1440×900 (desktop), 1024×768 (small laptop/tablet), 390×844 (phone). Both themes. Real
   input events (mouse moves, clicks, Tab, Space, Esc, `?`) were dispatched. Every screenshot in `screenshots/` comes
   from this run.
3. **Automated in-page checks.** Focusable elements were enumerated for accessible names and target size, headings and
   landmarks were listed, and tab order was walked (section G).
4. **Source inspection** of `web/src` (pages, components, store, URL sync, formatting helpers, tokens) to confirm what
   the app did and to find root causes. File and line references point to `web/src/...`.

## Classification used throughout

- **Verified defect:** directly observed or reproduced in the running app, or certain from code that runs on a normal
  path.
- **Evidence-supported concern:** strongly supported by what the interface shows plus established principles, but its
  effect on users isn't measured.
- **Hypothesis:** plausible, needs research or testing with representative users.
- **Subjective preference:** aesthetic judgement with no established usability impact. Listed separately and not
  prioritised.
- **Effective decision:** an existing pattern that demonstrably supports the workflow.

## Scope and limitations

- **Scope:** `/web` only. The pipeline, raw data and calculation correctness were not audited. Where a finding touches
  numbers (UX-01, UX-02), the issue is how the UI *labels and presents* them, not whether they are computed correctly.
- **Users:** no representative users (level designers) were tested. Impact statements are reasoned from the interface;
  section H lists the tests that would confirm them.
- **Assistive technology:** no screen reader or switch device was used. Accessible-name and focus findings come from DOM
  inspection and keyboard simulation (section G separates verified from untested).
- **WebGL in headless mode:** software rendering can make the map slower to appear than on real hardware. One apparent
  hover-offset bug was traced to capture timing and dropped; no finding depends on render timing.
- **Touch:** touch input wasn't emulated. Touch-related points are labelled as concerns, based on known component
  behaviour (Radix Tooltip doesn't open on tap).
- **Independence caveat:** the repository's `CLAUDE.md` (project rules, including a table of design decisions) was loaded
  into the auditor's context automatically. The findings rest on observed behaviour, not on that table. Where a
  recommendation conflicts with a recorded decision, the register says **"Conflicts with a recorded decision"** so the
  owner can choose deliberately.
- **Hidden route:** `/chat` isn't linked from the navigation, so it was inspected in source only and is out of the main
  assessment.
