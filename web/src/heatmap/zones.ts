// The interpretation layer's pure logic (spec 06, Stage 6b): which regions to show for a selection, where their footprint is,
// how to say what was recorded there, and why a region is "observed" rather than "consistent". Region statistics are computed in
// the pipeline (pipeline/src/lila_pipeline/zones.py); nothing here recomputes them.
import type { HeatmapLayerKey, MapInfo, ZoneLayer, ZoneRecord, ZoneRules, ZonesFile } from '../data/types'
import type { SpaceRect } from '../map/space'
import { cellRect } from './grid'
import { formatPlayerTime, plural } from './format'

/** The compact summary shows this many consistent regions at first (S, 2026-10-23). */
export const DEFAULT_SHOWN = 3

export const NO_CONSISTENT_TEXT = 'No consistent concentration detected in this selection.'

export const OUTLINE_NOTE = 'Outlines are approximate marks around a region of 4 × 4 heatmap cells, not exact boundaries.'

export function layerOf(selection: ZonesFile['selections'][string], layer: HeatmapLayerKey): ZoneLayer {
  return selection.layers[layer]
}

/** The zone layer for a map's selection (`date` null = all dates), or undefined when the file has nothing for that date. */
export function zoneLayer(file: ZonesFile, date: string | null, layer: HeatmapLayerKey): ZoneLayer | undefined {
  return file.selections[date ?? 'all']?.layers[layer]
}

export interface ZoneSummary {
  /** all consistent regions, strongest first */
  consistent: ZoneRecord[]
  /** the ones shown at first (at most `limit`) */
  shown: ZoneRecord[]
  /** consistent regions beyond the limit */
  hidden: number
  /** regions that were candidates but didn't pass every check, strongest first; kept with their measurements */
  observed: ZoneRecord[]
}

export function summarizeZones(layer: ZoneLayer, limit = DEFAULT_SHOWN): ZoneSummary {
  const consistent = layer.zones.filter((z) => z.tier === 'consistent')
  return {
    consistent,
    shown: consistent.slice(0, limit),
    hidden: Math.max(0, consistent.length - limit),
    observed: layer.zones.filter((z) => z.tier === 'observed'),
  }
}

/**
 * The consistent regions that are listed and outlined: the strongest `DEFAULT_SHOWN` at first, all of them once expanded.
 * Numbering follows this order, so the outline markers and the ranking list always agree. Observed regions are never in it.
 */
export function visibleConsistent(layer: ZoneLayer, expanded: boolean): ZoneRecord[] {
  return summarizeZones(layer, expanded ? Infinity : DEFAULT_SHOWN).shown
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

/** About how many world units a region is across: the minimap's scale over the regions per side. */
export function regionWorldUnits(mapScale: number, zonesPerSide: number): number {
  return Math.round(mapScale / zonesPerSide)
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

/** One line for a list row: value, share of the layer, and how many matches and recorded players stand behind it. */
export function zoneRowText(layer: HeatmapLayerKey, z: ZoneRecord): string {
  return `${zoneValueText(layer, z.value)} · ${sharePercent(z.share)} of the layer`
}

export function zoneSupportText(z: ZoneRecord): string {
  return `${plural(z.matches, 'match', 'matches')} · ${plural(z.players, 'player')}`
}

/** The checks a region failed, in words; empty for a consistent region. Read from the recorded measurements and the published rules. */
export function failedChecks(z: ZoneRecord, rules: ZoneRules): string[] {
  const failed: string[] = []
  if (z.stability < rules.min_stability) failed.push(`not repeated often enough when the matches are resampled (${Math.round(z.stability * 100)}%, needs ${Math.round(rules.min_stability * 100)}%)`)
  if (z.matches < rules.min_matches) failed.push(`only ${plural(z.matches, 'match', 'matches')} (needs ${rules.min_matches})`)
  if (z.players < rules.min_players) failed.push(`only ${plural(z.players, 'player')} (needs ${rules.min_players})`)
  if (z.largest_match_share > rules.max_one_match_share) failed.push(`${Math.round(z.largest_match_share * 100)}% from one match (at most ${Math.round(rules.max_one_match_share * 100)}%)`)
  if (z.survived_shifts < rules.required_shifts) failed.push(`not confirmed on shifted grids (${z.survived_shifts} of ${rules.required_shifts})`)
  return failed
}

/** The region's evidence, one fact per entry, for the details card. */
export function zoneDetails(layer: HeatmapLayerKey, z: ZoneRecord, rules: ZoneRules): { label: string; value: string }[] {
  const rows = [
    { label: layer === 'traffic' ? 'Estimated player time' : layer === 'kills' ? 'Kills recorded' : 'Deaths recorded', value: zoneValueText(layer, z.value) },
    { label: 'Share of the layer', value: sharePercent(z.share) },
    { label: 'Matches', value: String(z.matches) },
    { label: 'Recorded players', value: String(z.players) },
  ]
  if (z.journeys !== undefined) rows.push({ label: 'Journeys through it', value: String(z.journeys) })
  if (z.storm_deaths !== undefined && z.storm_deaths > 0) rows.push({ label: 'of which storm deaths', value: String(z.storm_deaths) })
  rows.push(
    { label: 'Largest single match', value: sharePercent(z.largest_match_share) },
    { label: 'Repeated when matches are resampled', value: `${Math.round(z.stability * 100)}%` },
    { label: 'Holds on shifted grids', value: `${z.survived_shifts} of ${rules.required_shifts}` },
  )
  return rows
}
