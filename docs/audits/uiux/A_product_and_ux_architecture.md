# A. Product and UX architecture

Derived from using the interface first, then confirmed in `web/src`. Where something is inferred rather than shown, it is
marked *(inference)*.

## What the application helps users do

The tool reads recorded telemetry from an extraction shooter (LILA BLACK) on three maps (AmbroseValley, GrandRift,
Lockdown) and answers three kinds of question:

| Question | Where the UI answers it |
|---|---|
| How do the maps compare: activity, time in match, kills, loot, storm deaths? | Overview (`/stats`) and per-map reports (`/stats?map=…`) |
| *Where* on a map do people go, fight and die? | Heatmaps (`/heatmaps`): traffic, kills and deaths density, plus numbered hotspot outlines |
| *How* did a particular match unfold? | Journeys (`/journeys`): a match list, paths with events, a timeline with playback |

## Likely users

- **Established by the interface:** people who think in maps, routes, hotspots and match flow. The vocabulary ("storm
  deaths", "loot", "hotspots", "Leads on / Room to improve", "Worth checking whether routes to the safe zone are long")
  speaks to level or game designers who will change a map.
- *(inference)* Primary: level designers reviewing a map's layout. Secondary: producers or analysts comparing maps, and
  reviewers of the project itself.
- *(inference)* Desktop-first. The map views need room, and the phone layout works but is clearly secondary (section G).

## Inventory

### Pages and routes

| Route | Page | Notes |
|---|---|---|
| `/` | → redirect to `/stats` | Old links with a query string go to the map page they meant (`main.tsx:19-23`) |
| `/stats` | Overview, all maps | Landing page |
| `/stats?map=X[&section=combat|loot]` | Map report | Shown under the same "Overview" nav item |
| `/heatmaps?map=…&date=…&layer=…` | Heatmaps | Shares one mounted `App` with Journeys |
| `/journeys?map=…&date=…&match=…&t=…` | Journeys | Match list ↔ selected-match inspector, map, playback dock |
| `/chat` | AI chat | Not in the nav; reviewed in source only |

### Navigation systems (5 layers)

1. **Primary nav (row 1):** Overview · Heatmaps · Journeys. Brand link on the left; Copy link (map pages only) and a
   settings menu (theme, shortcuts, About, GitHub) on the right.
2. **Context bar (row 2):** a Map toggle and a Date select, the same position on every page. On the Overview the Map
   toggle has an extra "All maps" segment, and picking a map *navigates* to that map's report.
3. **In-page selectors:** the Overview's map cards (select / open report) and "Compare on" select; the map report's
   section tabs (Overview · Combat & survival · Loot); the Heatmaps metric toggle (Traffic · Kills · Deaths).
4. **Side panel (map pages):** on Journeys it alternates between a *Browse* state (match list) and an *Inspect* state
   (legend with layer toggles, match overview). On Heatmaps it holds the metric, summary, switches and hotspot details.
5. **On-map controls:** zoom, fit and panel toggle; a minimap navigator when zoomed in; a coordinate readout; the
   heatmap display card (Focused/All activity, legend, opacity); the journey statistics card; the playback dock.

### Major components (by responsibility)

| Responsibility | Components |
|---|---|
| Shell and navigation | `PrimaryNav`, `ContextBar`/`MapToggle`, `TopBar` (date select), `SettingsMenu`, `HelpPopovers` |
| Statistics | `StatsPage`, `OverviewAllMaps`, `PageHero`, `FigureCard`, `MapComparisonCards`, `InsightCard`, `AnalyticsStrip`, `MapScorecard`/`MapStanding`, `MapReport`, `*Section`, `HistogramChart`, `ShareBar`, `MetricInfo` |
| Map | `MapStage` → `MapView` (deck.gl), `MapOverview`, tooltips |
| Journeys | `SidePanel`, `MatchList`, `Legend`, `MatchCard`, `JourneyCard`, `PlaybackDock`/`TickSlider` |
| Heatmaps | `HeatmapPanel`, `HeatmapSummary`, `HotspotDetails`, `HeatmapMapControls`/`HeatmapLegend` |
| State | One Zustand store, synced to the URL (`useUrlSync`); the stats page keeps its scope in the URL only |

## Primary and secondary workflows

| # | Workflow | Steps in the current UI |
|---|---|---|
| W1 | Compare maps | Land on Overview → read KPIs → change "Compare on" → read insights and the scorecard |
| W2 | Investigate one map | Overview → Map toggle *or* card chevron *or* insight link → report → section tabs |
| W3 | Find where things happen | Heatmaps (or "Open heatmaps" from a report) → pick metric → read density and outlines → click a hotspot |
| W4 | Inspect a match | Journeys → sort/search the list → pick a match → read legend and overview → play / scrub / click a route |
| W5 | Cross-reference place and behaviour *(inference: the core design question)* | Heatmaps hotspot → Journeys → find matches that pass there → replay |
| W6 | Share a view | Copy link (map pages) or copy the URL (stats pages) |

W5 is the workflow the product exists for, and the UI gives it the least support. Nothing connects a hotspot to the
matches that pass through it, and moving between the two pages resets the camera (UX-04).

## Mental model the interface encourages

- **Three lenses on one dataset:** numbers (Overview), space (Heatmaps), time (Journeys). The Map and Date filters carry
  across all three. The model is sound and easy to learn: the nav labels name the lens, and row 2 names the slice.
- **The model breaks in two places:**
  - *What one unit is.* The Overview counts a "match played" as one player in one match. Heatmaps uses "human journeys"
    and "matches". Journeys counts sessions. The user has to reconcile three numbers for the same map (UX-01).
  - *What "selecting a map" means.* On the Overview, row 2 navigates to a report, while clicking a card only highlights
    it and retargets one button and the charts (UX-10).

## Information hierarchy (as built)

- **Overview:** hero (≈ 220 px) → six KPI tiles → map comparison cards → key insights → four mini charts → scorecard.
  Patterns come before detail, which is a sound order. The evaluative layer (badges, "Leads on", "Room to improve") is
  more prominent than the caveats that qualify it (UX-02, UX-09).
- **Map report:** hero → six KPI tiles → vertical section tabs with 1–3 cards each.
- **Heatmaps:** the map dominates (good). The metric choice sits top-left in the panel, while how to read the colours
  (legend, mode, opacity) sits bottom-right on the map (UX-07).
- **Journeys:** the list or the inspector on the left, the map in the centre, the timeline at the bottom, the journey card
  bottom-right. Each sits roughly where the task needs it.

## Does the structure fit the tasks?

Mostly, yes. Three top-level destinations are the right number for three lenses, and keeping the filters in a shared row
is a good choice. The mismatches are underneath the structure: inconsistent units and terms, evaluative framing, and the
missing bridge between "where" and "which matches". Section F proposes targeted changes, not a new structure.
