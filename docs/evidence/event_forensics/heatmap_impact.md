# Heatmap impact of excluding the unknown journeys

Each human heatmap layer (64×64 cells, all dates) is built twice with the pipeline's own grid functions:
- **published:** human journeys only, as in `web/public/data/heatmaps/`;
- **with unknown:** the 17 unknown journeys added back.

The paired `Kill` events (EC-12) are left out of both kill layers. Source: `heatmap_impact` in [forensics_summary.json](forensics_summary.json).

| Map | Journeys (human + unknown) | Layer | Total with unknown | Published | From unknown | Cells changed | Cells lit only by unknown | Top-10 cells shared | Pearson r |
|---|---|---|---|---|---|---|---|---|---|
| AmbroseValley | 554 + 14 | kills | 1,669 | 1,656 | 0.78 % | 12 of 460 | 2 | 10 / 10 | 0.9994 |
| | | deaths | 316 | 315 | 0.32 % | 1 of 208 | 0 | 10 / 10 | 0.9993 |
| | | traffic (s) | 212,082 | 208,625 | 1.63 % | 489 of 1,620 | 2 | 10 / 10 | 0.9998 |
| GrandRift | 57 + 2 | kills | 179 | 179 | 0 % | 0 | 0 | 10 / 10 | 1.0 |
| | | deaths | 30 | 30 | 0 % | 0 | 0 | 10 / 10 | 1.0 |
| | | traffic (s) | 21,844 | 21,708 | 0.62 % | 45 of 1,259 | 3 | 10 / 10 | 0.9997 |
| Lockdown | 170 + 1 | kills | 388 | 388 | 0 % | 0 | 0 | 10 / 10 | 1.0 |
| | | deaths | 97 | 97 | 0 % | 0 | 0 | 10 / 10 | 1.0 |
| | | traffic (s) | 67,305 | 67,144 | 0.24 % | 36 of 1,103 | 1 | 10 / 10 | 0.9999 |

How to read the columns:
- *Cells changed … of N* compares against the number of cells lit in the published layer.
- *Top-10 cells shared* compares the ten busiest cells of the two versions (ties broken by cell order).

## Why exclusion is the better default
- **The patterns don't move.** Every layer keeps its ten busiest cells. The largest change to any total is 1.63 % (AmbroseValley traffic). Per-cell correlation is at least 0.9993.
- **What is removed is concentrated, not representative.** 14 of the 17 journeys come from one actor on one map. Kept in, they would weight one possibly automated client as 14 players.
- **The label stays true.** "Human heatmap" then means journeys that both README rules call human. A designer doesn't need to know about EC-09 to read it correctly.

The few cells lit only by unknown journeys (1–3 per traffic layer, 2 in the AmbroseValley kill layer) are lost from the heatmaps. Those journeys can still be seen in full in their match views.
