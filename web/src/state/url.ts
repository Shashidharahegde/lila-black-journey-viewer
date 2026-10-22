// URL contract: ?map=&date=&match=&hide=&t=. Unknown values fall back safely.
import type { Index } from '../data/types'

export const DEFAULT_MAP = 'AmbroseValley'
export const LAYER_KEYS = ['humans', 'bots', 'kill', 'death', 'storm_death', 'loot'] as const
export type LayerKey = (typeof LAYER_KEYS)[number]

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

export function canonicalHide(keys: readonly string[]): LayerKey[] {
  return LAYER_KEYS.filter((key) => keys.includes(key))
}

export function serializeSelection(selection: Selection, time: number | null = null): string {
  const params = new URLSearchParams({ map: selection.map })
  if (selection.date) params.set('date', selection.date)
  if (selection.match) params.set('match', selection.match)
  if (selection.hide.length) params.set('hide', canonicalHide(selection.hide).join(','))
  if (selection.match && time) params.set('t', String(time))
  return params.toString().replaceAll('%2C', ',')
}

export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  return !!a && !!b && a.map === b.map && a.date === b.date && a.match === b.match && a.hide.join() === b.hide.join()
}
