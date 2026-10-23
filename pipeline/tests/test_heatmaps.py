"""Grid maths: line tracing for traffic (D5) and event counts."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from lila_pipeline.heatmaps import count_grid, sparse_cells, trace_step, traffic_grid


def as_dict(cells: list[tuple[int, int, float]]) -> dict[tuple[int, int], float]:
    return {(i, j): pytest.approx(share) for i, j, share in cells}


def test_step_inside_one_cell() -> None:
    assert as_dict(trace_step(0.11, 0.11, 0.12, 0.12, grid=10)) == {(1, 1): 1.0}


def test_horizontal_step_split_by_distance() -> None:
    # from x = 1.5 to x = 3.5 cells: half a cell, a full cell, half a cell
    assert as_dict(trace_step(0.15, 0.55, 0.35, 0.55, grid=10)) == {(1, 5): 0.25, (2, 5): 0.5, (3, 5): 0.25}


def test_ec28_diagonal_step_visits_every_crossed_cell() -> None:
    cells = trace_step(0.05, 0.05, 0.35, 0.18, grid=10)  # crosses y = 1 at x ≈ 1.65, inside cell column 1
    assert sum(share for _, _, share in cells) == pytest.approx(1.0)
    assert {(i, j) for i, j, _ in cells} == {(0, 0), (1, 0), (1, 1), (2, 1), (3, 1)}


def test_step_through_a_grid_corner_skips_the_side_cells() -> None:
    assert {(i, j) for i, j, _ in trace_step(0.05, 0.05, 0.35, 0.15, grid=10)} == {(0, 0), (1, 0), (2, 1), (3, 1)}


def test_zero_length_step_and_map_edge() -> None:
    assert as_dict(trace_step(0.5, 0.5, 0.5, 0.5, grid=4)) == {(2, 2): 1.0}
    assert as_dict(trace_step(1.0, 1.0, 1.0, 1.0, grid=4)) == {(3, 3): 1.0}  # u = v = 1 is the last cell


def test_ec28_traffic_spreads_step_time_and_skips_long_gaps() -> None:
    positions = pd.DataFrame(
        {
            "file": ["a"] * 4,
            "epoch_s": [0, 10, 50, 55],  # 10 s step, then a 40 s gap (not traced), then 5 s
            "u": [0.15, 0.35, 0.05, 0.05],
            "v": [0.55, 0.55, 0.05, 0.05],
        }
    )
    seconds = traffic_grid(positions, grid=10)
    assert seconds.sum() == pytest.approx(15.0)
    assert seconds[1, 5] == pytest.approx(2.5) and seconds[2, 5] == pytest.approx(5.0) and seconds[3, 5] == pytest.approx(2.5)
    assert seconds[0, 0] == pytest.approx(5.0)


def test_steps_never_join_different_journeys() -> None:
    positions = pd.DataFrame({"file": ["a", "b"], "epoch_s": [0, 5], "u": [0.05, 0.95], "v": [0.05, 0.95]})
    assert traffic_grid(positions, grid=10).sum() == 0


def test_count_grid_and_sparse_cells() -> None:
    events = pd.DataFrame({"u": [0.01, 0.02, 0.99, 1.0], "v": [0.01, 0.02, 0.5, 1.0]})
    counts = count_grid(events, grid=4)
    assert sparse_cells(counts) == [[0, 0, 2], [3, 2, 1], [3, 3, 1]]
    assert sparse_cells(np.array([[0.04, 0.0], [0.0, 1.26]]), decimals=1) == [[1, 1, 1.3]]  # 0.04 rounds away
