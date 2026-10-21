"""Minimaps for the web: WebP, never larger than MAX_SIDE, never upscaled."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from lila_pipeline.projection import MAPS

MAX_SIDE = 4096
WEBP_QUALITY = 85

Image.MAX_IMAGE_PIXELS = None  # Lockdown's minimap is 9000×9000 (81 Mpx), above Pillow's default guard


def web_size(width: int, height: int, max_side: int = MAX_SIDE) -> tuple[int, int]:
    """Output size: scale down so the longest side is at most max_side, keeping the aspect ratio.

    GrandRift (2160×2158) stays as it is; upscaling would add bytes, not detail.
    """
    factor = min(1.0, max_side / max(width, height))
    return round(width * factor), round(height * factor)


def source_size(minimap_dir: Path, map_id: str) -> tuple[int, int]:
    with Image.open(minimap_dir / MAPS[map_id].minimap_file) as image:
        return image.size


def export_minimap(minimap_dir: Path, map_id: str, out_dir: Path) -> tuple[int, int]:
    """Write `<out_dir>/<map_id>.webp` and return its size.

    The images are fully opaque (EC-20), so the alpha channel is dropped.
    """
    with Image.open(minimap_dir / MAPS[map_id].minimap_file) as image:
        size = web_size(*image.size)
        converted = image.convert("RGB")
        if size != converted.size:
            converted = converted.resize(size, Image.Resampling.LANCZOS)
    out_dir.mkdir(parents=True, exist_ok=True)
    converted.save(out_dir / f"{map_id}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
    return size
