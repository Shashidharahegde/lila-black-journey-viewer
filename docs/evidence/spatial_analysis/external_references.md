# External references (not our data)

Kept apart from the findings in `REPORT.md`. Nothing in the report depends on these; they shaped the questions asked.
Access date: 2026-10-23. Where a page could not be read in full, that is said.

## 1. GameAnalytics blog, "Balance and Flow Maps"
URL: https://www.gameanalytics.com/blog/balance-and-flow-maps (guest post by Sean Houghton, cross-posted from AltDevBlog; the
worked example is the Molten map of *Transformers: War for Cybertron*; the post is old, around 2014).
Read in full. What it says, in our words:
- Death heatmaps bin kills by the **victim's** location, kill heatmaps by the **killer's**; a **balance map** subtracts deaths from
  kills per bin; a **normalised** balance map divides by the bin's sample count; a **flow map** averages kill direction per bin.
- Smaller bins reduce spatial blur but add noise; the author says each bin needs "at least a few hundred samples", that balance
  maps need far more data than a small playtest produces, and that sparse outer areas stay noisy even with millions of rows.
- Spawn-point clusters have abnormal counts and should be disregarded; both killer and victim positions are needed for each kill.

How we used it: it is the source of the questions "how many samples per cell?" and "do we have both sides of a kill?". Our
strongest 64 × 64 cell holds at most 25 events (AmbroseValley kills), and even our strongest 16 × 16 kill zone holds 139
(AmbroseValley), 19 (GrandRift) and 36 (Lockdown), well below "a few hundred", so the post's own guidance says 64 × 64
kill and death cells are under-sampled here. Our data records one side of each event only (the file owner's position), so
**balance and flow maps are not attempted**. These are the post's claims about its game, not tested on ours.

## 2. Daria Rodionova, "A Heatmap guide for game level analysis" (Medium)
URL: https://medium.com/@dariarodionovano/a-heatmap-guide-for-game-level-analysis-68cb6a7bcb2b
**Only a search-result summary was available: fetching the page returned HTTP 403.** So only these points were used, as
reported by that summary and not checked against the full text: the guide frames heatmaps around level-design questions (are
areas skipped, does movement match the intended design), and it criticises continuous colour scales as hard to read, losing
subtle shading, and worse for viewers with colour-vision deficiency.

How we used it: it motivated Task 3 (continuous glow versus a few bands, and colour-vision checks). Our own measurements are in
`REPORT.md` section 4 and are independent of the article: they reproduce the concern for the kill palette and contradict a blanket
version of it for traffic.

## 3. Colour-vision simulation
Machado, Oliveira and Fernandes, "A Physiologically-based Model for Simulation of Color Vision Deficiency", IEEE TVCG 2009 (the
deuteranopia and protanopia matrices at full severity). Used as a method, from memory of the published matrices; the report says so.
The CIELAB dE76 distance is the standard CIE 1976 formula.

## 4. Related reading surfaced by the search (not used for any claim)
Azur Games' write-up on heatmaps in mid-core games (https://azurgames.com/blog/game-development-analytics-how-we-use-heatmaps-in-midcore-games/);
Game Developer, "Using Heat Maps To Improve Track Design" (https://www.gamedeveloper.com/design/using-heat-maps-to-improve-track-design).
