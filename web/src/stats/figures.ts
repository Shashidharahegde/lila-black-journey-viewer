// The headline figures of each page and section, as text read from one slice. Every number is a stored value; nothing
// is derived except formatting. The headline row holds the level-design KPIs (S, 2026-10-23); a section's own tiles add
// only what the headline row doesn't already show.
import type { BreakdownValue, StatsFile, StatsSlice } from '../data/types'
import { KPIS, kpiContext, kpiText, type KpiId } from './comparison'
import { MISSING, formatCount, formatPercent, formatSeconds } from './format'
import { distributionOf, ratioOf } from './slices'
import { RATE_LABEL, count } from './terms'

export interface Figure {
  /** the metric whose definition the info tooltip shows */
  id: string
  label: string
  value: string
  detail?: string
  /** the distribution behind it has fewer than `few_values` values */
  fewValues?: boolean
}

/** A stored median or quartile: whole numbers plain, halves (even counts) with one decimal. */
export function formatNumber(n: number): string {
  return Number.isInteger(n) ? formatCount(n) : n.toFixed(1)
}

function kpiFigure(slice: StatsSlice, id: KpiId): Figure {
  const kpi = KPIS[id]
  const fewValues = id === 'time' ? distributionOf(slice, 'journey_span_s')?.few_values : undefined
  return { id: kpi.metric, label: kpi.label, value: kpiText(slice, id), detail: kpiContext(slice, id) ?? undefined, fewValues }
}

/** The headline row on the Overview and on a map's report: the same six KPIs, so the two pages read alike. */
export const HEADLINE_KPIS: readonly KpiId[] = ['journeys', 'players', 'time', 'kills', 'loot', 'storm']

export function headlineFigures(slice: StatsSlice): Figure[] {
  return HEADLINE_KPIS.map((id) => kpiFigure(slice, id))
}

export const COMBAT_METRICS = ['deaths', 'journeys_with_death', 'death_time_s'] as const

/** Combat & survival adds deaths and how often a human journey ends in one (kills and storm deaths are in the headline row). */
export function combatFigures(stats: StatsFile, slice: StatsSlice): Figure[] {
  const deaths = slice.values.deaths as BreakdownValue | null
  const withDeath = ratioOf(slice, 'journeys_with_death')
  return [
    {
      id: 'deaths',
      label: stats.metrics.deaths.label,
      value: deaths ? formatCount(deaths.value) : MISSING,
      detail: deaths ? `${formatCount(deaths.parts.by_bot)} by bots · ${formatCount(deaths.parts.storm)} by the storm` : undefined,
    },
    {
      id: 'journeys_with_death',
      label: RATE_LABEL.deaths,
      value: withDeath ? formatPercent(withDeath) : MISSING,
      detail: withDeath ? `${formatCount(withDeath.numerator)} of ${count(withDeath.denominator, 'journey')}` : undefined,
    },
  ]
}

export const LOOT_METRICS = ['journeys_with_loot', 'first_loot_s'] as const

/** Loot adds how many human journeys found anything and how soon (items per journey is in the headline row). */
export function lootFigures(slice: StatsSlice): Figure[] {
  const withLoot = ratioOf(slice, 'journeys_with_loot')
  const firstLoot = distributionOf(slice, 'first_loot_s')
  return [
    {
      id: 'journeys_with_loot',
      label: 'Human journeys with any loot',
      value: withLoot ? formatPercent(withLoot) : MISSING,
      detail: withLoot ? `${formatCount(withLoot.numerator)} of ${count(withLoot.denominator, 'journey')}` : undefined,
    },
    {
      id: 'first_loot_s',
      label: 'Median time to first loot',
      value: firstLoot?.median != null ? formatSeconds(firstLoot.median) : MISSING,
      detail: firstLoot?.median != null ? 'minutes:seconds into the match' : firstLoot ? 'No values in this selection' : undefined,
      fewValues: firstLoot?.few_values,
    },
  ]
}
