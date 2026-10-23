# 08 — Docs and submission

## Goal
Everything a reviewer needs is in the repo: how to run it, how it works, why it was built this way, what it reveals about the game, and a walkthrough.

## The problem in depth
- **Communication is a full row of the rubric.** ARCHITECTURE.md must explain decisions and trade-offs, not just list technologies — and it must fit on **one page**.
- **"How you mapped game coordinates to the minimap" is singled out** as the tricky part. It needs a worked example and evidence, not just the formula.
- **"Any assumptions you made where the data was ambiguous"** — every item in 02's problem list is one of these.
- **INSIGHTS.md is S's own work**, written after using the tool. Each insight needs: what caught the eye, concrete evidence (a stat or pattern), what's actionable (which metrics change, what to do), and why a level designer should care.
- **The checklist includes "Walkthrough covers all major features"**, which is not in the deliverables list — plan a short screen recording.
- **Only a GitHub repo link is accepted**, so every deliverable must be a file in the repo (no Google Docs).

## Implementation
**Commit 1 — `docs: write readme with setup and tech stack`**
Overview (one line + live URL) · what you can do with the tool · tech stack · setup (unzip data to `data/raw/`, `make data`, `make test`, `make web`) · environment variables (none for the core) · project structure · links to docs.

**Commit 2 — `docs: add one-page architecture doc`**
Sections:
1. *What I built with and why* — 3–4 lines.
2. *Data flow* — the diagram from CLAUDE.md, one line per stage.
3. *Coordinate mapping* — formula, the README example worked through, the real image sizes, UV storage, y-flip, and the calibration evidence (overlay images + the on-map test that fails without the flip).
4. *Assumptions* — a table of the data issues from 02 and how each was handled.
5. *Trade-offs* — the Decisions table from CLAUDE.md, trimmed to the 5–6 most important rows.
6. *What I'd do next* — one short list (danger ratio, extraction layer, backtracing, chatbot).

**Commit 3 — `docs: add insights`** *(written by S)*
Claude Code may write `pipeline/tools/insight_stats.py` that prints the numbers S asks for; S writes the text.

**Commit 4 — `docs: add walkthrough video link`**
3–5 minute screen recording: pick a map → filter by date → open the busiest match → play it → show markers and tooltips → switch to heatmaps → share a link. Link at the top of the README.

## How to verify (the submission checklist)
- [ ] Tool is live at the hosted URL
- [ ] Player paths render correctly on the minimap
- [ ] Humans and bots look different
- [ ] Kill, death, loot and storm events are marked
- [ ] Filtering by map / date / match works
- [ ] Playback shows match progression
- [ ] Heatmaps show kill zones, death zones and traffic
- [ ] ARCHITECTURE.md covers the coordinate mapping approach and fits on one page
- [ ] INSIGHTS.md has three insights with evidence
- [ ] Walkthrough covers all major features
- [ ] Repo opens for reviewers (public, or reviewers added)
