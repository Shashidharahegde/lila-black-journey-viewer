# Hotspot rules: before and after (2026-10-24)

Measured by running both versions on the real data: the 57 selections (3 maps, all dates plus each date, times 3 layers = 19 per layer).

**Before:** top decile of occupied 16×16 regions; kept if stable in ≥ 80% of 300 match-resamples, ≥ 5 matches, ≥ 3 players, no match over 50%, and surviving three half-region grid shifts.
**After:** every occupied 16×16 region ranked by value; kept if events from ≥ 5 matches and no match over 50%; at most 6 per layer.

| Layer | Selections with no hotspot | Hotspots per selection, median (max) | Share of the layer's total held by the hotspots, median | Hotspots in total |
|---|---|---|---|---|
| Traffic | 6 → 4 | 2 → 6 (7 → 6) | 10% → 24% | 39 → 89 |
| Kills | 16 → 9 | 0 → 1 (5 → 6) | 9% → 35% | 7 → 53 |
| Deaths | 17 → 13 | 0 → 0 (1 → 6) | 9% → 40% | 2 → 29 |

(Share medians are over the selections that have at least one hotspot: traffic 13 → 15, kills 3 → 10, deaths 2 → 6.)

All dates, per map (traffic / kills / deaths):

| Map | Before | After |
|---|---|---|
| AmbroseValley | 7 / 5 / 1 | 6 / 6 / 6 |
| GrandRift | 3 / 0 / 0 | 6 / 6 / 0 |
| Lockdown | 1 / 0 / 1 | 6 / 6 / 4 |

Every region that was a hotspot before and is not now: 5 traffic regions (34 of 39 kept). All 7 kill and 2 death hotspots kept. The rest of the "after" count is new regions that the stability and shifted-grid checks used to leave out.

What the change gives up: stability across resamples and the grid-shift check are no longer measured, so a hotspot can now be an area that only looks strong because of where the region grid falls. The ≥ 5 matches and ≤ 50% rules limit this but do not remove it. GrandRift deaths still has no hotspot (no region reaches 5 matches).
