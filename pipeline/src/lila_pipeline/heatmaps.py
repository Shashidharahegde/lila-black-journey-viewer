"""Heatmap grids over minimap UV space.

Cell (i, j) covers u ∈ [i/GRID, (i+1)/GRID) and v ∈ [j/GRID, (j+1)/GRID): i runs west → east,
j runs south → north (v grows upward, like world z). u or v exactly 1.0 falls in the last cell.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from lila_pipeline.journeys import MAX_PATH_GAP_S

GRID = 64


def _cell(value: float, grid: int) -> int:
    return min(max(int(math.floor(value)), 0), grid - 1)


def trace_step(u0: float, v0: float, u1: float, v1: float, grid: int = GRID) -> list[tuple[int, int, float]]:
    """Cells a straight step from (u0, v0) to (u1, v1) passes through, with the share of its length in each.

    The shares add up to 1. A step that doesn't move puts everything in its one cell.
    """
    x0, y0, x1, y1 = u0 * grid, v0 * grid, u1 * grid, v1 * grid
    dx, dy = x1 - x0, y1 - y0
    cuts = {0.0, 1.0}
    for start, delta in ((x0, dx), (y0, dy)):
        if delta == 0:
            continue
        low, high = sorted((start, start + delta))
        for line in range(math.floor(low) + 1, math.ceil(high)):
            cuts.add((line - start) / delta)
    bounds = sorted(cuts)
    shares: dict[tuple[int, int], float] = {}
    for a, b in zip(bounds, bounds[1:]):
        middle = (a + b) / 2
        key = (_cell(x0 + dx * middle, grid), _cell(y0 + dy * middle, grid))
        shares[key] = shares.get(key, 0.0) + (b - a)
    if not shares:  # zero-length step
        shares[(_cell(x0, grid), _cell(y0, grid))] = 1.0
    return [(i, j, share) for (i, j), share in shares.items()]


def traffic_grid(positions: pd.DataFrame, grid: int = GRID) -> np.ndarray:
    """Seconds of movement per cell, following each step's straight line (D5).

    Each pair of consecutive positions in a journey (no more than MAX_PATH_GAP_S apart)
    spreads its duration across the cells its line crosses, in proportion to the distance
    inside each. Longer gaps add nothing: where the player went is unknown. Expects one or
    more journeys sorted by time, with columns file, epoch_s, u, v.
    """
    seconds = np.zeros((grid, grid))
    for _, journey in positions.groupby("file", sort=False):
        t = journey["epoch_s"].to_numpy()
        u = journey["u"].to_numpy(dtype=float)
        v = journey["v"].to_numpy(dtype=float)
        for k in range(len(t) - 1):
            duration = t[k + 1] - t[k]
            if duration <= 0 or duration > MAX_PATH_GAP_S:
                continue
            for i, j, share in trace_step(u[k], v[k], u[k + 1], v[k + 1], grid):
                seconds[i, j] += duration * share
    return seconds


def count_grid(events: pd.DataFrame, grid: int = GRID) -> np.ndarray:
    """Number of events per cell."""
    counts = np.zeros((grid, grid))
    i = np.clip(np.floor(events["u"].to_numpy(dtype=float) * grid).astype(int), 0, grid - 1)
    j = np.clip(np.floor(events["v"].to_numpy(dtype=float) * grid).astype(int), 0, grid - 1)
    np.add.at(counts, (i, j), 1)
    return counts


def sparse_cells(grid_values: np.ndarray, decimals: int = 0) -> list[list[float]]:
    """Cells that are non-zero after rounding, as [i, j, value], in (i, j) order."""
    rounded = np.round(grid_values, decimals)
    i, j = np.nonzero(rounded)
    return [[int(a), int(b), int(c) if decimals == 0 else float(c)] for a, b, c in zip(i, j, rounded[i, j])]
