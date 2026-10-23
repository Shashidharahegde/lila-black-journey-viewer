// The stats pages' figures and chart rows: rows from stored histograms, and every figure read from the real stats.json.
import { describe, expect, it } from 'vitest'
import statsJson from '../../public/data/stats.json'
import type { HistogramValue, StatsFile } from '../data/types'
import { COMBAT_METRICS, LOOT_METRICS, combatFigures, formatNumber, headlineFigures, lootFigures } from './figures'
import { DEATH_SERIES, binLabel, histogramRows, histogramSummary, overflowLabel } from './histogram'
import { distributionOf, sliceFor } from './slices'

const stats = statsJson as unknown as StatsFile
const whole = sliceFor(stats, 'all', 'all')
const histogramOf = (id: string, slice = whole) => distributionOf(slice, id)!.histogram!
const texts = (figures: { label: string; value: string; detail?: string }[]) => figures.map((f) => [f.label, f.value, f.detail ?? ''])

describe('histogram rows', () => {
  it('edges become bin labels', () => {
    expect(binLabel(0, 60, 'minutes')).toBe('0–1 min')
    expect(binLabel(15, 30, 'seconds')).toBe('15–30 s')
    expect(binLabel(250, 500, 'values')).toBe('250–500')
    expect(binLabel(1, 2, 'counts')).toBe('1')
    expect(binLabel(4, 6, 'counts')).toBe('4–5')
    expect(binLabel(6, 11, 'counts')).toBe('6–10')
  })

  it('the overflow bin is labelled as open-ended', () => {
    expect(overflowLabel(300, 'seconds')).toBe('300 s +')
    expect(overflowLabel(11, 'counts')).toBe('11+')
    const firstLoot = histogramRows(histogramOf('first_loot_s'), 'seconds', true)
    expect(firstLoot.at(-1)).toEqual({ bin: '300 s +', value: histogramOf('first_loot_s').overflow })
  })

  it('a closed histogram adds no overflow bin unless something overflowed', () => {
    const span = histogramRows(histogramOf('journey_span_s'), 'minutes', false)
    expect(span).toHaveLength(15)
    expect(span[0].bin).toBe('0–1 min')
    expect(span.at(-1)!.bin).toBe('14–15 min')
    const overflowing: HistogramValue = { edges: [0, 60], counts: [2], overflow: 1, n: 3 }
    expect(histogramRows(overflowing, 'minutes', false).map((r) => r.bin)).toEqual(['0–1 min', '1 min +'])
  })

  it('death series keep a fixed order and match the file', () => {
    const h = histogramOf('death_time_s')
    expect(DEATH_SERIES.map((s) => s.key)).toEqual(['by_bot', 'storm', 'paired_killed'])
    expect(Object.keys(h.series!).sort()).toEqual([...DEATH_SERIES.map((s) => s.key)].sort())
    const rows = histogramRows(h, 'minutes', false, DEATH_SERIES.map((s) => s.key))
    expect(rows).toHaveLength(15)
    const total = (key: string) => rows.reduce((sum, r) => sum + Number(r[key]), 0)
    expect([total('by_bot'), total('storm'), total('paired_killed')]).toEqual([400, 39, 3])
    expect(histogramSummary('When deaths happen', rows.slice(0, 1), DEATH_SERIES)).toBe(
      'When deaths happen. 0–1 min: Killed by a bot 11, Storm 0, Kill/Killed pair (cause unknown) 0.',
    )
  })

  it('a split histogram that overflowed names the overflow instead of drawing it under one cause', () => {
    const h: HistogramValue = { edges: [0, 60], series: { a: [1], b: [2] }, overflow: 4, n: 7 }
    expect(histogramRows(h, 'minutes', false, ['a', 'b']).at(-1)).toEqual({ bin: '1 min + (4, cause not split)', a: 0, b: 0 })
  })
})

describe('figures', () => {
  it('every metric the sections read exists in stats.json', () => {
    for (const id of [...COMBAT_METRICS, ...LOOT_METRICS]) expect(stats.metrics[id], id).toBeDefined()
  })

  it('medians keep their stored half', () => {
    expect(formatNumber(2)).toBe('2')
    expect(formatNumber(1.5)).toBe('1.5')
  })

  it('the headline KPIs, all maps and all dates: plain labels, each with its reference point', () => {
    expect(texts(headlineFigures(whole))).toEqual([
      ['Matches played', '781', 'by human players'],
      ['Players', '245', 'unique human players'],
      ['Median time in match', '6:07', 'per player'],
      ['Kills per match', '2.85', 'avg per player · 2,223 total'],
      ['Items looted per match', '16.28', 'avg per player · 12,714 total'],
      ['Storm deaths', '4.99%', 'of matches played · 39 total'],
    ])
  })

  it('a map report uses the same six KPIs, read from that map', () => {
    const ambrose = sliceFor(stats, 'AmbroseValley', 'all')
    expect(headlineFigures(ambrose).map((f) => f.value)).toEqual(['554', '217', '5:55', '2.99', '17.67', '3.07%'])
  })

  it('no removed, undefined or jargon metric is shown', () => {
    const labels = headlineFigures(whole).map((f) => f.label).join(' ')
    expect(labels).not.toMatch(/journey|retention|in combat|survival|movement|grid|distance|multiple matches/i)
  })

  it('combat adds only what the headline row lacks: deaths and how often a match ends in one', () => {
    expect(texts(combatFigures(stats, whole))).toEqual([
      ['Deaths', '442', '400 by bots · 39 by the storm'],
      ['Matches ending in a death', '56.6%', '442 of 781 matches played'],
    ])
  })

  it('a thin slice flags figures with few values', () => {
    const thin = sliceFor(stats, 'GrandRift', '2026-02-13')
    const firstLoot = lootFigures(thin).find((f) => f.id === 'first_loot_s')!
    expect(firstLoot.fewValues).toBe(distributionOf(thin, 'first_loot_s')!.n < stats.thresholds.few_values)
    expect(firstLoot.fewValues).toBe(true)
  })

  it('loot adds only what the headline row lacks: how many matches found loot, and how soon', () => {
    expect(texts(lootFigures(whole))).toEqual([
      ['Matches with any loot', '92.7%', '724 of 781 matches played'],
      ['Median time to first loot', '0:42', 'min:s into the match'],
    ])
  })
})