// URL contract. Common: ?map=&date=&tab=journeys|heatmaps. Journeys & Playback adds match=, hide=, t=. Heatmaps adds layer=,
// density=off, outlines=off, intensity=all. Each tab writes only its own parameters, so the two never conflict; the other
// tab's state is kept in the store, not the URL. Links without tab= still work: a match= means journeys, otherwise heatmaps
// (the overview a link opened before the tabs existed); the old heatmap=off means density=off. Unknown values fall back safely.
import type { HeatmapLayerKey, Index } from '../data/types'
import { DEFAULT_HEATMAP_MODE, HEATMAP_MODES, type HeatmapMode } from '../heatmap/scale'

export const DEFAULT_MAP = 'AmbroseValley'
export const LAYER_KEYS = ['humans', 'bots', 'kill', 'death', 'storm_death', 'loot'] as const
export type LayerKey = (typeof LAYER_KEYS)[number]

/** Traffic first: the overview's default view (FRONTEND_GUIDELINES P6). `layer=` is left out of the URL at this default. */
export const HEATMAP_LAYERS: readonly HeatmapLayerKey[] = ['traffic', 'kills', 'deaths']
export const DEFAULT_HEATMAP_LAYER: HeatmapLayerKey = 'traffic'

/** The two top-level workspaces (S, 2026-10-23). */
export const TABS = ['journeys', 'heatmaps'] as const
export type Tab = (typeof TABS)[number]

/**
 * What the Heatmaps tab shows: one metric, and two independent switches (the density overlay and the hotspot outlines, any of the
 * four combinations). Everything but the default is written to the URL, so a link shows the same picture.
 */
export interface HeatmapView {
  layer: HeatmapLayerKey
  density: boolean
  outlines: boolean
  mode: HeatmapMode
}
export const DEFAULT_HEATMAP_VIEW: HeatmapView = { layer: DEFAULT_HEATMAP_LAYER, density: true, outlines: true, mode: DEFAULT_HEATMAP_MODE }

export interface Selection {
  map: string
  date: string | null
  match: string | null
  hide: LayerKey[]
}

const hasMap = (index: Index, map: string) => Object.prototype.hasOwnProperty.call(index.maps, map)

function defaultMap(index: Index): string {
  if (hasMap(index, DEFAULT_MAP)) return DEFAULT_MAP
  const first = Object.keys(index.maps)[0]
  // Keep URL parsing total even for a temporarily empty index; the parent can show an empty-state UI.
  return first ?? DEFAULT_MAP
}

export function matchFits(index: Index, id: string, map: string, date: string | null): boolean {
  const match = index.matches.find((item) => item.id === id)
  return !!match && match.map === map && (date === null || match.date === date)
}

export function parseSelection(params: URLSearchParams, index: Index): Selection {
  const rawMap = params.get('map')
  const rawDate = params.get('date')
  const rawMatch = params.get('match')
  const linked = rawMatch ? index.matches.find((match) => match.id === rawMatch) : undefined
  const map = rawMap && hasMap(index, rawMap) ? rawMap : (linked?.map ?? defaultMap(index))
  const date = rawDate && index.dates.some((item) => item.date === rawDate) ? rawDate : null
  const match = linked && matchFits(index, linked.id, map, date) ? linked.id : null
  const hide = canonicalHide((params.get('hide') ?? '').split(','))
  return { map, date, match, hide }
}

/**
 * Playback time from `t=` (whole seconds), kept within the selected match's duration.
 * Null without a match, or when `t` is missing, zero or not a number: the match then opens at 00:00.
 */
export function parseTime(params: URLSearchParams, index: Index, match: string | null): number | null {
  const raw = params.get('t')
  const summary = match ? index.matches.find((m) => m.id === match) : undefined
  if (!raw || !summary || !/^\d+$/.test(raw)) return null
  const t = Math.min(Number(raw), Math.floor(summary.duration_s))
  return t > 0 ? t : null
}

/** What goes into `t=`: the whole second the match is at, nothing at 00:00 or without a match. */
export function urlTime(selection: Selection, time: number): number | null {
  const t = Math.floor(time)
  return selection.match && t > 0 ? t : null
}

/** The tab from `tab=`; a link without it opens Journeys & Playback when it names a match and Heatmaps otherwise (as it did before the tabs). */
export function parseTab(params: URLSearchParams): Tab {
  return TABS.find((tab) => tab === params.get('tab')) ?? (params.get('match') ? 'journeys' : 'heatmaps')
}

/** The heatmap view from `layer=`, `density=off`, `outlines=off` and `intensity=all` (and the old `heatmap=off`); anything missing or unknown is the default. */
export function parseHeatmapView(params: URLSearchParams): HeatmapView {
  const layer = HEATMAP_LAYERS.find((key) => key === params.get('layer')) ?? DEFAULT_HEATMAP_VIEW.layer
  const mode = HEATMAP_MODES.find((key) => key === params.get('intensity')) ?? DEFAULT_HEATMAP_VIEW.mode
  return { layer, density: params.get('density') !== 'off' && params.get('heatmap') !== 'off', outlines: params.get('outlines') !== 'off', mode }
}

export function canonicalHide(keys: readonly string[]): LayerKey[] {
  return LAYER_KEYS.filter((key) => keys.includes(key))
}

/** The query string for a tab: the common parameters, then only that tab's own. */
export function serializeSelection(
  selection: Selection,
  time: number | null = null,
  view: HeatmapView = DEFAULT_HEATMAP_VIEW,
  tab: Tab = 'journeys',
): string {
  const params = new URLSearchParams({ map: selection.map })
  if (selection.date) params.set('date', selection.date)
  params.set('tab', tab)
  if (tab === 'journeys') {
    if (selection.match) params.set('match', selection.match)
    if (selection.hide.length) params.set('hide', canonicalHide(selection.hide).join(','))
    if (selection.match && time) params.set('t', String(time))
  } else {
    if (view.layer !== DEFAULT_HEATMAP_VIEW.layer) params.set('layer', view.layer)
    if (!view.density) params.set('density', 'off')
    if (!view.outlines) params.set('outlines', 'off')
    if (view.mode !== DEFAULT_HEATMAP_VIEW.mode) params.set('intensity', view.mode)
  }
  return params.toString().replaceAll('%2C', ',')
}

export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  return !!a && !!b && a.map === b.map && a.date === b.date && a.match === b.match && a.hide.join() === b.hide.join()
}
