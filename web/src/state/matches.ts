import type { MatchSummary } from '../data/types'

export type MatchSort = 'duration' | 'kills' | 'deaths' | 'loot' | 'recent'

export const DEFAULT_SORT: MatchSort = 'kills'

/** One sort option: `order` names the direction (every sort runs from the largest value down), for the sort icon's label. */
export const SORTS: { value: MatchSort; label: string; order: string; explain: string }[] = [
  { value: 'duration', label: 'Duration', order: 'Longest first', explain: 'Time from the first to the last recorded event.' },
  { value: 'kills', label: 'Kills', order: 'Most kills first', explain: 'Kills logged by human journeys. The Kill of a Kill/Killed pair isn’t counted.' },
  { value: 'deaths', label: 'Deaths', order: 'Most deaths first', explain: 'Deaths logged by human journeys, storm deaths not included.' },
  { value: 'loot', label: 'Loot', order: 'Most loot first', explain: 'Loot pickups logged by human journeys.' },
  { value: 'recent', label: 'Recent', order: 'Latest first', explain: 'Start time, in UTC.' },
]

function metric(m: MatchSummary, sort: MatchSort): number {
  switch (sort) {
    case 'duration':
      return m.duration_s
    case 'kills':
      return m.counts.kill
    case 'deaths':
      return m.counts.death
    case 'loot':
      return m.counts.loot
    case 'recent':
      return Date.parse(m.start_utc)
  }
}

/** Chosen metric descending, then longest, then id so the order is stable. */
function compare(sort: MatchSort) {
  return (a: MatchSummary, b: MatchSummary) =>
    metric(b, sort) - metric(a, sort) || b.duration_s - a.duration_s || a.id.localeCompare(b.id)
}

export interface DateGroup {
  date: string
  matches: MatchSummary[]
}

/** Matches on one map, on one date (null = all dates), grouped by start date (newest first) and sorted inside each group. */
export function pickerGroups(
  matches: MatchSummary[],
  map: string,
  date: string | null,
  sort: MatchSort = DEFAULT_SORT,
): DateGroup[] {
  const byDate = new Map<string, MatchSummary[]>()
  for (const m of matches) {
    if (m.map !== map || (date !== null && m.date !== date)) continue
    byDate.set(m.date, [...(byDate.get(m.date) ?? []), m])
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([d, list]) => ({ date: d, matches: list.sort(compare(sort)) }))
}

/** Same matches as `pickerGroups`, flattened in list order. */
export function pickerMatches(
  matches: MatchSummary[],
  map: string,
  date: string | null,
  sort: MatchSort = DEFAULT_SORT,
): MatchSummary[] {
  return pickerGroups(matches, map, date, sort).flatMap((g) => g.matches)
}

/**
 * The groups narrowed to matches whose ID or start date contains `query` and, with `botsOnly`, to matches with a bot journey
 * (52 of 796); empty groups are dropped.
 */
export function filterGroups(groups: DateGroup[], query: string, botsOnly = false): DateGroup[] {
  const q = query.trim().toLocaleLowerCase()
  if (!q && !botsOnly) return groups
  return groups
    .map((group) => ({
      ...group,
      matches: group.matches.filter(
        (m) =>
          (!botsOnly || m.bots > 0) &&
          (!q || m.id.toLocaleLowerCase().includes(q) || m.full_id.toLocaleLowerCase().includes(q) || m.date.includes(q)),
      ),
    }))
    .filter((group) => group.matches.length > 0)
}

/** "Tue, Feb 10" for a UTC start date. */
export function dateLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** "21:54" from an ISO start time (UTC). */
export function timeOfDay(startUtc: string): string {
  return startUtc.slice(11, 16)
}

/** The number a row leads with: the metric the list is sorted by. */
export function primaryLabel(m: MatchSummary, sort: MatchSort): string {
  switch (sort) {
    case 'duration':
      return durationText(m.duration_s)
    case 'kills':
      return plural(m.counts.kill, 'kill')
    case 'deaths':
      return plural(m.counts.death, 'death')
    case 'loot':
      return `${m.counts.loot} loot`
    case 'recent':
      return `${timeOfDay(m.start_utc)} UTC`
  }
}

// Other signals offered per sort, in priority order; loot is left to the inspector unless it is the sort.
const SIGNALS: Record<MatchSort, ('duration' | 'kills' | 'deaths' | 'storm')[]> = {
  duration: ['kills', 'deaths', 'storm'],
  kills: ['deaths', 'storm', 'duration'],
  deaths: ['kills', 'storm', 'duration'],
  loot: ['kills', 'deaths', 'duration'],
  recent: ['duration', 'kills', 'deaths'],
}

/** Up to two non-zero context signals that differ from the row's primary metric. */
export function signalLabels(m: MatchSummary, sort: MatchSort): string[] {
  const text = {
    duration: m.duration_s > 0 ? durationText(m.duration_s) : '',
    kills: m.counts.kill > 0 ? plural(m.counts.kill, 'kill') : '',
    deaths: m.counts.death > 0 ? plural(m.counts.death, 'death') : '',
    storm: m.counts.storm_death > 0 ? plural(m.counts.storm_death, 'storm death') : '',
  }
  return SIGNALS[sort].map((k) => text[k]).filter(Boolean).slice(0, 2)
}

/**
 * "2 human journeys · 1 unknown": only the kinds that exist. One human journey is the usual case (743 of 796 matches have one
 * recorded player), so it goes unsaid; the count appears only when a match has more. Bots get their own chip on the row
 * (`botsLabel`), so they aren't repeated here. The full breakdown is in the inspector.
 */
export function compositionLabel(m: Pick<MatchSummary, 'humans' | 'unknown'>): string {
  const parts: string[] = []
  if (m.humans > 1) parts.push(plural(m.humans, 'human journey'))
  if (m.unknown) parts.push(`${m.unknown} unknown`)
  return parts.join(' · ')
}

/** "14 bots" for the row's bot chip, or '' when the match has no bot journey. */
export function botsLabel(m: Pick<MatchSummary, 'bots'>): string {
  return m.bots ? plural(m.bots, 'bot') : ''
}

/** Recorded journeys (humans + unknown + bots) in a match. */
export function recordedPlayers(m: Pick<MatchSummary, 'humans' | 'unknown' | 'bots'>): number {
  return m.humans + m.unknown + m.bots
}

/** Matches on one map per start date, for the map pages' date list (dates without a match on the map are missing, i.e. 0). */
export function mapDateCounts(matches: Pick<MatchSummary, 'map' | 'date'>[], map: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const m of matches) if (m.map === map) counts.set(m.date, (counts.get(m.date) ?? 0) + 1)
  return counts
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** "1 human · 6 bots": humans, unknown and bots are always named separately, never lumped into "players". */
export function playersLabel(m: Pick<MatchSummary, 'humans' | 'unknown' | 'bots'>): string {
  const parts = [plural(m.humans, 'human')]
  if (m.unknown) parts.push(`${m.unknown} unknown`)
  if (m.bots) parts.push(plural(m.bots, 'bot'))
  return parts.join(' · ')
}

/** A moment in a match as a clock, "12:32" (timeline, tooltips, recorded spans). */
export function durationLabel(seconds: number): string {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** A length of time with its units, "11m 14s", where a bare "11:14" could be read as a time of day. */
export function durationText(seconds: number): string {
  const s = Math.round(seconds)
  const m = Math.floor(s / 60)
  return m === 0 ? `${s}s` : `${m}m ${s % 60}s`
}

/** The same length in words for screen readers, "11 minutes 14 seconds" ("11m" can be read out as metres). */
export function durationWords(seconds: number): string {
  const s = Math.round(seconds)
  const m = Math.floor(s / 60)
  const parts = m ? [plural(m, 'minute')] : []
  if (s % 60 || !m) parts.push(plural(s % 60, 'second'))
  return parts.join(' ')
}

/** "4 kills · 1 death · 20 loot": kills and deaths always, the rarer types only when present. */
export function matchCountsLabel(m: Pick<MatchSummary, 'counts'>): string {
  const c = m.counts
  const parts = [plural(c.kill, 'kill'), plural(c.death, 'death')]
  if (c.storm_death) parts.push(plural(c.storm_death, 'storm death'))
  if (c.kill_killed_pair) parts.push(plural(c.kill_killed_pair, 'Kill/Killed pair'))
  parts.push(`${c.loot} loot`)
  return parts.join(' · ')
}
