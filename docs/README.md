# Build docs

One document per feature, built in this order. Each one is the spec for that feature: read it fully before starting.

| # | Doc | Feature |
|---|---|---|
| 1 | [01_PROJECT_SETUP.md](01_PROJECT_SETUP.md) | Repo, pipeline package, web app |
| 2 | [02_DATA_PIPELINE.md](02_DATA_PIPELINE.md) | Parquet → clean data → JSON + WebP (defines the data format every later feature uses) |
| 3 | [03_MAP_AND_FILTERS.md](03_MAP_AND_FILTERS.md) | Minimap view, map / date / match filters, shareable URLs |
| 4 | [04_JOURNEYS_AND_MARKERS.md](04_JOURNEYS_AND_MARKERS.md) | Player paths, human vs bot, event markers |
| 5 | [05_PLAYBACK.md](05_PLAYBACK.md) | Timeline and match playback |
| 6 | [06_HEATMAPS.md](06_HEATMAPS.md) | Kill, death and traffic heatmaps |
| 7 | [07_DEPLOY.md](07_DEPLOY.md) | Vercel deployment |
| 8 | [08_DOCS_AND_SUBMISSION.md](08_DOCS_AND_SUBMISSION.md) | README, ARCHITECTURE, INSIGHTS, walkthrough |
| — | [10_DASHBOARD.md](10_DASHBOARD.md) | Optional overall statistics page, after feature 8 and before the chatbot |
| — | [09_CHATBOT.md](09_CHATBOT.md) | Optional, after the dashboard (reads its `stats.json`) |

**[FRONTEND_GUIDELINES.md](FRONTEND_GUIDELINES.md) is the master for everything in the web app:** layout, colours, icons, typography, components and interaction. Feature specs say what to build; the guidelines say how it looks and behaves, and win if the two differ.

Every feature doc has the same sections: **Goal · The problem in depth · Decisions · Implementation (one commit per step) · How to verify · Out of scope.**

If a doc turns out to be wrong once you're in the code, don't silently work around it: tell S what's wrong and propose the fix.
