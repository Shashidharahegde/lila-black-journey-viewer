# B. Screen-by-screen findings

Each screen lists **what works** and **what doesn't**, with register IDs (section C) for the problems. Screenshots are in
`screenshots/`.

---

## 1. Global shell (all pages)

Screens: [01](screenshots/01_overview_top.png), [08](screenshots/08_heatmaps_default.png), [14](screenshots/14_journeys_no_match.png)

**Works**
- Two fixed rows (destinations, then Map + Date) in the same place on every page. Orientation is easy: the active
  destination is a filled blue pill, and the active map is a raised segment.
- Map and date carry across pages, so the user doesn't re-enter context.
- The settings menu keeps secondary actions (theme, shortcuts, About, GitHub) out of the way.
- Both themes are complete and legible ([30](screenshots/30_overview_light.png), [31](screenshots/31_journeys_light.png)).

**Doesn't**
- The date list on map pages shows *all-maps* counts and offers dates that are empty for the selected map. UX-05
- "Overview" names the nav item, the all-maps page and a report section. UX-11
- The shortcuts popover is the same on every map page and lists playback keys on Heatmaps. UX-20
- On phones, row 2 scrolls sideways and the date filter is off-screen. UX-14

---

## 2. Overview (all maps): `/stats`

Screens: [01](screenshots/01_overview_top.png), [02](screenshots/02_overview_mid.png), [32](screenshots/32_metric_info_tooltip.png), [33](screenshots/33_scorecard_info_tooltip.png), [29](screenshots/29_overview_single_match_date.png)

**Works**
- Patterns come before details: KPIs → comparison → insights → charts → scorecard.
- KPI tiles lead with the value, then the label, then one line of context ("avg per player · 2,223 total"). Each has a
  definition one hover away.
- Insights state a finding and something to check ("Worth checking whether routes to the safe zone are long…"). They
  don't overclaim a cause.
- Sparse dates degrade gracefully: "—" for missing values, "Few matches"/"Few values" badges, and "Too few maps have
  matches on this date to compare them" ([29](screenshots/29_overview_single_match_date.png)).
- The mini charts label every value next to its bar and use event colours (kills red, loot gold, storm violet)
  consistently with the map pages.

**Doesn't**
- "Matches played" (554 for AmbroseValley) is a count of player-in-match journeys, and doesn't match the 553 and 566
  "matches" shown for the same map elsewhere. UX-01
- The default comparison metric is a sample count, yet it carries "Leading / Needs improvement" badges. The scorecard
  lists "Player activity" as a "Room to improve". UX-02
- Two ways to "select a map" with different effects: the row-2 toggle (navigates) and the cards (highlight only). UX-10
- All three insight cards link "Open Lockdown", including the one that leads with "AmbroseValley leads overall". UX-15
- The definitions and caveats that qualify the badges are hover-only and include internal text ("Stored as …",
  "(S, 2026-10-23)", "null for all maps"). UX-09
- The hero line reads "1 matches played by 1 player" on a single-match date. UX-19
- Only three headings on the page. The charts and the scorecard aren't headings. UX-22
- The donut chart adds two unnamed tab stops (`svg role="application"`). UX-21

---

## 3. Map report: `/stats?map=X`

Screens: [04](screenshots/04_report_grandrift_top.png), [05](screenshots/05_report_grandrift_overview_section.png), [06](screenshots/06_report_combat.png), [07](screenshots/07_report_loot.png)

**Works**
- One report per map with the same six KPI tiles as the Overview, so values are easy to compare.
- Charts have axis titles with units, stacked series in a fixed order, and an `sr-only` table of the same numbers.
- "Death causes" gives count, share and total in words, so the bar isn't the only encoding.
- Copy says what a pattern *may* indicate: "A long wait can point to little loot near where players start".

**Doesn't**
- The section tabs split short content (Combat: 2 tiles and 2 charts; Loot: 2 tiles and 1 chart) into three views. A
  single scroll would fit on about two screens. "Open heatmaps" appears twice. UX-17 *(hypothesis)*
- "Standing" repeats the evaluative framing ("In between", "Room to improve: Player activity"). UX-02
- In "When deaths happen", "Killed by a bot" and "Kill/Killed pair" are two greys of similar lightness (6–7 min bar). The
  legend separates them, but the stacked segments are hard to tell apart. Folded into UX-07's root cause (encoding
  without enough separation); low impact because the pair count is 1.
- "Median time to first loot: 0:37, min:s into the match". UX-19

---

## 4. Heatmaps: `/heatmaps`

Screens: [08](screenshots/08_heatmaps_default.png), [09](screenshots/09_heatmaps_kills.png), [11](screenshots/11_heatmaps_hotspot_selected.png), [13](screenshots/13_heatmaps_traffic_allactivity.png), [27](screenshots/27_heatmaps_sparse_grandrift_day.png)

**Works**
- The map gets most of the screen. The panel is compact: metric → summary → two switches → hotspot details.
- The summary leads with a meaningful total ("3,477 min estimated time humans spent on the map"), then three ratios with
  named denominators.
- Hotspots are numbered strongest first. Clicking one zooms in smoothly and fills the panel with its figures. Esc, ×, or a
  click on empty map clears it. The panel and the map always agree ([11](screenshots/11_heatmaps_hotspot_selected.png)).
- Hover reads the actual cell value ("This cell: 7 kills") and outlines the cell under the pointer. The hover-to-cell
  alignment was checked and is exact.
- Empty and sparse states are honest: "No hotspots stand out for this map and date", plus "Few matches" with its reason.
- Kills and deaths use fixed count classes (1, 2–3, 4–9, 10+), so the same colour means the same count on every date.

**Doesn't**
- The legend has no metric name, unit or "per cell", and it sits in the opposite corner from the metric selector. Mode
  and opacity are on the map, while the overlay/outline switches are in the panel. UX-07
- "Focused" (the default) hides cells under 30 s without saying so, contradicting the About note that an empty cell means
  no observed traffic. UX-08
- "Kills per match: 3" here vs "2.99" on the Overview, with a different denominator. UX-01
- On GrandRift, the minimap's baked-in coloured zones and labels (red Mine Pit, orange quarters, green areas) sit under
  the heat colours. A sparse layer is almost invisible ([27](screenshots/27_heatmaps_sparse_grandrift_day.png)). UX-18 *(hypothesis)*
- Hotspots can only be picked with a pointer. There is no list or keyboard path. UX-03
- Returning from Journeys resets the camera. UX-04

---

## 5. Journeys, no match selected: `/journeys`

Screens: [14](screenshots/14_journeys_no_match.png), [28](screenshots/28_journeys_empty_date.png)

**Works**
- The list is well designed for scanning: date headers stay pinned, the sorted metric leads each row as a tinted chip,
  secondary signals follow, and bot matches carry an amber chip. Search covers ID and date. "With bots" filters.
- Empty results explain themselves and offer the way back ("Clear search", "Show all matches").
- Each row has a full accessible name ("1. Select match b3c04fcc. 1 human. 17 kills · 0 deaths · 53 loot. Duration 11:14.").

**Doesn't**
- "Sort by Kills" ranks matches *within each day*. The most-killed match overall isn't necessarily first, and the only
  hint is an icon tooltip. UX-12
- "566 matches" for the same map that the Overview calls 554 "matches played". UX-01
- The map is empty, with no prompt to pick a match. The list is visible, so impact is probably low. UX-24 *(hypothesis)*
- "11:14 min" (minutes:seconds followed by "min"). UX-19

---

## 6. Journeys, match selected and playback

Screens: [15](screenshots/15_journeys_match_selected.png), [16](screenshots/16_journeys_playing.png), [17](screenshots/17_journeys_route_clicked.png), [19](screenshots/19_return_to_journeys.png), [24](screenshots/24_tablet_1024_journeys.png)

**Works**
- Picking a match eases the camera to frame its journeys, and the timeline appears with event ticks (colour *and* shape).
- Previous/next kill-or-death buttons, Space and ←/→ make reviewing a fight fast. Space on a focused button presses it and
  doesn't double-toggle (verified).
- The legend doubles as layer toggles with live counts, so "what is drawn" and "what I can hide" are in one place.
- Clicking a route opens a compact statistics card. "Click a route to see its statistics" teaches this in place.
- The playback time is written to the URL (`t=28`), so a shared link reopens at the same moment.

**Doesn't**
- With "Full paths" on (the default), playback draws every future kill and loot marker. At 00:24 all 17 kills are on the
  map, and only the moving head shows time. UX-06
- The panel shows the same counts twice under different scope labels ("On the map" vs "In human files"). UX-13
- Leaving for Heatmaps and coming back zooms out to the whole map. The match becomes a small cluster
  ([19](screenshots/19_return_to_journeys.png) vs [17](screenshots/17_journeys_route_clicked.png)). UX-04
- The hover tooltip draws on top of the journey card when the pointer is near it ([17](screenshots/17_journeys_route_clicked.png)). UX-23
- Kill and death markers are both skull icons, told apart by a red crosshair ring vs grey. UX-25 *(hypothesis)*
- If the match file fails to load, the panel shows the error with no retry. UX-16
- Journeys and markers can't be selected with the keyboard. UX-03

---

## 7. Phone (390 px)

Screens: [20](screenshots/20_mobile_overview.png), [21](screenshots/21_mobile_heatmaps.png), [22](screenshots/22_mobile_journeys_match.png), [23](screenshots/23_mobile_drawer.png)

**Works**
- The Overview reflows to two KPI columns and stacked cards without horizontal page scroll.
- The playback dock wraps into three rows and stays usable. The side panel becomes a drawer.

**Doesn't** (all UX-14)
- Row 2 is 634 px wide inside 390 px. The date filter and part of "Lockdown" are off-screen, with only a thin scroll line
  as a cue.
- The drawer's close (×) overlaps the "Browse matches" button.
- The nav shows three unlabelled icons.
- On Heatmaps, the chosen metric isn't visible anywhere on screen (it is in the closed drawer), and the legend doesn't
  name it.

---

## 8. Settings, help and About

Screens: [26](screenshots/26_shortcuts_popover.png), [32](screenshots/32_metric_info_tooltip.png)

**Works**
- `?` opens the shortcuts from anywhere on the map pages. The About popover collects the data caveats in plain language
  and links to the full list of data issues.

**Doesn't**
- The About note "a cell with no value means no observed human traffic" isn't true in the default Focused view. UX-08
- The shortcut list doesn't match the current page. UX-20
