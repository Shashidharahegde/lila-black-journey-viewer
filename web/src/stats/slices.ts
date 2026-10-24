// Reading stats.json: the version check, slice lookup and the words around a slice. Nothing here computes a statistic.
import type { CountValue, DistributionValue, RateValue, RatioValue, ScoreValue, StatsFile, StatsSlice } from '../data/types'
import { ALL } from '../state/statsUrl'
import { plural } from './format'
import { count } from './terms'

/** The metrics_version this page was written for (spec 10, "Version check by consumers"). */
export const SUPPORTED_METRICS_VERSION = 2

export const OUT_OF_DATE = 'Statistics are out of date: run `make data`.'

/** Null when the file is usable; otherwise the message the error state shows. */
export function statsProblem(file: Pick<StatsFile, 'metrics_version'>): string | null {
  return file.metrics_version === SUPPORTED_METRICS_VERSION ? null : OUT_OF_DATE
}

/** The first 8 characters of the data fingerprint, as the About popover shows it. */
export function shortFingerprint(file: Pick<StatsFile, 'source'>): string {
  return file.source.fingerprint.replace(/^sha256:/, '').slice(0, 8)
}

/** Every map × date scope is in the file (an empty one says so), so a parsed scope always has a slice. */
export function sliceFor(stats: StatsFile, map: string, date: string): StatsSlice {
  const slice = stats.slices[map]?.[date]
  if (!slice) throw new Error(`stats.json has no slice for ${map} · ${date}`)
  return slice
}

export function countOf(slice: StatsSlice, id: string): number | null {
  return (slice.values[id] as CountValue | null)?.value ?? null
}

export function ratioOf(slice: StatsSlice, id: string): RatioValue | null {
  return (slice.values[id] as RatioValue | null) ?? null
}

export function distributionOf(slice: StatsSlice, id: string): DistributionValue | null {
  return (slice.values[id] as DistributionValue | null) ?? null
}

export function rateOf(slice: StatsSlice, id: string): RateValue | null {
  return (slice.values[id] as RateValue | null) ?? null
}

export function scoreOf(slice: StatsSlice): ScoreValue | null {
  return (slice.values.map_score as ScoreValue | null) ?? null
}

/** "All maps · all dates", "GrandRift · 2026-02-13". */
export function scopeWords(map: string, date: string): string {
  return `${map === ALL ? 'All maps' : map} · ${date === ALL ? 'all dates' : date}`
}

/** "No human journeys recorded on GrandRift on 2026-02-09". */
export function emptyText(map: string, date: string): string {
  return `No human journeys recorded on ${map === ALL ? 'any map' : map} ${date === ALL ? 'on any date' : `on ${date}`}`
}

/** "798 human journeys in 796 matches · 248 players observed", or the empty-state sentence. */
export function sampleText(slice: StatsSlice, map: string, date: string): string {
  const { sample } = slice
  if (slice.flags.empty) return emptyText(map, date)
  return `${count(sample.human_journeys, 'journey')} in ${count(sample.matches_with_human, 'match')} · ${count(sample.human_players, 'player')}`
}

export interface SliceBadge {
  label: string
  reason: string
}

const utc = (iso: string) => iso.replace('T', ' ').replace('Z', ' UTC')

/** The limits that apply to a slice, as badges with their reason (guidelines §7). An empty slice gets the empty state instead. */
export function sliceBadges(stats: StatsFile, slice: StatsSlice, date: string): SliceBadge[] {
  const badges: SliceBadge[] = []
  if (slice.flags.few_matches && !slice.flags.empty) {
    const n = slice.sample.matches_with_human
    badges.push({
      label: 'Few matches',
      reason: `Only ${plural(n, 'match', 'matches')} with a human journey (fewer than ${stats.thresholds.few_matches}): a pattern here may not hold.`,
    })
  }
  if (slice.flags.partial_date) {
    if (date === ALL) {
      const partial = stats.dates.filter((d) => d.partial).map((d) => d.date)
      badges.push({ label: 'Includes partial days', reason: `${partial.join(' and ')} cover less than a full day of recording.` })
    } else {
      const d = stats.dates.find((item) => item.date === date)
      if (d) badges.push({ label: 'Partial day', reason: `Data observed from ${utc(d.observed_from_utc)} to ${utc(d.observed_to_utc)} only.` })
    }
  }
  return badges
}
