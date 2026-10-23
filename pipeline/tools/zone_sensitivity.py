"""Grid-boundary and threshold sensitivity of the region analysis -> docs/evidence/spatial_analysis/zone_sensitivity.*

    cd pipeline && uv run python tools/zone_sensitivity.py

Uses the pipeline's own `lila_pipeline.zones` code, so what is tested is what ships. For every map, selection (all dates and
each date) and layer the region evidence (bootstrap included) is collected once on the baseline grid and on grids shifted
by half a region horizontally, vertically and both; the rules are then re-applied under many variants without redrawing
the resamples.

1. Shift check: of the baseline candidates, which pass the stability and support checks, and which of those survive the
   shifts, under two ways of matching regions geographically ("majority" and "dominant", see zones.py).
2. Threshold sensitivity: one rule changed at a time (and a stricter and a looser combination); how many consistent
   concentrations each map and layer keeps, and which baseline ones flip.
Nothing here changes the shipped files.
"""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

from lila_pipeline import export, zones
from lila_pipeline.build import prepare
from lila_pipeline.projection import MAPS

OUT = Path(__file__).resolve().parents[2] / "docs" / "evidence" / "spatial_analysis"
BASE = zones.RULES

VARIANTS: dict[str, zones.Rules] = {
    "baseline": BASE,
    "top 5% (not 10%)": replace(BASE, top_share=0.05),
    "top 15%": replace(BASE, top_share=0.15),
    "stability 0.7": replace(BASE, min_stability=0.7),
    "stability 0.9": replace(BASE, min_stability=0.9),
    "3 matches": replace(BASE, min_matches=3),
    "8 matches": replace(BASE, min_matches=8),
    "2 players": replace(BASE, min_players=2),
    "5 players": replace(BASE, min_players=5),
    "one-match cap 40%": replace(BASE, max_one_match_share=0.4),
    "one-match cap 60%": replace(BASE, max_one_match_share=0.6),
    "shift: survive 2 of 3": replace(BASE, required_shifts=2),
    "shift: majority rule": replace(BASE, survival_rule="majority"),
    "shift: majority rule, 2 of 3": replace(BASE, survival_rule="majority", required_shifts=2),
    "no shift check": replace(BASE, required_shifts=0),
    "looser (stab 0.7, 3 matches, 2 players, cap 60%, 2 of 3)": replace(BASE, min_stability=0.7, min_matches=3, min_players=2, max_one_match_share=0.6, required_shifts=2),
    "stricter (stab 0.9, 8 matches, 5 players, cap 40%)": replace(BASE, min_stability=0.9, min_matches=8, min_players=5, max_one_match_share=0.4),
}


def table(header: list[str], rows: list[list]) -> str:
    return "\n".join(["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"] + ["| " + " | ".join(str(c) for c in r) + " |" for r in rows])


def main() -> None:
    prepared = prepare()
    events = prepared.events
    result: dict = {"baseline_rules": zones.rules_as_dict(BASE), "variants": list(VARIANTS), "maps": {}}
    for map_id in MAPS:
        inputs = export.zone_inputs(map_id, events)
        map_out: dict = {}
        for key in export.selection_keys(inputs):
            chosen = export.selected_journeys(inputs, key)
            per_layer = {}
            for layer in zones.LAYERS:
                evidence = zones.collect(
                    inputs.tensors[layer][chosen], inputs.match_of[chosen], inputs.player_of[chosen],
                    key=f"{map_id}|{layer}|{key}", count_journeys=layer == "traffic",
                )
                variants = {}
                for name, rules in VARIANTS.items():
                    r = zones.classify(evidence, rules)
                    variants[name] = {
                        "consistent": r["consistent"],
                        "candidates": r["candidates"],
                        "consistent_zones": [[z["i"], z["j"]] for z in r["zones"] if z["tier"] == "consistent"],
                    }
                base = zones.classify(evidence, BASE)
                shifts = []
                for z in base["zones"]:
                    shifts.append(
                        {
                            "zone": [z["i"], z["j"]],
                            "value": z["value"],
                            "passes_baseline_checks": z["passes_stability_and_support"],
                            "stability": round(z["stability"], 2),
                            "matches": z["matches"],
                            "players": z["players"],
                            "largest_match_share": round(z["largest_match_share"], 3),
                            "checks": [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in c.items()} for c in z["shift_checks"]],
                            "survived_majority": sum(c["established_share"] >= BASE.survival_share for c in z["shift_checks"]),
                            "survived_dominant": sum(c["dominant_established"] for c in z["shift_checks"]),
                        }
                    )
                per_layer[layer] = {"variants": variants, "baseline_candidates": shifts}
            map_out[key] = {"matches": int(len(set(inputs.match_of[chosen]))), "layers": per_layer}
        result["maps"][map_id] = map_out
        print(map_id, "done", flush=True)
    (OUT / "zone_sensitivity.json").write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")

    # --- report tables --------------------------------------------------------------------------------------------
    lines = ["# Grid-shift and threshold sensitivity (generated by tools/zone_sensitivity.py)", ""]
    rows = []
    for map_id in MAPS:
        for layer in zones.LAYERS:
            cands = result["maps"][map_id]["all"]["layers"][layer]["baseline_candidates"]
            passed = [c for c in cands if c["passes_baseline_checks"]]
            rows.append(
                [map_id, layer, len(cands), len(passed)]
                + [sum(c["survived_majority"] == n for c in passed) for n in (3, 2, 1, 0)]
                + [sum(c["survived_dominant"] == n for c in passed) for n in (3, 2, 1, 0)]
            )
    lines += [
        "## 1. Shift check, all-dates selection",
        "",
        "Of the baseline candidates, those that pass the stability and support checks, and how many shifted grids (of 3) each survives.",
        "",
        table(["Map", "Layer", "Candidates", "Pass stability and support", "Majority rule: survive 3", "2", "1", "0", "Dominant rule: survive 3", "2", "1", "0"], rows),
        "",
    ]
    rows = []
    for map_id in MAPS:
        for layer in zones.LAYERS:
            r = [map_id, layer]
            for name in VARIANTS:
                r.append(result["maps"][map_id]["all"]["layers"][layer]["variants"][name]["consistent"])
            rows.append(r)
    lines += ["## 2. Consistent concentrations per rule variant, all-dates selection", "", table(["Map", "Layer"] + list(VARIANTS), rows), ""]
    rows = []
    for map_id in MAPS:
        for key, sel in result["maps"][map_id].items():
            if key == "all":
                continue
            for layer in zones.LAYERS:
                v = sel["layers"][layer]["variants"]
                rows.append([map_id, key, sel["matches"], layer, v["baseline"]["consistent"], v["looser (stab 0.7, 3 matches, 2 players, cap 60%, 2 of 3)"]["consistent"], v["shift: majority rule"]["consistent"], v["no shift check"]["consistent"]])
    lines += [
        "## 3. Single-date selections: consistent concentrations under the baseline, the looser rules, the stricter majority shift rule and without the shift check",
        "",
        table(["Map", "Date", "Matches", "Layer", "Baseline", "Looser", "Majority rule", "No shift check"], rows),
        "",
    ]
    (OUT / "zone_sensitivity.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("wrote", OUT / "zone_sensitivity.md")


if __name__ == "__main__":
    main()
