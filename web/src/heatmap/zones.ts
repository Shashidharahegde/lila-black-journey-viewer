// The interpretation layer's pure logic (spec 06, Stage 6b): which regions are hotspots for a selection, where their footprint is,
// and how to say what was recorded there. Region statistics are computed in the pipeline (pipeline/src/lila_pipeline/zones.py);
// nothing here recomputes them. Only regions that pass every check are shown (S, 2026-10-23); the checks are described in docs/.
import type { HeatmapLayerKey, MapInfo, ZoneLayer, ZoneRecord, ZonesFile } from '../data/types'
import type { SpaceRect } from '../map/space'
import { cellRect } from './grid'
import { formatPlayerTime, plural } from './format'

export function layerOf(selection: ZonesFile['selections'][string], layer: HeatmapLayerKey): ZoneLayer {
  return selection.layers[layer]
}

/** The zone layer for a map's selection (`date` null = all dates), or undefined when the file has nothing for that date. */
export function zoneLayer(file: ZonesFile, date: string | null, layer: HeatmapLayerKey): ZoneLayer | undefined {
  return file.selections[date ?? 'all']?.layers[layer]
}

/** The hotspots of a layer: the regions that pass every check, strongest first. Their order is their number on the map and in the panel. */
export function passingZones(layer: ZoneLayer): ZoneRecord[] {
  return layer.zones.filter((z) => z.tier === 'consistent')
}

/** A region's stable identity inside one selection, for highlighting. */
export const zoneKey = (z: Pick<ZoneRecord, 'i' | 'j'>) => `${z.i},${z.j}`

/** The region's footprint in the drawing space: the union of its 4 × 4 heatmap cells, placed with the same cell rectangles. */
export function zoneFootprint(z: Pick<ZoneRecord, 'i' | 'j'>, map: MapInfo, zoneCells: number, grid: number): SpaceRect {
  const first = cellRect(z.i * zoneCells, z.j * zoneCells, map, grid)
  const last = cellRect(z.i * zoneCells + zoneCells - 1, z.j * zoneCells + zoneCells - 1, map, grid)
  return { left: first.left, bottom: first.bottom, right: last.right, top: last.top }
}

/**
 * The outline of a region: a circle through the corners of its footprint, in drawing-space units, so it follows zoom and pan with the
 * map. It is a mark around an approximate 4 × 4-cell region, not a boundary of anything physical.
 */
export function zoneOutline(rect: SpaceRect): { cx: number; cy: number; radius: number } {
  return { cx: (rect.left + rect.right) / 2, cy: (rect.top + rect.bottom) / 2, radius: Math.hypot(rect.right - rect.left, rect.bottom - rect.top) / 2 }
}

/** Is a drawing-space point inside the region's outline circle? (For click and hover; the outline has no fill to pick.) */
export function insideOutline(point: readonly [number, number], outline: { cx: number; cy: number; radius: number }): boolean {
  return Math.hypot(point[0] - outline.cx, point[1] - outline.cy) <= outline.radius
}

export function footprintPolygon(rect: SpaceRect): [number, number][] {
  return [
    [rect.left, rect.top],
    [rect.right, rect.top],
    [rect.right, rect.bottom],
    [rect.left, rect.bottom],
  ]
}

/** What was recorded there, with the layer's unit: "139 kills", "25 deaths", "136 min of estimated player time". */
export function zoneValueText(layer: HeatmapLayerKey, value: number): string {
  if (layer === 'traffic') return `${formatPlayerTime(value)} of estimated player time`
  return plural(value, layer === 'kills' ? 'kill' : 'death')
}

export function sharePercent(share: number): string {
  const pct = share * 100
  return pct < 1 ? '<1%' : `${Math.round(pct)}%`
}

/** A region's lead number and its unit, set apart for the list: { value: '139', unit: 'kills' }, { value: '136 min', unit: 'player time' }. */
export function zoneMetric(layer: HeatmapLayerKey, value: number): { value: string; unit: string } {
  if (layer === 'traffic') return { value: formatPlayerTime(value), unit: 'player time' }
  const [count, ...unit] = plural(value, layer === 'kills' ? 'kill' : 'death').split(' ')
  return { value: count, unit: unit.join(' ') }
}

/** What a hotspot's share is a share of: the layer's total for the selected map and date (`ZoneRecord.share`). */
export function shareOf(layer: HeatmapLayerKey): string {
  return `of all ${layer === 'traffic' ? 'player time' : layer}`
}

export function zoneSupportText(z: ZoneRecord): string {
  return `${plural(z.matches, 'match', 'matches')} · ${plural(z.players, 'player')}`
}
