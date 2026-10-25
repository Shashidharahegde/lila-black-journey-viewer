# 01 — Project setup

## Goal
A clean, runnable skeleton: a Python pipeline package and a React web app in one repo, with raw data safely excluded from git.

## The problem in depth
- The repo will be public or shared with reviewers, so **LILA's raw production data must never be committed** — including by accident through a broad `git add .`. The ignore rules come first, before any data-touching code exists.
- Two languages live in one repo (Python pipeline, TypeScript web app). Each needs its own dependency management, and a newcomer must be able to set both up from the README alone.
- Reviewers judge code organisation; the top-level layout should make the data flow obvious: `data/raw → pipeline → web`.

## Decisions
| Choice | Decision | Why |
|---|---|---|
| Python tooling | `uv` + `pyproject.toml` | Fast, reproducible, one file for dependencies and config |
| Web tooling | Vite + React + TypeScript | Fast dev server, simple static build for Vercel |
| Task runner | Makefile | One obvious entry point: `make data`, `make test`, `make web` |

Target layout (folders appear only when a feature needs them):
```
data/raw/            gitignored — unzip player_data.zip here
pipeline/            Python package + tests
web/                 React app; web/public/data and web/public/maps are generated
docs/                these build docs
Makefile  README.md  CLAUDE.md  COMMIT_CONVENTION.md
```

## Implementation
**Commit 1 — `chore: add gitignore and readme skeleton`**
- `.gitignore`: `data/raw/`, `.env*`, `node_modules/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `dist/`, `.DS_Store`.
- `README.md` with headings only: Overview, Live URL, Tech stack, Setup, Environment variables, Project structure, Docs.

**Commit 2 — `chore: set up python pipeline package`**
- `pipeline/pyproject.toml` with pandas, pyarrow, numpy, Pillow, pytest.
- `pipeline/src/lila_pipeline/__init__.py` and one smoke test (`tests/test_smoke.py`) that imports the package.

**Commit 3 — `chore: set up vite react typescript app`**
- `web/` created with Vite's React + TS template, cleaned of demo content; page shows the tool's name.
- Add deck.gl dependencies now (`deck.gl`, `@deck.gl/react`) so later features don't mix setup into feature commits.

**Commit 4 — `chore: add makefile with test and web targets`**
- `make test` → runs pytest; `make web` → runs the Vite dev server. (`make data` is added in feature 2.)

## How to verify
1. `git status` after unzipping the data into `data/raw/` shows nothing under `data/raw/`.
2. `make test` passes (one smoke test).
3. `make web` serves a page showing the tool's name.

## Out of scope
Any pipeline logic, any map code, any placeholder files for later features.
