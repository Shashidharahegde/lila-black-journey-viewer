// Statistics page URL contract: /stats?map=&date=&section=. `map` and `date` are left out at "all"; `section` only applies
// inside a single map's report and is left out at its default ("overview"). Legacy `tab=` links still work: `tab=maps` now
// means the all-maps Overview (map comparison lives there, not a separate tab); `tab=engagement`/`tab=combat` become
// `section=` when a real map is also named, else they're ignored (map comparison had none). The URL is the page's only
// state: user changes push, invalid or incomplete URLs are corrected with a replace, as on the map.
import type { StatsFile } from '../data/types'

export const ALL = 'all'

/** A map report's secondary sections, in display order. Only reachable when a single map is selected. The former
 * Engagement and Movement sections were removed (S, 2026-10-23): their links open the Overview section. */
export const SECTIONS = ['overview', 'combat', 'loot'] as const
export type Section = (typeof SECTIONS)[number]
export const DEFAULT_SECTION: Section = 'overview'

export const SECTION_LABEL: Record<Section, string> = {
  overview: 'Overview',
  combat: 'Combat & survival',
  loot: 'Loot',
}

/** Old `tab=` values that still map to a section once a real map is also named. `tab=maps` has no section counterpart. */
const LEGACY_TAB_SECTION: Partial<Record<string, Section>> = { combat: 'combat' }

export interface StatsScope {
  /** 'all' or a map id */
  map: string
  /** 'all' or a date */
  date: string
  /** meaningful only when map !== 'all' */
  section: Section
}

export const DEFAULT_STATS_SCOPE: StatsScope = { map: ALL, date: ALL, section: DEFAULT_SECTION }

export function parseStatsScope(params: URLSearchParams, stats: Pick<StatsFile, 'maps' | 'dates'>): StatsScope {
  const map = stats.maps.find((m) => m === params.get('map')) ?? ALL
  const date = stats.dates.find((d) => d.date === params.get('date'))?.date ?? ALL
  const rawSection = params.get('section')
  const section = SECTIONS.find((s) => s === rawSection) ?? LEGACY_TAB_SECTION[params.get('tab') ?? ''] ?? DEFAULT_SECTION
  // the all-maps overview has no sections of its own (map comparison lives on it directly)
  return { map, date, section: map === ALL ? DEFAULT_SECTION : section }
}

export function serializeStatsScope(scope: StatsScope): string {
  const params = new URLSearchParams()
  if (scope.map !== ALL) params.set('map', scope.map)
  if (scope.date !== ALL) params.set('date', scope.date)
  if (scope.map !== ALL && scope.section !== DEFAULT_SECTION) params.set('section', scope.section)
  return params.toString()
}

/** The Overview for a date and map ('all' by default): the primary nav's Overview link. A single map chosen on any page
 * opens that map's report; "All maps" stays all maps (S, 2026-10-24). */
export function overviewLinkFor(date: string | null, map: string = ALL): string {
  const search = serializeStatsScope({ map, date: date ?? ALL, section: DEFAULT_SECTION })
  return search ? `/stats?${search}` : '/stats'
}

/** One map's report on its Overview section, for that map and date (map comparison cards, "View detailed analysis"). */
export function statsLinkFor(map: string, date: string | null): string {
  return `/stats?${serializeStatsScope({ map, date: date ?? ALL, section: DEFAULT_SECTION })}`
}
