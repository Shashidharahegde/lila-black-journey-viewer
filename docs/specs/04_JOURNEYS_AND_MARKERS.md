# 04 — Journeys and event markers

## Goal
For a selected match, show each player's path and what happened along it, so a designer can tell at a glance who was human, who was a bot, and where they fought, looted and died.

## The problem in depth
- **Humans and bots must be distinguishable without reading a legend twice.** Colour alone fails for colour-blind users and when many paths overlap.
- **Event types must be distinct by shape, not only colour.** Kills, deaths, loot and storm deaths need different symbols. The two halves of a Kill/Killed pair (EC-12) use the normal kill and death symbols, with a tooltip saying the cause is unknown.
- **Marker meaning depends on the actor.** A kill marker is where the *killer* stood; a death marker is where the *victim* fell (see 02). Tooltips must say so, or designers will misread fights.
- **Gaps are real.** Paths are already split into segments where sampling stopped for over 30 s; drawing a line across a gap would invent movement.
- **Samples are every ~5 s.** Lines between samples are straight and can cut through walls; this is a limit of the data, worth stating in the UI.
- **Loot is the most common event** (12,829 rows after cleaning, against 2,409 kills and 700 deaths; `build_report.json`) and can bury the rarer, more important ones. Loot needs to be visually quieter.

## Decisions
Exact colours, icons, sizes and styling are in [FRONTEND_GUIDELINES.md](FRONTEND_GUIDELINES.md) §4, the master for the frontend. This table records the choices; if the two ever differ, the guidelines win.

| Choice | Decision | Why |
|---|---|---|
| Human paths | Solid blue (`#2589F5`), 3 px, with a thin white casing; all humans the same blue. The 2 matches with two humans tell them apart with H1/H2 labels at the path start and hover highlight | Design system; one colour means "human" everywhere |
| Bot paths | Amber (`#E99124`), dashed, 1.5 px, semi-transparent; toggle to hide | Bots are context; dash and width keep them apart from humans in greyscale |
| Positions | Human = blue circle, bot = amber diamond | Shape carries the actor kind |
| Markers | S's icons on a white badge with a ring in the event colour: kill = crosshair skull (red), death = skull (charcoal), loot = crate (gold), storm death = thundercloud (violet) | Distinct shapes; the badge keeps icons visible on the dark minimaps |
| Marker size / order | Loot smallest and drawn first; deaths and kills on top | Rare events stay visible |
| Tooltip | Event type in plain words, raw label, match time (mm:ss), actor kind | "Killed a bot (BotKill) at 4:12 — human" |
| Legend | Always visible, compact, with the same icons; includes a note that kill markers show the killer's position | Prevents misreading |
| Layer toggles | Humans, bots, and each event type on/off | Designers isolate what they need |

## Implementation
**Commit 1 — `feat: draw player paths for the selected match`**
`PathLayer` over each actor's segments, converted from UV to the drawing space from 03.

**Commit 2 — `feat: style humans and bots differently`**
Human/bot styles above; toggle to hide bots; `unknown` journeys (EC-09) get a neutral style, an "Unknown" label and a tooltip note, and stay visible when bots are hidden.

**Commit 3 — `feat: add event markers with distinct shapes`**
`IconLayer` (or `ScatterplotLayer` + shapes) for each event type; draw order as above.

**Commit 4 — `feat: add legend, tooltips and layer toggles`**
Legend, plain-language tooltips, per-type toggles; the match header shows counts ("1 human · 6 bots · 4 kills · 1 death").

## How to verify
1. Pick one of the busiest matches. Humans and bots are clearly different even in greyscale (check with a browser greyscale filter).
2. Pick one human file in that match; compare 3–4 of its events (type, time, position) with the raw parquet rows. Write down which match you checked — it goes in ARCHITECTURE.md as evidence.
3. Find a journey with a long gap: no line is drawn across it.
4. Hover a kill and a death: tooltips say who and where correctly.

## Out of scope
Animation over time (feature 5), aggregated views across matches (feature 6).
