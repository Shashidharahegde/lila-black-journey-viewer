# LILA BLACK Player Journey Viewer

## Overview
A browser tool for LILA's Level Designers to see how players move, fight, loot and die on the three LILA BLACK maps.

## Live URL
Not deployed yet.

## Tech stack
| Layer | Tools |
|---|---|
| Data pipeline (runs before deploy) | Python 3.11+, uv, pandas, pyarrow, numpy, Pillow, pytest |
| Web app | React 19, TypeScript, Vite, Tailwind CSS v4, deck.gl |
| Hosting | Vercel (static site) |

## Setup
Requirements: Python 3.11+, [uv](https://docs.astral.sh/uv/), Node.js 20.19+ or 22.12+ (required by Vite), and `make`. On Windows, use `mingw32-make` or install make with `choco install make`.

1. Unzip `player_data.zip` into `data/raw/`, so that `data/raw/player_data/February_10/` exists. This folder is gitignored.
2. `make setup` installs the pipeline and web dependencies.
3. `make data` rebuilds `web/public/data/`, `web/public/maps/` and `docs/evidence/build_report.json` from the raw data (~45 s). The generated files are committed, so this is only needed after changing the pipeline. The output is reproducible: the same raw data gives byte-identical files, so a rebuild with no pipeline change leaves `git status` clean.
4. `make test` runs the pipeline tests.
5. `make web` starts the dev server.

Without uv: `cd pipeline && pip install -r requirements.txt && pip install -e .`
`pipeline/requirements.txt` is generated from `uv.lock`. Run `make requirements` after changing Python dependencies.

## Environment variables
None.

## Project structure
```
data/raw/     raw parquet files and minimaps (gitignored)
pipeline/     Python package: raw data → web/public/data and web/public/maps
web/          React app that loads the generated files
docs/         build specs, one per feature
```

## Docs
- [ARCHITECTURE.md](ARCHITECTURE.md): how it's built and why
- [EDGE_CASES.md](EDGE_CASES.md): data issues found and how each is handled
- [INSIGHTS.md](INSIGHTS.md): what the tool shows about the game
