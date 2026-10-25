# Frontend UI guidelines

**This file is the master for the frontend UI/UX.** It governs every UI change under `web/`: the UI pass on features 3–4, then playback (05), heatmaps (06) and the optional chat panel (09). Feature specs say *what* to build (scope, data, commit plan); this file says *how it looks and behaves*. If a spec disagrees with this file, this file wins and the spec is updated to match. Decisions are logged in §11; anything marked **Pending** there isn't decided yet.

## 1. What the tool is for
A Level Designer opens it to answer questions about a map:
- Where do players go, and which areas show no observed human traffic? → traffic heatmap
- Where do fights and deaths cluster? → kill and death heatmaps
- What happened in this match, and in what order? → journeys, markers and playback
- Is this pattern real or a small sample? → sample size and data notes, always next to the view

Everything on screen should help answer one of these. If a control or number doesn't, it doesn't ship.

**Quality over quantity.** The six core checks come first, done properly: paths on the right minimap · humans vs bots · kill/death/loot/storm markers · map/date/match filters · playback · kill/death/traffic heatmaps. Nothing else gets built until these are polished.

## 2. Principles → rules for this tool
S's 20 principles, turned into rules we can check. AI principles (12–14) apply to the optional chatbot (spec 09) only.

| # | Principle | Rule here |
|---|---|---|
| 1 | Decision-first | Every view has a title that says what it shows ("Deaths · AmbroseValley · all dates"). No decorative charts. |
| 2 | Data accuracy, spatial integrity | Nothing is converted in the browser except the hover readout (`space.ts`). Image, paths, markers, heatmap cells and playback all use the one drawing space. No smoothing, blur or curve-fitting. |
| 3 | Overview first | The app opens on the all-maps Overview (`/stats`). Heatmaps (`/heatmaps`) is the aggregate over all matches; Journeys (`/journeys`) holds matches, paths and playback, and a match opens there on demand. The three are the primary nav (P22). |
| 4 | Progressive disclosure | Defaults show the essentials; data notes, raw event labels and IDs live in tooltips and an "About this data" panel. |
| 5 | Consistent encodings | Gameplay colours, shapes and labels are defined once (§4) and used by the map, legend, tooltips and timeline ticks. |
| 6 | Context over isolated data | Every marker tooltip says who, what, when (mm:ss) and what the position means. Every heatmap shows its sample size. |
| 7 | Meaningful aggregation | Traffic = time spent (not rows), log scale. Kills/deaths = counts, linear. Units are named in the legend and hover ("41 min of player time"). |
| 8 | Temporal and spatial continuity | Playback interpolates only inside a segment; no line across a gap over 30 s. Past events stay visible, faded. |
| 9 | Coordinated views | One store. Hovering an actor highlights it on the map, in the timeline and in the legend count. Map, filters, timeline and URL never disagree. |
| 10 | Comparison | In scope: switching kills/deaths/traffic on the same map and dates keeps the view (zoom, pan) still, so layers can be compared in place; switching map keeps the date. Out of scope: side-by-side views, level versions (no version data). |
| 11 | Direct manipulation | Every interaction responds within one frame or shows a loading state. Every change can be undone with Back. |
| 12–14 | AI | Spec 09 only: numbers come from tools, sources are shown, facts, interpretation and uncertainty are labelled separately. |
| 15 | Uncertainty | Data limits are shown where they matter (§7), not only in docs. |
| 16 | Explore without losing context | The full state is in the URL. Opening a match from the overview and pressing Back returns to the same overview. |
| 17 | Cognitive efficiency | At most one primary action per panel. No more than 3 levels of nesting in the sidebar. Short labels in plain English. |
| 18 | Accessibility | Nothing is told by colour alone (§4). Text contrast ≥ 4.5:1. Everything works with the keyboard. |
| 19 | Reproducibility | A shared link reproduces the exact view. The pipeline that made the numbers is `make data`. |
| 20 | Outcome-based validation | Each feature ends with the designer tasks in §10, not just "it looks fine". |

## 3. Layout
Dark by default with a light toggle (P12). The minimaps are dark (mean luminance 28–37 of 255 on all three web images), so the map stage is black in both themes; only the chrome around it changes. The choice is kept in `localStorage` (not the URL) and applied before first paint.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ LILA BLACK          [Overview]  Heatmaps  Journeys                    ⧉   ⚙  │  row 1: primary nav 56 px
├──────────────────────────────────────────────────────────────────────────────┤
│ Map [All maps|AmbroseValley|GrandRift|Lockdown]  [All dates ▾]               │  row 2: filters 48 px
├───────────────────────┬──────────────────────────────────────────────────────┤
│ SIDE PANEL 320 px     │ MAP STAGE                               [+][−][Fit]  │
│                       │                                                      │
│ Overview (no match):  │                                                      │
│  Heatmap: Kills|Deaths│                                                      │
│           |Traffic    │                                                      │
│  Sample size line     │                                                      │
│  Scale legend         │                                                      │
│  Opacity              │                                       ┌────────────┐ │
│  ─────────────        │                                       │ Clicked    │ │
│  Matches (n) list     │                                       │ journey    │ │
│                       │ x −301.4  z −355.6                    └────────────┘ │
│ Match selected:       ├──────────────────────────────────────────────────────┤
│  ← Overview           │ ▶  4×  02:14 / 14:47  ──●──▲──✕────────▲──  ☐ Full  │  timeline 72 px
│  Match card + counts  │                                          paths        │  (match only)
│  Legend + toggles     │                                                      │
└───────────────────────┴──────────────────────────────────────────────────────┘
```

- **Two rows, on every page (P22):** row 1 is the primary nav: brand, Overview · Journeys · Heatmaps in the centre (the active one filled in brand blue), and the secondary actions on the right: Copy link (Heatmaps and Journeys only) and one settings menu (theme, keyboard shortcuts, the page's About panel, GitHub). Row 2 holds the filters: the map as a segmented control, the same on every page ("All maps" first on the Overview only; it slides out on Heatmaps and Journeys and back in on the Overview), then the date dropdown. The map and date carry across all three pages. AI Chat is hidden for now; `/chat` still works but nothing links to it. How I built this (`/how-i-built-this`) opens from a "How I built this" button with a hammer icon beside the About button (icon only on phones); it has no map or date, so its row 2 is a sticky bar of section links (P23).
- *(The diagram's side panel predates the Heatmaps/Journeys split; each page now has its own panel, see spec 06 Stage 6d.)*
- **Side panel:** content depends on whether a match is selected. Overview: heatmap controls, then the match list. Match: a "← Overview" link, the match card (players, duration, counts), then the legend with the layer toggles (P13). The match card keeps recorded bot journeys apart from bot combat. "Recorded bot journeys" is the number of bot files, which is often 0. "Bot kills" and "Deaths by bots" count `BotKill` and `BotKilled` in human files; they show "–" until the match file loads. When a match has bot combat but no recorded bot journey, a one-line note in secondary text says: "Bot activity detected, but no bot movement data is available for playback." "Other kills" and "Other deaths" appear only if a counted kill or death isn't bot combat. None does in this data.
- **Map stage:** zoom buttons and "Fit" top right; world x/z readout bottom left in Geist Mono; bottom right, the statistics of the clicked route (how it ended, kills, deaths, loot, time recorded, distance), kept until Esc, its close button or a click on empty map; a one-line hint when nothing is selected.
- **Timeline dock:** only when a match is selected (spec 05).
- **Default view:** with no match selected, the overview shows the traffic heatmap for the selected map and date. Until feature 6 exists, the overview shows the bare map, with no space reserved for heatmap controls (no placeholders, CLAUDE.md rule 3).
- **Widths:** designed for 1280 px and wider. Below 1024 px the side panel becomes a drawer over the map. Phones aren't a target, but nothing may overflow horizontally.

## 4. Visual encoding
### Gameplay colours
Defined once in `src/map/encoding.ts` (TypeScript, used by deck.gl and the legend) and mirrored as CSS tokens. Never type these hex values anywhere else.

| Meaning | Colour (token) | On the map | Icon (`src/assets/`) | Notes |
|---|---|---|---|---|
| Human | `#2589F5` | Blue circle (position, playback head); solid path 3 px | `Human_player` (legend, actor list, tooltip header) | |
| Bot | `#E99124` | Amber diamond (position, playback head); dashed path 1.5 px, 60 % opacity | `Bot_player` (legend, actor list, tooltip header) | Bots are context; humans are the focus |
| Kill | `#E5484D` | Icon on a badge | `kill-crosshair-skull.svg` | Position = where the killer stood. The SVG's red is `#F0444F`; align it with the token |
| Death | `#344256` | Icon on a badge | `Dead_icon` | Position = where the victim fell |
| Loot | `#D99A19` | Icon on a badge, smallest marker | `Loot` | Only player-client journeys (human or `unknown`, EC-09) loot in this data; bots never do |
| Storm death | `#8B5CF6` | Icon on a badge | `Cel-Shaded_Thundercloud_Emblem` | The cloud is navy and cyan, not violet; the violet ring keeps it apart from human blue |
| Kill/Killed pair | — | No icon of its own: the two events use the normal kill and death icons; the tooltip says the cause is unknown | — | 3 pairs in the data (EC-12). There is no self-kill category; `Blast_icon` isn't used: an explosion suggests a cause the data can't confirm |

**Not used (no matching data):** `Supply_Drop_Icon` and `Objective_Markers` have no event in the data, so they aren't shown. `Extraction_Point` is kept for an optional *inferred* extraction layer (EC-13: no extraction event). That layer is out of scope for the core (spec 06), and if it's built it must say "inferred".

### Icons on the map
The icons are detailed, full-colour illustrations (733–1367 px PNGs with transparency), so they are drawn as they are (`IconLayer` with `mask: false`), not tinted.
- **Event icons sit on a badge:** a white circle with a 2 px ring in the event's token colour. The badge keeps dark icons visible on the dark minimap (the storm cloud and the outlines would otherwise disappear). The ring ties each icon to the colour used in the legend and on timeline ticks.
- **Human and bot illustrations aren't used as map markers.** At 12–20 px a soldier and a robot become blobs, and up to 14 bots share a match. The map uses the circle and diamond. The illustrations appear where there is room: legend, actor list and tooltip headers.
- **File format:** the PNGs are 0.4–1.2 MB each (7.7 MB together), and they are shaded raster illustrations that wouldn't trace cleanly into SVG. So they're handled like the minimaps:
  - The originals live in `data/raw/icons/`, which is gitignored.
  - 128 px WebP copies (alpha kept, 4.5–8.6 KB each) live in `web/src/assets/` and are committed; components import them, so Vite fingerprints them. They were converted once by hand (S, 2026-10-22), not by a pipeline step.
  - Nothing over ~30 KB ships per icon.
  - `kill-crosshair-skull.svg` is already small (1.7 KB) and stays an SVG, with its red changed to the kill token.
  - All nine were converted, including the unused ones (§4 "Not used"); unused files aren't imported, so they don't ship in the build.
- **Legibility check:** every event icon must still be recognisable at its map size on all three maps, in greyscale and with deuteranopia emulation. Kill and death are both skulls, so they are told apart by the crosshair. If that fails at 20 px, the kill badge grows to 24 px.

### Rules that keep the encoding readable
- **Shape carries meaning; colour supports it.** Every event and actor kind has its own shape. Checked in greyscale and with deuteranopia/protanopia emulation (Chrome DevTools → Rendering).
- **Measured risks with this palette** (WCAG contrast and CIELAB ΔE76, computed for this doc):
  - Bot amber vs loot gold: ΔE 12.1 normally, **1.1 for deuteranopia** (indistinguishable). They are told apart by shape (crate vs diamond/dashed line) and size, and bots never loot. Both hues are kept; revisit if designer task 3 (§10) fails.
  - Human blue vs storm violet: ΔE 6.2 for deuteranopia. Shape (circle/line vs swirl) carries it.
  - Death charcoal on the dark minimap: contrast 1.50:1 against `#252525`. **Every marker gets a white halo or badge** so it stays visible on dark and bright parts of the map.
- **Human paths** get a 1 px white casing (a wider white path drawn underneath) so blue reads on dark ground.
- **Two humans in one match** (1 match has 2 humans; none has more): both blue. They are told apart by a small label at the path start (H1, H2) and by hover highlight, not by a second hue.
- **Draw order, bottom → top:** bot paths, unknown paths, human paths, loot, storm deaths, deaths, kills, hovered item. Rare events stay on top.
- **Marker sizes (screen px including the badge, at the reference zoom):** loot 14, others 20, hovered ×1.25. Bot-owned markers: same icon, 75 % size and 60 % opacity.
- **Zoom-dependent styling (P11, map pass M2):** sizes are screen pixels, set independently of the image, and follow the zoom measured in levels in from the whole map. Routes: ×1.5 on the whole map down to ×1 at 3 levels in (wide to read at a glance, thin for detail). Markers: ×0.85 on the whole map up to ×1.3 at 3 levels in (compact overview, readable and clickable close up). Linear in zoom levels, flat outside that range (`zoomStyle` in `encoding.ts`). Applied through deck.gl `widthScale` / `sizeScale`, so zooming recomputes no data.
- **Start, end and direction (map pass M3):** an open ring (white centre, actor-coloured ring) where a journey was first recorded and a filled square where it was last recorded; white chevrons with a dark edge along the route show which way it went. Humans and unknown journeys always show them; bots only when hovered or selected (P15), so 14 bots don't add 28 endpoints and hundreds of arrows. Arrows are spaced by their own collision group (at least 3 arrow-widths apart), so more appear as you zoom in. The last position isn't called an extraction (EC-13).
- **Selected journey (map pass M3):** the clicked journey is 1.5× wider, sits on a soft white glow (+10 px, 35 %), shows its start, end and arrows even if it's a bot, and is drawn at full strength; everything else dims to 30 %. Hover only dims and widens ×1.25, so hovered and selected never look the same.
- **Overlapping markers (P14):** each badge and icon is one image, and deck.gl's `CollisionFilterExtension` hides the lower-priority marker where two overlap: kill 40, death and storm death 30, loot 0, plus human 10 / unknown 5 / bot 0, plus 100 for the hovered or selected actor. Zooming in separates them and reveals the rest.
- **Heatmaps (visual pass and interpretation layer, 2026-10-23):** traffic is a continuous teal-to-yellow glow (log scale fixed per map, opacity rising with intensity; Focused / All activity; in Focused, cells under 30 s of estimated player time are not drawn and 30 to 60 s is a faint trace). Kills and deaths are four absolute count classes, 1 / 2–3 / 4–9 / 10+, stepping in lightness and opacity as well as hue. Soft edges about one cell wide are display-only and never add neighbours. Below the controls, the **concentrations summary** lists at most three consistent 16×16 regions (more on request), says "No consistent concentration detected in this selection." when none qualifies, and marks each with a numbered double-stroke circle (an approximate mark, never a fill). Heatmaps are their own tab with two independent switches (density overlay, hotspot outlines); clicking a region zooms to it and opens a details card in the map's bottom-right corner. The Journeys tab shows no heatmap.

### Interface colours (tokens in `src/index.css` `@theme`)
Hex values below are the light set. The dark set (`.dark` on `<html>`, `src/index.css`) redefines canvas `#0E1520`, surface `#151F2D`, subtle `#1D2A3B`, border `#2A3A4F`, text `#E6EDF5`, text-secondary `#9AA9BC` (6.9:1 on surface), text-muted `#7A8AA0` (4.7:1), brand-tint `#12263F`, and lightens the death token to `#8EA2BD` (charcoal is 1.5:1 on a dark card). Brand, brand-strong and the other gameplay hues are shared.

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#F5F7FA` | Page background |
| `surface` | `#FFFFFF` | Panels, cards, dropdowns, tooltips |
| `subtle` | `#EDF1F6` | Secondary controls, hover |
| `border` | `#DCE3EC` | Card edges, dividers |
| `text` | `#182638` | Headings, important labels (15.3:1 on white) |
| `text-secondary` | `#607086` | Descriptions (5.05:1 on white, 4.45:1 on `subtle`) |
| `text-muted` | `#8895A6` | **3.05:1 on white: fails AA for body text.** Only for non-essential metadata at ≥ 14 px semibold, or placeholder text |
| `brand` | `#2589F5` | Selected state fills, focus rings, icons, borders. **Not for text on white (3.51:1), and not as a background behind white text** |
| `brand-strong` | `#1672D4` | Primary button background with white text (4.78:1), blue links |
| `brand-tint` | `#E8F3FF` | Selected cards, active filters |
| `stage` | `#000000` | Map stage background (the minimaps' off-map area is opaque black, EC-20) |

## 5. Typography
- **Inter** for all UI text. Sizes: 12 (captions), 14 (body, controls), 16 (panel titles), 20 (page title). Weights 400/500/600; 700 only for the title.
- **Geist Mono** only for data: world coordinates, UV, mm:ss times, match and player IDs. Use `tabular-nums` for any number that changes (time display, counts) so it doesn't jitter.
- Sentence case everywhere ("Match start date (UTC)", not "MATCH START DATE"). No all-caps labels.
- **Font loading:** bundled with `@fontsource` packages (Inter, Geist Mono), imported once in `main.tsx`. No request to Google; versions pinned in `package-lock.json`. Only the weights listed above are imported.

## 6. Components and interaction
### shadcn/ui
Interface components come from shadcn/ui (Decisions table). They are copied into `src/components/ui/` and themed with our tokens, so we own the code and the look.

| Need | shadcn component |
|---|---|
| Map, heatmap layer, playback speed | `ToggleGroup` (segmented, single choice) |
| Date | `Select` |
| Buttons (fit, copy link, play) | `Button` |
| Layer toggles in the legend | `Checkbox` |
| "With bots" match filter | `Toggle` |
| Timeline, heatmap opacity | `Slider` (the timeline's event ticks are our own overlay on top) |
| Match card, legend, panels | `Card` |
| "Partial", "small sample", "numeric ID" | `Badge` |
| Match list, actor list | `ScrollArea` |
| About this data, shortcuts | `Popover` |
| Side panel below 1024 px | `Sheet` |
| Loading | `Skeleton` |
| Hover help on controls | `Tooltip` |
| Statistics page sections | `Tabs` |
| Settings menu (theme, shortcuts, GitHub); About button | `DropdownMenu` (added with P22) |
| Statistics charts (histograms, bars) | `Chart` (`ChartContainer`, `ChartTooltip`, `ChartLegend` on Recharts) |

Rules:
- **The set in the table above (plus `Kbd`, `Separator`) is installed up front** in the setup commit (S, 2026-10-22), so later commits build on a fixed kit. Anything beyond the table is added in the commit that first uses it (CLAUDE.md rule 3).
- **Theme through CSS variables, not by editing component files.** Map shadcn's variables to our tokens: `--background` → canvas, `--card`/`--popover` → surface, `--foreground` → text, `--muted` → subtle, `--muted-foreground` → **text-secondary** (shadcn uses it for descriptions, so it must pass AA; never the 3.05:1 muted grey), `--border`/`--input` → border, `--primary` → brand-strong, `--ring` → brand, `--accent` → brand-tint. Edit a component file only when theming can't do it, and say why in the commit.
- **Icons:** `lucide-react` (shadcn's default) for interface icons. This settles the old P5. Gameplay icons stay S's own (§4).
- **Map tooltips** are rendered by us, not by deck.gl's built-in string tooltip: hover info goes to the store and a React card styled like shadcn's `Popover` is drawn at the cursor. Map and controls then share one look.
- **Toasts:** shadcn's `Sonner`. It replaces `react-hot-toast`, which is removed from `package.json` in the same commit.
- **Base primitives:** Radix UI (chosen at `shadcn init`).
- **Chart colours:** `--chart-1…5` in `src/index.css` point at existing tokens (1 brand/human, 2 kill, 3 death, 4 storm, 5 loot), so charts follow the theme with no values of their own. A chart picks its series colour from the token that encodes the same thing on the map; there are no per-map colours.

### Behaviour
- **Controls:** segmented control (`ToggleGroup`) for ≤ 4 exclusive options (map, heatmap layer, speed); dropdown (`Select`) for longer lists (date); checkbox rows in the legend for layer toggles.
- **States:** every async view has loading, empty and error states. Loading never shifts the layout (reserve the space). Errors appear in place, plus a toast for failures that block the whole app.
- **Tooltips:** white card, 12–14 px, max 280 px wide. Line 1: what happened in plain words. Line 2: who and when (Geist Mono for ID and time). Line 3+: position meaning and data notes. Raw event names in brackets, e.g. "Killed a bot (BotKill)".
- **Hover:** highlights the hovered actor everywhere and dims the others to 30 %. **Click** on a path or marker selects that actor (kept until Esc or a click on empty map).
- **Keyboard:** all controls reachable with Tab, visible focus ring (`brand`, 2 px). Space play/pause, ← / → ±5 s, F fit map, Esc clear selection. Shortcuts are listed in a "?" popover.
- **URL:** every visible state that matters is in the URL (`map, date, match, hide`, later `t`, `layer`). User actions push history; corrections replace (Decisions table).
- **Motion:** only for meaning (playback, hover highlight, the camera bringing a picked match or hotspot into view). Transitions ≤ 150 ms, except camera moves: eased in and out over 700 ms (`map/zoom.ts`), stopped by any user input. Respect `prefers-reduced-motion` (camera moves are instant, instant highlights). One exception: the statistics count-up (`ui/CountUp.tsx`) runs under reduced motion too, because only digits change in place and nothing moves (S, 2026-10-24).
- **Loading on the map:** `LoadingIndicator` (`components/loading-indicator.tsx`): a pill centred in the map frame, shown only when loading lasts over 200 ms and then for at least 400 ms, so fast loads don't flicker.
- **Copy:** plain English, no jargon ("time spent", not "dwell"). Humans and bots are always counted separately, never as "players". Numbers in UI text come from the data files, never typed in.

## 7. Uncertainty and data quality in the UI
Show each limit where it affects a reading:

| Limit | Where it shows |
|---|---|
| Positions every ~5 s; straight lines between them | Legend note; About this data (S, 2026-10-22: removed from path tooltips) |
| Gaps over 30 s aren't drawn | Path tooltip ("2 path pieces…") |
| Kill/death position is the file owner's | Legend; About this data (S, 2026-10-22: removed from marker tooltips) |
| Rows logged after death (EC-14) | Marker tooltip ("timing uncertain") |
| Unknown journeys (EC-09) | Actor tooltip and actor list badge |
| Partial dates (EC-24) | "Partial" label in the date list; reason in a tooltip |
| Small samples (EC-26) | Sample-size line on every heatmap; a "Few matches" badge when a layer has fewer than 10 contributing matches (§11 P7) |
| No extraction event (EC-13) | Any extraction view is labelled "inferred" |
| Event counts have three scopes (M4): match card = events in human files (bot kills and deaths by bots from raw labels; paired `Kill` and `Killed` counted as a pair; late events included); legend = markers on the map, bot events included; journey card = one journey (paired `Kill` and events after death left out) | Labelled heading on each; legend kill row names its pair markers; `SCOPE` in `journeys.ts` |

An "About this data" panel, opened from the About button in the top nav on every page, collects these in one place and links to `EDGE_CASES.md`.

## 8. Code conventions
- **Styling:** Tailwind v4 utilities with the `@theme` tokens above, combined with `cn()` (`src/lib/utils.ts`, from shadcn). No raw hex in components; no inline styles except values computed from data.
- **One encoding module:** `src/map/encoding.ts` owns gameplay colours, icons, sizes, labels and draw order. Layers, legend, tooltips and timeline ticks import from it. (Today this lives in `journeyLayers.ts` as `EVENT_STYLE` and `HUMAN_COLORS`; the UI pass moves it.)
- **Icons:** gameplay icons imported from `src/assets/` (WebP, §4) plus the kill SVG; interface icons from `lucide-react`.
- **Pure logic stays out of components** (as now: `journeys.ts`, `space.ts`, `matches.ts`, `url.ts`) and has Vitest tests.
- **Folders:** `src/components/ui/` = shadcn components (vendored; edit only for theming, and for accessibility props the component lacks, as in P19); `src/components/` = our reusable building blocks that shadcn doesn't have, written in shadcn's style (`IconBadge`, `MapTooltip`, `TickSlider`, `Stat`); `src/ui/` = our app components (one per file, props typed), built from both.
- **Import alias:** shadcn needs `@/` → `src/` in `tsconfig.app.json` and `vite.config.ts`. New code may use it; existing relative imports are left as they are.
- **Performance:** deck.gl layers are memoised on their inputs. During playback the paths and current positions are cut at the playback time on the CPU every frame (`map/playback.ts`), and markers are only re-cut when one appears or fades, so deck.gl uploads nothing between those moments. The dock splits so that only the clock and the slider re-render per frame. (Spec 05 first planned a time uniform on a `TripsLayer`; see P16.)
  - One deck.gl canvas for the whole session: switching maps swaps layers, never the WebGL context.
  - Minimaps are fetched and decoded off the main thread (`createImageBitmap`, `src/map/minimap.ts`) as soon as the map is shown, not after deck.gl starts; once the first one is in, the other maps download into the HTTP cache. At most 2 decoded maps are kept (~64 MB each at 4096 px).
  - Values that change on every mouse move (coordinate readout, hover card) live outside MapView's state, so a move re-renders only them.
  - Zoom changes only `widthScale` / `sizeScale`, never per-object data.
- **Layout stability:** nothing may change the page's size after load. The page itself never scrolls (only panels do); visually hidden labels inside a scroll area need a positioned ancestor inside the scrolled content, or they stretch the page. Boxes whose text changes (coordinate readout, status lines) have fixed sizes. Long lists use `content-visibility: auto`.

## 9. UI work plan
The UI pass on features 3–4 comes before feature 5, so playback and heatmaps are built on the final shell. One commit each, stopping after each for S:

| # | Commit | Contents |
|---|---|---|
| 0 | `docs: add frontend guidelines` | This file |
| 1 | `chore: set up shadcn/ui with design tokens and fonts` | `shadcn init` with Radix (components.json, `cn()`, `@/` alias), `@theme` tokens and shadcn variable mapping, `@fontsource` Inter and Geist Mono, light canvas and global styles; the §6 shadcn set in `src/components/ui/`, our own building blocks in `src/components/`; `Sonner` replaces `react-hot-toast` |
| 2 | `feat: add top bar and side panel layout` | Top bar (`ToggleGroup` for map, `Select` for date, copy-link `Button`); overview/match side panel (`Card`, `ScrollArea`); map stage controls |
| 3 | `chore: replace gameplay icon pngs with small webp` | 128 px WebP in `src/assets/` replace the PNGs (originals moved to `data/raw/icons/`); kill SVG red aligned to the token |
| 4 | `feat: apply the gameplay encoding to journeys and markers` | `encoding.ts`, icons on badges, path casing, dashed bots, H1/H2 labels, draw order |
| 5 | `feat: restyle legend, tooltips and match list` | Legend with `Checkbox` toggles and counts, React map tooltips, match list and actor list with human/bot avatars, hover highlight |
| 6 | `feat: add keyboard shortcuts and about-this-data panel` | Focus rings, shortcuts `Popover`, data notes (§7) with `Badge`s |

### Map pass (S, 2026-10-22)
S's review after the UI pass: zoom was broken, the map could be dragged into the black margin, bot paths and markers crowded out the human journey, the legend covered the map, and the light panels clashed with the dark map. Decisions P11–P15 (§11). One commit each:

| # | Commit | Contents |
|---|---|---|
| M1 | `fix: make map zoom controls work and keep the view on the map` | Store only target and zoom; bounded camera; faster wheel zoom; disabled +/− at the limits |
| M2 | `feat: scale routes and markers with zoom` | Zoom-dependent route widths and marker sizes (both grow when zoomed in; S, 2026-10-22: base sizes doubled and routes no longer thin out, as they read faint zoomed in; values in `src/map/encoding.ts`); priority hiding of overlapping markers (P14) |
| M3 | `feat: mark journey start, end and direction` | Start and end markers, direction arrows on human routes, an unmistakable selected journey; humans over bots (P15) |
| M1b | `feat: show clicked journey statistics on the map` | Legend moves to the side panel in place of the journey list; the clicked route's statistics card takes the legend's corner (P13). Built before M2 |
| M4 | `feat: label event counts by scope` | Event counts labelled by scope ("on the map" vs "human files") |
| M5 | `feat: tighten match and journey navigation` | Compact match summary, switch matches without losing the list, clearer selectable rows and journey differentiation, polished coordinate readout |
| M6 | `feat: add dark theme with a light toggle` | Dark token set as the default, a light toggle (P12) |

Then feature 5 (timeline dock per §3) and feature 6 (overview panel per §3).

## 10. Designer tasks (outcome check)
Run at the end of each feature, timed, with the answer checked against the data:
1. On AmbroseValley, find the busiest match and say when its first death happened (mm:ss).
2. In that match, point to where a bot killed a human, and say whose position the marker shows.
3. Tell which paths are humans and which are bots with the browser in greyscale.
4. Find where deaths cluster on Lockdown, and say whether it is just a high-traffic area.
5. Say how many matches the GrandRift heatmap is based on.
6. Send a link to minute 6:40 of a match; open it in a new tab and get the same view.

## 11. Decisions log
| # | Question | Decision (S, 2026-10-22) |
|---|---|---|
| P1 | Look: design system vs spec 04 | Design system; spec 04 updated |
| P2 | Loot gold vs bot amber (ΔE 1.1 for deuteranopia) | Keep both hues; shape, size and "loot is human-only" tell them apart. Revisit if task 3 fails |
| P3 | Self-kill icon | Superseded: the self-kill category was removed (EC-12, D7); pairs use the normal kill and death icons |
| P4 | Font loading | `@fontsource` packages, bundled |
| P5 | Interface icons | `lucide-react` (comes with shadcn) |
| P6 | Default view with no match | Overview with the traffic heatmap (bare map until feature 6) |
| P7 | Small-sample badge threshold | "Few matches" when a layer's contributing matches are below 10 (S, 2026-10-22; covers 17 of 57 map/date/layer selections; 16 get the badge, one shows the empty state); events stay visible beside it |
| P8 | Icon files | Originals in gitignored `data/raw/icons/`; 128 px WebP copies committed in `web/src/assets/` (converted once, no pipeline step; S, 2026-10-22); the kill SVG stays an SVG |
| P9 | Toasts | shadcn `Sonner`, replacing `react-hot-toast` |
| P10 | shadcn base primitives | Radix UI |
| P11 | Map camera | Bounded: zoom out stops at the whole map, panning stops at the map edge; buttons zoom one level |
| P12 | Theme | Dark by default with a light toggle (replaces "light chrome, no dark theme" in §3) |
| P13 | Legend placement | Legend and layer toggles in the side panel, replacing the journey list; the map corner shows the clicked route's statistics (S replaced the earlier "Layers chip" choice the same day) |
| P14 | Marker clutter | Priority hiding (`CollisionFilterExtension`): kills/deaths/storm deaths over loot |
| P15 | Bots vs humans | Both clearly visible; humans get priority (on top, wider, casing, start/end markers) |
| P16 | Playback drawing | The static view's `PathLayer`, cut at the playback time on the CPU; the whole path travelled so far stays visible (no 30 s fading trail); past events stay, faded after 15 s. Replaces spec 05's `TripsLayer` (S, 2026-10-22) |
| P17 | Playback speeds | 0.5×, 1×, 2×, 4×, 8×, default 4× (S, 2026-10-22: playback felt too slow, so 8× was added). Replaces spec 05's 1×/4×/16× |
| P18 | `t=` in the URL | Written with a replace after the time has settled, never while playing; opening a link starts paused at that time |
| P19 | Vendored `slider.tsx` | Edited to accept `thumbProps`, so the timeline thumb gets an accessible name and value text |
| P20 | Statistics charts (spec 10) | shadcn `Chart` on Recharts 3.8.0 (the version shadcn CLI 4.22.1 installs for React 19); `--chart-1…5` mapped to the brand and gameplay tokens; `chart.tsx` unedited (S, 2026-10-22) |
| P22 | Navigation (S, 2026-10-24) | At most two persistent rows. Row 1: brand · Overview, Heatmaps, Journeys · Copy link (map pages) and a settings menu. Row 2: the map toggle and date filter, shared and carried across the three pages; "All maps" exists only on the Overview, and a map picked on any page opens that map's report there. Heatmaps and Journeys have their own paths (`/heatmaps`, `/journeys`); old `/explore?tab=` links are forwarded. The theme toggle, About and shortcuts moved into the settings menu; the date filter left the side panels. AI Chat is hidden from the nav (the `/chat` page still works). Replaces the Overview · Explore · AI Chat bar, the map row and the Heatmaps / Journeys & Playback tabs |
| P21 | Finding bot matches | A "With bots" `Toggle` beside the match list title narrows the list to matches with a bot journey (52 of 796), combined with the search and kept in the store for the session, not the URL. Each such row carries an amber chip with the bot avatar, "14 bots", after the sort chip; bots are no longer repeated in the row's grey details line (S, 2026-10-23) |
| P23 | How I built this (S, 2026-10-25) | `/how-i-built-this` (`ui/CaseStudyPage.tsx`), opened from a "How I built this" button with a hammer icon beside About (`ui/CaseStudyButton.tsx`; icon only on phones), not a centred nav link: `PageHero` with the map banners, KPI tiles, then System, Coordinates, Decisions, Insights and Checks sections built from `Card`, `Tabs`, `Slider`, `Switch`, `Badge` and `Button` on the tokens, in both themes, and a References list at the end. Row 2 is a sticky bar of section links that marks the section in view. Copy is plain and sentence case; every figure is traced to a repo file or a test run (see the file's header comment) |
