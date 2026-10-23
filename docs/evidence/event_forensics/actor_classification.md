# A. The 17 numeric-ID journeys (EC-09, EC-10)

## The README's rules
1. **By ID:** UUID `user_id` = human; short numeric ID = bot.
2. **By events:** humans log `Position`, `Loot`, `Kill`, `Killed` and `KilledByStorm`; bots log `BotPosition`, `BotKill` and `BotKilled`.

On 1,225 of 1,242 files the two rules agree. On 17 they don't.

## What the raw rows show
**Ownership is clean.** In every file, every row has the same `user_id`, `match_id` and map, and they match the file name. Each file is one actor's journey in one match.

**Events by group** (files that contain the event / rows):

| Event | UUID files (781) | Numeric, with `BotPosition` (444) | Numeric, without `BotPosition` (17) |
|---|---|---|---|
| `Position` | 781 / 50,648 | 0 | 17 / 636 |
| `BotPosition` | 0 | 444 / 21,712 | 0 |
| `Loot` | 724 / 12,751 | 0 | 14 / 115 |
| `BotKill` | 581 / 2,227 | 126 / 170 | 5 / 13 |
| `BotKilled` | 400 / 402 | 296 / 296 | 1 / 1 |
| `KilledByStorm` | 39 / 39 | 0 | 0 |
| `Kill` / `Killed` | 3 / 3 each | 0 | 0 |

No file logs both `Position` and `BotPosition`.

**17 files, 17 journeys, 3 actors.** Actor A has 14 journeys (AmbroseValley, on all five days), B has 2 (GrandRift) and C has 1 (Lockdown). Each journey is in a different match. Per-journey detail is in [actor_classification.csv](actor_classification.csv).

**Examples** (t = seconds into the journey; consecutive `Position` rows grouped):
- U06 (6 bots in the match): `Position`×3 t0–25 · `Loot` t32 · `Position`×2 · `Loot`×3 t44 · `Position`×13 · `Loot` t115 · `Position`×8 to t184. Ends without a death.
- U10 (14 bots): 152 rows over 734 s: 120 `Position`, 28 `Loot` and 4 `BotKill`. Ends without a death.
- U12: `Position`×2 over 25 s, and nothing else.

## Evidence for "player client"
- **Event vocabulary:** they log `Position` (17 of 17) and `Loot` (14 of 17). No `BotPosition` file ever logs either.
- **Speed:** bots never move faster than 5.0 world units per second, across all 444 bot files. 12 of the 17 do exceed that, as do 728 of the 781 UUID journeys.
- **Role in the match:**
  - All 17 start at their match's first event, as all 781 UUID journeys do; only 28 of 444 bot journeys do.
  - Bots appear 0 or 5 s after the first non-bot journey, both in UUID-led matches (0 s: 15, 5 s: 283) and in matches led by one of these journeys (0 s: 13, 5 s: 133).
  - 16 of these matches have no UUID human. Without these journeys they would be the only bot-only matches in the data.

## Evidence against "human"
- The ID format says bot.
- Actor A is an ordinary `BotPosition` bot in 3 other matches, each of which has a UUID human.
- Actor B's ID is outside the numeric range used by bot files; A's and C's are inside it.
- Only 1 of the 17 journeys dies, against 442 of the 781 UUID journeys. Their median length is 161 s, against 367 s.

## Why `unknown`
The evidence shows these journeys come from the player client. It doesn't show that a person was playing: one actor appearing in 14 matches over five days, and as a bot elsewhere, fits an internal or automated test client just as well.
- **Calling them human** would put possible test traffic into designer-facing human statistics.
- **Calling them bots** would contradict every event-level signal: no bot file loots or exceeds the bot speed cap.

So the pipeline classifies an actor only when both README rules agree (`normalize.classify_actors`). The 17 journeys:
- keep all their positions and events in the match files;
- are drawn in a neutral style with an "Unknown" label;
- stay visible when bots are hidden;
- are left out of human counts and human heatmaps.

Journeys are now 781 human, 444 bot and 17 unknown. Matches with exactly one human: 779; with two: 1; with none: 16 (EC-10).

Impact on heatmaps: [heatmap_impact.md](heatmap_impact.md).
