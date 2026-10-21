"""World → minimap coordinates. The only place in the project where this conversion happens.

The pipeline stores UV (0–1) rather than pixels: the real minimaps are 4320², 2160×2158 and
9000² px (not the 1024 px the data README states), and UV stays valid whatever size an image
is resized to.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from numpy.typing import ArrayLike, NDArray


@dataclass(frozen=True)
class MapCalibration:
    """How a map's world (x, z) plane lines up with its minimap image (values from the data README).

    The world square from `origin` to `origin + scale` on both axes covers the whole image.
    """

    scale: float
    origin_x: float
    origin_z: float
    minimap_file: str


MAPS: dict[str, MapCalibration] = {
    "AmbroseValley": MapCalibration(900, -370, -473, "AmbroseValley_Minimap.png"),
    "GrandRift": MapCalibration(581, -290, -290, "GrandRift_Minimap.png"),
    "Lockdown": MapCalibration(1000, -500, -500, "Lockdown_Minimap.jpg"),
}


def world_to_uv(map_id: str, x: ArrayLike, z: ArrayLike) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Convert world (x, z) to UV: u grows to the right, v grows upward (with world z).

    `y` is elevation and plays no part in the 2D map. Values outside 0–1 are returned
    unchanged, never clamped, so callers can count and report them.
    """
    try:
        cal = MAPS[map_id]
    except KeyError:
        raise ValueError(f"unknown map {map_id!r}; expected one of {sorted(MAPS)}") from None
    u = (np.asarray(x, dtype=np.float64) - cal.origin_x) / cal.scale
    v = (np.asarray(z, dtype=np.float64) - cal.origin_z) / cal.scale
    return u, v


def add_uv(events: pd.DataFrame) -> pd.DataFrame:
    """Add `u` and `v` columns to rows from any mix of maps."""
    out = events.copy()
    out["u"] = np.nan
    out["v"] = np.nan
    for map_id, rows in out.groupby("map_id"):
        u, v = world_to_uv(str(map_id), rows["x"], rows["z"])
        out.loc[rows.index, "u"] = u
        out.loc[rows.index, "v"] = v
    return out


def uv_to_pixel(
    u: ArrayLike, v: ArrayLike, width: int, height: int
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Convert UV to image pixels with the origin at the top-left corner.

    v is flipped because image rows count downward while world z grows upward. Width and
    height are scaled separately, so non-square images (GrandRift is 2160×2158) work.
    """
    px = np.asarray(u, dtype=np.float64) * width
    py = (1.0 - np.asarray(v, dtype=np.float64)) * height
    return px, py
