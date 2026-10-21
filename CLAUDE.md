# CLAUDE.md — LILA BLACK Player Journey Visualization Tool

You are helping S (the owner of this repo) build a take-home assignment for LILA Games.
S reviews and pushes every change himself. Read this whole file before doing anything.

---

## 0. Hard rules (never break these)

1. **Never run `git commit`, `git push`, `git merge`, `git rebase`, `git reset --hard` or `gh pr create`.**
   You may run read-only git commands (`git status`, `git diff`, `git log`). S stages, commits and pushes.
2. **Work in chunks** (Section 6). Do one chunk, then STOP and hand over (Section 7). Never start the next chunk without S saying so.
3. **Never invent data facts.** Every number in docs, UI copy or chat answers must come from code run against the data. If you state a number, say which script produced it.
4. **Never fabricate insights.** INSIGHTS.md is written by S after using the tool. You may produce a stats report that supports his insights; you do not write the insights.
5. **Raw data stays out of git.** `data/raw/` is gitignored. Never commit parquet files or original minimaps.
6. **Core before extras.** The project has two tracks (Section 6). Extras (E1, E2) start only after the core track reaches the **submission-ready checkpoint**: deployed, documented and pushed. Never let extras work break or delay a core feature.
   During core chunks, build only the **extension hooks** in Section 3.1, never extras features themselves.
7. Keep the one-page limit for ARCHITECTURE.md. Prefer tables over paragraphs.
8. Follow `COMMIT_CONVENTION.md` when proposing commit messages.
9. **Build incrementally: one feature, one step at a time.**
   - Create only the files the *current step* needs. The layout in Section 4 is the **target**, not a to-do list: never create empty placeholder files, empty folders or stub modules for later chunks.
   - Before writing anything in a step, list the exact files you will create or change, and wait for S to say go.
   - After each step, stop. Do not continue to the next step, the next chunk, or "while I'm here" extras.
   - If a step seems to need something from a later chunk, say so and ask; don't build it early.

---

## 1. The assignment (what is graded)

Build and deploy a browser tool that lets a **Level Designer** (not a data scientist) explore player behaviour on LILA BLACK's three maps.

Core requirements (all must work in the deployed build):
- Load and parse the provided parquet data
- Player journeys on the correct minimap, with world coordinates mapped correctly
- Humans and bots visually distinct
- Kills, deaths, loot, storm deaths as distinct markers
- Filter by map, date and match
- Timeline / playback of a match
- Heatmaps: kill zones, death zones, high-traffic areas
- Hosted at a shareable URL, usable without help

Rubric: system design · attention to detail (coordinates, bytes, bots, timestamps, edge cases) · end-to-end execution · product thinking · code quality · communication (architecture doc, trade-offs).
Guiding principle: **deeper, not bigger.** A few features done correctly and explained beat many half-done ones.

Deliverables: repo · deployed URL · README.md · ARCHITECTURE.md (one page) · INSIGHTS.md (three insights, written by S).

---

## 2. Data facts already established (audit of 2026-10-20)

The README that ships with the data is wrong in several places. These findings come from a full audit of all 1,243 files.
**Encode each one as an executable contract test** (Section 5) — do not just trust this list.

| ID | Topic | Finding | Handling |
|---|---|---|---|
| A-01 | Clock | `ts` is stored as `timestamp[ms]` but the integer is **Unix epoch seconds**. Read as seconds, events fall on their folder dates (2026-02-09 23:58 → 02-14 15:01 UTC) and journeys last 13–890 s. Read as ms, matches last < 1 s. Resolution = 1 s. | `epoch_s = ts.astype(int64)`; match time `t = epoch_s − min(epoch_s in match)`. |
| A-02 | Minimap size | README says 1024×1024. Actual: AmbroseValley 4320×4320 PNG, GrandRift **2160×2158** PNG, Lockdown 9000×9000 JPG (11.8 MB). | Project to UV (0–1); UV is image-relative so any resize is safe. Export WebP ≈ 4096 px for the web. Never hardcode 1024. |
| A-03 | Coordinates | README formula is correct: `u=(x−ox)/scale`, `v=(z−oz)/scale`, `px=u·W`, `py=(1−v)·H`. `y` is elevation — ignore for 2D. Worked example (−301.45, −355.55) → (78, 890) at 1024 px, (329, 3756) at 4320 px. 0 out-of-bounds points. | Single projection function in the pipeline; frontend receives map-space coordinates only. |
| A-04 | Calibration evidence | Share of positions on transparent/void pixels: AmbroseValley 0.46 %, GrandRift 0 % transparent (4.8 % on opaque black art inside the map — verify visually), Lockdown 0.08 % (+0.2 % water). With the Y-flip removed (a likely bug) the rate jumps to 7–12 %; random points 41–51 %. | Automated on-map test **with the no-flip version as a negative control that must fail**. |
| A-05 | Bot detection | README: numeric `user_id` = bot. But 17 numeric-ID files (IDs 1379, 1402, 1429) emit human events (`Position`, `Loot`) and never `BotPosition`. Each is the only human-behaving actor in one of the 16 otherwise bot-only matches. | Classify by **behaviour** (`BotPosition` present → bot; human event vocabulary → human). Keep `id_says_bot` and flag mismatches (likely internal/test accounts). Result: 794 matches have exactly 1 human, 2 have 2. |
| A-06 | Combat labels | Both humans and bots emit `BotKill`/`BotKilled`. An event's x/z is the **file owner's** position. | Kill marker = where the killer stood; death marker = where the victim fell. Keep raw labels plus a designer-facing meaning. |
| A-07 | PvP | Only 3 `Kill` + 3 `Killed`; each pair is in the **same file, same second, same spot**, in single-human matches. Not PvP. | Show as "self-inflicted / unattributed death". No PvP heatmap; state why. |
| A-08 | Coverage | 743/796 matches contain one file. Only 53 matches have bot files (5–16 files each). 566 AmbroseValley, 171 Lockdown, 59 GrandRift matches. | Aggregate views are the default; single-match playback is the drill-down. Match picker shows recorded-actor count and sorts richest first. |
| A-09 | Sampling | Positions every 5 s (mode); gaps up to 518 s. | Break paths when the gap is > 30 s; interpolate only for playback; show sample dots. |
| A-10 | Post-death rows | 174 human journeys have exactly one `Position` 1–3 s after death at the same spot. | Treat the journey as ending at death; keep the row, flag it. |
| A-11 | Duplicates | One human file exists in both `February_10/` and `February_11/` (match spans midnight). ~1,400 other exact-duplicate rows, mostly `Loot` (several items picked up in the same second). | Ingest identical files once. Keep same-second Loot rows (legitimate). Tie-break ordering by `(epoch_s, source row index)`. |
| A-12 | Extraction | No extraction event exists. 339 human journeys end without death; on AmbroseValley 68 % of them end in 6 of 400 grid cells. | "Likely extraction points" layer, always labelled **inferred**. |
| A-13 | Storm | All 39 storm deaths occur 655–887 s into the match. | Storm-death markers coloured by match time. |
| A-14 | Date | Folders match UTC days; one match crosses midnight. | Date filter = UTC date of match start; keep folder date as metadata. |
| A-15 | Stats | 339 unique users (245 UUID + 94 numeric), 796 matches, 89,104 rows, 8 event types, `event` always bytes. | Contract test reproduces these. |

Status vocabulary for the register: **Verified** (tested against the data) · **Inferred** (evidence-backed, labelled in the UI) · **Unknown** (cannot be determined; stated, not guessed).

---

## 3. Architecture decisions (agreed)

- **Build-time pipeline, static frontend.** The data is 8 MB and fixed, so all querying and aggregation runs in Python at build time and outputs static files. No always-on backend (avoids cold starts and a second thing to host). The logical layers (ingest → normalise → canonical model → query/aggregate → UI) stay separate modules.
- **Extras add to the system; they never change the core.** The chatbot (extra E2) will be one serverless function (`/api/chat`) so the API key never reaches the browser, reading analytics files produced by a new pipeline stage (extra E1). The map must work fully if chat is down or absent.
- **One projection.** The pipeline outputs map-space coordinates; the minimap image is drawn in the same coordinate space, so there's no second transform that could drift on zoom/pan.
- **Generated data is committed** (`web/public/data/`), so Vercel builds the frontend only. The pipeline is reproducible locally from the raw zip.

### 3.1 Extension hooks (build these during the core, so extras plug in later without rework)

| Hook | Built in chunk | Why the extras need it |
|---|---|---|
| **Canonical events table** written to `pipeline/out/events.parquet` (one row per event: match, actor, actor_kind, map, epoch_s, t, event, raw_event, x, z, u, v, flags) | 02 | E1 computes backtraces and sequences from this one table instead of re-reading raw files. |
| **Pipeline stages as separate functions** in `build.py` (`ingest → normalize → project → aggregate → [analytics] → report`), each taking and returning dataframes | 02 | E1 adds one stage without touching the others. |
| **Pure query functions** in `aggregate.py` (e.g. `density(events, map, event, phase)`), not inline notebook-style code | 04 | The same functions can later back chat tools and their tests. |
| **Versioned data contract**: every generated JSON has `schema_version` and `generated_at`; shapes documented in `web/src/lib/dataContract.ts` | 04 | Chat tools and the UI read the same files and can't silently disagree. |
| **Grid zone IDs** (e.g. `C4` on an 8×8 grid per map) attached to every event | 04 | Backtracing and sequences need discrete zones; designers need names they can say aloud. |
| **`docs/corpus/`** folder holding README, DATA_QUALITY, metric definitions | 08 | E2's retrieval indexes this folder; no code change needed when documents are added. |
| **`api/` reserved** in `vercel.json`; the UI layout has a collapsible side-panel slot (empty in the core) | 07 | E2 adds `api/chat.ts` and a panel component only. |
| **URL state** for every view | 05 | Chat answers can link to the exact map view as evidence. |

### Stack
| Layer | Choice |
|---|---|
| Pipeline | Python 3.11+, `uv`, DuckDB and/or pandas, pyarrow, numpy, scipy, Pillow |
| Tests | pytest (pipeline), Vitest (frontend logic only, if useful) |
| Frontend | Vite + React + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`, utility classes for all UI styling; no CSS-in-JS, no `tailwind.config.js`), deck.gl (`OrthographicView`, `BitmapLayer`, `PathLayer`, `TripsLayer`, `ScatterplotLayer`/`IconLayer`), Zustand, state mirrored to the URL |
| Hosting | Vercel |
| *Extras only:* analytics | Same Python pipeline (pandas/numpy); no new heavy dependencies |
| *Extras only:* chat | Vercel serverless function (TypeScript), Anthropic SDK with tool use, model from env var `ANTHROPIC_MODEL`; BM25 retrieval (e.g. MiniSearch) over an index built at build time |

Colour: Okabe–Ito for categorical markers, viridis/magma for heatmaps. Event types differ by **shape and colour** (colour-blind safe). Humans = solid coloured paths; bots = thin grey dashed, hideable.

---

## 4. Repository layout (the TARGET, not a to-do list — see hard rule 9)

Files appear only when the chunk that needs them is being built.

```
.
├── CLAUDE.md
├── COMMIT_CONVENTION.md
├── README.md
├── ARCHITECTURE.md
├── INSIGHTS.md                  # written by S
├── DATA_QUALITY.md              # generated by the pipeline
├── Makefile                     # make data | make test | make web | make all
├── pipeline/
│   ├── pyproject.toml
│   ├── src/lila_pipeline/
│   │   ├── config.py            # map calibration table, paths, thresholds
│   │   ├── ingest.py            # read + decode + file dedupe
│   │   ├── normalize.py         # clock, ordering, actor classification, flags
│   │   ├── projection.py        # world → UV → map space (the ONLY place this happens)
│   │   ├── aggregate.py         # match index, tracks, density grids, zone IDs
│   │   ├── analytics.py         # EXTRA E1: action abstraction, backtraces, sequences, group comparison
│   │   ├── images.py            # minimap → WebP
│   │   ├── report.py            # DATA_QUALITY.md + assumptions register
│   │   └── build.py             # CLI entry point
│   └── tests/
│       ├── test_contracts.py    # one test per assumption ID
│       ├── test_projection.py   # README example + on-map test + negative control
│       └── test_aggregate.py
├── web/
│   ├── public/data/             # generated JSON (committed)
│   ├── public/data/analytics/   # EXTRA E1 output (committed)
│   ├── public/maps/             # generated WebP (committed)
│   └── src/ (components/, layers/, state/, lib/)
├── docs/
│   ├── calibration/             # overlay evidence images
│   └── corpus/                  # documents the chatbot retrieves from
├── ROADMAP.md                   # chunk 08
├── api/chat.ts                  # EXTRA E2
├── evals/                       # EXTRA E2: chat eval questions + runner
└── data/raw/                    # gitignored: player_data.zip unpacked here
```

---

## 5. Engineering standards

- **Executable assumptions register:** every row in Section 2 becomes a test in `test_contracts.py` named after its ID (e.g. `test_A01_ts_is_epoch_seconds`). If the data changes and an assumption breaks, `make test` fails and names it.
- **The register is generated:** `report.py` writes `DATA_QUALITY.md` with the ID, finding, evidence (computed numbers), handling and status. ARCHITECTURE.md links to it instead of repeating it.
- **No silent failure:** never `except: continue`. Count and report any skipped file or row.
- **Traffic heatmap** = occupancy weighted by time between samples, capped at the gap threshold, then log-scaled. Never raw row counts.
- **Danger ratio** = deaths ÷ traffic per cell, hidden below a minimum sample size, always shown alongside counts.
- **Every view states its sample size**, e.g. "142 matches · 318 deaths".
- Readable code: small modules, typed functions, docstrings explaining *why*. No dead code, no commented-out blocks.
- Keep web data small: per-match files loaded on demand; the index plus heatmap grids load upfront.

---

## 6. Chunks (one reviewable push each)

Each chunk ends with S reviewing and pushing. Suggested branch per chunk: `chunk/NN-short-name` (core) or `extra/EN-short-name` (extras).

### Track 1 — CORE (graded requirements; priority 1)

| # | Chunk | Done when |
|---|---|---|
| 01 | **Scaffold, in four separate steps (one commit each, S approves between steps):** **01a** `.gitignore` + README skeleton · **01b** Python pipeline package: `pyproject.toml` and one passing smoke test only · **01c** Vite + React + TypeScript app shell in `web/` · **01d** Makefile with `test` and `web` targets only | After each step the thing it adds runs; no files exist for later chunks |
| 02 | **Ingest + normalise + contract tests** (A-01, A-05–A-11, A-14, A-15); canonical events table; staged pipeline (hooks) | All contract tests pass; skipped-file count reported; `events.parquet` written |
| 03 | **Projection + calibration tests + WebP minimaps** (A-02–A-04) | README example test, on-map test and negative control pass; overlay PNGs saved to `docs/calibration/` |
| 04 | **Aggregates + DATA_QUALITY.md**: match index, per-match tracks, density grids (traffic, kills, deaths, storm, danger, unvisited, inferred extraction) by map × date × match phase; zone IDs; versioned data contract (hooks) | Generated files committed; DATA_QUALITY.md generated |
| 05 | **Map viewer**: deck.gl map, map/date/match filters, URL state, legend, sample sizes, hover shows world coordinates | Every map renders with the correct image; filters work; a URL reproduces the view |
| 06 | **Journeys + markers**: human/bot styles, event shapes, path breaks at gaps | Spot-check one match against its raw rows (document it) |
| 07 | **Playback + heatmaps + deploy**: timeline scrubber, 1×/4×/16×, event ticks, fading trails; heatmap toggles; Vercel config with `api/` reserved; empty side-panel slot (hooks) | Deployed URL works in a private window; README has the URL |
| 08 | **Docs**: ARCHITECTURE.md (one page), README final, ROADMAP.md, `docs/corpus/`, `scripts/insight_stats.py` producing numbers S can cite | S writes INSIGHTS.md from the tool and stats report |

**✅ SUBMISSION-READY CHECKPOINT** — after chunk 08 the repo is a complete submission on its own. S may submit here. Extras are added only after this point.

### Track 2 — EXTRAS (not graded requirements; only after the checkpoint)

| # | Extra | Done when |
|---|---|---|
| E1 | **Analytics layer** (Section 8.1): action abstraction, death backtraces, event context, died-vs-survived comparison, sequence frequencies — a new pipeline stage writing `public/data/analytics/` | Unit tests for thresholds, backtracing and n-gram counts pass; register A-16+ added; core tests still pass |
| E2 | **Data chatbot** (Section 8.2): `/api/chat` with tools over E1 output + BM25 retrieval over `docs/corpus/`; chat panel in the side-panel slot; eval set + runner | Eval runner passes; the deployed map works with the API key removed |
| E3 | **Docs update**: add extras to ARCHITECTURE.md (stay at one page), README env vars, ROADMAP.md | S approves wording |

If time runs short, cut in this order: sequence frequencies (in E1) → E2 → E1. Never cut core.

---

## 7. End-of-chunk handover (always use this format)

When a chunk is done, stop and reply with:

1. **What changed:** files added/modified, one line each.
2. **How to verify (2–5 steps):** exact commands and what S should see. Include at least one thing for S to check by eye or against raw data, not just "tests pass".
3. **Assumptions touched:** register IDs added or changed.
4. **Open questions / risks:** anything S must decide.
5. **Proposed commit message(s):** following COMMIT_CONVENTION.md, ready to copy. Split into several commits if the chunk mixes concerns.
6. **Suggested `git add` paths** (S runs them himself).

Then wait.

---

## 8. Extras specification (read only when S starts E1)

### 8.1 E1 — Analytics layer

The research basis, as S has framed it. Cite each method this way in docs and chat answers; do **not** claim the papers validate this extraction-shooter adaptation.

| Method | Source | Our adaptation | Status |
|---|---|---|---|
| Event context / action sequences | Moura et al., 2011 — player behaviour visualization | What players did in the N seconds before a death or kill | Build |
| Backward tracing from critical events | Teng et al., 2026 — interactive process visualization | Most common zone paths leading into deaths, per map / zone | Build |
| Player-group comparison | Teng et al., 2026 | **Journey** groups: died vs survived, map vs map, early vs late. Not player groups: median 2 journeys per player | Build |
| Grouping low-level actions into patterns | Teng et al., 2026 | Each 5 s step → `Travel` / `Loot` / `Combat` / `Idle`, run-length merged | Build |
| Sliding-window frequency of recurring sequences | Xu et al., 2026 — open-world mission design analysis | n-gram frequencies over action sequences, **contrasted** between died and survived | Build (first to cut) |
| Behavioural embeddings / playstyle clusters | Wang et al., 2024 — player2vec | Not viable: 798 human journeys, 248 players, 5 meaningful event types | **Skip** → ROADMAP.md with the data needed to make it viable |

Rules:
- Action thresholds (movement distance for `Travel`, look-back window, combat window) live in `config.py` and become register entries **A-16+**, each with the evidence used to pick it.
- Every analytics output includes its sample size. Results based on fewer than a configured minimum (e.g. 30 events) carry `low_sample: true`.
- Inferred concepts (extraction, actions) keep the word "inferred" in every output label.

### 8.2 E2 — Data chatbot

- **Role:** answers designers' questions from the data. It does **not** control the map. It may include a link to the matching map view (the URL state) as evidence.
- **Structured tools** (TypeScript, reading E1 + core JSON): `death_backtrace(map, zone?, window_s)`, `event_context(event, map, zone?)`, `compare_groups(map, metric)`, `frequent_sequences(map, group, n)`, `match_summary(match_id)`, `map_overview(map, date?)`.
- **Retrieval:** BM25 over chunked `docs/corpus/` (README, DATA_QUALITY, metric and method definitions with citations), index built at build time. No vector database. ARCHITECTURE.md states honestly that the corpus is small today and the layer exists for growth (design docs, patch notes).
- **Answer rules (system prompt):** every number comes from a tool result; every answer states sample size and which method produced it; inferred things are labelled; questions the data can't answer (PvP, playstyles, extraction certainty) get a clear "can't tell from this data" with the reason from the register.
- **Safety and cost:** API key only in Vercel env vars; per-IP rate limit; max tokens per answer; graceful message if the key or quota is missing.
- **Evals:** `evals/questions.yaml` with 15–20 cases (expected tool calls and key numbers), including a small-sample case (GrandRift deaths ≈ 30) and must-refuse cases. `npm run evals` scores them.
