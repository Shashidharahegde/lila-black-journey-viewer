# 03 — Map and filters

## Goal
A Level Designer opens the tool, picks a map, a date and a match, and sees the correct minimap at a usable size, with zoom and pan. The view can be shared as a link.

## The problem in depth
- **The image and the data must share one coordinate space.** If the image is drawn in one space and paths in another, they drift apart on zoom or resize. The pipeline gives UV (0–1); the map must be drawn in the same UV-derived space.
- **GrandRift is not square** (2160×2158 originally). The drawing space must keep each map's real aspect ratio.
- **Most matches have one recorded player** (743 of 796). A plain alphabetical match list hides the 53 interesting multi-player matches. Designers need to find good matches quickly.
- **Designers think in the game's units.** Hovering should show world coordinates (x, z), which they can look up in the editor, not pixels.
- **Designers share findings.** A teammate should be able to open the same view from a link.
- **Dates come from the data, not from the folder names** (decision D1). A match's date is the UTC date of its first recorded event, so the data has six dates: 2026-02-09 (1 match that starts at 23:58) through 2026-02-14. The pipeline publishes the list, with match counts and a `partial` flag, in `index.json`. A hardcoded five-day list would hide the Feb 9 match.
- **The pipeline's alignment checks are mathematical** (decision D4). The rendered map is the first place where image and data are drawn together on screen, so final alignment is checked here.

## Decisions
| Choice | Decision | Why |
|---|---|---|
| Renderer | deck.gl `OrthographicView` + `BitmapLayer` | Flat 2D map with smooth zoom/pan, and the same engine later draws paths, playback and heatmaps |
| Drawing space | `X = u · 1000`, `Y = (1 − v) · 1000 · (H / W)`; image bounds match | One space for image and data; keeps aspect ratio; flips y because images count rows from the top |
| Match picker | Sorted by recorded players (humans + unknown + bots), then duration; shows map, date, duration, player count | Puts the 53 richest matches first |
| Date filter | Options built from `index.json` `dates` ("All dates" + one entry per date, showing its match count). Only dates with `partial: true` get a "partial" label, with `observed_from_utc` / `observed_to_utc` as the reason in a tooltip; `boundary` alone isn't shown as partial. No dates in frontend code | New or corrected data can't silently drop a date; labelled "match start date (UTC)" per D1 |
| Default view | Map selected, no match selected; once feature 6 exists, this overview shows the traffic heatmap (FRONTEND_GUIDELINES §3) | Overview first; a match opens on demand |
| URL state | `?map=&date=&match=` (playback time and layers added by later features) | Shareable views |
| State | One small store (Zustand) synced with the URL | Single source of truth |

## Implementation
**Commit 1 — `feat: show minimap in a zoomable map view`**
Load `index.json`; draw the selected map image with deck.gl; zoom and pan; fit the map to the screen on load.

**Commit 2 — `feat: add map and date filters`**
Map selector (from `index.json` `maps`) and date selector (from `index.json` `dates`, as in the Decisions table). Switching map changes the image and resets the view.

**Commit 3 — `feat: add match picker sorted by recorded players`**
List filtered by map and date, busiest first, showing player count and duration. Selecting a match loads its file (rendering comes in feature 4).

**Commit 4 — `feat: keep the current view in the url`**
Read state from the URL on load; update the URL on change. Unknown values fall back to defaults.

**Commit 5 — `feat: show world coordinates on hover`**
Convert the cursor position back to world x/z using the map's scale and origin from `index.json`; show it in a corner. (Display only — the data itself is never converted in the browser.)

## How to verify
1. Each map shows its own image at the right aspect ratio; zoom and pan are smooth.
2. On AmbroseValley, hovering at the README example's pixel position shows roughly x = −301, z = −356.
3. The date list matches `index.json`: six dates from 2026-02-09 (1 match) to 2026-02-14, with the partial dates labelled. Changing the date updates the match list; the busiest matches are at the top.
4. Copy the URL, open it in a new tab: the same map, date and match are selected.
5. **Rendered alignment (D4, final check).** On GrandRift, open the matches listed in `docs/evidence/grandrift_validation.md` once paths are drawn (feature 4), and compare with `docs/evidence/grandrift_correct.png`: the same start points (north-east corner, east edge by Engineer's Quarters) and routes. Also check the README example on AmbroseValley (step 2) and one corner of each map.

## Out of scope
Drawing paths and markers (feature 4), playback (5), heatmaps (6).
