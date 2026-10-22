# LILA BLACK - Player Event Data

##Task
At LILA Games, our Level Design team needs a way to understand how players actually navigate our maps. Right now, they have raw telemetry data but no easy way to see what's happening visually — where players move, where fights break out, where people die to the storm, and which areas of the map get ignored.

Your job is to build a tool that turns this raw data into something a Level Designer can open in their browser and actually use.
What You're Getting
A zip file (player_data.zip) containing:

5 days of production gameplay data from LILA BLACK (an extraction shooter)
Minimap images for each of the 3 maps in the game
A README explaining the data format, schema, and coordinate system

Read the README carefully before starting. Everything you need to understand the data is in there.
The Task
Build and deploy a web-based visualization tool that lets a Level Designer explore player behavior on our maps.
Requirements
Core (must have):

Load and parse the provided parquet data
Display player journeys on the correct minimap, with world coordinates properly mapped to the minimap image
Distinguish between human players and bots visually
Show different event types (kills, deaths, loot, storm deaths) as distinct markers
Allow filtering by map, date, and/or match
Timeline/playback to watch a match unfold over time
Heatmap overlays showing kill zones, death zones, or high-traffic areas



## What is this?

This dataset contains **5 days of production gameplay data** (Feb 10-14, 2026) from **LILA BLACK**, a battle-royale style game. Each file records one player's journey through one match.

### Quick Stats

| Metric | Value |
|--------|-------|
| Date Range | February 10 - 14, 2026 |
| Total Files | 1,243 |
| Total Event Rows | ~89,000 |
| Unique Players | 339 |
| Unique Matches | 796 |
| Maps | AmbroseValley, GrandRift, Lockdown |

---

## Folder Structure

```
player_data/
├── February_10/     (437 files, ~2.85 MB)
├── February_11/     (293 files, ~1.9 MB)
├── February_12/     (268 files, ~1.7 MB)
├── February_13/     (166 files, ~1.05 MB)
├── February_14/     (79 files, ~488 KB)   ← partial day
└── README.md        (this file)
```

---

## File Format

All files are **Apache Parquet** format (a columnar storage format common in data engineering). Despite having no `.parquet` extension, any parquet reader will open them.

### Filename Convention

```
{user_id}_{match_id}.nakama-0
```

**Examples:**
- `f4e072fa-b7af-4761-b567-1d95b7ad0108_b71aaad8-aa62-4b3a-8534-927d4de18f22.nakama-0` — a human player's journey
- `1440_d7e50fad-fb7a-4ed4-932f-e4ca9ff0c97b.nakama-0` — a bot's journey

**How to tell humans from bots by filename:**
- **Human player:** `user_id` is a UUID (e.g., `f4e072fa-b7af-4761-b567-1d95b7ad0108`)
- **Bot:** `user_id` is a short numeric ID (e.g., `1440`, `382`)

Each file = **one player (or bot) in one match**. A match with 10 humans and 40 bots produces 50 files.

---

## Parquet Schema

Each file contains a table with the following columns:

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | string | Unique player or bot identifier. UUIDs are human players, numeric IDs are bots. |
| `match_id` | string | Unique match identifier. Includes a `.nakama-0` suffix (the game server instance). |
| `map_id` | string | Which map the match was played on. One of: `AmbroseValley`, `GrandRift`, `Lockdown`. |
| `x` | float32 | World X coordinate of the event |
| `y` | float32 | World Y coordinate (vertical/elevation) |
| `z` | float32 | World Z coordinate |
| `ts` | timestamp (ms) | Timestamp of the event. Stored as milliseconds — represents time elapsed within the match, not wall-clock time. |
| `event` | binary (bytes) | The event type (see Event Types below). Stored as bytes — decode with `.decode('utf-8')` in Python or cast to string. |

### Sample Row (Human)

```
user_id:   f4e072fa-b7af-4761-b567-1d95b7ad0108
match_id:  b71aaad8-aa62-4b3a-8534-927d4de18f22.nakama-0
map_id:    AmbroseValley
x:         -301.45
y:         124.97
z:         -355.55
ts:        1970-01-21 11:52:07.161
event:     b'Position'
```

### Sample Row (Bot)

```
user_id:   1440
match_id:  d7e50fad-fb7a-4ed4-932f-e4ca9ff0c97b.nakama-0
map_id:    AmbroseValley
x:         -280.85
y:         121.62
z:         -323.35
ts:        1970-01-21 11:52:21.082
event:     b'BotPosition'
```

---

## Event Types

There are **8 event types** that describe what happened at each recorded moment:

### Movement Events (most frequent)
| Event | Description |
|-------|-------------|
| `Position` | A human player's position was sampled (movement tracking) |
| `BotPosition` | A bot's position was sampled |

### Combat Events
| Event | Description |
|-------|-------------|
| `Kill` | A human player killed another human player |
| `Killed` | A human player was killed by another human player |
| `BotKill` | A human player killed a bot |
| `BotKilled` | A human player was killed by a bot |

### Environment Events
| Event | Description |
|-------|-------------|
| `KilledByStorm` | A player died to the storm (the shrinking play zone) |

### Item Events
| Event | Description |
|-------|-------------|
| `Loot` | A player picked up an item |

---

## Game Context

**LILA BLACK** is an extraction shooter where:
- Players enter a match, complete objectives, loot items, and must **extract** before it's too late
- A **one-directional storm** pushes across the map, forcing players to move and extract before being consumed
- Players fight other players and bots along the way
- Matches contain a mix of **human players** and **bots** (AI-controlled opponents)
- There are currently **3 maps** in rotation:
  - **Ambrose Valley** — the primary/most played map
  - **Grand Rift** — secondary map
  - **Lockdown** — smaller/close-quarters map

---

## Maps & Minimaps

Minimap images for all 3 maps are included in the `minimaps/` folder. These are top-down views of each map.

```
minimaps/
├── AmbroseValley_Minimap.png
├── GrandRift_Minimap.png
└── Lockdown_Minimap.jpg
```


## Key Concepts

### Match
A single game session. Identified by `match_id`. Typically has multiple human players and bots. A match lasts several minutes. You can reconstruct the full match by combining all files that share the same `match_id`.

### Player Journey
One player's experience within one match — represented by a single parquet file. Contains their movement path (Position events sampled periodically) and discrete events (kills, deaths, looting).

### Bots vs Humans
- **Humans** have UUID `user_id` values and generate `Position`, `Kill`, `Killed`, `Loot`, `KilledByStorm` events
- **Bots** have numeric `user_id` values and generate `BotPosition`, `BotKill`, `BotKilled` events
- A single human player can appear across multiple matches (multiple files with the same `user_id` but different `match_id`)

## Tips

- The `event` column is stored as **bytes** in parquet. You'll need to decode it to get readable strings.
- Files have **no `.parquet` extension** — but they are valid parquet files. Most tools (pandas, DuckDB, Polars, Spark) will read them fine if you pass the path directly.
- **February 14 is a partial day** (data collection was still ongoing).
- Position events are the bulk of the data (~85%+). Filter them out if you want to focus on combat/loot events.
- To reconstruct a full match timeline, gather all files sharing the same `match_id`, combine them, and sort by `ts`.



1. We are looking for clear, concise, and well-thought-out responses 
2. Use of AI to write any deliverables for this test is permitted 

