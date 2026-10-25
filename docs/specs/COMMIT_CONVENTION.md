# Commit messages

Every commit has a **subject line** and a **detailed body**.

```
<type>: <what changed, in one line>

What:
- <each meaningful change, one bullet each>

Why:
- <optional: only for architectural or behavioural changes with a real technical reason>

How it was checked:
- <tests run, or what was checked by eye and what it showed>


```

## Subject line
| Type | Use for |
|---|---|
| `feat` | New feature (map, playback, heatmap…) |
| `fix` | Bug fix |
| `data` | Pipeline / data cleaning changes |
| `docs` | README, ARCHITECTURE, INSIGHTS |
| `chore` | Setup, config, dependencies |

- Present tense, lowercase: "add", not "added".
- Under 72 characters.
- Describe the change to the tool, not the file name.

## Body
- Leave one blank line after the subject.
- Write full sentences or clear bullets. A reviewer should understand the change without opening the diff.
- **Why** is optional. Write it only for an architectural or behavioural change with a genuine technical reason: a problem it fixes, a data fact, a constraint, a trade-off. Leave it out for aesthetic, layout, styling and other cosmetic changes.
- Keep **Why** readable by anyone on GitHub. Don't quote internal conversations or decisions ("S, 2026-10-22: …"), and don't point to private files such as CLAUDE.md rows or the Decisions table. State the reason itself.
- **How it was checked** is required. "Not checked" is not acceptable.
- Leave out **Notes** if there's nothing to add.

## Examples

```
chore: set up pipeline package and vite app

What:
- Add .gitignore excluding raw data, env files, node_modules and caches.
- Add Python pipeline package (pyproject.toml, pandas, pyarrow, Pillow, pytest).
- Add Vite + React + TypeScript app in web/.
- Add README skeleton with setup and tech stack sections.

Why:
- Gives the project a clean base so each feature lands in its own commit.
- Raw player data is LILA's production data and must never enter git.

How it was checked:
- `pytest` runs (no tests yet) and `npm run dev` serves an empty page.
- `git status` confirms data/raw/ is ignored.
```

```
data: read timestamps as seconds, not milliseconds

What:
- Convert ts to Unix epoch seconds instead of milliseconds.
- Compute match time as seconds since the earliest event in the match.

Why:
- The parquet column is typed as milliseconds, but read that way every
  match lasts under one second.
- Read as seconds, every event falls on its folder's date
  (Feb 10–14, 2026) and matches last 13 s to ~15 min, which fits
  "a match lasts several minutes" in the README.

How it was checked:
- Added a test that match durations fall between 10 s and 20 min.
- Spot-checked one file: first event 2026-02-10 18:09 UTC, inside the
  February_10 folder.

```

```
data: classify bots by behaviour instead of id format

What:
- Mark a player as a bot when their file contains BotPosition events.
- Flag files whose numeric id disagrees with their behaviour.

Why:
- The README says numeric ids are bots, but 17 files with numeric ids
  (pseudonyms 85fd66c7, 929d4b9d, 7801beec) record human-style Position
  and Loot events and never BotPosition.
- With the behaviour rule, 794 of 796 matches have exactly one human,
  which is consistent with the rest of the data.

How it was checked:
- Test asserts all 17 files are classified as human and flagged.
- Test asserts no match has more than two humans.

```

```
fix: flip y axis when converting to minimap pixels

What:
- Apply py = (1 - v) * image_height instead of v * image_height.

Why:
- Image pixel rows start at the top, while world z increases upward.
  Without the flip, paths appeared mirrored and crossed water on Lockdown.

How it was checked:
- README worked example now returns (78, 890) at 1024 px.
- Plotted all positions on each minimap: paths follow roads and buildings.
```

```
feat: add match playback with timeline

What:
- Add a timeline slider covering the selected match's duration.
- Add play/pause and 1x, 4x, 16x speed controls.
- Show players' positions up to the current time, with a fading trail.

Why:
- Level Designers need to see how a match unfolds over time, not just
  the final paths. This is a core requirement.

How it was checked:
- Played the busiest AmbroseValley match from start to finish at each
  speed; markers appear at the times listed in the raw file.
