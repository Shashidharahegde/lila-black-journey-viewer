"""Turn the evidence JSON into the markdown tables of docs/evidence/spatial_analysis/REPORT.md.

    cd pipeline && uv run python tools/spatial_tables.py

Reads spatial_analysis.json, visual_encoding.json and zone_sensitivity.json from the evidence folder, and the shipped web/public/data/zones/*.json, fills the
{{PLACEHOLDERS}} of tools/spatial_report_template.md and writes REPORT.md next to them. No number in a table is typed by
hand. (Numbers quoted in the template's prose are checked against these tables by eye when the report is written.)
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVIDENCE = HERE.parents[1] / "docs" / "evidence" / "spatial_analysis"
MAPS = ("AmbroseValley", "GrandRift", "Lockdown")
LAYERS = ("kills", "deaths", "traffic")
SHORT = {"AmbroseValley": "AmbroseValley", "GrandRift": "GrandRift", "Lockdown": "Lockdown"}


def table(header: list[str], rows: list[list]) -> str:
    out = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def pct(x: float) -> str:
    return f"{round(100 * x)}%"


def fmt(v: float) -> str:
    return f"{v:,.0f}" if abs(v) >= 100 else f"{v:g}"


def distribution(S: dict) -> str:
    rows = []
    for m in MAPS:
        for L in LAYERS:
            d = S["maps"][m]["layers"][L]["by_resolution"]["64"]["distribution"]
            q = d["quantiles"]
            unit = " s" if L == "traffic" else ""
            rows.append(
                [m, L, fmt(d["total"]) + unit, f"{d['occupied_cells']:,} ({pct(d['occupied_share'])})",
                 pct(d["single_event_cell_share"]) if "single_event_cell_share" in d else "n/a",
                 f"{fmt(q['p50'])} / {fmt(q['p90'])} / {fmt(q['max'])}",
                 pct(d["top10_cells_share"]), pct(d["top10pct_cells_share"]), d["cells_for_50pct"], d["cells_for_80pct"], d["gini_occupied"]]
            )
    return table(["Map", "Layer", "Total recorded", "Occupied cells (share of 4,096)", "Single-event cells", "Cell value p50 / p90 / max", "Top 10 cells hold", "Top 10% of occupied cells hold", "Cells for 50% of total", "Cells for 80%", "Gini"], rows)


def value_bands(S: dict) -> str:
    rows = []
    for m in MAPS:
        for L in ("kills", "deaths"):
            b = S["maps"][m]["layers"][L]["by_resolution"]["64"]["distribution"]["bands"]
            rows.append([m, L] + [f"{b[k]['cells']} cells ({pct(b[k]['value_share'])} of events)" for k in b])
    return table(["Map", "Layer", "1 event", "2", "3-4", "5-9", "10 or more"], rows)


def resolution(S: dict) -> str:
    rows = []
    for m in MAPS:
        for L in LAYERS:
            for g in ("64", "32", "16"):
                e = S["maps"][m]["layers"][L]["by_resolution"][g]
                d, x = e["distribution"], e["match"]
                sh5, sh10 = x["split_half_random"]["top5"], x["split_half_random"]["top10"]
                rows.append(
                    [m if (L, g) == ("kills", "64") else "", L if g == "64" else "", f"{g}x{g}", d["occupied_cells"],
                     pct(d["single_event_cell_share"]) if "single_event_cell_share" in d else "n/a",
                     pct(d["top10_cells_share"]),
                     f"{sh5['exact_overlap_median']:.1f} (chance {sh5['chance_exact_median']:.1f})",
                     f"{sh10['exact_overlap_median']:.1f} (chance {sh10['chance_exact_median']:.1f})",
                     f"{x['bootstrap_top10']['freq>=0.8']['cells']} cells, {pct(x['bootstrap_top10']['freq>=0.8']['value_share'])}",
                     pct(x["support"]["value_in_supported_cells_share"])]
                )
    return table(["Map", "Layer", "Grid", "Occupied", "Single-event cells", "Top 10 cells hold", "Split-half overlap, top 5", "Split-half overlap, top 10", "Stable cells (in top 10 in >=80% of resamples)", "Value in cells with >=3 matches"], rows)


def support(S: dict) -> str:
    rows = []
    for m in MAPS:
        for L in LAYERS:
            e = S["maps"][m]["layers"][L]["by_resolution"]["64"]
            sm, sp = e["match"]["support"], e["player"]["support"]
            worst = max(t["largest_match_share"] for t in sm["top10"])
            rows.append([m, L, f"{sm['top10_min_matches']} / {sm['top10_median_matches']:g}", f"{sp['top10_min_matches']} / {sp['top10_median_matches']:g}", f"{sm['top10_cells_with_min_support']} of 10", pct(worst)])
    return table(["Map", "Layer", "Matches behind the 10 strongest cells (min / median)", "Players (min / median)", "Cells with >=3 matches", "Largest single-match share of any of them"], rows)


def vs_traffic(S: dict) -> str:
    rows = []
    for m in MAPS:
        for L in ("kills", "deaths"):
            e = S["maps"][m]["layers"][L]["by_resolution"]
            cells = []
            for g in ("64", "32", "16"):
                v = e[g]["vs_traffic"]
                cells.append(f"{v['rank_corr_with_traffic']:.2f}")
            v64 = e["64"]["vs_traffic"]
            rows.append([m, L] + cells + [pct(v64["share_of_events_in_top10pct_traffic_cells"]), v64["top10_cell_overlap_with_top10_traffic_cells"]])
    return table(["Map", "Layer", "Rank correlation with traffic, 64", "32", "16", "Events in the busiest 10% of traffic cells (64)", "Top-10 cells shared with top-10 traffic cells (64)"], rows)


def journeys(S: dict) -> str:
    rows = []
    for m in MAPS:
        o = S["maps"][m]
        for g in ("64", "16"):
            j = o["layers"]["traffic"]["by_resolution"][g]["journey_coverage"]
            rows.append([m if g == "64" else "", f"{g}x{g}", f"{o['human_journeys']} journeys, {o['distinct_human_players']} players" if g == "64" else "", f"{j['rank_corr_time_vs_journeys']:.2f}", pct(j["cells_where_one_journey_is_over_half_of_the_time_share"]), j["top10_overlap_time_vs_journeys"]])
    return table(["Map", "Grid", "Recorded", "Rank correlation, time vs journeys through the cell", "Cells where one journey is over half the time", "Top-10 overlap, time vs journeys"], rows)


def encoding(V: dict) -> str:
    rows = []
    for m in MAPS:
        for L in LAYERS:
            cont, allc, band, deu, pro, cdeu, weak = [], [], [], [], [], [], []
            for bg, e in V["maps"][m].items():
                x = e[L]
                cont.append(x["continuous_hotspots"]["levels_at_dE10"])
                weak.append(x["continuous_hotspots"]["weakest_vs_map_dE"])
                band.append(x["banded"]["min_adjacent_dE"])
                deu.append(x["banded_deuteranopia"]["min_adjacent_dE"])
                pro.append(x["banded_protanopia"]["min_adjacent_dE"])
                cdeu.append(x["continuous_hotspots_deuteranopia"]["levels_at_dE10"])
            rows.append([m if L == "kills" else "", L, f"{min(cont)}-{max(cont)}", f"{min(cdeu)}-{max(cdeu)}", f"{min(weak):g}-{max(weak):g}", f"{min(band):g}-{max(band):g}", f"{min(deu):g}-{max(deu):g}", f"{min(pro):g}-{max(pro):g}"])
    return table(["Map", "Layer", "Continuous: levels >=10 dE apart", "...with deuteranopia", "Weakest cell vs plain map (dE)", "4 bands: smallest gap between neighbours (dE)", "...deuteranopia", "...protanopia"], rows)


def bands(S: dict) -> str:
    rows = []
    for m in MAPS:
        for L in LAYERS:
            b = S["maps"][m]["layers"][L]["bands"]
            e = b["all"]["edges_raw"]
            unit = " s" if L == "traffic" else ""
            rows.append([m, L, fmt(b["domain_64"]) + unit, " / ".join(fmt(x) for x in e), " / ".join(str(c) for c in b["all"]["cells_per_band"])])
    return table(["Map", "Layer", "Fixed scale maximum (all dates)", "Band edges (raw value) at 25 / 50 / 75% of the scale", "Cells in the four bands (all dates)"], rows)


def zone_world_centre(i: int, j: int, info: dict) -> list[int]:
    u, v = (i + 0.5) / 16, (j + 0.5) / 16
    return [round(u * info["scale"] + info["origin_x"]), round(v * info["scale"] + info["origin_z"])]


def tiers(Z: dict) -> str:
    rows = []
    for m in MAPS:
        for L in LAYERS:
            a = Z[m]["selections"]["all"]["layers"][L]
            top = a["zones"][0]
            rows.append([m, L, a["occupied_zones"], a["candidates"], a["consistent"], a["candidates"] - a["consistent"],
                         f"{top['value']:g} ({pct(top['share'])}), {top['matches']} matches, {top['players']} players, in {pct(top['stability'])} of resamples, shifted grids {top['survived_shifts']} of 3, {top['tier']}"])
    return table(["Map", "Layer", "Occupied regions (16x16)", "Candidate regions (top decile)", "Consistent", "Observed", "Strongest region"], rows)


def zones_list(Z: dict, I: dict) -> str:
    out = []
    for m in MAPS:
        for L in LAYERS:
            a = Z[m]["selections"]["all"]["layers"][L]
            rows = []
            for k, z in enumerate(a["zones"]):
                extra = f", {z['journeys']} journeys" if "journeys" in z else (f", {z['storm_deaths']} storm" if z.get("storm_deaths") else "")
                rows.append([k + 1, [z["i"], z["j"]], zone_world_centre(z["i"], z["j"], I[m]), f"{z['value']:g}{extra}", pct(z["share"]), z["matches"], z["players"], pct(z["largest_match_share"]), f"{z['stability']:.2f}", f"{z['survived_shifts']} of 3", z["tier"]])
            out.append(f"**{m}, {L}**\n\n" + table(["#", "Region (i, j)", "Centre (world x, z)", "Value", "Share of layer", "Matches", "Players", "Largest match share", "Stability", "Shifted grids", "Tier"], rows))
    return "\n\n".join(out)


def by_date(Z: dict) -> str:
    rows = []
    for m in MAPS:
        for d, x in Z[m]["selections"].items():
            if d == "all":
                continue
            cell = lambda L: f"{x['layers'][L]['consistent']} / {x['layers'][L]['candidates']}"
            rows.append([m, d, x["matches"], cell("traffic"), f"{x['layers']['kills']['total']:g}: {cell('kills')}", f"{x['layers']['deaths']['total']:g}: {cell('deaths')}"])
    return table(["Map", "Date", "Matches", "Traffic (consistent / candidates)", "Kills (events: consistent / candidates)", "Deaths (events: consistent / candidates)"], rows)


def shift_table(Q: dict) -> str:
    rows = []
    for m in MAPS:
        for L in LAYERS:
            cands = Q["maps"][m]["all"]["layers"][L]["baseline_candidates"]
            passed = [c for c in cands if c["passes_baseline_checks"]]
            rows.append([m, L, len(cands), len(passed)] + [sum(c["survived_dominant"] == n for c in passed) for n in (3, 2, 1, 0)] + [sum(c["survived_majority"] == n for c in passed) for n in (3, 2, 1, 0)])
    return table(["Map", "Layer", "Candidates", "Pass stability and support", "Counterpart rule (used): survive 3 shifted grids", "2", "1", "0", "Stricter majority rule: survive 3", "2", "1", "0"], rows)


def fate(Q: dict, I: dict) -> str:
    rows = []
    for m in MAPS:
        for L in LAYERS:
            for c in Q["maps"][m]["all"]["layers"][L]["baseline_candidates"]:
                if c["passes_baseline_checks"] and c["survived_dominant"] == 3:
                    verdict, why = "consistent", ""
                else:
                    verdict = "observed"
                    reasons = []
                    if c["stability"] < 0.8:
                        reasons.append(f"stability {c['stability']:.2f}")
                    if c["matches"] < 5:
                        reasons.append(f"{c['matches']} matches")
                    if c["largest_match_share"] > 0.5:
                        reasons.append(f"{round(100 * c['largest_match_share'])}% from one match")
                    if c["passes_baseline_checks"]:
                        weak = [k for k in c["checks"] if not k["dominant_established"]]
                        parts = []
                        for k in weak:
                            if not k["dominant_is_candidate"]:
                                parts.append("counterpart outside the top decile")
                            elif k["dominant_stability"] < 0.8:
                                parts.append(f"counterpart stability {k['dominant_stability']:.2f}")
                            else:
                                parts.append("counterpart fails support")
                        reasons.append(f"shifted grids {c['survived_dominant']} of 3 (" + "; ".join(parts) + ")")
                    why = ", ".join(reasons)
                rows.append([m, L, c["zone"], zone_world_centre(c["zone"][0], c["zone"][1], I[m]), f"{c['value']:g}", verdict, why])
    return table(["Map", "Layer", "Region (i, j)", "Centre (world x, z)", "Value", "Verdict", "Why not consistent"], rows)


def variants(Q: dict) -> str:
    columns = ["baseline", "top 5% (not 10%)", "top 15%", "stability 0.7", "stability 0.9", "3 matches", "8 matches", "2 players", "5 players", "one-match cap 40%", "one-match cap 60%",
               "shift: survive 2 of 3", "shift: majority rule", "no shift check",
               "looser (stab 0.7, 3 matches, 2 players, cap 60%, 2 of 3)", "stricter (stab 0.9, 8 matches, 5 players, cap 40%)"]
    rows = [[m, L] + [Q["maps"][m]["all"]["layers"][L]["variants"][c]["consistent"] for c in columns] for m in MAPS for L in LAYERS]
    return table(["Map", "Layer"] + [c.replace("looser (stab 0.7, 3 matches, 2 players, cap 60%, 2 of 3)", "looser (see rules)").replace("stricter (stab 0.9, 8 matches, 5 players, cap 40%)", "stricter (see rules)") for c in columns], rows)


def main() -> None:
    S = json.loads((EVIDENCE / "spatial_analysis.json").read_text(encoding="utf-8"))
    V = json.loads((EVIDENCE / "visual_encoding.json").read_text(encoding="utf-8"))
    Q = json.loads((EVIDENCE / "zone_sensitivity.json").read_text(encoding="utf-8"))
    web_data = HERE.parents[1] / "web" / "public" / "data"
    Z = {m: json.loads((web_data / "zones" / f"{m}.json").read_text(encoding="utf-8")) for m in MAPS}
    I = json.loads((web_data / "index.json").read_text(encoding="utf-8"))["maps"]
    text = (HERE / "spatial_report_template.md").read_text(encoding="utf-8")
    rules = Z["AmbroseValley"]["rules"]
    fills = {
        "DISTRIBUTION": distribution(S), "VALUE_BANDS": value_bands(S), "RESOLUTION": resolution(S), "SUPPORT": support(S),
        "VS_TRAFFIC": vs_traffic(S), "JOURNEYS": journeys(S), "ENCODING": encoding(V), "BANDS": bands(S), "TIERS": tiers(Z),
        "ZONES": zones_list(Z, I), "BY_DATE": by_date(Z), "SHIFT_TABLE": shift_table(Q), "FATE": fate(Q, I), "VARIANTS": variants(Q),
        "PARAMS": ", ".join(f"{k} = {v}" for k, v in rules.items() if k != "bootstraps"),
        "SPLITS": str(S["splits"]), "BOOTSTRAPS": str(rules["bootstraps"]), "SEED": str(S["seed"]),
        "PLAYERS": "; ".join(f"{m}: {S['maps'][m]['distinct_human_players']} players in {S['maps'][m]['human_journeys']} journeys" for m in MAPS),
    }
    for key, value in fills.items():
        text = text.replace("{{" + key + "}}", value)
    leftover = [w for w in text.split() if w.startswith("{{")]
    if leftover:
        raise SystemExit(f"unfilled placeholders: {leftover}")
    (EVIDENCE / "REPORT.md").write_text(text, encoding="utf-8")
    print("wrote", EVIDENCE / "REPORT.md")


if __name__ == "__main__":
    main()
