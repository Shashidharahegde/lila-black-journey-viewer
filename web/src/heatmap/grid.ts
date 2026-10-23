// Heatmap cell geometry in the shared drawing space (space.ts). The only place a cell becomes a rectangle.
import type { MapInfo } from '../data/types'
import { uvToSpace, type SpaceRect } from '../map/space'

/** The pipeline's grid (heatmaps.py GRID); each heatmap file also states its own. */
export const HEATMAP_GRID = 64

/**
 * Cell (i, j) covers u ∈ [i/grid, (i+1)/grid) and v ∈ [j/grid, (j+1)/grid), j growing north.
 * The drawing space has Y down, so the cell's top edge is the one with the larger v.
 */
export function cellRect(i: number, j: number, map: MapInfo, grid = HEATMAP_GRID): SpaceRect {
  const [left, bottom] = uvToSpace(i / grid, j / grid, map)
  const [right, top] = uvToSpace((i + 1) / grid, (j + 1) / grid, map)
  return { left, top, right, bottom }
}

/** Corners for deck.gl, in a fixed winding. */
export function cellPolygon(i: number, j: number, map: MapInfo, grid = HEATMAP_GRID): [number, number][] {
  const { left, top, right, bottom } = cellRect(i, j, map, grid)
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ]
}

const clampCell = (value: number, grid: number) => Math.min(Math.max(Math.floor(value), 0), grid - 1)

/** The cell a map position falls in, as the pipeline bins it (u or v of exactly 1 is in the last cell). */
export function cellOf(u: number, v: number, grid = HEATMAP_GRID): [number, number] {
  return [clampCell(u * grid, grid), clampCell(v * grid, grid)]
}
