// Plain-words text for heatmap values (spec 06). Raw values stay raw; these only say them.
import type { HeatmapLayerKey } from '../data/types'
import type { HeatmapMode } from './scale'

const number = (n: number) => Math.round(n).toLocaleString('en-US')

/** Player time from seconds: "under 1 s", "35 s", "41 min". Never hours, so every value reads on one scale. */
export function formatPlayerTime(seconds: number): string {
  if (seconds < 1) return 'under 1 s'
  const whole = Math.round(seconds)
  if (whole < 60) return `${whole} s`
  return `${number(seconds / 60)} min`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${number(count)} ${count === 1 ? one : many}`
}

/** "12 deaths", "1 kill", "41 min of estimated player time". */
export function cellValueText(layer: HeatmapLayerKey, value: number): string {
  if (layer === 'traffic') return `${formatPlayerTime(value)} of estimated player time`
  return plural(value, layer === 'kills' ? 'kill' : 'death')
}

export const LAYER_LABEL: Record<HeatmapLayerKey, string> = {
  traffic: 'Traffic',
  kills: 'Kills',
  deaths: 'Deaths',
}

/** What a layer shows, in the words of spec 06. */
export const LAYER_NOTE: Record<HeatmapLayerKey, string> = {
  traffic: 'Estimated observed player time',
  kills: 'Where humans stood when they killed',
  deaths: 'Where humans died, storm included',
}

export const MODE_LABEL: Record<HeatmapMode, string> = { focused: 'Focused', all: 'All activity' }

export const MODE_NOTE: Record<HeatmapMode, string> = {
  focused: 'Focused hides cells under 30 s of estimated player time, shows 30 to 60 s as a barely visible trace, and lets stronger cells rise steeply. No number is removed: every cell is still in the hover.',
  all: 'All activity shows every observed cell at a clearly visible strength, stronger where there is more.',
}

export const dateText = (date: string | null) => date ?? 'all dates'

/** The scope line: what the heatmap is built from. It never says "match" as if one match were selected. */
export function scopeLine(map: string, date: string | null): string {
  return `All human journeys · ${map} · ${dateText(date)}`
}
