// One figure, one name, one value on every page (UX-01). The Heatmaps summary is computed from the heatmap files and the index;
// the stats pages read stats.json. For every map × date these two paths must give the same text for the same metric, and the
// populations that differ on purpose (matches, matches with a human journey, human journeys) must stay distinct.
import { describe, expect, it } from 'vitest'
import AmbroseValley from '../../public/data/heatmaps/AmbroseValley.json'
import GrandRift from '../../public/data/heatmaps/GrandRift.json'
import Lockdown from '../../public/data/heatmaps/Lockdown.json'
import indexJson from '../../public/data/index.json'
import statsJson from '../../public/data/stats.json'
import type { BreakdownValue, HeatmapFile, Index, StatsFile } from '../data/types'
import { heatmapEvidence, layerSummary } from '../heatmap/evidence'
import { mapDateCounts, pickerMatches } from '../state/matches'
import { KPIS, kpiText } from './comparison'
import { combatFigures, headlineFigures, lootFigures } from './figures'
import { formatPercent } from './format'
import { countOf, rateOf, ratioOf, sampleText, sliceFor } from './slices'
import { RATE_LABEL, TERMS, count, ratePerJourney, sharePercent } from './terms'

const stats = statsJson as unknown as StatsFile
const index = indexJson as Index
const heatmaps = { AmbroseValley, GrandRift, Lockdown } as unknown as Record<string, HeatmapFile>
const DATES = [...stats.dates.map((d) => d.date), 'all']
const SCOPES = stats.maps.flatMap((map) => DATES.map((date) => ({ map, date, slice: sliceFor(stats, map, date) })))
const nonEmpty = SCOPES.filter((s) => !s.slice.flags.empty)

describe('rounding matches stats.py for every stored rate and share', () => {
  it.each(nonEmpty.map((s) => [`${s.map} ${s.date}`, s] as const))('%s', (_, { slice }) => {
    for (const id of ['kill_rate', 'loot_rate']) {
      const r = rateOf(slice, id)!
      expect(ratePerJourney(r.numerator, r.denominator)).toBe(r.value.toFixed(2))
    }
    for (const id of ['journeys_with_death', 'journeys_with_loot', 'repeat_players']) {
      const r = ratioOf(slice, id)!
      expect(sharePercent(r.numerator, r.denominator)).toBe(formatPercent(r))
    }
  })

  it('exact binary halves go to the even neighbour, as Python round() does', () => {
    expect(ratePerJourney(1, 8)).toBe('0.12') // 0.125
    expect(ratePerJourney(3, 8)).toBe('0.38') // 0.375
  })
})

describe('Heatmaps summary = stats pages, every map and date', () => {
  it.each(nonEmpty.map((s) => [`${s.map} ${s.date}`, s] as const))('%s', (_, { map, date, slice }) => {
    const day = date === 'all' ? null : date
    const kills = layerSummary('kills', heatmapEvidence(index, heatmaps[map], 'kills', day))
    const deaths = layerSummary('deaths', heatmapEvidence(index, heatmaps[map], 'deaths', day))
    const traffic = layerSummary('traffic', heatmapEvidence(index, heatmaps[map], 'traffic', day))

    // the totals
    expect(kills.lead.value).toBe(countOf(slice, 'kills')!.toLocaleString('en-US'))
    expect(deaths.lead.value).toBe((slice.values.deaths as BreakdownValue).value.toLocaleString('en-US'))
    // kills per human journey: same denominator and precision as the KPI tile
    expect(kills.figures[0].value).toBe(kpiText(slice, 'kills'))
    // deaths ÷ journeys is the stored share of journeys ending in a death (a journey has at most one death)
    expect(deaths.figures[0].value).toBe(formatPercent(ratioOf(slice, 'journeys_with_death')!))
    expect(deaths.figures[1].value).toBe((slice.values.deaths as BreakdownValue).parts.storm.toLocaleString('en-US'))
    // the two populations, named apart
    expect(traffic.figures[1]).toEqual({ value: slice.sample.human_journeys.toLocaleString('en-US'), label: TERMS.journey.many })
    expect(traffic.figures[2].value).toBe(slice.sample.matches_with_human.toLocaleString('en-US'))
  })
})

describe('Journeys list = matches, every map and date', () => {
  it.each(SCOPES.map((s) => [`${s.map} ${s.date}`, s] as const))('%s', (_, { map, date, slice }) => {
    // the list counts every recorded match (bot-only ones too), which is stats' `matches`, not the human journeys
    expect(pickerMatches(index.matches, map, date === 'all' ? null : date)).toHaveLength(slice.sample.matches)
    if (date !== 'all') expect(mapDateCounts(index.matches, map).get(date) ?? 0).toBe(slice.sample.matches)
  })
})

describe('the shared vocabulary', () => {
  it('rates name the human journey as their denominator, on every page', () => {
    expect(KPIS.kills.label).toBe(RATE_LABEL.kills)
    expect(KPIS.loot.label).toBe(RATE_LABEL.loot)
    expect(combatFigures(stats, sliceFor(stats, 'all', 'all'))[1].label).toBe(RATE_LABEL.deaths)
    const labels = [...headlineFigures(sliceFor(stats, 'all', 'all')), ...combatFigures(stats, sliceFor(stats, 'all', 'all')), ...lootFigures(sliceFor(stats, 'all', 'all'))]
      .flatMap((f) => [f.label, f.detail ?? ''])
      .join(' | ')
    // "match" is only ever a game session: no "matches played" for journeys, no "per match" rates
    expect(labels).not.toMatch(/matches played|per match\b|avg per player/i)
  })

  it('AmbroseValley, all dates: three different populations, three different names', () => {
    const slice = sliceFor(stats, 'AmbroseValley', 'all')
    expect([slice.sample.matches, slice.sample.matches_with_human, slice.sample.human_journeys]).toEqual([566, 566, 568])
    expect(sampleText(slice, 'AmbroseValley', 'all')).toBe('568 human journeys in 566 matches · 218 players observed')
    expect(count(1, 'journey')).toBe('1 human journey')
    expect(countOf(slice, 'human_journeys')).toBe(568)
  })
})
