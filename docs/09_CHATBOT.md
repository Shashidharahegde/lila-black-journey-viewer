# 09 — Chatbot (optional — only after feature 8 is submitted-ready)

## Goal
Let a designer ask questions in plain language ("Where do players die most on Lockdown?") and get answers backed by the data, with counts and sample sizes.

## The problem in depth
- **LLMs are unreliable at counting.** Feeding the JSON files into a prompt is too large and gives wrong numbers. Code must compute; the LLM must only choose what to compute and explain the result.
- **The API key must stay secret**, so the LLM can't be called from the browser. This is the one place a small backend is justified.
- **Some questions can't be answered from this data** (player-vs-player fights, playstyles, confirmed extractions). The assistant must say so, with the reason, instead of guessing.
- **Small samples** (GrandRift: 59 matches) must be flagged in answers.

## Decisions
| Choice | Decision | Why |
|---|---|---|
| Hosting | One Vercel serverless function, `api/chat` | Keeps the key server-side; the rest of the site stays static |
| Structured queries | Tools the LLM can call, reading the same JSON files as the map: `match_list`, `match_summary`, `heatmap_top_cells`, `compare_maps` | Code computes; map and chat can't disagree |
| Retrieval (RAG) | Keyword search (BM25) over the project docs (README, ARCHITECTURE, 02's data notes, metric definitions) | Answers "what does this mean" questions; no vector database needed at this size |
| Answer rules | Numbers only from tools; always state sample size; label inferred results; refuse unanswerable questions with the reason | Trustworthy answers |
| Limits | Rate limit per visitor; max answer length; friendly message if the key or quota is missing | Shared link, real cost |
| Evaluation | 15 test questions with expected tools and numbers, incl. small-sample and must-refuse cases | Proves it works |

Research basis S may cite for later analytics tools (our adaptation, not validated by the papers for this game): Moura et al. 2011 (event context), Teng et al. 2026 (backward tracing, group comparison), Xu et al. 2026 (recurring sequences).

## Implementation
**Commit 1 — `feat: add chat tools over generated data`** (pure functions + tests)
**Commit 2 — `feat: add document search for chat`**
**Commit 3 — `feat: add chat api function with answer rules`**
**Commit 4 — `feat: add chat panel to the map view`**
**Commit 5 — `test: add chat evaluation questions and runner`**
**Commit 6 — `docs: document chatbot and env vars`** (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` in README)

## How to verify
1. Evaluation runner passes.
2. "Who wins PvP fights?" gets a clear answer that the data can't say: only 3 same-second `Kill`/`Killed` pairs exist, and their cause is unknown.
3. Remove the API key: the map still works; the chat panel shows a friendly message.
