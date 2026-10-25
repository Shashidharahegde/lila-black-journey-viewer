# C. Consolidated UX issue register

Ordered by priority, then by user impact. Each issue appears once, even when several screens share its root cause.
Code references are relative to `web/src/`.

**Classification:** VD = verified defect · EC = evidence-supported concern · HY = hypothesis (needs testing).
**Conflicts with a recorded decision** marks a recommendation that reverses a choice in the project's decision table, so
the owner can decide deliberately.

## Summary

| ID | Issue | Class | Priority | Confidence |
|---|---|---|---|---|
| UX-01 | "Match" and per-match rates mean different things on different pages | VD | High | High |
| UX-02 | Neutral comparisons carry judgement badges that contradict the metric's own caveat | EC | High | High |
| UX-03 | Journeys, markers and hotspots can be selected only with a pointer | VD | High | High |
| UX-04 | Switching Heatmaps ↔ Journeys throws away the camera and the match framing | VD | Medium | High |
| UX-05 | Map-page date list shows all-maps counts and leads to empty views | VD | Medium | High |
| UX-06 | Playback with "Full paths" (default) shows future events | EC | Medium | Medium |
| UX-07 | Heatmap legend has no metric, unit or "per cell"; display controls are split | EC | Medium | Medium |
| UX-08 | "Focused" silently hides low-traffic cells, contradicting the About note | VD | Medium | High |
| UX-09 | Key definitions live only in hover tooltips, which also leak internal text | VD | Medium | High |
| UX-10 | Two competing "selected map" models on the Overview | EC | Medium | High |
| UX-11 | "Overview" names three different things | EC | Medium | Medium |
| UX-12 | Match list sorts only within each day | EC | Medium | Medium |
| UX-13 | Selected-match panel repeats counts under different scopes | EC | Medium | Medium |
| UX-14 | Phone layout: date filter off-screen, overlapping close button, unlabelled nav, hidden metric | VD | Medium | High |
| UX-21 | Focus order and unnamed focus stops | VD | Medium | High |
| UX-15 | Insight links go to a different map than the headline leads with | VD | Low | High |
| UX-16 | Match-file load error has no retry | VD | Low | High |
| UX-17 | Map report tabs split thin content | HY | Low | Low |
| UX-18 | GrandRift minimap colours compete with heat colours | HY | Low | Medium |
| UX-19 | Formatting slips: "1 matches", "11:14 min", "min:s", unitless durations | VD | Low | High |
| UX-20 | Shortcut list isn't page-aware | VD | Low | High |
| UX-22 | Overview has too few headings for navigation | VD | Low | High |
| UX-23 | Hover tooltip draws over the journey card | VD | Low | High |
| UX-24 | Journeys opens on an empty map with no on-map prompt | HY | Low | Low |
| UX-25 | Kill and death markers are both skulls | HY | Low | Low |
| UX-26 | Count-up animation runs under reduced motion | EC | Low | Medium |

---

## UX-01 · "Match" and per-match rates mean different things on different pages
- **Location:** Overview KPI tiles and map cards; Heatmaps summary card; Journeys match list header.
- **Problem:** The same words name different quantities. For AmbroseValley, all dates:
  - Overview card: **554** "Matches played · by human players" ([01](screenshots/01_overview_top.png)). This is one
    human player in one match (a journey).
  - Heatmaps summary: **554** "human journeys" and **553** "matches" ([08](screenshots/08_heatmaps_default.png)).
  - Journeys list: "Matches **566**" ([14](screenshots/14_journeys_no_match.png)). These are sessions, including bot-only
    ones.
  - "Kills per match" is **2.99** on the Overview (kills ÷ journeys) and **3** on Heatmaps (kills ÷ 553 matches, rounded
    to one decimal: `heatmap/evidence.ts:73,94`). Same label, different denominator and precision.
  - The metric tooltip says the stored name is "Kills per journey (average)", and the tile adds "avg per player"
    ([32](screenshots/32_metric_info_tooltip.png)). One figure, three nouns.
- **Evidence:** Observed in screenshots 01, 08 and 14. Formatting in `stats/figures.ts`, `heatmap/evidence.ts:94`,
  `ui/MatchList.tsx:202`.
- **User impact:** Designers compare figures across pages, and that's the point of carrying map and date between them.
  Three "match" counts for one map make them doubt every number, or quote the wrong one in a review. This damages trust
  in the tool and can produce a wrong comparison.
- **Root cause:** There is no shared domain vocabulary in the UI. Each page names the data in its own words: the stats
  pages renamed "journey" to "match played", while Heatmaps and Journeys kept "journey" and "match".
- **Recommendation:** Adopt one glossary and apply it everywhere, including labels, tooltips and the About text.
  - **Match:** one game session (what the Journeys list counts).
  - **Player journey:** one recorded player in one match.
  - Rates name their denominator: "kills per player journey". Wherever both counts appear, show both, for example
    "554 player journeys in 553 matches".
  - Use one precision per metric across pages (2 decimals for rates, as the Overview does).
  - Put the glossary in the About panel.
  - Alternative: keep "matches played" on the stats pages but rename the Journeys list to "Sessions". This is weaker,
    because "match" stays ambiguous.
  - *Conflicts with a recorded decision* ("Stats wording": a journey is shown as a "match played").
- **Classification · Priority · Confidence:** VD · High · High.
- **Verification:**
  - A unit test asserts that every label for the same metric uses the same noun and precision.
  - Usability task T2 (section H): "How many matches were recorded on AmbroseValley?" asked on two different pages.
    Success = the same answer, and the participant can explain it.

## UX-02 · Neutral comparisons carry judgement badges that contradict the metric's own caveat
- **Location:** Overview map cards (Compare on), Map scorecard, map report "Standing".
- **Problem:**
  - The default "Compare on" metric is *Matches played*, a sample count. The map with the fewest gets **"Needs
    improvement"** ([01](screenshots/01_overview_top.png)).
  - The scorecard lists **"Player activity"** under GrandRift's "Room to improve" ([02](screenshots/02_overview_mid.png),
    [05](screenshots/05_report_grandrift_overview_section.png)).
  - The score's own tooltip says: "A comparison between maps, not a measure of quality… small gaps look large… A map with
    few matches counts like any other" ([33](screenshots/33_scorecard_info_tooltip.png)).
  - The badges are prominent. The caveat is behind a 20 px ⓘ.
- **Evidence:** `stats/comparison.ts:141` (`STANDING = { best: 'Leading', worst: 'Needs improvement' }`); `comparison.ts:43-50`
  (journeys `higherIsBetter: true`); `ui/MapComparisonCards.tsx:26,61`; tooltip text from `stats.json` via `ui/MetricInfo.tsx`.
- **User impact:** A level designer reads "GrandRift needs improvement on player activity" as a verdict on the map's
  design. The figure says only that fewer sessions were recorded there. With three maps, one map is always "Leading" and
  one is always "Needs improvement" on every metric, whatever the gap. Kills "higher is better" is also a design value
  judgement, not a fact. The risk is a wrong design decision, the most expensive kind of UX error in an analytics tool.
- **Root cause:** Weak separation between *description* and *evaluation*. The comparison component labels rank as
  quality, and the qualification sits in a hover-only tooltip.
- **Recommendation:**
  1. Don't attach evaluative badges to volume metrics (matches played, players). Show rank or share instead ("71 % of
     matches").
  2. For rate metrics, replace "Leading / Needs improvement" with neutral, directional wording ("Highest", "Lowest") and
     show the gap ("3.3× Lockdown's rate"). Keep the judgement in the insight text, which already suggests what to check.
  3. If the composite score stays, show the caveat as visible text under it ("Relative ranking of these three maps, not a
     quality score"), and drop "Player activity" from what designers are told to improve.
  - Alternative: keep the badges and add a visible one-line caveat. That is cheaper, but the badge still dominates.
  - *Conflicts with recorded decisions* ("Map performance score", "Stats wording").
- **Classification · Priority · Confidence:** EC · High · High (that the labels contradict the caveat is verified; the
  effect on decisions is the concern).
- **Verification:** Task T3: "Which map should get design attention first, and why?" Failure = a participant cites
  matches played or player activity as a design problem.

## UX-03 · Journeys, markers and hotspots can be selected only with a pointer
- **Location:** Map stage on Journeys and Heatmaps.
- **Problem:**
  - Journey statistics (the `JourneyCard`) and hotspot details open only by clicking on the WebGL canvas.
  - Neither page offers a list of journeys or hotspots.
  - The canvas container (`div.deck-events-root`, `tabindex="0"`) is a tab stop with no name or role.
  - The deck.gl controller has `keyboard: false` (`map/MapView.tsx:151`), so focusing the canvas does nothing.
- **Evidence:** In-page enumeration (section G) found the unnamed focusable div on both map pages. Tab order walk: after
  the Date select, focus lands on "DIV" and then the zoom buttons. `ui/MapStage.tsx:182-190` (selection only via
  `onClickObject`); `ui/HotspotDetails.tsx:36-43` (the only prompt is "Click on the specific hotspot").
- **User impact:** Keyboard and screen-reader users can't get per-journey statistics or hotspot figures, which are two
  core outputs of the tool (WCAG 2.1.1 Keyboard, 4.1.2 Name, Role, Value). Mouse users lose nothing, but they also have
  no way to *find* hotspot N without hunting for it on the map.
- **Root cause:** Component responsibility. The map is the only place where these objects can be selected. Lists that
  once provided a second path were removed to reduce clutter.
- **Recommendation:**
  - Add a compact keyboard-reachable selector for each page:
    - Heatmaps: a numbered hotspot list (1–N with value and share), under the details area or as a select.
    - Journeys: an actor select in the legend card ("Human 5a8a…", "Bot 3…").
  - Selecting from either does exactly what a map click does.
  - Remove `tabindex` from the canvas, or give it a name and keyboard pan/zoom.
  - *Conflicts with recorded decisions* (no region list; the per-actor list was replaced by the legend). A select keeps
    the visual cost close to zero.
- **Classification · Priority · Confidence:** VD · High · High.
- **Verification:** Keyboard-only script: open Journeys → pick a match → open a journey's statistics → go to Heatmaps →
  open hotspot 2, without the mouse. An axe or Playwright test asserts no focusable element is unnamed.

## UX-04 · Switching Heatmaps ↔ Journeys throws away the camera and the match framing
- **Location:** Map pages, on page switch.
- **Problem:** On Journeys, a picked match is framed and zoomed ([17](screenshots/17_journeys_route_clicked.png)). Going
  to Heatmaps and back shows the whole map with the match as a small cluster ([19](screenshots/19_return_to_journeys.png)).
  The re-framing doesn't run again.
- **Evidence:**
  - Reproduced: Journeys with a match → nav Heatmaps → nav Journeys.
  - Cause: `ui/MapStage.tsx:201` (`refitKey={tab}`) and `map/MapView.tsx:335-341` ("Changing page zooms back out to the
    whole map"). Focus ids are remembered, so the match isn't framed again.
  - The code contradicts itself: `main.tsx:28-29` says switching pages "keeps the map, its camera".
- **User impact:** The core cross-check (W5: a hotspot here, which matches pass through it?) means going back and forth.
  Each trip costs a re-zoom, and the user loses their place.
- **Root cause:** An interaction-pattern decision applied globally (refit on page change), without per-page view memory.
- **Recommendation:** Remember the camera per page and restore it on return. Alternatively, keep one shared camera so the
  same area stays in view on both pages, which supports W5 directly. Refit only when the map changes. Update the comment
  in `main.tsx`.
- **Classification · Priority · Confidence:** VD · Medium · High.
- **Verification:** A Playwright test compares the view state before and after a round trip. Task T5 measures the time to
  compare a hotspot with a match.

## UX-05 · Map-page date list shows all-maps counts and leads to empty views
- **Location:** Row-2 date select on Heatmaps and Journeys.
- **Problem:** Each option shows the count for *all maps* (`ui/TopBar.tsx:37-45` uses `index.dates[].matches`). With
  GrandRift selected, "2026-02-10 · 287 matches" is offered, but GrandRift has 24 that day. "2026-02-09 · 1 match" leads
  to "Matches 0, No matches on this map for the selected date" ([28](screenshots/28_journeys_empty_date.png)).
- **Evidence:** Reproduced at `/journeys?map=GrandRift&date=2026-02-09`. The per-map counts were checked against
  `public/data/index.json`.
- **User impact:** The filter promises data that isn't there. Users waste a step, or misjudge how much data a day has for
  their map (24 vs 287 changes how much you trust a heatmap).
- **Root cause:** The control shows a global aggregate where the context is map-specific.
- **Recommendation:** Show the count for the selected map, and disable or mark dates with 0 ("no matches on this map").
  Keep the all-maps label on the Overview, where it is correct ("matches on all maps" is already in its group label).
- **Classification · Priority · Confidence:** VD · Medium · High.
- **Verification:** A unit test checks that the counts equal the per-map count from `index.json`. Manual check: no
  selectable date gives an empty list.

## UX-06 · Playback with "Full paths" (default) shows future events
- **Location:** Journeys playback.
- **Problem:** With "Full paths" on (the default, `state/store.ts:180`), the map draws the whole static journey,
  including every future kill and loot marker. Only a moving head shows the playback time
  (`ui/MapStage.tsx:139-143`). At 00:24, all 17 kill markers from later in the match are visible
  ([16](screenshots/16_journeys_playing.png)).
- **User impact:** "What had happened by minute 3?" can't be read off the map. Users may attribute a later event to the
  current moment. Pressing Play on the default view changes very little visibly, so playback can look broken.
- **Root cause:** One toggle controls two things: path context and event visibility. The default favours the static
  overview, even while the user is playing.
- **Recommendation:**
  - Whatever the path setting, draw markers only up to the playback time while time > 0 or playing. Show future markers
    faded if context helps.
  - Alternative: switch "Full paths" off automatically on Play and restore it on Restart. This is simpler but more
    surprising.
  - *Conflicts with a recorded decision* (full paths on by default).
- **Classification · Priority · Confidence:** EC · Medium · Medium.
- **Verification:** Task T4: "At 03:00, how many kills had this player made?" Success ≥ 90 % correct without scrubbing
  the list.

## UX-07 · Heatmap legend has no metric, unit or "per cell"; display controls are split
- **Location:** Heatmaps: the bottom-right display card and the side panel.
- **Problem:**
  - The legend shows "1 · 2–3 · 4–9 · 10+" or "1 min · 5 min · 51 min" with no metric name, no unit for counts and no
    "per cell" or cell size. The full wording exists only in `sr-only` and `aria-label` text
    (`ui/HeatmapLegend.tsx:27,41`).
  - The metric is chosen top-left in the panel; its legend, mode and opacity are bottom-right on the map. The
    overlay/outline switches sit in the panel.
  - On phones the panel is a closed drawer, so nothing visible names the metric ([21](screenshots/21_mobile_heatmaps.png)).
- **User impact:** Users can't read the colour scale without remembering the metric choice and guessing the spatial unit.
  "10+" what, over what area? Split controls mean looking in two corners to understand one picture.
- **Root cause:** The decision about which component owns these controls followed screen space, not the task. The
  card was made caption-free to stay small.
- **Recommendation:** Give the legend a one-line title: "Kills per cell (≈ X m)" or "Player time per cell". Either
  group all display controls (overlay, outlines, mode, opacity) with the legend, or move the legend into the panel next
  to the metric. On phones, put the metric toggle on the map card. *Conflicts with a recorded decision* (legend card "no
  captions").
- **Classification · Priority · Confidence:** EC · Medium · Medium.
- **Verification:** Task T6: "What does the brightest colour mean?" Success = metric and unit named correctly.

## UX-08 · "Focused" silently hides low-traffic cells, contradicting the About note
- **Location:** Heatmaps → Traffic, default "Focused" view; About this data.
- **Problem:** In Focused, cells under 30 s aren't drawn (`heatmap/scale.ts:72-79`). The About popover says "a cell with
  no value means no observed human traffic, not that the area is unreachable" (`ui/HelpPopovers.tsx:42`). In the default
  view, an empty area may in fact have traffic. Nothing near the toggle says cells are hidden; the legend just starts at
  "1 min".
- **User impact:** Designers may conclude an area is unused when it is lightly used. On GrandRift's single days, this
  can blank most of the map.
- **Root cause:** Content design. The view's filtering rule isn't stated where the view is chosen, and the global note
  wasn't updated.
- **Recommendation:**
  - Name the view after its effect, for example "Main routes (≥ 30 s)" vs "All activity".
  - Add a one-line note under the legend: "Cells under 30 s hidden".
  - Correct the About note.
- **Classification · Priority · Confidence:** VD · Medium · High.
- **Verification:** Content review. Task T6 follow-up: "Is the north-west corner unused?" Success = the participant
  checks All activity, or says it's uncertain.

## UX-09 · Key definitions live only in hover tooltips, which also leak internal text
- **Location:** Every ⓘ (`ui/MetricInfo.tsx`), "Few matches"/"Few values" badges (`ui/ReasonBadge.tsx`), partial-date
  reasons (`ui/TopBar.tsx:38` uses a `title` attribute).
- **Problem:**
  - The definitions, populations and limitations that decide how to read a number are only in hover/focus tooltips.
    The score tooltip is about 400 px tall ([33](screenshots/33_scorecard_info_tooltip.png)).
  - Radix tooltips don't open on tap, and `title` attributes aren't exposed to keyboard or touch users.
  - The tooltips show internal text: "Stored as “Map performance score”" (`MetricInfo.tsx:21`), an author and date tag
    "(S, 2026-10-23)", and "null for all maps".
- **User impact:** Touch users can't reach the caveats. Mouse users have to know to hover. Internal notes read as
  unfinished and add jargon to the most important explanations.
- **Root cause:** Progressive disclosure has nowhere to put content of medium importance. The UI has visible text or a
  tooltip, and nothing in between. Developer metadata is passed straight to users.
- **Recommendation:**
  - Use a click/tap **popover** (the same Radix family) for ⓘ and badges.
  - Show the one most important caveat as visible text where a judgement is made (see UX-02).
  - Remove "Stored as…" (or move it to the chat-facing data only).
  - Remove author and date tags and replace "null" with plain language.
  - Replace `title` on date options with visible text or an accessible description.
- **Classification · Priority · Confidence:** VD (text leak, title attribute) · Medium · High.
- **Verification:** Touch test on a phone or tablet: every ⓘ opens. A grep in CI fails on `Stored as`, `(S, 20` and
  `null` in user-facing strings.

## UX-10 · Two competing "selected map" models on the Overview
- **Location:** Overview: row-2 Map toggle vs Map comparison cards.
- **Problem:**
  - Row 2 shows "All maps" as active. Clicking a map there *navigates* to its report.
  - Separately, the cards have their own local selection (`ui/OverviewAllMaps.tsx:22`, `useState(stats.maps[0])`),
    shown by a blue glow. It changes only the "View detailed analysis of X" button (which sits under a different
    heading) and the chart highlight. That highlight is a subtle opacity change.
  - Each card is a button (select) with a separate chevron link (open).
- **Evidence:** Screens [01](screenshots/01_overview_top.png) and [02](screenshots/02_overview_mid.png): "All maps" is
  active while the AmbroseValley card is "selected".
- **User impact:** Two ways to pick a map with different effects, on the same screen. A user who clicks a card expecting
  to open it sees only a highlight. A user who changes row 2 expecting a highlight leaves the page.
- **Root cause:** Inconsistent interaction patterns. An extra in-page selection state was added for the insights button
  and charts.
- **Recommendation:** Make the card click open the report, the same as row 2 and the chevron. Drop the local selection,
  and replace "View detailed analysis of X" with the per-card action. If cross-highlighting the charts is worth keeping,
  do it on hover or focus only.
- **Classification · Priority · Confidence:** EC · Medium · High (behaviour verified; confusion is the concern).
- **Verification:** First-click test: "Open the GrandRift details." Success = the first click reaches the report.

## UX-11 · "Overview" names three different things
- **Location:** Primary nav, Overview page title, map report section tab.
- **Problem:** "Overview" is the nav destination, the all-maps page title, and the first section of every map report
  ([04](screenshots/04_report_grandrift_top.png)). On a map report, the nav still says "Overview" and the section tab
  also says "Overview".
- **User impact:** Weak wayfinding: "go to Overview" is ambiguous, and the active-state cue can't tell the all-maps view
  from a map report.
- **Root cause:** No naming scheme for levels of the hierarchy.
- **Recommendation:** Name the nav destination after what it contains, for example "Statistics" or "Maps". Rename the
  report section to "Summary" or "Standing". Keep "Overview" only as the all-maps page title.
- **Classification · Priority · Confidence:** EC · Medium · Medium.
- **Verification:** Tree test: "Where would you find GrandRift's death causes?" Success rate and directness.

## UX-12 · Match list sorts only within each day
- **Location:** Journeys match list.
- **Problem:** Matches are grouped by date (newest first) and sorted inside each day (`state/matches.ts:49-56`). "Sort by
  Kills" with All dates shows the top match *of the newest day* first, not the top match overall. The only explanation is
  the sort icon's tooltip, "Most kills first, within each day" (`ui/MatchList.tsx:59-62`). Explanatory text for each sort
  exists (`SORTS[].explain`, `state/matches.ts:8-13`) but is never rendered.
- **User impact:** "Find the bloodiest match" (a natural question when looking for fights to replay) can't be answered
  without scrolling through every day. Users may wrongly assume #1 is the global maximum.
- **Root cause:** The grouping and the sort compete. Grouping was chosen for orientation, sorting for ranking.
- **Recommendation:**
  - When a metric sort is chosen with All dates, rank across days and show the date on each row (a "Group by day"
    toggle can bring the groups back).
  - Alternatively, keep the groups and add a visible note under the sort control: "Ranked within each day".
  - Render the existing `explain` text.
  - *Conflicts with a recorded decision* ("Match list": grouped, sorted within each day).
- **Classification · Priority · Confidence:** EC · Medium · Medium.
- **Verification:** Task T7: "Find the match with the most kills on AmbroseValley." Time and accuracy.

## UX-13 · Selected-match panel repeats counts under different scopes
- **Location:** Journeys side panel, Inspect state.
- **Problem:** The legend ("On the map") shows Humans 1, Bots 0, Loot 53, Kill 17. The card below ("Match overview":
  "Recorded journeys", "In human files") shows Humans 1, Bots 0, Kills 17, Deaths 0, Loot 53
  ([15](screenshots/15_journeys_match_selected.png)). The numbers can differ when bots are present, because the scopes
  differ. The About popover needs a whole note to explain the "three scopes" of event counts.
- **User impact:** The same numbers twice take space and invite the question "why two?". When they *do* differ, the
  difference is explained only in the About popover.
- **Root cause:** Weak information grouping. Two components, each complete on its own, are stacked without merging
  their responsibilities.
- **Recommendation:** Merge them into one card. A header line gives date, time, duration and journeys
  (1 human · 0 bots). The legend rows give the counts with their toggles. Where human-only counts differ from what's on
  the map, show both in one row ("Kills 17 (human 15)").
- **Classification · Priority · Confidence:** EC · Medium · Medium.
- **Verification:** Comprehension check: "How many kills did the human player make?" on a match with bots.

## UX-14 · Phone layout: date filter off-screen, overlapping close button, unlabelled nav, hidden metric
- **Location:** All pages at 390 px.
- **Problem:**
  1. Row 2 is 634 px wide inside 390 px (`ui/ContextBar.tsx:14`, `overflow-x-auto`). The date filter is off-screen,
     with only a thin scroll line as a cue ([20](screenshots/20_mobile_overview.png)).
  2. The drawer's close (×) overlaps the "Browse matches" button ([23](screenshots/23_mobile_drawer.png)).
  3. The nav shows three icons with no visible labels (`ui/PrimaryNav.tsx:79-80`).
  4. On Heatmaps, nothing on screen names the active metric (UX-07).
- **Evidence:** Measured `scrollWidth` 634 vs `clientWidth` 390. Screenshots 20–23.
- **User impact:** On phones, users may never find the date filter, the drawer's main action is partly covered, and the
  nav relies on recognising icons. *(Inference: phones are a secondary context for this audience, hence Medium.)*
- **Root cause:** A desktop row reused at phone width without reflowing. Absolute-positioned sheet close button.
- **Recommendation:**
  - On narrow screens, use a Select for Map, or wrap row 2 onto two lines so the date is always visible.
  - Add right padding to the drawer header.
  - Show short labels under the nav icons.
  - Put the metric toggle on the map card.
- **Classification · Priority · Confidence:** VD · Medium · High.
- **Verification:** Visual regression at 360/390/414 px. Assert no control's bounding box lies outside the viewport.

## UX-21 · Focus order and unnamed focus stops
- **Location:** Map pages, Overview.
- **Problem:**
  - On map pages the DOM puts the map stage before the side panel. Tab goes nav → filters → canvas div → zoom buttons
    → … and only then the match list, which is visually first on the left.
  - There is no skip link.
  - On the Overview, the Recharts donut adds two unnamed tab stops (`svg role="application" tabindex="0"`,
    `g tabindex="0"`).
- **Evidence:** Tab walk and in-page enumeration (section G).
- **User impact:** Keyboard users go through irrelevant stops before reaching the list. `role="application"` can change
  screen-reader modes unexpectedly (WCAG 2.4.3 Focus Order, 4.1.2).
- **Root cause:** Layout built with absolute positioning over a DOM order chosen for rendering. Third-party chart
  defaults left on.
- **Recommendation:**
  - Put `<aside>` before `<main>` in the DOM, or add a skip link to the side panel.
  - Set `accessibilityLayer={false}` (or `tabIndex={-1}`) on the decorative donut, which already has an `aria-label`
    wrapper.
  - Remove the canvas tab stop (UX-03).
- **Classification · Priority · Confidence:** VD · Medium · High.
- **Verification:** An automated tab-order snapshot test; axe "focusable element has no accessible name".

## UX-15 · Insight links go to a different map than the headline leads with
- **Location:** Overview → Key insights.
- **Problem:** The first card reads "AmbroseValley leads overall; Lockdown has the most room to improve", but its link is
  "Open Lockdown". All three cards end in an identical "Open Lockdown" ([02](screenshots/02_overview_mid.png);
  `stats/insights.ts:29`, `ui/InsightCard.tsx:29`).
- **User impact:** Mild surprise about where the link goes. Three identical links don't say what each card offers.
- **Root cause:** The link target is "the map the insight is about", and for a two-map finding that's the second map.
- **Recommendation:** Name the destination by purpose ("See Lockdown's weak measures", "Storm deaths on Lockdown").
  For two-map findings, link both maps.
- **Classification · Priority · Confidence:** VD · Low · High.
- **Verification:** Content review.

## UX-16 · Match-file load error has no retry
- **Location:** Journeys side panel, selected match.
- **Problem:** `SidePanel` renders "Retry match data" only if `onRetryMatch` is passed (`ui/SidePanel.tsx:183`), and
  `App` doesn't pass it (`App.tsx:144-151`). A failed match file shows a message with no action.
- **User impact:** Recovery requires picking another match and back, or reloading the page. Rare, but a dead end.
- **Root cause:** The component API is ready, but the call site doesn't wire it up.
- **Recommendation:** Pass a retry that re-requests the match file, as the index and heatmap errors already do.
- **Classification · Priority · Confidence:** VD · Low · High.
- **Verification:** Block `/data/matches/*.json` in DevTools, then confirm the Retry button appears and works.

## UX-17 · Map report tabs split thin content *(hypothesis)*
- **Location:** `/stats?map=X`.
- **Problem:** Three vertical tabs hold 1–3 cards each ([05](screenshots/05_report_grandrift_overview_section.png)–[07](screenshots/07_report_loot.png)).
  All of it would fit in about two screens of scrolling. "Open heatmaps" appears in the hero and again in the Overview
  section.
- **User impact (hypothesised):** Extra clicks, and comparing Combat with Loot means switching tabs. Content behind
  unselected tabs is easy to miss.
- **Recommendation:** Test one scrolling report with in-page anchors (keep the section list as a sticky table of
  contents) against the current tabs.
- **Classification · Priority · Confidence:** HY · Low · Low.
- **Verification:** A/B test with task "What share of GrandRift deaths are storm deaths, and when do players find their
  first loot?"

## UX-18 · GrandRift minimap colours compete with heat colours *(hypothesis)*
- **Location:** Heatmaps on GrandRift.
- **Problem:** The GrandRift art has saturated red, orange, yellow and green zone fills and large labels baked in
  ([27](screenshots/27_heatmaps_sparse_grandrift_day.png)). The kills palette (orange to white) and the deaths palette
  (violet) are drawn over them. On a sparse day the deaths layer is barely distinguishable.
- **Recommendation:** Test an optional "dim map" control (darken or desaturate the base image under the overlay). The
  opacity slider exists but changes the overlay, not the base.
- **Classification · Priority · Confidence:** HY · Low · Medium.
- **Verification:** Task T6 on GrandRift with and without dimming.

## UX-19 · Formatting slips
- **Location / evidence:**
  - "**1 matches** played by 1 player" (`ui/ScopeLine.tsx:17`, [29](screenshots/29_overview_single_match_date.png)).
  - "**11:14 min**": minutes:seconds followed by "min" (`state/matches.ts:107,133`).
  - "0:37 · **min:s** into the match" (`stats/figures.ts:76`).
  - "Sat, Feb 14 at 13:34 UTC · **11:14**" with no unit (`ui/MatchCard.tsx:15-16`).
  - "**12:34 long**" with the Recent sort (`ui/MatchList.tsx:107`).
- **User impact:** Small, but these erode polish and briefly confuse (is 11:14 min eleven minutes, or eleven hours and
  fourteen minutes?).
- **Recommendation:** Use `plural()` in ScopeLine. Format durations one way everywhere, for example "11 m 14 s" or
  "11:14" with a "Duration" label.
- **Classification · Priority · Confidence:** VD · Low · High.
- **Verification:** Unit tests for formatters with 1 and 0 values.

## UX-20 · Shortcut list isn't page-aware
- **Location:** `?` popover on Heatmaps and Journeys.
- **Problem:**
  - The same list everywhere (`ui/shortcuts.ts:4-11`; `App.tsx:161` always enables it). On Heatmaps it offers
    Space/←/→ (no effect) and "Esc: Clear the selected actor", although Esc clears the selected *hotspot* there.
  - "Tab: Move between controls" isn't an app shortcut.
- **Recommendation:** Filter the list by page and state, and word Esc as "Clear the selection".
- **Classification · Priority · Confidence:** VD · Low · High.
- **Verification:** Content review.

## UX-22 · Overview has too few headings for navigation
- **Location:** `/stats`.
- **Problem:** Only H1 "Overview", H2 "Map comparison" and H2 "Key insights" exist. The four charts, the scorecard and
  the per-map cards are `div` titles (`CardTitle`).
- **User impact:** Screen-reader users navigating by heading skip the scorecard and charts (WCAG 1.3.1).
- **Recommendation:** Render section titles as headings: H2 "Map scorecard", H2 "Comparison charts", H3 for each chart.
- **Classification · Priority · Confidence:** VD · Low · High.
- **Verification:** Heading outline test.

## UX-23 · Hover tooltip draws over the journey card
- **Location:** Journeys, after clicking a route near the bottom-right.
- **Problem:** The map hover card renders above the journey statistics card, so the two overlap
  ([17](screenshots/17_journeys_route_clicked.png)). The journey card also covers the bottom-right of the map, where
  routes may run.
- **Recommendation:** Hide the hover card while the pointer is over the journey card's area, or position the hover card
  away from fixed overlays.
- **Classification · Priority · Confidence:** VD · Low · High.

## UX-24 · Journeys opens on an empty map with no on-map prompt *(hypothesis)*
- **Location:** `/journeys` with no match ([14](screenshots/14_journeys_no_match.png)).
- **Problem:** A large empty map and no "Pick a match from the list" cue. The list is visible, so most users will find
  it.
- **Recommendation:** A small centred hint on the map, or pre-select the top match of the current sort.
- **Classification · Priority · Confidence:** HY · Low · Low.

## UX-25 · Kill and death markers are both skulls *(hypothesis)*
- **Location:** Journeys map and legend.
- **Problem:** The kill marker is a skull in a red crosshair ring and the death marker a grey skull. At small zoom the
  shapes converge, and the difference relies largely on colour and ring.
- **Recommendation:** Test recognition at default zoom. If confusion shows up, use a crosshair-only kill icon.
- **Classification · Priority · Confidence:** HY · Low · Low.

## UX-26 · Count-up animation runs under reduced motion
- **Location:** Overview KPI tiles and map cards (`ui/CountUp.tsx:15-16`, a deliberate exception).
- **Problem:** Numbers animate for 900 ms even with `prefers-reduced-motion: reduce`. The digits change in place without
  moving, so the risk is low, but users who opted out still get animation. Meanwhile the value they came for is briefly
  wrong.
- **Recommendation:** Respect reduced motion (show the final value at once). *Conflicts with a recorded decision.*
- **Classification · Priority · Confidence:** EC · Low · Medium (WCAG 2.3.3 is AAA, so this is not an AA failure).
