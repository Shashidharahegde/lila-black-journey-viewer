# 05 — Timeline and playback

## Goal
Watch a match unfold: players move, events appear when they happen, and a designer can jump straight to the moments that matter.

## The problem in depth
- **All actors share one clock.** Match time `t` is measured from the earliest event in the match (02), so players who joined a few seconds later start later, as they did in the game.
- **Positions are 5 s apart.** Jumping from sample to sample looks jerky; smooth movement needs interpolation **within** a segment, never across a gap.
- **Matches last up to ~15 minutes.** Watching in real time is too slow for a designer; speed controls are essential.
- **Most of a match is quiet.** Designers want to jump to kills and deaths, not scrub blindly.
- **Context matters.** A dot alone doesn't show where a player came from; the path travelled so far does.

## Decisions
| Choice | Decision | Why |
|---|---|---|
| Animation | The static view's deck.gl `PathLayer`, cut at the playback time on the CPU every frame (`trimPath`, `headOf` in `map/playback.ts`) | Playback draws the same layers as the full-path view (casing, dashed bots, arrows), so the two can't disagree; at the match end both show the same picture (tested). Replaces the spec's `TripsLayer` (S, 2026-10-22) |
| Interpolation | Linear between samples inside a segment; nothing drawn across gaps | Smooth without inventing movement |
| Trail | The whole path travelled so far, no fading; start, end and direction marks appear with it | Direction and where a player has been stay readable at any speed. Replaces the 30 s fading trail (S, 2026-10-22) |
| Speeds | 0.5×, 1×, 2×, 4×, 8× (default 4×) | 15 minutes takes ~3¾ min at 4× and under 2 min at 8×. S added 8× on 2026-10-22 because playback felt too slow. Replaces 1×/4×/16× |
| Events | A marker appears once `t ≥ event time`; past events stay, slightly faded | Shows what has happened so far |
| Timeline ticks | Kill and death times marked on the slider; click to jump | Jump straight to the action |
| Full-path mode | A toggle shows complete paths (feature 4's static view) | Sometimes the whole journey is what matters |
| URL | Adds `t=` (current time), written with a replace once the time has settled and never while playing; opening the link starts paused at that time | Share "look at minute 6:40 of this match" without filling the Back history with every pause and seek |

## Implementation
**Commit 1 — `feat: add timeline slider and play/pause`**
Slider over `0 … duration_s`, current time display (mm:ss), play/pause with `requestAnimationFrame`.

**Commit 2 — `feat: animate player movement`**
Paths cut at the current time (`PathLayer`) with a current-position marker per actor; events revealed by current time.

**Commit 3 — `feat: add playback speeds and event ticks on the timeline`**
0.5× / 1× / 2× / 4× / 8× and keyboard shortcuts (space = play/pause, ← / → = ±5 s). Ticks for kills and deaths; clicking a tick jumps there.

**Commit 4 — `feat: keep playback time in the url`**
`t=` in the URL; opening the link starts paused at that time.

## How to verify
1. Play the busiest AmbroseValley match at 4× from start to end: movement is smooth, no jumps across gaps.
2. Pause at a death tick: the death marker appears at that moment, at the end of that player's trail.
3. Check one event time against the raw data: (event `ts` − earliest `ts` in the match) equals the time shown.
4. Share a link with `t=`; it opens at that moment.

## Out of scope
Aggregated heatmaps (feature 6).
