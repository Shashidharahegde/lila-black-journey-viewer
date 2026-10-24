"""Region statistics for the interpretation layer (spec 06, Stage 6b).

The 64 x 64 heatmap grids stay the authoritative numbers. This module adds a separate, coarser view of the same events:
**regions** of 4 x 4 cells (16 x 16 regions per map), each with how much was recorded there and how well that is supported.

Definitions, for every layer
----------------------------
* **Value** of a region: kills = counted kills (`counted_kills`), deaths = death rows (`DEATH_CATEGORIES`, storm deaths included,
  counted separately in `storm_deaths`), traffic = estimated seconds of human movement (the D5 traced grid, summed over the
  region's cells). Humans only.
* **Contributing match:** a match with a positive value in the region (kills: at least one counted kill there; deaths: at
  least one death; traffic: at least one traced second).
* **Contributing player:** a recorded human player (all of one player's journeys in the selection together) with a positive
  value there. Real IDs never leave this module; only counts are written.
* **Largest match share:** the largest single match's value in the region divided by the region's value (kills and deaths:
  its events; traffic: its seconds).
* **Journeys through the region** (traffic only): human journeys with traced time in the region (distinct, from the same
  traced movement as the traffic values; not a count of events).
* **Candidates:** the top decile of occupied regions by value (at least 3), in the selection being looked at.
* **Stability:** the share of `bootstraps` resamples of the selection's matches (with replacement, fixed seed) in which the
  region is again among the candidates (candidate count fixed from the full selection). Sampling stability inside this
  sample; it is not a significance test and says nothing about other players or builds.
* **Grid-shift survival:** the analysis is repeated on grids shifted by half a region horizontally, vertically and both (the same
  resamples). A region survives a shift when its geographic counterpart (the shifted region that holds the largest part of its
  value, not the region with the same cell indices) passes the same stability and support checks. The stricter "majority"
  rule (at least half of its value inside qualifying shifted regions) is kept as a sensitivity variant.
* **Consistent concentration:** a candidate that passes every check below. Everything else among the candidates is an
  **observed concentration** with its measurements kept.

Everything is deterministic: seeds come from the map, layer and selection, so a rebuild gives byte-identical files.
"""

from __future__ import annotations

import math
import zlib
from dataclasses import asdict, dataclass, replace

import numpy as np

from lila_pipeline.heatmaps import GRID

ZONE_CELLS = 4  # cells per region side
ZONES = GRID // ZONE_CELLS  # regions per side (16)
SHIFTS: tuple[tuple[int, int], ...] = ((0, 0), (ZONE_CELLS // 2, 0), (0, ZONE_CELLS // 2), (ZONE_CELLS // 2, ZONE_CELLS // 2))
SEED = 20261023
LAYERS = ("kills", "deaths", "traffic")


@dataclass(frozen=True)
class Rules:
    """The qualification rules. Provisional (S, 2026-10-23): change one here and the files and tests follow."""

    top_share: float = 0.10  # candidates: top decile of occupied regions ...
    min_candidates: int = 3  # ... and at least this many
    min_stability: float = 0.8
    min_matches: int = 5
    min_players: int = 3
    max_one_match_share: float = 0.5
    survival_rule: str = "dominant"  # "dominant": the shifted region holding most of its value must pass the same checks;
    #                                  "majority": at least survival_share of its value must lie in regions that do
    survival_share: float = 0.5
    required_shifts: int = 3  # out of the three shifted grids
    bootstraps: int = 300


RULES = Rules()


def zone_of_cell(shift: tuple[int, int] = (0, 0)) -> tuple[np.ndarray, int, int]:
    """Region index of each of the 4,096 cells (flat index i * 64 + j) for a grid shifted by `shift` cells.

    A shifted grid has one more region per shifted axis, whose first and last regions are partial (half the cells)."""
    si, sj = shift
    ni, nj = (GRID + si - 1) // ZONE_CELLS + 1, (GRID + sj - 1) // ZONE_CELLS + 1
    i, j = np.divmod(np.arange(GRID * GRID), GRID)
    return ((i + si) // ZONE_CELLS) * nj + (j + sj) // ZONE_CELLS, ni, nj


def aggregator(shift: tuple[int, int]) -> tuple[np.ndarray, int, int, np.ndarray]:
    """(cells x regions) 0/1 matrix, regions per axis, and the region of every cell."""
    zone, ni, nj = zone_of_cell(shift)
    a = np.zeros((GRID * GRID, ni * nj))
    a[np.arange(GRID * GRID), zone] = 1.0
    return a, ni, nj, zone


@dataclass
class GridEvidence:
    """Everything measured about one (possibly shifted) region grid in one selection and layer."""

    shift: tuple[int, int]
    ni: int
    nj: int
    zone_of_cell: np.ndarray
    value: np.ndarray
    matches: np.ndarray
    players: np.ndarray
    journeys: np.ndarray | None
    largest_match_share: np.ndarray
    boot_values: np.ndarray  # (bootstraps, regions): the region values in each resample
    jitter: np.ndarray  # fixed tie-breaking noise for the same resamples


@dataclass
class LayerEvidence:
    layer: str
    n_matches: int
    n_players: int
    cell_total: np.ndarray  # (4096,)
    storm_cells: np.ndarray | None
    grids: list[GridEvidence]


def _seed(key: str) -> int:
    return (zlib.crc32(key.encode("utf-8")) + SEED) % (2**32)


def collect(
    tensor: np.ndarray,
    match_ids: np.ndarray,
    player_ids: np.ndarray,
    key: str,
    rules: Rules = RULES,
    count_journeys: bool = False,
    storm: np.ndarray | None = None,
    shifts: tuple[tuple[int, int], ...] = SHIFTS,
) -> LayerEvidence:
    """Measure a layer's regions in a selection. `tensor` is (journeys, 64, 64) values; match_ids / player_ids label each journey."""
    flat = np.asarray(tensor, dtype=np.float64).reshape(tensor.shape[0], GRID * GRID)
    _, match_idx = np.unique(match_ids, return_inverse=True)
    _, player_idx = np.unique(player_ids, return_inverse=True)
    n_matches, n_players = int(match_idx.max()) + 1, int(player_idx.max()) + 1
    match_flat = np.zeros((n_matches, GRID * GRID))
    np.add.at(match_flat, match_idx, flat)
    player_flat = np.zeros((n_players, GRID * GRID))
    np.add.at(player_flat, player_idx, flat)
    cell_total = flat.sum(axis=0)

    rng = np.random.default_rng(_seed(key))
    draws = rng.integers(0, n_matches, size=(rules.bootstraps, n_matches))
    weights = np.stack([np.bincount(row, minlength=n_matches) for row in draws]).astype(np.float64) if rules.bootstraps else np.zeros((0, n_matches))
    boot_cells = weights @ match_flat

    grids = []
    for shift in shifts:
        a, ni, nj, zone = aggregator(shift)
        value = cell_total @ a
        per_match = match_flat @ a
        largest = np.divide(per_match.max(axis=0), value, out=np.zeros_like(value), where=value > 0)
        grids.append(
            GridEvidence(
                shift=shift,
                ni=ni,
                nj=nj,
                zone_of_cell=zone,
                value=value,
                matches=(per_match > 0).sum(axis=0),
                players=((player_flat @ a) > 0).sum(axis=0),
                journeys=((flat @ a) > 0).sum(axis=0) if count_journeys else None,
                largest_match_share=largest,
                boot_values=boot_cells @ a,
                jitter=rng.random((rules.bootstraps, ni * nj)) * 1e-6,
            )
        )
    return LayerEvidence(layer="", n_matches=n_matches, n_players=n_players, cell_total=cell_total, storm_cells=None if storm is None else storm.reshape(-1).astype(np.float64), grids=grids)


def candidate_count(grid: GridEvidence, rules: Rules) -> int:
    occupied = int((grid.value > 0).sum())
    return 0 if occupied == 0 else max(rules.min_candidates, math.ceil(rules.top_share * occupied))


def top_regions(grid: GridEvidence, k: int) -> np.ndarray:
    """The k regions with the largest value (ties by index), never including empty ones."""
    order = np.lexsort((np.arange(grid.value.size), -grid.value))
    return order[: min(k, int((grid.value > 0).sum()))]


def stability(grid: GridEvidence, k: int) -> np.ndarray:
    """For every region: the share of resamples in which it is among the k strongest."""
    if k == 0:
        return np.zeros(grid.value.size)
    score = np.where(grid.boot_values > 0, grid.boot_values + grid.jitter, -np.inf)
    take = min(k, grid.value.size)
    chosen = np.argpartition(-score, take - 1, axis=1)[:, :take]
    valid = np.take_along_axis(grid.boot_values, chosen, axis=1) > 0
    hits = np.bincount(chosen[valid], minlength=grid.value.size)
    return hits / grid.boot_values.shape[0]


def established(grid: GridEvidence, rules: Rules) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(candidate regions, stability of every region, boolean per region: passes stability and support)."""
    k = candidate_count(grid, rules)
    candidates = top_regions(grid, k)
    freq = stability(grid, k)
    passes = np.zeros(grid.value.size, dtype=bool)
    ok = (
        (freq[candidates] >= rules.min_stability)
        & (grid.matches[candidates] >= rules.min_matches)
        & (grid.players[candidates] >= rules.min_players)
        & (grid.largest_match_share[candidates] <= rules.max_one_match_share)
    )
    passes[candidates[ok]] = True
    return candidates, freq, passes


def survives(check: dict, rules: Rules) -> bool:
    if rules.survival_rule == "dominant":
        return check["dominant_established"]
    return check["established_share"] >= rules.survival_share


def classify(evidence: LayerEvidence, rules: Rules = RULES) -> dict:
    """Candidates of the unshifted grid with their measurements, checks, and tier (`consistent` or `observed`)."""
    base = evidence.grids[0]
    candidates, freq, passes = established(base, rules)
    shifted = [established(g, rules) for g in evidence.grids[1:]]
    shifted_passes = [passes_g for _, _, passes_g in shifted]
    total = evidence.cell_total
    layer_total = float(total.sum())

    zones = []
    for z in candidates:
        cells = np.flatnonzero(base.zone_of_cell == z)
        mass = total[cells]
        checks = []
        for g, (cand_g, freq_g, passed) in zip(evidence.grids[1:], shifted):
            by_region = np.bincount(g.zone_of_cell[cells], weights=mass, minlength=g.value.size)
            dominant = int(np.argmax(by_region))
            checks.append(
                {
                    "established_share": float(by_region[passed].sum() / base.value[z]),
                    "dominant_share": float(by_region[dominant] / base.value[z]),
                    "dominant_established": bool(passed[dominant]),
                    "dominant_is_candidate": bool(dominant in set(cand_g.tolist())),
                    "dominant_stability": float(freq_g[dominant]),
                    "dominant_matches": int(g.matches[dominant]),
                    "dominant_players": int(g.players[dominant]),
                    "dominant_largest_match_share": float(g.largest_match_share[dominant]),
                }
            )
        survived = sum(survives(c, rules) for c in checks)
        consistent = bool(passes[z]) and survived >= rules.required_shifts
        record = {
            "i": int(z // base.nj),
            "j": int(z % base.nj),
            "value": float(base.value[z]),
            "share": float(base.value[z] / layer_total) if layer_total > 0 else 0.0,
            "matches": int(base.matches[z]),
            "players": int(base.players[z]),
            "largest_match_share": float(base.largest_match_share[z]),
            "stability": float(freq[z]),
            "passes_stability_and_support": bool(passes[z]),
            "survived_shifts": survived,
            "shift_checks": checks,
            "tier": "consistent" if consistent else "observed",
        }
        if base.journeys is not None:
            record["journeys"] = int(base.journeys[z])
        if evidence.storm_cells is not None:
            record["storm_deaths"] = float(evidence.storm_cells[cells].sum())
        zones.append(record)
    result = {
        "total": layer_total,
        "occupied_zones": int((base.value > 0).sum()),
        "candidates": len(zones),
        "consistent": sum(z["tier"] == "consistent" for z in zones),
        "zones": zones,
    }
    if evidence.storm_cells is not None:
        result["storm_deaths"] = float(evidence.storm_cells.sum())  # the whole selection's storm deaths, among the deaths
    return result


@dataclass(frozen=True)
class HotspotRules:
    """What makes a region a hotspot (S, 2026-10-24). Replaces the stability and shifted-grid checks of `Rules`/`classify`."""

    min_matches: int = 5  # events from at least this many different matches, so a one-off never counts
    max_one_match_share: float = 0.5  # no single match supplies more than this share of the region's value
    max_hotspots: int = 6  # at most this many per layer, strongest first


HOTSPOT_RULES = HotspotRules()
# `collect` needs no resamples or shifted grids for hotspots
HOTSPOT_EVIDENCE = {"rules": replace(RULES, bootstraps=0), "shifts": ((0, 0),)}


def hotspots(evidence: LayerEvidence, rules: HotspotRules = HOTSPOT_RULES) -> dict:
    """The hotspots of a layer in a selection: the regions with the largest value that pass both support checks, at most
    `rules.max_hotspots`, strongest first (ties by index). Fewer, or none, when fewer regions qualify."""
    base = evidence.grids[0]
    total = evidence.cell_total
    layer_total = float(total.sum())
    order = np.lexsort((np.arange(base.value.size), -base.value))
    supported = (base.value > 0) & (base.matches >= rules.min_matches) & (base.largest_match_share <= rules.max_one_match_share)
    zones_out = []
    for z in (int(r) for r in order if supported[r]):
        if len(zones_out) == rules.max_hotspots:
            break
        record = {
            "i": int(z // base.nj),
            "j": int(z % base.nj),
            "value": float(base.value[z]),
            "share": float(base.value[z] / layer_total) if layer_total > 0 else 0.0,
            "matches": int(base.matches[z]),
            "players": int(base.players[z]),
            "largest_match_share": float(base.largest_match_share[z]),
        }
        if base.journeys is not None:
            record["journeys"] = int(base.journeys[z])
        if evidence.storm_cells is not None:
            record["storm_deaths"] = float(evidence.storm_cells[np.flatnonzero(base.zone_of_cell == z)].sum())
        zones_out.append(record)
    result = {"total": layer_total, "occupied_zones": int((base.value > 0).sum()), "hotspots": len(zones_out), "zones": zones_out}
    if evidence.storm_cells is not None:
        result["storm_deaths"] = float(evidence.storm_cells.sum())
    return result


def rules_as_dict(rules: HotspotRules = HOTSPOT_RULES) -> dict:
    return asdict(rules)
