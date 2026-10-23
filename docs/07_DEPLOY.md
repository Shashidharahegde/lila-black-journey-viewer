# 07 — Deploy

## Goal
A public URL that reviewers can open and use without help, which redeploys automatically on every push.

## The problem in depth
- **The site must work on first open.** Static hosting has nothing to wake up, so first load depends only on file sizes — which is why the minimaps are WebP and match files are loaded on demand.
- **Shared links are deep links** (`/?map=…&match=…&t=…`). The host must serve the app for any URL, not a 404.
- **Linux hosts are case-sensitive.** `Maps/` and `maps/` are different on Vercel even if they work on a laptop.
- **Generated data must be in git.** Vercel builds only the frontend; it never sees the raw data or runs Python.
- **Preview vs production.** Branch previews on the free plan can ask visitors to log in. Only the production URL goes in the README.
- **S does the Vercel setup** (it needs his login). The repo must be ready so that setup is just a few clicks.

## Decisions
| Choice | Decision | Why |
|---|---|---|
| Host | Vercel, root directory `web/`, Vite preset, output `dist/` | Free, deploys from GitHub |
| Routing | `vercel.json` rewrite of all paths to `index.html` | Deep links work |
| Caching | Long cache for `/maps/*`; short for `/data/index.json` | Fast repeat visits; updates still show |
| First deploy | As early as feature 3 | Find hosting problems while there's time |

## Implementation
**Commit 1 — `chore: add vercel config for static deploy`**
`web/vercel.json` with the rewrite and cache headers. README section "Deploying" with the exact Vercel settings S needs to enter.

**Commit 2 — `docs: add live url to readme`**
After S deploys: production URL at the top of the README.

## How to verify
1. Open the production URL in a private window: the map loads.
2. Open a deep link with a match and time: the view is restored.
3. Check the browser's network tab: no 404s; minimaps are WebP.
4. Total first-load size is reasonable (aim: under ~5 MB including one minimap).

## Out of scope
Any serverless functions (only for the optional chatbot).
