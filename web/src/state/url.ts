// What the URL holds: ?map=&date=&match=&hide=. Parsing never fails; unknown values fall back to defaults.
import type { Index } from '../data/types'

export const DEFAULT_MAP = 'AmbroseValley'

/** Layers that can be switched off, in the order they are written to ?hide=. */
export const LAYER_KEYS = ['bots', 'kill', 'death', 'storm_death', 'loot'] as const
export type LayerKey = (typeof LAYER_KEYS)[number]

export interface Selection {
  map: string
  /** null = all dates */
  date: string | null
  match: string | null
  /** switched-off layers, always in LAYER_KEYS order; empty = everything shown */
  hide: LayerKey[]
}

function defaultMap(index: Index): string {
  return DEFAULT_MAP in index.maps ? DEFAULT_MAP : Object.keys(index.maps)[0]
}

/** True when the match exists and is visible under this map and date. */
export function matchFits(index: Index, id: string, map: string, date: string | null): boolean {
  const m = index.matches.find((x) => x.id === id)
  return !!m && m.map === map && (date === null || m.date === date)
}

export function parseSelection(params: URLSearchParams, index: Index): Selection {
  const rawMap = params.get('map')
  const rawDate = params.get('date')
  const rawMatch = params.get('match')
  const linked = rawMatch ? index.matches.find((m) => m.id === rawMatch) : undefined

  // A valid map wins; a link with only ?match= opens that match's map.
  const map = rawMap && rawMap in index.maps ? rawMap : (linked?.map ?? defaultMap(index))
  const date = rawDate && index.dates.some((d) => d.date === rawDate) ? rawDate : null
  const match = linked && matchFits(index, linked.id, map, date) ? linked.id : null
  const hide = canonicalHide((params.get('hide') ?? '').split(','))
  return { map, date, match, hide }
}

/** Known keys only, no repeats, in LAYER_KEYS order. */
export function canonicalHide(keys: readonly string[]): LayerKey[] {
  return LAYER_KEYS.filter((k) => keys.includes(k))
}

export function serializeSelection(s: Selection): string {
  const params = new URLSearchParams({ map: s.map })
  if (s.date) params.set('date', s.date)
  if (s.match) params.set('match', s.match)
  if (s.hide.length) params.set('hide', s.hide.join(','))
  // keep the comma readable in shared links
  return params.toString().replaceAll('%2C', ',')
}

export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  return (
    !!a && !!b && a.map === b.map && a.date === b.date && a.match === b.match && a.hide.join() === b.hide.join()
  )
}
