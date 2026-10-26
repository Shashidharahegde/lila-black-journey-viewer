# From 1,243 parquet files to a map a level designer can read

*How the LILA BLACK Player Journey Viewer was built: the system design, the decisions, the problems we ran into, and how every quirk in the data was handled.*

Live tool: https://lila-black-journey-viewer.vercel.app/ · Short version: [ARCHITECTURE.md](../../ARCHITECTURE.md) · Reference version: [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) · Register of data issues: [EDGE_CASES.md](EDGE_CASES.md) · Assumptions and evidence: [docs/evidence/README.md](../evidence/README.md)

---

## Contents
1. [The brief](#1-the-brief)
2. [How the work was organised](#2-how-the-work-was-organised)
3. [First contact with the data](#3-first-contact-with-the-data)
4. [System design](#4-system-design)
5. [The four traps the brief warned about](#5-the-four-traps-the-brief-warned-about)
6. [The quieter edge cases](#6-the-quieter-edge-cases)
7. [Getting coordinates right, and proving it](#7-getting-coordinates-right-and-proving-it)
8. [Drawing what happened, and nothing more](#8-drawing-what-happened-and-nothing-more)
9. [Heatmaps: four redesigns](#9-heatmaps-four-redesigns)
10. [Problems we hit in the frontend](#10-problems-we-hit-in-the-frontend)
11. [Decisions we reversed](#11-decisions-we-reversed)
12. [How we know it works](#12-how-we-know-it-works)
13. [Every file, and what it does](#13-every-file-and-what-it-does)
14. [What's still uncertain](#14-whats-still-uncertain)
15. [Lessons](#15-lessons)

---

## 1. The brief

LILA's Level Design team has five days of production telemetry from LILA BLACK, an extraction shooter played on three maps (AmbroseValley, GrandRift and Lockdown), but no way to see it. The task was to build a browser tool that shows where players move, where fights happen, where people die to the storm and which areas are ignored. It had to be hosted and shareable.

The required features were journeys on the correct minimap, humans and bots told apart, distinct markers for kills, deaths, loot and storm deaths, filters for map, date and match, playback, and heatmaps. The brief also warned where people go wrong: *"The data has nuances (coordinate mapping, bytes encoding, bot detection, timestamps). Getting these right is part of the test."*

The audience shaped every choice. A level designer isn't a data scientist. They need a map they can trust at a glance, numbers with plain names, and nothing that looks like a finding when it's really noise.

## 2. How the work was organised

The tool was built with an AI coding assistant (Claude Code), which the brief explicitly allows. The useful part wasn't the code generation; it was the rules put around it, which live in the repo:

- **A spec per feature** (`docs/specs/01_…` to `docs/specs/08_…`), each with a goal, the problem in depth, a commit plan and a "How to verify" list. Features were built in order, one commit-sized step at a time, each reviewed before the next.
- **A Decisions table** (in the project's working notes, summarised in ARCHITECTURE.md). Any new design choice (a library, a data format, where logic lives) stopped work until it was decided between 2–3 written options. When a decision was later reversed, the table kept the old rule and the reason it changed.
- **An edge-case register** ([EDGE_CASES.md](EDGE_CASES.md)): one row per data issue with an ID (EC-01 to EC-30), the evidence, the handling and a status. Tests are named after the IDs (`test_ec09_…`), so a reviewer can go from a claim to the code that enforces it.
- **No invented numbers.** Every statistic in the docs or the UI comes from running code on the data. This rule caught mistakes several times, including one in this documentation pass: a status count written from memory turned out to be wrong when it was counted.
- **Raw data never enters git.** `data/raw/` is gitignored, and `make check-ids` scans everything trackable for real player IDs and key-like secrets.

## 3. First contact with the data

The zip holds 1,243 parquet files in five day folders, three minimap images and a README. Each file is one actor in one match, with eight columns: `user_id`, `match_id`, `map_id`, `x`, `y`, `z`, `ts`, `event`. There are eight event types:

| Event | Meaning (from the file owner's view) |
|---|---|
| `Position` | A human's position sample |
| `BotPosition` | A bot's position sample |
| `Loot` | Picked up an item |
| `BotKill` / `BotKilled` | Killed a bot / was killed by a bot (in a bot's own file: this bot killed / died) |
| `Kill` / `Killed` | Killed a player / was killed by a player |
| `KilledByStorm` | Died to the storm |

Before writing any feature, the data was audited. The README turned out to be wrong or incomplete in several places, and those findings became the first 30 rows of the register. After cleaning:

| | Count |
|---|---|
| Files found / read | 1,243 / 1,242 |
| Rows read → kept | 89,016 → 88,653 |
| Matches | 796 (AmbroseValley 566, Lockdown 171, GrandRift 59) |
| Journeys | 798 human, 444 bot |
| Matches by recorded humans | 794 with one, 2 with two |
| Match length | 13–887 s |
| Human events | 12,829 loot, 2,236 counted kills, 404 deaths, 39 storm deaths |

*Sources: [`build_report.json`](../evidence/build_report.json), `web/public/data/index.json`, the match files.*

One fact shaped everything after it: **743 of 796 matches contain only one recorded file.** This is not a full record of each match. It's mostly one player's view per match, plus the bots it ran into. Every label in the tool says "recorded" for that reason.

## 4. System design

### The shape

```
data/raw/  parquet + minimaps (gitignored)
   │
   ▼  pipeline/  — Python, run locally with `make data`
   ingest → normalize → journeys → project → heatmaps / zones / stats → export
   │
   ▼  web/public/data/*.json (3.9 MB) + web/public/maps/*.webp (1.3 MB), committed
   │
   ▼  web/  — React + TypeScript + deck.gl, filters and playback in the browser
   │
   ▼  Vercel — a static site
```

### Why there is no backend

The data is about 8 MB and fixed. Every question the tool asks of it is known in advance: this match's paths, this map's kills on this date. So every answer can be computed once, before deploy, and served as files. The alternatives were FastAPI + DuckDB as serverless functions, or an always-on server. Both add things that can fail on a reviewer's first visit (cold starts, a sleeping free-tier server, an expired key) and offer nothing in return while the data doesn't change. The decision is written down with its exit condition: revisit if the data becomes live or much larger.

### Why parquet is parsed in Python, not the browser

DuckDB-WASM could read the parquet files in the browser. But that means downloading and parsing 1,243 files on every visit. The Python pipeline does the work once and is reproducible: the same raw data gives byte-identical output, so a rebuild with no pipeline change leaves `git status` clean. That property turned out to be a useful test in itself.

### Why the coordinate conversion lives in one place

The pipeline converts world coordinates to map coordinates in one function (`projection.world_to_uv`). The site only ever sees the result. Paths, markers, playback dots and heatmap cells all come from the same numbers, so they can't disagree. This is the most important design decision in the project; section 7 explains it.

### Why deck.gl

deck.gl draws the minimap image, thousands of path segments, icon markers, an animated playback layer and a heatmap picture in one WebGL view, with zoom and pan. Leaflet is built for geographic tiles, and Streamlit would have made playback and URL state awkward.

### The data contract

The pipeline writes four kinds of file:

| File | Holds | Loaded |
|---|---|---|
| `index.json` | Maps (image, size, calibration), dates (with partial-day flags), one row per match (map, date, duration, humans, bots, event counts) | On start |
| `matches/<id>.json` (796 files) | Per actor: kind, flags, path segments as `[t, u, v]` triples, events as `{t, type, raw, u, v, flags}` | When a match opens |
| `heatmaps/<map>.json` | Sparse 64×64 grids per date and layer (traffic, kills, deaths), with sample sizes | On the Heatmaps page |
| `zones/<map>.json` | 16×16 region statistics and hotspots per date and layer | On the Heatmaps page |
| `stats.json` | Every statistic for 28 map × date slices | On the Overview |

No world coordinates and no raw player IDs leave the pipeline.

## 5. The four traps the brief warned about

### 5.1 Timestamps: the column lies about its unit

`ts` is typed `timestamp[ms]`. Read that way, the entire five-day dataset spans **6.6 minutes in January 1970**, and every match lasts under a second.

Read as **Unix seconds**, every event falls between 2026-02-09 23:58:55 and 2026-02-14 15:01:40 UTC, and matches last 13 s to about 15 minutes. That's the right length for an extraction shooter match, and the dates line up with the folder names. The integer is right; only its declared unit is wrong.

**Handling (EC-01):** cast `ts` to int64 and treat it as seconds. Match time is `t = epoch_s − earliest epoch_s in that match`, so every actor in a match shares one clock that starts at 0. Playback, the timeline and "11–15 minutes in" all use this clock.

Two smaller timing issues came with it:
- **EC-02:** three files have rows out of time order, so rows are sorted before any "first death" or path logic.
- **EC-03:** the 1 s resolution puts several events in the same second (loot bursts). The sort is stable on `(epoch_s, original row)`, so file order decides ties instead of chance.

### 5.2 Bytes encoding: an easy one to get silently wrong

The `event` column is binary: every row holds `b'Position'`, not `'Position'`. Compare it against a string and nothing matches. A pipeline that doesn't notice still runs, but every event lands in no category.

**Handling (EC-08):** decode as UTF-8 at ingest (`ingest._to_frame`), then map each decoded label to a category. Any label outside the eight known types **stops the build** rather than being dropped. A new event type in a future export can't vanish quietly. The parquet schema is checked per file too; a file with the wrong schema is listed as failed in the build report (none failed on this data).

### 5.3 Bot detection: the README's rule doesn't hold

The README says UUID IDs are humans and numeric IDs are bots. The data mostly agrees: all 444 files that log `BotPosition` have numeric IDs, and no file logs both `BotPosition` and `Position`.

But **17 files with numeric IDs never log `BotPosition`**. They come from 3 actors in 17 matches. They log `Position`, like the player client does, and 14 of them log `Loot`, which no `BotPosition` file ever does. 12 of them move faster than any bot moves: the fastest bot step in 444 bot files is 5.0 units/s. The evidence on the other side: one of those three actors is an ordinary `BotPosition` bot in 3 other matches. These could be test accounts, or a bot running on the player client.

This decision changed twice, which says something about how ambiguous it is:

1. **First rule: behaviour.** A file that logs `BotPosition` is a bot.
2. **Second rule (2026-10-22): "unknown".** Classify only where the two README rules agree; call the 17 `unknown`, show them on the map, but leave them out of human counts and heatmaps. The forensic evidence ([`actor_classification.md`](../evidence/event_forensics/actor_classification.md)) showed the cost was small: at most 1.63 % of any heatmap total.
3. **Final rule (2026-10-24): behaviour, flagged.** The 17 count as humans and carry an `id_mismatch` flag in the match files and the build report, so they can be found and excluded again. The reasoning: the events say player client, and an `unknown` class made the UI harder to read (three styles instead of two, and 16 matches with no human). The cost is stated openly: nothing proves a person played them.

**Handling (EC-09, EC-10):** `normalize.classify_actors`. Result: 798 human and 444 bot journeys, and every match has a human.

### 5.4 Coordinate mapping: right formula, wrong image size

The README's formula is correct:

```
u = (x − origin_x) / scale
v = (z − origin_z) / scale
pixel_x = u · width
pixel_y = (1 − v) · height
```

But it says the minimaps are 1024 px. They are **AmbroseValley 4320 × 4320, GrandRift 2160 × 2158, Lockdown 9000 × 9000**. Anyone who multiplies by 1024 puts every point in the top-left corner of the real image. GrandRift isn't even square. And `y` is elevation, which a top-down map ignores. Section 7 covers how this was handled and checked.

## 6. The quieter edge cases

These weren't named in the brief. Most only show up if you count things two different ways and get two different answers.

### Files and duplicates

**One file in two folders (EC-04).** One human journey of match `ac049b28` is byte-identical in `February_10/` and `February_11/`. It's read once (content hash), and the skip is listed in the build report.

**A match split across folders (EC-05).** That same match runs 23:51–23:57 UTC on 10 February, but its six bot files are only in `February_11/`. So nothing ever groups by folder; everything groups by `match_id`.

**Journeys logged twice in full (EC-29).** Three files have a second half that exactly repeats the first, on all 8 columns, in file order. Keeping both halves doubles those players' kills, loot and heatmap time. The first half is kept and the copy discarded: 190 rows.

**…but not every duplicate row is a duplicate (EC-06).** The obvious fix, "drop exact duplicate rows", would have been wrong. Outside the three doubled journeys there are 1,225 repeated rows (1,195 `Loot`, 30 `BotKill`), all within one second at one spot. Picking up several items in one second is plausible. The rule became: **no row is removed only because it looks identical to another.** Only the proven copies go, and a test checks that the legitimate same-second double loots inside the doubled journeys survive.

**Junk in the data folder (EC-07).** `.DS_Store`, the `minimaps/` folder and stray top-level files. Only files inside day folders are read, and anything unreadable is listed.

### Whose event is it?

**Every event carries the file owner's position (EC-11).** A `BotKill` in a human's file is recorded where the human stood, not where the bot fell. In a bot's own file, `BotKilled` means *this bot* died. So categories are defined from the owner's view: `kill` = the owner killed something, `death` = the owner died. On the map, a kill marker shows where the killer stood and a death marker where the victim fell.

**The three Kill/Killed pairs (EC-12).** `Kill` and `Killed` (player vs player) appear only 3 times each in the whole dataset, always as a pair: adjacent rows in one human's file, the same second, identical position, the journey ending 0–2 s later, and no other recorded file in the match. The first rule merged each pair into a "self-kill". That was a claim the data can't support: identical positions prove nothing, because every event carries the owner's position anyway. With 743 of 796 matches recording a single file, an unrecorded opponent can't be ruled out. The final rule keeps both rows with their original labels, flagged `kill_killed_pair`. The `Killed` counts as a death; the `Kill` is shown but left out of kill totals and the kill heatmap, because whether anyone else died is unknown. Tooltips say the cause is unknown ([evidence](../evidence/event_forensics/kill_killed_pairs.md)).

**No extraction event (EC-13).** An extraction shooter without an "extracted" event: 355 of 798 human journeys end without a recorded death. They might have extracted, disconnected, or just stopped being recorded. Nothing in the tool is drawn as an extraction. A journey ends at its "last recorded position", and any future extraction layer must be labelled *inferred*.

### Life after death

**Positions after dying (EC-14).** 172 journeys log positions 1–6 s after their first death, almost always at the death spot. In playback, that looks like a dead player twitching. Those 173 positions are dropped from paths, playback and traffic. But two `BotKill`s also come after a death. A late kill might be a logging delay rather than a false event, so they're kept and flagged `after_death` instead of deleted. Rows in the same second as the death stay, because 1 s resolution can't order them.

### Gaps and samples

**Position gaps (EC-16).** Positions arrive about every 5 seconds, but 311 gaps are longer than 30 s, the longest 518 s. Drawing a straight line across an 8-minute gap invents a route. Paths break at gaps over 30 s; playback hides the actor in a gap rather than sliding them across it.

**A player crosses about one heatmap cell per sample (EC-28).** The median step between samples is 13 world units; a 64×64 cell is 9–16 units wide depending on the map. Counting traffic only at the sample points leaves holes in every corridor. So each step's time is spread along its straight line across every cell it crosses (D5). It's an approximation (the real route between samples is unknown), but a better one.

### Dates

**Folders aren't UTC days (EC-23, EC-24).** 4 matches start before their folder's day, and 3 cross UTC midnight. Match `e325a53a` starts at 2026-02-09 23:58:55, one continuous journey, so "9 February" is a real date with one match. A match is dated by the UTC date of its first event. The date list is generated from the data, never hardcoded, and the first and last days are flagged partial, with the observed window shown.

### Samples and privacy

**Small samples (EC-25, EC-26).** GrandRift has 59 matches. Every heatmap and statistic carries its sample size, and a selection with fewer than 10 contributing matches gets a "Few matches" badge.

**Real account IDs (EC-27, EC-30).** `user_id` holds real account IDs. Every output uses an 8-character `sha1` pseudonym, and tests scan every generated file for raw IDs. The hashes are unsalted, so the 94 four-digit numeric IDs could be recovered by trying each one; that was accepted as out of scope for this assignment and written down.

## 7. Getting coordinates right, and proving it

### The approach

1. **Store UV (0–1), not pixels.** UV doesn't depend on image size. The web images are WebP at `min(original, 4096)` px (4096², 2160×2158, 4096²), and alignment survives the resize because nothing was ever stored in pixels.
2. **Flip v.** Image rows count downward from the top; world z grows upward. Without `1 − v`, every path is mirrored top-to-bottom.
3. **Use width and height separately.** Treating GrandRift's 2160×2158 image as square would put its south edge 2 px off.
4. **One drawing space in the browser.** deck.gl draws the image *and* every data layer at `X = u·1000`, `Y = (1 − v)·1000·H/W`. Image and data share one coordinate system, so zooming and panning can't separate them, and playback interpolates between points already in that space.
5. **Never clamp.** Out-of-range values are returned unchanged so they can be counted. All 72,996 recorded positions turned out to fall inside their map's square.

### The worked example

The README's sample row is AmbroseValley (scale 900, origin −370 / −473), x = −301.45, z = −355.55. Through the production functions:

```
u = (−301.45 + 370) / 900 = 0.07617
v = (−355.55 + 473) / 900 = 0.1305

at 1024 px:            (78.0, 890.4)    ← the README says (78, 890)
on the 4320 px image:  (329.0, 3756.2)
on the 4096 px WebP:   (312.0, 3561.5)
without the flip, y on the WebP would be 534.5 — the mirror image
```

### The problem: how do you prove a map is aligned?

There are no landmarks with known world coordinates, so there's no answer key. The first idea was a pixel-colour test: correctly mapped positions should rarely sit on the black area around the map. On GrandRift that fails as a test, because its roads and some building art are near-black. With the *correct* mapping, 4.0 % of GrandRift positions sit on near-black pixels; without the flip it's 12.1 %. A threshold would be arbitrary, so the decision (D4) was: **maths tests are the pass/fail check, pictures are evidence for a human to review, and no pixel-colour threshold.**

The checks, in order of strength:

| Check | What it showed |
|---|---|
| **Maths tests** on the production functions (`test_projection.py`): the README example, the four world corners → the four image corners, the centre → the centre (GrandRift: 1080, 1079), +x goes right, +z goes up, nothing clamped | All pass |
| **Browser drawing space** tested against values from the Python projection (`space.test.ts`) | All pass |
| **Overlays with a deliberately wrong control** ([`grandrift_validation.md`](../evidence/coordinates/grandrift_validation.md)): 10 varied GrandRift journeys (1,046 positions) drawn with and without the flip | With the flip, every start and end sits on the island and clusters sit on named places: Labour Quarters, Mine Pit, Engineer's Quarters, the Burnt Zone. Without it, starts land in the black area beyond the map edge |
| **Round trip on real data** ([`reverse_mapping_validation.md`](../evidence/coordinates/reverse_mapping_validation.md)): every exported path point sent back through the *browser's* code to world coordinates and compared with the parquet x/z | Max error 0.04–0.07 world units per map, exactly the 4-decimal rounding in the JSON |
| **Independent audit** ([`FORENSIC_AUDIT_REPORT.md`](../audits/forensic/FORENSIC_AUDIT_REPORT.md)): samples projected onto image content and compared against wrong flips, shifts and scales | 99.7–100 % land on map content; every wrong flip scores 2.6–24 points lower |

The honest conclusion: the mapping is consistent everywhere it can be tested and trusted to about ±10 world units, but it isn't proven against ground truth, because none exists.

## 8. Drawing what happened, and nothing more

**Humans vs bots.** Humans are solid blue (`#2589F5`), wider, with a dark casing, drawn on top, with start and end markers and direction arrows. Bots are dashed amber (`#E99124`). An early version made bots faint, but bots matter to a level designer too (where do they push players?), so the rule became "both clearly visible, humans get priority". Shape (solid vs dashed) carries the difference as well as colour, so it survives colour-vision deficiency and greyscale.

**Markers.** One icon per category on a badge: kill, death, storm death, loot, and bot kills and deaths in amber. Where markers overlap, kills, deaths and storm deaths win over loot (deck.gl's `CollisionFilterExtension`); zooming in reveals the rest. Clustering would have needed a new library and hidden event types behind a number.

**Playback.** Everything runs from one match clock `t` in the store. Each frame, every path is cut at `t`, so the route so far stays on screen. Each actor's dot is interpolated between two samples of one path segment, and hidden in a gap or after its last sample. Events appear at their time. The spec first called for deck.gl's `TripsLayer` with a 30 s fading trail. Cutting the paths on the CPU instead kept the exact same styling as the static view (casing, dashes, arrows), so the two can't disagree, and it's testable without a GPU. At no more than 16 actors per match, it's cheap. Speeds run 0.5×–8×; 4× is the default after the first version felt too slow.

**Shareable views.** Page, map, date, match, playback time and heatmap layer are all in the URL. User changes push a history entry, so Back works. Playback time is written with a replace once it settles, so Back doesn't step through every frame.

## 9. Heatmaps: four redesigns

Heatmaps went through more iterations than any other feature. Each change was driven by something specific that was wrong.

**Redesign 1: traffic along the route, not at the samples.** Covered in EC-28 above. Sample-only counting left gaps in every corridor.

**Redesign 2: from a mosaic to a picture.** The first heatmap drew each 64×64 cell as a solid square. It read as a mosaic, hid the minimap underneath, and made hotspots hard to see. Now each non-zero cell is painted as a small soft bump (Gaussian, σ = 1 cell, cut off at 2.4σ), whose colour and opacity come from that cell's own value; overlapping bumps keep the stronger value instead of adding up. Smoothing is display-only. Neighbours are never summed, so no peak is invented, and hovering reads the grid, not pixels.

**Redesign 3: counts you can read.** Kills and deaths first used a continuous colour ramp scaled to each map's maximum. Measured, neighbouring counts were only 0.7–8 ΔE apart (0 ΔE for GrandRift deaths): the eye couldn't tell 2 kills from 3. They now use fixed count classes (1 / 2–3 / 4–9 / 10+) that step in lightness and opacity as well as hue. A colour means the same count on every map and date, and the classes stay at least 18.9 ΔE apart for kills and 7.0 ΔE for deaths under colour-vision deficiency. Traffic stays continuous on a log scale, because it's estimated time, not a count.

**Redesign 4: what counts as a hotspot.** This was the hardest one.
- *Single cells don't work.* A 64×64 kill cell usually holds one event. Split AmbroseValley's matches in half at random and compare the top kill cells of each half: they overlap **0.0** at 64×64 and **0.8** at 16×16 ([spatial report](../evidence/spatial_analysis/REPORT.md)). So hotspots are 16×16 regions (4×4 cells).
- *The first rule was statistically careful and hard to explain:* top decile of regions, stable in at least 80 % of 300 match-resamples, at least 3 players, and surviving three half-region grid shifts. An audit then reran it with 100 seeds and 5,000 resamples and found it borderline seed-dependent: whether a region "counted" could depend on the random seed.
- *The final rule is simple:* a hotspot is a region with events from **at least 5 different matches**, where **no single match supplies over 50 %** of its value; at most **6** per layer, strongest first. One match can't make a hotspot, and a designer can check the rule by hand. When nothing qualifies, the panel says so instead of inventing an answer.

There was a smaller problem too. With "Focused" traffic (hide cells under 30 player-seconds), 84 % of GrandRift's cells disappear, so a single GrandRift day looks nearly empty. The "All activity" view shows every observed cell for exactly that case.

## 10. Problems we hit in the frontend

**Users got lost in the black margin.** Free pan and zoom let people drag the map off screen. Zoom-out now stops at the whole map and panning stops at its edge. The default view fits the part of each image that has content (GrandRift's island fills only about 60 % of its image).

**The zoom buttons stopped working.** deck.gl transition fields stored in the view state broke the +/− buttons. Only `target` and `zoom` are stored now. Smooth camera moves (when a match is picked or a hotspot clicked) are run frame by frame in `MapView` over 700 ms, stop on any user move, and are instant with reduced motion.

**The map jittered when switching pages.** Opening the side panel or the playback dock resized the map, and the camera refit. The map frame now never changes size: the panel and dock are drawn over it, and the camera always reserves their space. Measured afterwards, 0.00 % of map pixels change across page switches and panel toggles.

**"Match" meant three different things.** On AmbroseValley there are 566 matches, 566 with a human, and 568 human journeys, and different pages called different ones "matches". The Heatmaps page showed "kills per match" as kills ÷ matches to 1 decimal, while the stats pages showed kills ÷ journeys to 2 decimals: the same label, two different numbers. One vocabulary now lives in `web/src/stats/terms.ts` (*match*, *human journey*, *players observed*, *recorded span*, *recorded death*, *estimated player time*). Every rate names its denominator, and a cross-page test checks that pages agree.

**Three levels of navigation were too many.** Overview / Explore / Chat, then a map row, then Heatmaps / Journeys tabs. It's now two rows on every page: Overview · Journeys · Heatmaps, then the map toggle and date filter. The address matches what's on screen (`/heatmaps`, `/journeys`), and old links are forwarded.

**A chatbot was built, then removed.** An AI chat over the statistics was built as a serverless function, then judged out of scope and removed. A feature that needs an API key and can fail at runtime works against the "nothing to fail on a reviewer's first visit" principle.

**Testing WebGL without a screen.** The browser extension wasn't available for verification, so checks ran in headless Chrome with software WebGL. A 4096 px texture takes 5–9 s to appear that way, and quick screenshots come out blank. That's a capture artefact, not a bug, but it took time to learn.

## 11. Decisions we reversed

Reversals were recorded rather than overwritten. These are the main ones:

| Area | First rule | Final rule | What changed our minds |
|---|---|---|---|
| Ambiguous actors | Behaviour → then `unknown` unless both rules agree | Behaviour, 17 flagged `id_mismatch` | `unknown` made the UI harder to read for ≤ 1.63 % of any total; the flag keeps it reversible |
| Kill/Killed pairs | Merged into a `self_kill` | Both rows kept, cause unknown | The rows can't distinguish a self-kill from a trade with an unrecorded player |
| Heatmap drawing | Solid 64×64 cells | Soft bumps from the cell values | The mosaic hid the minimap |
| Kill/death colours | Continuous ramp per map | Fixed count classes | Neighbouring counts were indistinguishable (0.7–8 ΔE) |
| Hotspots | Resampling stability + grid shifts | ≥ 5 matches, ≤ 50 % from one, top 6 | Seed-sensitive and hard to explain |
| Playback | `TripsLayer`, 30 s trail, 1×/4×/16× | Paths cut at `t`, full history, 0.5×–8× | Same styling as the static view; felt too slow at first |
| Landing page | The Heatmaps tab | The all-maps Overview | Patterns before individual journeys |
| Navigation | Three levels with tabs | Two rows, pages with their own paths | Too many levels; the address should match the nav |
| Chat | One serverless function | Removed | Out of scope |

## 12. How we know it works

| Check | Result (2026-10-24) |
|---|---|
| Pipeline tests (`make test`) | 130 passed |
| Web tests (`npx vitest run` in `web/`) | 476 passed in 28 files |
| Rebuild | Byte-identical output from the same raw data |
| Independent forensic audit | Separate code reproduced all 796 index rows, every match file, every kill and death grid cell, and all 7,792 values in `stats.json`. It ran before the final actor and hotspot rules, so its counts use the earlier `unknown` class |
| UI/UX audit (`docs/audits/uiux/`) | 26 issues, each with screenshots; fixes tracked one by one |
| Live site vs repo | The deployed data files are byte-identical to the repo, and a local build of the latest commit produces the same app bundle the site serves |

Tests check behaviour, not just that code runs. For example: no path point after a death, the three doubled journeys lose exactly 190 rows, the legitimate double loot survives, heatmap death totals equal human deaths, no raw player ID appears in any output, and the circle around a hotspot contains its region and stays inside the map.

## 13. Every file, and what it does

### Root
| File | Purpose |
|---|---|
| `README.md` | Tech stack, setup, deploy settings, environment variables (none) |
| `ARCHITECTURE.md` | The one-page architecture doc |
| `INSIGHTS.md` | Three verified things the data shows about the maps |
| `CLAUDE.md` | Rules and decisions for the coding agent |
| `Makefile` | `setup`, `data`, `test`, `web`, `check-ids`, `requirements` |

### `pipeline/` — Python, raw data → website files
| File | Purpose |
|---|---|
| `src/lila_pipeline/ingest.py` | Find day-folder files, check the schema, decode `event` bytes, skip identical files (EC-04, EC-07, EC-08) |
| `src/lila_pipeline/normalize.py` | Seconds clock and match time, stable sort, remove doubled journeys, classify actors (EC-01–03, EC-09, EC-29) |
| `src/lila_pipeline/journeys.py` | Event categories from the owner's view, Kill/Killed pairs, death cutoff, path splitting (EC-11, EC-12, EC-14, EC-16) |
| `src/lila_pipeline/projection.py` | World (x, z) → UV and UV → pixels: the only coordinate conversion (EC-17–22) |
| `src/lila_pipeline/heatmaps.py` | 64×64 traffic (traced along steps), kill and death grids (EC-28) |
| `src/lila_pipeline/zones.py` | 16×16 regions and the hotspot rules |
| `src/lila_pipeline/stats.py` | Every statistic for 28 map × date slices, and the map score |
| `src/lila_pipeline/images.py` | Minimaps → WebP, never upscaled |
| `src/lila_pipeline/export.py` | Writes `index.json`, match files, heatmaps, zones |
| `src/lila_pipeline/build.py` | Runs everything; writes `docs/evidence/build_report.json` |
| `tests/` | 130 tests, named after edge-case IDs where they enforce one |
| `tools/` | Evidence scripts: `event_forensics.py` (actors, pairs), `spatial_analysis.py` and `zone_sensitivity.py` (hotspots), `count_bands.py` (colour distances), `insight_stats.py` (numbers for INSIGHTS.md), `check_ids.py` (privacy scan) |
| `validate_map_alignment.py`, `validate_reverse_mapping.py` | The coordinate checks in section 7 |
| `pyproject.toml`, `uv.lock`, `requirements.txt` | Dependencies; `requirements.txt` is generated from the lockfile |

### `web/` — React app
| Folder | Purpose |
|---|---|
| `src/data/` | Loading and typing the generated files |
| `src/map/` | `space.ts` (UV → drawing space), `MapView.tsx` (the deck.gl canvas and camera), `journeys.ts` and `journeyLayers.ts` (paths and markers), `playback.ts` (cutting paths at `t`), `zoom.ts`, `encoding.ts` (colours, widths, icons) |
| `src/heatmap/` | `raster.ts` (painting cells as soft bumps), `scale.ts` (colour and opacity curves, count classes), `zones.ts` (hotspot outlines), `evidence.ts` (summary figures), `reconcile.test.ts` (grid totals match the source) |
| `src/state/` | The Zustand store, URL parsing and sync, the playback clock, data hooks |
| `src/stats/` | Overview and map report figures, `terms.ts` (one vocabulary), `crosspage.test.ts` |
| `src/ui/` | Pages and components: navigation, match list, playback dock, heatmap panel, hotspot details, legends, tooltips, About |
| `src/components/` | Shared pieces, and shadcn/ui components themed with the design tokens |
| `public/data/`, `public/maps/` | The generated files (committed) |
| `vercel.json` | Every path except `/assets/`, `/data/`, `/maps/` goes to `index.html`, so deep links work; cache headers |

### `docs/`
Indexed in [`docs/README.md`](../README.md).

| Folder | Purpose |
|---|---|
| `reports/` | This article, `TECHNICAL_REPORT.md` (the reference version: every edge case, every check) and `EDGE_CASES.md` (the register: EC-01 to EC-30, with evidence, handling, status and test names) |
| `specs/` | `01_…` to `08_…`, one spec per feature in build order; `09_CHATBOT.md` (the removed chat, history) and `10_DASHBOARD.md` (the Overview statistics); `FRONTEND_GUIDELINES.md` (how the UI looks and behaves; wins over the specs); `COMMIT_CONVENTION.md` |
| `source/` | The assignment brief and the data README as LILA supplied them |
| `audits/` | The UI/UX audit (with screenshots) and the independent forensic data audit with its scripts |
| `evidence/` | Assumptions and their evidence (its README), build report, coordinate validation, event forensics, spatial analysis, frontend verification, screenshots of earlier UI versions |
| `archive/` | Superseded working notes, kept for history |

## 14. What's still uncertain

- **Coverage.** Most matches record one player. The tool shows what was recorded, not everyone who was there. An empty heatmap cell means "no recorded human activity", not "nobody went there".
- **Traffic is an estimate.** The audit found movement is logged on a 5 s tick only while the actor moves (99.9 % of gaps are within ±1 s of a multiple of 5), so a long gap is probably a player standing still rather than walking. Under other ways of allocating that time, hotspot values move by 1–16 %, though the strongest traffic region on each map stays the same.
- **Extraction is unknown.** No event marks it.
- **Coordinates are consistent, not ground-truthed:** trusted to about ±10 world units.
- **The 17 flagged journeys** are counted as human on the evidence of their events, not on proof.

## 15. Lessons

1. **Audit before building.** Every one of the brief's four traps, and most of the quieter ones, showed up in the first audit, before any UI existed. Fixing a unit or a classification rule later means regenerating everything.
2. **Count things two ways.** Most edge cases surfaced as a disagreement: folder dates vs event dates, row counts vs journey counts, kills per match vs kills per journey.
3. **Don't delete what you can't disprove.** Same-second loot, late kills and the Kill/Killed pairs were all kept and flagged instead of removed. Every removal in the pipeline is a proven copy or a provably impossible row, and it's counted in the build report.
4. **Write down the reversal, not just the decision.** Several rules changed, and the record of *why* is what lets a reviewer trust the final one.
5. **One function for the hard part.** Putting the coordinate conversion in exactly one tested place meant paths, markers, playback and heatmaps could never drift apart, and every check in section 7 only had to test one thing.
