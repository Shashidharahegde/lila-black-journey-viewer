# 09 — Chatbot (optional — only after feature 8 is submitted-ready)
> **Dropped 2026-10-24.** Chat is out of scope and its code was removed. This spec is kept as history only.

## Goal
Let a designer ask questions in plain language ("How many deaths on Lockdown?") and get a short answer backed by the data, with the map, date and sample size.

## The problem in depth
- **LLMs are unreliable at counting.** Every figure is already computed by `pipeline/src/lila_pipeline/stats.py` into `web/public/data/stats.json`. The model only reads and explains it; it never counts, sums or averages.
- **The API key must stay secret**, so the LLM can't be called from the browser. This is the one place a small backend is justified.
- **Some questions can't be answered from this data** (player-vs-player fights, positions, single matches, confirmed extractions). The assistant must say so, with the reason, instead of guessing.
- **Small samples** must be flagged in answers (`flags.few_matches`, `flags.partial_date`).

## Decisions
| Choice | Decision | Why |
|---|---|---|
| Hosting | One Vercel serverless function, `web/api/chat.ts` (the Vercel root directory is `web/`) | Keeps the key server-side; the rest of the site stays static |
| Information source | `stats.json` and the answer rules in the system prompt, marked for prompt caching. No tools and no retrieval (RAG) | The file is ~76 KB and already holds every statistic, so there is nothing to search. Fewer parts, fewer ways to fail. The metric definitions and limitations are in the file itself |
| Prompt | Built by `web/api/_lib/prompt.ts` from the same file the dashboard reads | The dashboard and the chat can't disagree |
| Model | `claude-haiku-5-5`, set by `ANTHROPIC_MODEL`; low effort; capped `max_tokens` | The job is quoting numbers from a table, so the cheapest model is enough |
| Answer rules | Numbers only from `stats.json`; always give map, date and sample size; flag few-matches and partial dates; label inferred results; refuse unanswerable questions with the reason | Trustworthy answers |
| Limits | Rate limit per visitor; max answer length; friendly message if the key or quota is missing | Shared link, real cost |
| Evaluation | About 15 test questions with expected numbers, incl. small-sample and must-refuse cases | Proves it works |

Out of scope, by design: per-match questions and "where on the map" questions. The assistant points to the Journeys & Playback and Heatmaps tabs. Revisit with tools if those questions matter.

Research basis S may cite for later analytics tools (our adaptation, not validated by the papers for this game): Moura et al. 2011 (event context), Teng et al. 2026 (backward tracing, group comparison), Xu et al. 2026 (recurring sequences).

## Implementation
**Commit 1 — `feat: add chat system prompt from stats`** (`web/api/_lib/prompt.ts`, test, decision row)
**Commit 2 — `feat: add chat api function`** (`web/api/chat.ts`: Anthropic SDK call, prompt caching, rate limit, missing-key message)
**Commit 3 — `feat: add the AI Chat page`** (replaces the `/chat` placeholder: example questions, answer list, loading and error states)

> **Hidden for now (S, 2026-10-24):** the navigation pass removed AI Chat from the primary nav. The `/chat` page and `web/api/chat.ts` are unchanged and still work at `/chat`, but nothing in the app links to them. Bringing it back is a nav change only (see CLAUDE.md, Primary navigation).
**Commit 4 — `test: add chat evaluation questions and runner`**
**Commit 5 — `docs: document chatbot and env vars`** (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` in README)

## How to verify
1. Evaluation runner passes.
2. "Who wins PvP fights?" gets a clear answer that the data can't say: only same-second `Kill`/`Killed` pairs exist, and their cause is unknown.
3. Remove the API key: the map still works; the chat panel shows a friendly message.
