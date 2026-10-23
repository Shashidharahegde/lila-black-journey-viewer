// Draws one heatmap layer as a translucent picture in map (UV) space (spec 06).
//
// The 64 × 64 cells stay the numbers. This only paints them: each non-zero cell becomes a soft bump
// centred on the cell, with a bounded falloff. A bump's peak opacity and colour come from the cell's own
// value, so an isolated cell shows exactly its own intensity at its centre and nothing is added up
// across neighbours (no invented peaks); where bumps overlap the stronger one wins the opacity, and the
// colours blend weighted by the square of each bump, so a strong cell keeps its own bright colour instead
// of being averaged towards its dimmer neighbours (S, 2026-10-23: hotspots stand out more). Nothing here reads or changes the raw values, and hover reads the cells, not these pixels.
//
// The picture covers the whole minimap, row 0 = north, so it is placed with the minimap's own bounds and
// follows each map's aspect ratio (GrandRift's is not square) without any extra maths.
import type { HeatmapCell, HeatmapLayerKey } from '../data/types'
import { HEATMAP_GRID } from './grid'
import { baseColor, cellStyle, type HeatmapMode } from './scale'

export interface RasterOptions {
  /** texture pixels per cell side */
  scale: number
  /** size of the soft edge, in cells (Gaussian σ) */
  sigmaCells: number
  /** where the falloff reaches zero, in σ */
  reachSigmas: number
}

/** Display-only smoothing, in one place: about a cell of falloff either side, bounded at 2.4 cells. */
export const RASTER: RasterOptions = { scale: 8, sigmaCells: 1, reachSigmas: 2.4 }

export interface Raster {
  width: number
  height: number
  /** RGBA, row 0 = north, not premultiplied */
  data: Uint8ClampedArray<ArrayBuffer>
}

/** Texture pixel (column, row from the north) of the centre of cell (i, j). Fractional: pixel centres sit at k + 0.5. */
export function cellCentrePixel(i: number, j: number, grid = HEATMAP_GRID, scale = RASTER.scale): [number, number] {
  return [(i + 0.5) * scale - 0.5, (grid - (j + 0.5)) * scale - 0.5]
}

export function renderRaster(
  cells: readonly HeatmapCell[],
  layer: HeatmapLayerKey,
  mode: HeatmapMode,
  domain: number,
  grid = HEATMAP_GRID,
  options: RasterOptions = RASTER,
): Raster {
  const { scale, sigmaCells, reachSigmas } = options
  const size = grid * scale
  const alpha = new Float32Array(size * size)
  const weight = new Float32Array(size * size)
  const red = new Float32Array(size * size)
  const green = new Float32Array(size * size)
  const blue = new Float32Array(size * size)

  const sigma = sigmaCells * scale
  const reach = Math.ceil(sigma * reachSigmas)
  const edge = Math.exp(-(reachSigmas * reachSigmas) / 2) // so the bump is exactly 0 at its reach
  const twoSigmaSq = 2 * sigma * sigma

  for (const [i, j, value] of cells) {
    const style = cellStyle(layer, mode, value, domain)
    if (style === null) continue
    const peak = style.alpha
    const [r, g, b] = style.color
    const cx = (i + 0.5) * scale
    const cy = (grid - (j + 0.5)) * scale
    const x0 = Math.max(0, Math.floor(cx - reach))
    const x1 = Math.min(size - 1, Math.ceil(cx + reach))
    const y0 = Math.max(0, Math.floor(cy - reach))
    const y1 = Math.min(size - 1, Math.ceil(cy + reach))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        const g0 = Math.exp(-(dx * dx + dy * dy) / twoSigmaSq)
        if (g0 <= edge) continue
        const bump = peak * ((g0 - edge) / (1 - edge))
        const k = y * size + x
        if (bump > alpha[k]) alpha[k] = bump
        const w = bump * bump
        weight[k] += w
        red[k] += w * r
        green[k] += w * g
        blue[k] += w * b
      }
    }
  }

  // Pixels with no bump take the layer's lowest colour, so the soft edge never blends towards black.
  const [r0, g0, b0] = baseColor(layer)
  const data = new Uint8ClampedArray(new ArrayBuffer(size * size * 4))
  for (let k = 0; k < size * size; k++) {
    const w = weight[k]
    data[k * 4] = w > 0 ? red[k] / w : r0
    data[k * 4 + 1] = w > 0 ? green[k] / w : g0
    data[k * 4 + 2] = w > 0 ? blue[k] / w : b0
    data[k * 4 + 3] = Math.round(alpha[k] * 255)
  }
  return { width: size, height: size, data }
}

/** Cell values by position, for hover: the raw numbers, never the painted pixels. */
export function cellLookup(cells: readonly HeatmapCell[], grid = HEATMAP_GRID): Map<number, number> {
  const lookup = new Map<number, number>()
  for (const [i, j, value] of cells) lookup.set(i * grid + j, value)
  return lookup
}
