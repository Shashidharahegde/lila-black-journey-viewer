# Insights

Three things I learned about LILA BLACK from the cleaned match data.
 Positions are world `x, z`. Two terms:
- **Spawn point**: every human journey is first recorded at match time 0, and those first positions fall into a few tight groups. AmbroseValley has 7, each used by 75 to 87 journeys. That even spread suggests the game assigns spawns, so comparing them is fair.
- **Died within 5 minutes**: the journey has a recorded death (killed by a bot or by the storm) at or before 300 s.

---

## 1. One AmbroseValley spawn point loses half its players in the first 5 minutes

**What caught my eye**
The seven AmbroseValley spawns are not equally safe. Six lose 17 % to 35 % of their players within 5 minutes. The spawn on the west riverbank (`x -143, z -191`) loses 49 %.

**Evidence**
| AmbroseValley spawn (x, z) | Journeys | Died within 5 min | Median loot in first 2 min |
|---|---|---|---|
| West riverbank (-143, -191) | 75 | **49 %** (37) | **2** |
| North-west corner (-172, 336) | 77 | 35 % | 4 |
| North-east (234, 219) | 86 | 31 % | 5 |
| East (267, -48) | 87 | 30 % | 6 |
| West (-316, 1) | 82 | 24 % | 6 |
| South (-104, -366) | 79 | 22 % | 8 |
| South-west corner (-296, -351) | 82 | 17 % | 5 |
| The other six together | 493 | **27 %** (131) | |

- Not luck: shuffling the spawn labels at random 5,000 times never produced a gap between the best and worst spawn as large as the real one (32 percentage points).
- It holds on three of the four full days (10, 12 and 13 February). On 11 February the riverbank spawn was not worse (4 of 17).
- Where they die: 44 of the 75 riverbank players reach the riverside buildings just south of the walled compound within 5 minutes (`x -136 to -46, z -113 to -5`, about 150 m north of the spawn). That area holds 6 % of all human time on the map and 16 % of all human deaths (51 of 316); 19 of those 51 are riverbank-spawn players, more than from any other spawn.
- 23 of the 37 riverbank players who died early had not killed anything yet, and 19 of the 37 died before 2:00.
- They also start poorer: a median of 2 loot pickups in the first 2 minutes against 4 to 8 at every other spawn; 15 of 75 picked up nothing.
- The picture shows each spawn with its 5-minute death rate, early deaths in red and the riverside area boxed: [AmbroseValley](docs/evidence/insights/spawn_early_deaths_AmbroseValley.webp).

To see it in the tool: Heatmaps → AmbroseValley → Deaths shows the cluster at those buildings; on Journeys, routes from the riverbank start run north into it.

**Actionable?**
Yes. It is one known spawn and one known area.
- *Metrics affected:* share of journeys dying within 5 minutes per spawn (the riverbank spawn should come close to the 27 % the others average); loot in the first 2 minutes per spawn; deaths in the riverside buildings as a share of the map's deaths (16 % for 6 % of the time).
- *Actions:* check what threatens players in those buildings in the first minutes (bot placement, sightlines over the river crossing) and add cover on the approach; add loot between the spawn and the crossing; or move the spawn so its first route doesn't lead straight into that area. Then re-run the per-spawn table: because spawns appear to be assigned, it is a clean before/after test.

**Why a level designer should care**
Players don't choose this spawn, so half of the people who get it have a worse first five minutes because of the layout. That feels unfair, and an early death is the match most likely to end a session.

---

## 2. Surviving players leave from six fixed spots, and use them unevenly (inferred)

**What caught my eye**
There is no extraction event in the data, so I looked at where journeys that end without a death finish. They don't end just anywhere: on AmbroseValley they end at six exact spots, with a median distance of 2 to 3 m from each spot's centre. I read these as the extraction points. This is an inference from positions, not a logged event.

**Evidence**
- AmbroseValley: 200 of 252 journeys without a death (79 %) end within 10 m of one of six spots. Those spots hold only 1.8 % of all human position samples, so players are not just spending a lot of time there. Only 1 journey that ended in a death has its last position there.
- Lockdown: 50 of 74 (68 %) end at five spots holding 1.0 % of samples. GrandRift: 14 of 29 at two spots (a small sample).
- It doesn't depend on how the map is cut: on a 20 × 20 grid the six busiest cells hold 68 % to 86 % of these endings on every map.
- Use on AmbroseValley is uneven:

| End spot (x, z) | Journeys ending there | Share | Median end time | Kills per journey |
|---|---|---|---|---|
| East, by the warehouses (196, -70) | 47 | 23 % | 9:28 | 5.13 |
| South-centre (72, -309) | 44 | 22 % | 9:38 | 4.66 |
| North-east (213, 188) | 35 | 17 % | 9:49 | 4.77 |
| West (-237, 52) | 33 | 16 % | 10:39 | 5.00 |
| South-west, by the river (-151, -249) | 27 | 13 % | **6:32** | **1.93** |
| North-west corner (-166, 311) | 18 | 9 % | 9:05 | 3.72 |

- Players cross the map to leave: only 45 of 233 left from the spot nearest the spawn they started at.
- The south-west spot stands out: players leave from it about two and a half minutes earlier than from the next-earliest spot, with far fewer kills. It is 56 m from the riverbank spawn in insight 1, so it looks like an early way out of a dangerous start.
- The pictures show starts as green rings and survivors' ends as red squares: [AmbroseValley](docs/evidence/insights/starts_and_ends_AmbroseValley.webp), [Lockdown](docs/evidence/insights/starts_and_ends_Lockdown.webp), [GrandRift](docs/evidence/insights/starts_and_ends_GrandRift.webp).

To see it in the tool: on Journeys, open a few matches whose player survived; the square marking the last recorded position keeps landing on the same spots.

**Actionable?**
Yes, with the caveat that the extraction points are inferred.
- *Metrics affected:* share of extractions per spot (9 % to 23 % today); median time to extract per spot; kills and loot before extracting.
- *Actions:* confirm the six spots against the level data, and log an extraction event so this no longer has to be inferred; find out why the north-west spot gets half the use of the east one (distance, an exposed approach, or players not knowing it's there); decide whether a quick, low-risk exit next to the most dangerous spawn is intended, and if not, move it or make reaching it cost something.

**Why a level designer should care**
Extraction points shape the second half of a match: they decide which routes are busy late and where the last fights happen. An exit hardly anyone uses is wasted space, and an exit that is much easier than the rest lets players skip the risk the mode is built on.

---

## 3. On Lockdown, one in six players dies before picking anything up

**What caught my eye**
On Lockdown, 16.4 % of human journeys have no loot pickup at all, three times AmbroseValley's rate. Almost all of them are killed by bots close to where they started.

**Evidence**
| Map | Journeys with no loot | Of players killed by bots, never looted | Those deaths: median time, distance from start |
|---|---|---|---|
| Lockdown | 28 of 171 (**16.4 %**) | 25 of 80 (**31.2 %**) | 127 s, **75 m** |
| AmbroseValley | 28 of 568 (4.9 %) | 26 of 297 (8.8 %) | 104 s, 153 m |
| GrandRift | 4 of 59 (6.8 %) | 3 of 24 (12.5 %) | (too few) |

- Not luck: Fisher's exact test gives p = 0.000004 for the no-loot share and p = 0.000002 for the share among players killed by bots (Lockdown against AmbroseValley).
- It holds in both halves of the dates: Lockdown 11.7 % (9 to 11 February) and 25.0 % (12 to 14 February); AmbroseValley 4.7 % and 5.2 %.
- These players die close to where they entered: a median 75 m from their start, against 171 m for all bot deaths on Lockdown.
- Loot isn't simply far away: players who do loot get their first item about as fast on both maps (median 45 s on Lockdown, 41 s on AmbroseValley).
- It isn't one bad spawn: the 28 no-loot journeys come from all nine Lockdown spawn points (1 to 7 each). The most, 7, come from the spawn at `x -122, z 85`, where 11 of 17 players die within 5 minutes; with 17 journeys that spawn is worth watching but too small to act on alone.
- Early loot goes with surviving on every map, not just Lockdown. Of the players still alive at 2:00, those with 6 or more pickups died by 5:00 16.6 % of the time, against 27.8 % for those with 0 to 2. Comparing players from the same spawn, the low-loot group did worse at 11 of the 12 spawns with enough players in both groups. This is a correlation: players who loot quickly may also be more skilled.

To see it in the tool: on Journeys, pick Lockdown, sort the match list by Duration and open the shortest matches; the death marker sits near the start ring with no loot markers between them.

**Actionable?**
Yes.
- *Metrics affected:* share of journeys with no loot (16.4 % on Lockdown); death rate by 5:00; loot pickups in the first 2 minutes; time to first loot.
- *Actions:* check where bots spawn and patrol relative to Lockdown's player spawns and give each spawn a short safe window or more cover; place a little loot within reach of each spawn so players have something before the first fight; change one spawn's early loot and compare its 5-minute death rate before and after, which also tests whether loot is the cause.

**Why a level designer should care**
A player who dies empty-handed two minutes in, near where they started, didn't really get a game. It reads as being ambushed at the spawn, and that is the kind of match that makes people stop playing. Spawn surroundings and early loot are both directly in the level designer's hands.

---

## How these were checked
Each insight was computed twice with separate code: once by the analysis that found it, once by an independent re-check. Both runs read the cleaned match files in `web/public/data/matches/`, which already apply the pipeline's rules (bots by behaviour, rows after death removed, duplicated journeys dropped). Spawn and end spots are found by grouping first and last positions within 50 m and 40 m.

Limits:
- Spawn points and extraction points are inferred from positions; neither is logged.
- AmbroseValley has 75 to 87 journeys per spawn; the other maps have 8 to 27, so per-spawn results are firm only on AmbroseValley.
- Five days of data, with mostly one recorded human per match.
