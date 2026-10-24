# D. Cross-cutting design problems

These are systemic causes. Fixing one removes several register issues at once. They are kept separate from local
defects that need only a local fix (listed at the end).

## D1. No shared domain vocabulary
**Issues:** UX-01, UX-13, UX-19, part of UX-08 and UX-11.

The UI has three units (session, player-in-match, player) and names them inconsistently: "match", "match played",
"journey", "human journey", "player". Each page made its own choice, and rates borrow nouns freely ("kills per match"
divided by journeys on one page and by matches on another). The About popover then needs notes on "three scopes" to
explain the result.

This is an **information-architecture problem at the data-model level**, not a copy-editing one. The fix is a small
glossary that every label, tooltip and help text uses, plus formatting helpers that put the unit in the name (see E1).

## D2. Description and evaluation aren't separated
**Issues:** UX-02, UX-15, part of UX-09.

The stats pages turn ranks into judgements ("Leading", "Needs improvement", "Room to improve") for every metric,
including sample counts. The caveats that limit those judgements are hidden. In an analytics tool for designers, the UI
should *describe* differences with their size and *point to* what to check. The insight cards already do this well; the
badges and the scorecard don't.

## D3. Control placement follows space, not task
**Issues:** UX-07, UX-10, UX-13, UX-03.

Controls that act on one thing are spread across places:
- Heatmap display: switches in the panel, mode and opacity on the map, legend in the opposite corner.
- Map selection on the Overview: row 2 vs the cards.
- Journey and hotspot selection: on the canvas only.

Each placement is reasonable alone. Together they make users hunt, and they leave keyboard users with no path. The rule
to adopt: **every object you can select on the map can also be selected in the panel, and every control that changes how
a layer looks sits next to that layer's legend.**

## D4. Progressive disclosure has only two levels
**Issues:** UX-09, UX-08, UX-17, UX-12.

Content is either always visible or behind hover. Medium-importance content (the rule a view applies, what a sort
means, the caveat on a score) ends up hover-only, where touch and many mouse users never see it. Some useful text is
written but never shown (`SORTS[].explain`). A third level is missing: a short visible sentence, then a click/tap popover
for the full definition.

## D5. View state isn't preserved across the core loop
**Issues:** UX-04, UX-06, UX-24.

The product's main loop is *where* (Heatmaps) → *which matches* (Journeys) → *how* (playback) → back. The camera resets
on every page switch, playback defaults to a mode that hides time, and nothing links a hotspot to the matches that pass
through it. Each step works alone, but the loop between them isn't designed.

## D6. Accessibility of the map is an afterthought
**Issues:** UX-03, UX-21, UX-22.

The HTML controls around the map are well labelled (match rows, sliders, toggles, live regions). The map itself, the
centre of the product, has no keyboard path and leaves an unnamed tab stop. This is systemic because both map pages
inherit it from `MapView`.

---

## Local defects (not systemic)
UX-05 (date counts), UX-14 (phone layout), UX-16 (missing retry), UX-18 (GrandRift art), UX-19 (formatting),
UX-20 (shortcut list), UX-23 (overlap), UX-25 (icons), UX-26 (count-up).

---

## Effective design decisions (keep these)

| # | Decision | Why it works |
|---|---|---|
| E1 | Fixed map frame: the side panel and dock draw *over* a camera frame that already reserves their space | Opening or closing the panel or dock never moves the map. Users keep their spatial bearings |
| E2 | Whole view in the URL (map, date, match, layer, `t=`), with Copy link and working Back/Forward | Sharing and returning to an exact moment is trivial, and Back undoes navigation |
| E3 | Shared Map + Date row carried across pages | Context is set once. The three pages read as three lenses on one slice |
| E4 | The legend is also the layer toggle list, with live counts | "What is drawn" and "what I can hide" are one control, with no separate settings |
| E5 | Timeline ticks encode event type by colour *and* shape; previous/next kill-or-death buttons; Space and ←/→ | Fast review of fights. Doesn't rely on colour alone |
| E6 | Match rows lead with the sorted metric as a tinted chip; sticky date headers; bot chip; full accessible names | Scannable, and the sort is visible on every row |
| E7 | Honest sample-size signals ("Few matches", "Few values", "—" for no data, "too few maps to compare") | Thin data is flagged where it's read, not hidden |
| E8 | Loading: delayed indicator (200 ms) and skeletons sized to the final layout | No flicker on fast loads, no layout shift on slow ones |
| E9 | Error states with a reason and Retry (index, heatmap, statistics) | Recoverable without a reload (except UX-16) |
| E10 | Hotspots numbered strongest first; click zooms in and shows figures in the panel; Esc, ×, or an empty click clears | Clear selection model. The map and the panel always agree |
| E11 | Hover reads the cell grid, not painted pixels ("This cell: 7 kills") | Exact values on demand, with no extra chrome |
| E12 | Charts with axis titles and units plus hidden data tables | Interpretable and accessible |
| E13 | Insight copy states the finding and what to check, not a cause | Matches what the data can support |
| E14 | Complete light and dark themes from shared tokens; gameplay colours consistent across map, legend, charts and icons | One visual language; kills, loot and storm read the same everywhere |

## Subjective observations (not prioritised)

1. **Hero banners** take about 220 px above the KPIs on every stats page. They add atmosphere, and the KPIs are still
   above the fold at 900 px, so there is no demonstrated usability cost.
2. **Card art strips** on the map comparison cards are decorative. They help recognise each map, at the cost of width.
3. **The brand glow** behind Key insights is decoration with no functional role.
