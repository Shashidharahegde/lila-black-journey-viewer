// How a heatmap cell's value becomes colour and opacity (spec 06).
//
// Traffic is continuous: a log1p position on a scale fixed per map (the domain), so a value looks the same on every date, with
// opacity that rises with intensity (weak activity fades, strong concentrations stand out).
// Kills and deaths are absolute count classes, 1 / 2–3 / 4–9 / 10 or more, identical on every date and map (S, 2026-10-23; evidence
// in docs/evidence/spatial_analysis/count_bands.*): a class is a count, not a share of a maximum. The classes step in lightness as
// well as hue, so they stay apart for viewers with colour-vision deficiency. Classes colour the 64 × 64 cells only; the aggregated
// 16 × 16 regions of the interpretation layer are never coloured by them.
import type { HeatmapCell, HeatmapLayerKey } from '../data/types'

export type Rgb = [number, number, number]

/**
 * Traffic only. Focused hides short visits and lets strong traffic dominate (the visibility policy below); All activity keeps every
 * observed cell visible. Kills and deaths look the same in both. (Not related to the hotspot outlines, which are a separate switch.)
 */
export type HeatmapMode = 'focused' | 'all'
export const HEATMAP_MODES: readonly HeatmapMode[] = ['focused', 'all']
export const DEFAULT_HEATMAP_MODE: HeatmapMode = 'focused'

const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as Rgb

// --- traffic: continuous ---------------------------------------------------------------------------------------------

/**
 * The largest value over every date key of one layer. Fixed per map and layer, so a value has the same intensity on every date.
 * (`all` holds the largest cells, but the traffic cells are rounded separately per key, so the maximum is taken over all keys.)
 */
export function layerDomain(byDate: Record<string, HeatmapCell[]>): number {
  let max = 0
  for (const cells of Object.values(byDate)) for (const [, , value] of cells) if (value > max) max = value
  return max
}

/** Traffic's normalised intensity, 0–1 (log1p of the seconds over the domain). Null when there is nothing to show (value ≤ 0 or no domain). */
export function trafficPosition(value: number, max: number): number | null {
  if (!(value > 0) || !(max > 0)) return null
  return Math.min(1, Math.max(0, Math.log1p(value) / Math.log1p(max)))
}

// teal → cyan → yellow → near-white: the top 15 % of the scale runs to a near-white yellow, so the busiest cells read brightest
const TRAFFIC_PALETTE = [
  [0, '#1a7fa3'],
  [0.5, '#38d3e0'],
  [0.85, '#ffe953'],
  [1, '#fffce6'],
] as const

const TRAFFIC_STOPS = TRAFFIC_PALETTE.map(([at, hex]) => ({ at, rgb: hexToRgb(hex) }))

/** Traffic's palette colour at intensity t (0–1, clamped). */
export function trafficColor(t: number): Rgb {
  const x = Math.min(1, Math.max(0, t))
  for (let k = 1; k < TRAFFIC_STOPS.length; k++) {
    if (x <= TRAFFIC_STOPS[k].at) {
      const a = TRAFFIC_STOPS[k - 1]
      const b = TRAFFIC_STOPS[k]
      const f = (x - a.at) / (b.at - a.at)
      return [0, 1, 2].map((c) => Math.round(a.rgb[c] + (b.rgb[c] - a.rgb[c]) * f)) as Rgb
    }
  }
  return TRAFFIC_STOPS[TRAFFIC_STOPS.length - 1].rgb
}

/** `linear-gradient(...)` of the traffic palette, left = 0, for the legend bar. */
export function trafficGradient(): string {
  return `linear-gradient(to right, ${TRAFFIC_PALETTE.map(([at, hex]) => `${hex} ${Math.round(at * 100)}%`).join(', ')})`
}

/**
 * The traffic visibility policy of the Focused view, on estimated player-seconds per original 64 × 64 cell (S, 2026-10-23):
 * under 30 s the cell is not drawn; 30 to under 60 s it is extremely faint; from 60 s it rises with the log of the value over the
 * map's fixed scale maximum, on a curve with exponent 1.5 so that the strongest concentrations are far brighter than the typical
 * visible cell. The thresholds are absolute seconds and the scale maximum is fixed per map (over all dates), so a value looks the same
 * on every date. The numbers behind hidden cells are untouched and still shown on hover.
 */
export const TRAFFIC_FOCUS = {
  hideBelow: 30,
  faintBelow: 60,
  faint: { from: 0.03, to: 0.06 },
  strong: { floor: 0.1, top: 1, power: 1.5 },
}

/** Position of a value above the strong threshold, 0–1, on a log scale up to the map's maximum (1 when the maximum is no larger than the threshold). */
export function strongPosition(value: number, max: number): number {
  const base = TRAFFIC_FOCUS.faintBelow
  if (!(max > base)) return 1
  return Math.min(1, Math.max(0, Math.log(value / base) / Math.log(max / base)))
}

/** The Focused style of a traffic cell: null when hidden (under 30 s), a faint teal from 30 s, and a rising opacity and colour from 60 s. */
export function trafficFocusedStyle(value: number, max: number): { color: Rgb; alpha: number } | null {
  const { hideBelow, faintBelow, faint, strong } = TRAFFIC_FOCUS
  if (!(value >= hideBelow)) return null
  if (value < faintBelow) return { color: trafficColor(0), alpha: faint.from + (faint.to - faint.from) * ((value - hideBelow) / (faintBelow - hideBelow)) }
  const x = strongPosition(value, max)
  return { color: trafficColor(x), alpha: strong.floor + (strong.top - strong.floor) * x ** strong.power }
}

/** All activity: every observed cell, log1p intensity over the scale maximum, opacity rising from a faint floor. */
export const TRAFFIC_ALL = { floor: 0.18, top: 0.95 }

export function trafficAllAlpha(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return TRAFFIC_ALL.floor + (TRAFFIC_ALL.top - TRAFFIC_ALL.floor) * x
}

// --- kills and deaths: absolute count classes ---------------------------------------------------------------------------

export type CountLayer = 'kills' | 'deaths'
export const isCountLayer = (layer: HeatmapLayerKey): layer is CountLayer => layer !== 'traffic'

/** The four classes: a cell holding `min` or more (up to the next class) is in it. */
export const COUNT_BANDS = [
  { min: 1, label: '1' },
  { min: 2, label: '2–3' },
  { min: 4, label: '4–9' },
  { min: 10, label: '10+' },
] as const

/** The class (0–3) of a count, or null for a cell with nothing in it. Values are whole event counts. */
export function countBand(value: number): number | null {
  if (!(value >= 1)) return null
  let band = 0
  for (let k = 1; k < COUNT_BANDS.length; k++) if (value >= COUNT_BANDS[k].min) band = k
  return band
}

const style = (rows: readonly (readonly [string, number])[]) => rows.map(([hex, alpha]) => ({ color: hexToRgb(hex), alpha }))

/**
 * Class styles, weakest to strongest: colour and peak opacity. Lightness rises with the count (kills: dark red, orange, amber, pale
 * yellow; deaths: deep indigo, periwinkle, orchid, pale pink), and so does opacity. A single event is faint (opacity 0.26 for kills,
 * 0.30 for deaths) and ten or more are opaque (4–9 at 0.88 for kills, 0.90 for deaths; S, 2026-10-23: hotspots brighter), so weak and strong observations are far apart. Measured over the three
 * minimaps' own colours the neighbouring classes stay at least 16.4 dE apart for kills and 10.1 dE for deaths even under deuteranopia
 * and protanopia (docs/evidence/spatial_analysis/count_bands.json).
 */
export const COUNT_STYLE: Record<CountLayer, { color: Rgb; alpha: number }[]> = {
  kills: style([['#c2361b', 0.26], ['#ff6a1a', 0.52], ['#ffb52e', 0.88], ['#fff1b8', 1]]),
  deaths: style([['#4a3fd0', 0.3], ['#7a74ff', 0.56], ['#d86cff', 0.9], ['#ffe4f8', 1]]),
}

/** CSS colour of a class's legend swatch: its colour at its own opacity. */
export function countSwatch(layer: CountLayer, band: number): string {
  const { color: [r, g, b], alpha } = COUNT_STYLE[layer][band]
  return `rgb(${r} ${g} ${b} / ${alpha})`
}

// --- one entry point for the painter ------------------------------------------------------------------------------------------

/** The colour and peak opacity of a cell, or null when it must not be drawn (no value, or no domain for traffic). */
export function cellStyle(layer: HeatmapLayerKey, mode: HeatmapMode, value: number, domain: number): { color: Rgb; alpha: number } | null {
  if (isCountLayer(layer)) {
    const band = countBand(value)
    return band === null ? null : COUNT_STYLE[layer][band]
  }
  if (mode === 'focused') return trafficFocusedStyle(value, domain)
  const t = trafficPosition(value, domain)
  return t === null ? null : { color: trafficColor(t), alpha: trafficAllAlpha(t) }
}

/** The lowest end of a layer's colours: what pixels with no bump take, so a soft edge never blends towards black. */
export function baseColor(layer: HeatmapLayerKey): Rgb {
  return isCountLayer(layer) ? COUNT_STYLE[layer][0].color : trafficColor(0)
}
