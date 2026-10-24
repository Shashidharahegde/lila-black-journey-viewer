# F. Proposed information and interaction architecture

**The evidence doesn't support a restructure.** Three destinations (numbers, space, time) sharing one Map + Date context
match the tasks (section A). The changes below adjust naming, component responsibility and the links *between*
destinations, where the register shows real cost.

## Navigation

```
Row 1  LILA BLACK      [ Statistics ]  [ Heatmaps ]  [ Journeys ]         (Copy link)  (⚙)
Row 2  Map: [All maps]* [AmbroseValley] [GrandRift] [Lockdown]   Date: [All dates ▾ (per-map counts)]
       * Statistics only
```

| Change | From | To | Benefit | Evidence |
|---|---|---|---|---|
| Nav label | Overview | Statistics (or "Maps") | "Overview" keeps one meaning: the all-maps page title | UX-11 |
| Report section | Overview · Combat & survival · Loot | Summary · Combat & survival · Loot (or one scrolling page; test T-a) | No name collision | UX-11, UX-17 |
| Date options | All-maps counts | Counts for the selected map; 0 disabled | The filter never leads to an empty view | UX-05 |
| Phone row 2 | Sideways-scrolling toggle | Map select + Date select on one line | Both filters visible at 390 px | UX-14 |

## Component responsibility

| Responsibility | Today | Proposed |
|---|---|---|
| Choosing a map on Statistics | Row 2 (navigates) **and** card selection (highlights) | Row 2 and the card both open the report. Hover/focus on a card highlights the charts |
| How a heatmap looks | Switches in the panel; mode, opacity and legend on the map | One "Layer" group: metric → legend (titled, with unit) → mode → opacity → overlay/outline switches. On desktop it lives in the panel, and the map keeps only a compact legend with title |
| Picking a hotspot | Canvas click only | Canvas click **or** the numbered list/select in the panel (same store action, `selectZone`) |
| Picking a journey | Canvas click only | Canvas click **or** the journey select in the legend card (same action, `pinActor`) |
| Match facts | Legend card + Match overview card (overlapping counts) | One "Match" card: header (date, time, duration, composition) + legend rows (toggle, symbol, count, human-only count where different) |
| Caveats and definitions | Hover tooltips | Visible one-liner where a judgement is made, plus a click/tap popover for the full definition |

## Interaction hierarchy for the core loop (W5)

```
Heatmaps                          Journeys                         Playback
pick metric ─► see hotspots ─►    (shared camera: same area) ─►    markers appear as time passes
             click hotspot N  ─►  [Matches through hotspot N]* ─►  prev/next kill-or-death
             (or pick from list)  sorted list, top first           Full paths = path context only
       ◄───────────── Back / nav keeps camera and selection ──────────────►
* candidate (T-e), needs region → match data
```

Principles:
1. **The camera is part of the user's context.** Keep it across page switches; reset only when the map changes.
2. **Time controls what's visible.** During playback, nothing from the future appears unless clearly faded.
3. **Every map selection has a panel twin.** Pointer and keyboard paths do the same thing through the same store action.
4. **Words are stable.** The glossary (E1) is the contract between pages.

## What not to change

The fixed map frame, URL-encoded state, legend-as-toggles, timeline design, match-row design, loading and error
patterns, and the sample-size flags (section D, E1–E14) all demonstrably support the workflows. Redesigning them would
add risk without evidence of benefit.
