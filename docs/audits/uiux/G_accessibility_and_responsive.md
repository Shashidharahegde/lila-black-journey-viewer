# G. Accessibility and responsive findings

## How it was checked

- **Keyboard:** real Tab, Space, Esc and `?` key events in headless Chrome. Tab order recorded on Journeys.
- **DOM enumeration** on Overview, Heatmaps and Journeys (with a match): every visible focusable element (buttons, links,
  sliders, checkboxes, switches, inputs, `tabindex=0`) checked for an accessible name and a size ≥ 24×24 px; headings and
  landmarks listed.
- **Viewports:** 1440×900, 1024×768, 390×844. Both themes.
- **Not done:** screen-reader testing (NVDA, VoiceOver), touch input, 200 %/400 % zoom, Windows High Contrast, colour
  vision simulation of the map overlays.

## Verified issues

| # | Finding | WCAG | Evidence | Register |
|---|---|---|---|---|
| A1 | Journeys, markers and hotspots can be selected only with a pointer; journey statistics and hotspot details unreachable by keyboard | 2.1.1 (A) | No list or keyboard path in `MapStage`/`HotspotDetails`; deck.gl `keyboard: false` | UX-03 |
| A2 | Unnamed focusable `div.deck-events-root` (`tabindex=0`) on both map pages; focusing it does nothing | 4.1.2 (A), 2.4.3 | Enumeration; tab walk lands on "DIV" | UX-03, UX-21 |
| A3 | Recharts donut adds two unnamed tab stops, one with `role="application"` | 4.1.2 (A) | Enumeration on `/stats` | UX-21 |
| A4 | Focus order: map stage controls come before the side panel, which is visually first | 2.4.3 (A) | Tab walk: nav → filters → canvas → zoom → … → match list | UX-21 |
| A5 | No skip link; about 10 tab stops before the match list | 2.4.1 (A) *(landmarks exist, which can satisfy 2.4.1; this is a convenience gap)* | Tab walk; no "skip" in source | UX-21 |
| A6 | Thin heading structure on the Overview (3 headings; charts and scorecard aren't headings) | 1.3.1 (A) | Heading list | UX-22 |
| A7 | Partial-date reason only in a `title` attribute on a select option | 1.3.1 / 4.1.2 (no keyboard or touch access to `title`) | `ui/TopBar.tsx:38` | UX-09 |
| A8 | Phone: date filter outside the viewport inside a horizontally scrolling row; drawer close overlaps a button | 1.4.10 Reflow (AA) for row 2 | `scrollWidth` 634 vs 390; screenshot 23 | UX-14 |
| A9 | Animation under reduced motion (count-up) | 2.3.3 (AAA, advisory) | `ui/CountUp.tsx:15-16` | UX-26 |

## Verified as working

- Visible focus ring on all HTML controls (2 px brand outline), checked on the zoom buttons and match rows.
- Accessible names on every HTML control checked except A2 and A3. Match rows carry full descriptive names. The playback
  slider has `aria-valuetext` ("00:28 of 11:14").
- Live regions: hotspot details (`aria-live="polite"`), journey card, loading `role="status"`, errors `role="alert"`.
- Charts: `role="img"` with a summary `aria-label` and an `sr-only` data table.
- Colour isn't the only cue for timeline ticks (shape too) or count classes (lightness steps).
- Text contrast. Dark tokens are documented in `index.css` (text 14.1:1, secondary 6.9:1, muted 4.7:1 on surface). The
  light theme's secondary text `#607086` measures 5.05:1 on white cards and 4.70:1 on the `#f5f7fa` canvas (computed
  for this audit). All of these meet AA for body text.
- Reduced motion is respected for transitions and camera moves (`index.css` global rule, `MapView` instant moves); count-up
  is the exception (A9).
- Space doesn't double-trigger on a focused button. Keyboard shortcuts are ignored while typing in inputs or menus.

## Target size (WCAG 2.5.8, AA: 24×24 px or spacing exception)

| Element | Size | Assessment |
|---|---|---|
| ⓘ metric info buttons | 20×20 | Below 24 px. Probably passes the spacing exception (isolated inline), but a 24 px hit area is cheap |
| Layer checkboxes | 16×16 | Pass: the whole label row is the click target |
| Density/outline switches | 36×20 | Pass by spacing; the label is clickable |
| Timeline tick buttons | 2×6 – 2×12 (+4 px pseudo hit area) | Below 24 px, but exempt: the same seek is available via slider and prev/next buttons |
| Slider thumbs (time, opacity) | 12×12 | The track is the larger target; borderline, worth a 20–24 px thumb |

## Untested concerns (need assistive technology or devices)

- **Screen reader announcement** of map state: nothing announces what the map currently shows (match framed, hotspot
  selected) apart from panel live regions. Needs NVDA/VoiceOver testing.
- **Touch:** Radix tooltips (ⓘ, badges, the sort-icon explanation) don't open on tap, a known component behaviour. If
  confirmed on a device, definitions are unreachable on touch (UX-09).
- **Map overlays under colour-vision deficiency:** human blue vs bot amber and the heat palettes were not simulated here.
  Bots are also dashed, a non-colour cue.
- **Zoom 200 %/400 %:** the fixed-height shell (`html, body { overflow: hidden }`) may clip panel content at high zoom.
  Needs a manual check (1.4.4, 1.4.10).
- **Hover card persistence (1.4.13):** map hover cards vanish when the pointer moves, which is expected. They aren't
  keyboard-triggerable (A1).

## Responsive summary

| Width | Result |
|---|---|
| 1440 | Comfortable. The heatmap leaves wide black margins on either side of AmbroseValley's square map (inherent to the map shape) |
| 1024 | Works. The side panel takes 31 % of the width; the Match overview needs a scroll |
| 390 | Overview reflows well. Map pages work with a drawer, but: row 2 overflows (date hidden), drawer close overlaps "Browse matches", nav is icon-only, Heatmaps hides the metric (UX-14, UX-07). The playback dock wraps into 3 rows (117 px) and stays usable |
