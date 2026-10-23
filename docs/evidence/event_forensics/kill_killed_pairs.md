# B. The three `Kill`/`Killed` pairs (EC-12)

## The rows
The whole dataset has 3 `Kill` rows and 3 `Killed` rows, all in 3 UUID (human) files. Each file holds one pair:

| Case | Map | Match time | Rows | Same second | Same x/y/z | Journey ends | Other recorded files in the match |
|---|---|---|---|---|---|---|---|
| P1 | GrandRift | 431 s | `Kill` then `Killed`, adjacent | yes | yes | 1 s later | 0 |
| P2 | AmbroseValley | 546 s | `Kill` then `Killed`, adjacent | yes | yes | 2 s later | 0 |
| P3 | AmbroseValley | 639 s | `Kill` then `Killed`, adjacent | yes | yes | at once (last rows) | 0 |

Per-event detail is in [kill_killed_pairs.csv](kill_killed_pairs.csv).

## Why "self-kill" was unsupported
The earlier pipeline merged each pair into a single `self_kill` row and deleted the `Kill`. The evidence it relied on doesn't separate a self-kill from other explanations:

- **Identical x/y/z** is expected whatever happened. Every event carries the position of the file's owner (EC-11), so a kill and a death in the same second share a position in any case.
- **No other file in the match** doesn't mean no other player. 743 of the 796 matches record only one file, while the README describes matches with several humans, so recording is incomplete. An unrecorded opponent can't be ruled out, and that is exactly the README's reading: the owner killed a human and was killed by one.
- **No victim or killer column exists.** Each row names only the file's owner.
- **Timestamps are whole seconds** (EC-01, EC-03), so the order within the second is unknown.

What the rows do show is that the two events are logged together:
- No `Kill` occurs without a `Killed` in the same second.
- For comparison, only 2 of 400 seconds in which a human file logs `BotKilled` also have a `BotKill` from that file.

That points to one incident logged twice. It doesn't say whether the cause was self-inflicted or a trade.

## How the pipeline represents them now
`journeys.categorize_events`:
- keeps every row and its original label, time and position;
- flags both rows of each same-file, same-second `Kill`/`Killed` pair `kill_killed_pair: true`;
- has no `self_kill` category.

| Event | Type in the data | Counted as |
|---|---|---|
| `Killed` | `death` | a death (death totals and the death heatmap): the owner's death is certain |
| `Kill` | `kill` | not a kill. It is left out of kill totals and the kill heatmap, because whether anyone else died is unknown. Each match's `counts.kill_killed_pair` counts the pair instead |

If the pairs turn out to be self-inflicted, nothing extra was counted. If they turn out to be trades, nothing was deleted, and both events can be recounted from the match files.

## How they appear in the viewer
- Both markers are drawn at the shared spot, using the normal kill and death symbols.
- Each tooltip gives the raw label with the README's meaning marked as the README's ("Kill logged (README: killed a human player)"). It adds that the cause is unknown: self-inflicted, or a trade with an unrecorded player.
- The match header lists "1 Kill/Killed pair" separately from kills.
