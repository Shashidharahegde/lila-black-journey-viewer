"""World → minimap conversion: README reference, corners, centre, orientation, non-square images."""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from lila_pipeline.ingest import DEFAULT_DATA_DIR
from lila_pipeline.projection import MAPS, uv_to_pixel, world_to_uv

# Real minimap sizes (EC-17); test_ec17_real_minimap_sizes checks them against the files.
IMAGE_SIZES = {"AmbroseValley": (4320, 4320), "GrandRift": (2160, 2158), "Lockdown": (9000, 9000)}


def project(map_id: str, x: float, z: float, width: int, height: int) -> tuple[float, float]:
    u, v = world_to_uv(map_id, x, z)
    px, py = uv_to_pixel(u, v, width, height)
    return float(px), float(py)


def test_readme_reference_example() -> None:
    u, v = world_to_uv("AmbroseValley", -301.45, -355.55)
    assert float(u) == pytest.approx(0.0762, abs=1e-4)
    assert float(v) == pytest.approx(0.1305, abs=1e-4)
    px, py = uv_to_pixel(u, v, 1024, 1024)
    assert (round(float(px)), round(float(py))) == (78, 890)


@pytest.mark.parametrize("map_id", sorted(MAPS))
def test_world_corners_land_on_image_corners(map_id: str) -> None:
    cal = MAPS[map_id]
    width, height = IMAGE_SIZES[map_id]
    west, east = cal.origin_x, cal.origin_x + cal.scale
    south, north = cal.origin_z, cal.origin_z + cal.scale
    assert project(map_id, west, south, width, height) == pytest.approx((0, height))
    assert project(map_id, east, south, width, height) == pytest.approx((width, height))
    assert project(map_id, west, north, width, height) == pytest.approx((0, 0))
    assert project(map_id, east, north, width, height) == pytest.approx((width, 0))


@pytest.mark.parametrize("map_id", sorted(MAPS))
def test_world_centre_lands_on_image_centre(map_id: str) -> None:
    cal = MAPS[map_id]
    width, height = IMAGE_SIZES[map_id]
    centre_x, centre_z = cal.origin_x + cal.scale / 2, cal.origin_z + cal.scale / 2
    assert project(map_id, centre_x, centre_z, width, height) == pytest.approx((width / 2, height / 2))


@pytest.mark.parametrize("map_id", sorted(MAPS))
def test_orientation_x_right_z_up(map_id: str) -> None:
    width, height = IMAGE_SIZES[map_id]
    px0, py0 = project(map_id, 0, 0, width, height)
    px_east, py_east = project(map_id, 10, 0, width, height)
    px_north, py_north = project(map_id, 0, 10, width, height)
    assert px_east > px0 and py_east == pytest.approx(py0)
    assert py_north < py0 and px_north == pytest.approx(px0)  # image rows count downward


def test_ec21_grandrift_non_square_image_scales_axes_separately() -> None:
    width, height = IMAGE_SIZES["GrandRift"]
    cal = MAPS["GrandRift"]
    assert project("GrandRift", cal.origin_x + cal.scale / 2, cal.origin_z + cal.scale / 2, width, height) == (
        pytest.approx(1080),
        pytest.approx(1079),
    )
    px, py = uv_to_pixel(1.0, 0.0, width, height)
    assert (float(px), float(py)) == (2160, 2158)


def test_out_of_bounds_values_are_not_clamped() -> None:
    cal = MAPS["GrandRift"]
    u, v = world_to_uv("GrandRift", cal.origin_x - 10, cal.origin_z + cal.scale + 10)
    assert float(u) < 0 and float(v) > 1


def test_vector_input() -> None:
    u, v = world_to_uv("Lockdown", np.array([-500.0, 0.0, 500.0], dtype=np.float32), np.array([-500.0, 0.0, 500.0]))
    assert u.tolist() == [0.0, 0.5, 1.0] and v.tolist() == [0.0, 0.5, 1.0]


def test_unknown_map_is_rejected() -> None:
    with pytest.raises(ValueError, match="unknown map"):
        world_to_uv("Atlantis", 0, 0)


def test_ec17_real_minimap_sizes() -> None:
    folder = DEFAULT_DATA_DIR / "minimaps"
    if not folder.is_dir():
        pytest.skip("raw minimaps not unzipped")
    for map_id, cal in MAPS.items():
        with Image.open(folder / cal.minimap_file) as image:
            assert image.size == IMAGE_SIZES[map_id]


def test_all_recorded_positions_fall_inside_their_map(clocked_events) -> None:
    for map_id, rows in clocked_events.groupby("map_id"):
        u, v = world_to_uv(map_id, rows["x"], rows["z"])
        assert ((u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)).all(), map_id
