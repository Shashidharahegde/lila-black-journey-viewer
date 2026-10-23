// The level-design KPIs (S, 2026-10-23), read from each slice and compared between maps. Each map's value is its own
// slice's stored value; ranking the maps only orders those values and never adds them up (spec 10, EC-09/EC-10).
//
// Wording: a "journey" in the data is one human player's recorded match, so the pages say "match played" / "per match"
// (an average over players' matches). A journey has at most one death (stats.py checks it), so storm deaths per 100
// journeys is the share of matches played that ended in a storm death.
import type { StatsFile, StatsSlice } from '../data/types'
import { MISSING, formatCount, formatSeconds } from './format'
import { countOf, distributionOf, rateOf, scoreOf, sliceFor } from './slices'

export interface Kpi {
  /** the stats.json metric whose definition the ⓘ shows */
  metric: string
  label: string
  /** the label under a map card's small figures */
  short: string
  read: (slice: StatsSlice) => number | null
  format: (n: number) => string
  /** one short line of context: the reference point or the stored total behind a rate */
  context?: (slice: StatsSlice) => string | null
  higherIsBetter: boolean
}

// rates are shown exactly as stored (2 decimals): rounding them again would round twice (2.846 → 2.85 → 2.9)
const asStored = (n: number) => n.toFixed(2)

function rateTotal(slice: StatsSlice, id: string, lead: string): string | null {
  const r = rateOf(slice, id)
  return r ? `${lead} · ${formatCount(r.numerator)} total` : null
}

export const KPIS = {
  score: {
    metric: 'map_score',
    label: 'Relative score',
    short: 'Relative score',
    read: (s) => scoreOf(s)?.value ?? null,
    // stored 0–1 (2 decimals) shown out of 100: the same number, no second rounding
    format: (n) => `${Math.round(n * 100)}/100`,
    context: () => 'vs the other maps',
    higherIsBetter: true,
  },
  journeys: {
    metric: 'human_journeys',
    label: 'Matches played',
    short: 'Matches played',
    read: (s) => countOf(s, 'human_journeys'),
    format: formatCount,
    context: () => 'by human players',
    higherIsBetter: true,
  },
  players: {
    metric: 'human_players',
    label: 'Players',
    short: 'Players',
    read: (s) => countOf(s, 'human_players'),
    format: formatCount,
    context: () => 'unique human players',
    higherIsBetter: true,
  },
  time: {
    metric: 'journey_span_s',
    label: 'Median time in match',
    short: 'Time in match',
    read: (s) => distributionOf(s, 'journey_span_s')?.median ?? null,
    format: formatSeconds,
    context: () => 'per player',
    higherIsBetter: true,
  },
  kills: {
    metric: 'kill_rate',
    label: 'Kills per match',
    short: 'Kills per match',
    read: (s) => rateOf(s, 'kill_rate')?.value ?? null,
    format: asStored,
    context: (s) => rateTotal(s, 'kill_rate', 'avg per player'),
    higherIsBetter: true,
  },
  loot: {
    metric: 'loot_rate',
    label: 'Items looted per match',
    short: 'Items per match',
    read: (s) => rateOf(s, 'loot_rate')?.value ?? null,
    format: asStored,
    context: (s) => rateTotal(s, 'loot_rate', 'avg per player'),
    higherIsBetter: true,
  },
  storm: {
    metric: 'storm_death_rate',
    label: 'Storm deaths',
    short: 'Storm deaths',
    read: (s) => rateOf(s, 'storm_death_rate')?.value ?? null,
    format: (n) => `${asStored(n)}%`,
    context: (s) => rateTotal(s, 'storm_death_rate', 'of matches played'),
    higherIsBetter: false,
  },
} satisfies Record<string, Kpi>

export type KpiId = keyof typeof KPIS

/** The "Compare on" menu, in display order. */
export const COMPARISON_KPIS: readonly KpiId[] = ['journeys', 'players', 'time', 'kills', 'loot', 'storm', 'score']

/** The two small figures on a map card: the first two of these that aren't the card's main figure. */
const CARD_SECONDARY: readonly KpiId[] = ['time', 'kills', 'loot', 'journeys']

export function secondaryKpis(primary: KpiId): KpiId[] {
  return CARD_SECONDARY.filter((id) => id !== primary).slice(0, 2)
}

export function kpiText(slice: StatsSlice, id: KpiId): string {
  const n = KPIS[id].read(slice)
  return n === null ? MISSING : KPIS[id].format(n)
}

export function kpiContext(slice: StatsSlice, id: KpiId): string | null {
  return KPIS[id].read(slice) === null ? null : (KPIS[id] as Kpi).context?.(slice) ?? null
}

export interface MapRow {
  map: string
  value: number | null
}

/** Each map's own value for one KPI at one date; a map with no value is `null`, never dropped. */
export function kpiByMap(stats: StatsFile, date: string, id: KpiId): MapRow[] {
  return stats.maps.map((map) => ({ map, value: KPIS[id].read(sliceFor(stats, map, date)) }))
}

/** Which map leads and which has the most room to improve on a KPI (null when fewer than two maps have a value, or
 * all are equal). */
export function bestAndWorst(rows: readonly MapRow[], higherIsBetter: boolean): { best: string; worst: string } | null {
  const valued = rows.filter((r): r is { map: string; value: number } => r.value !== null)
  if (valued.length < 2) return null
  const sorted = [...valued].sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value))
  if (sorted[0].value === sorted.at(-1)!.value) return null
  return { best: sorted[0].map, worst: sorted.at(-1)!.map }
}

/** The constructive names for a map's standing (S, 2026-10-23: never "worst"). */
export const STANDING = { best: 'Leading', worst: 'Needs improvement' } as const
