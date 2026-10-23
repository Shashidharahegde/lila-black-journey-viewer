import { describe, expect, it } from 'vitest'
import statsJson from '../../public/data/stats.json'
import type { StatsFile } from '../data/types'
import { ALL } from '../state/statsUrl'
import { COMPARISON_KPIS, KPIS, STANDING, bestAndWorst, kpiByMap, kpiContext, kpiText, secondaryKpis } from './comparison'
import { countOf, sliceFor } from './slices'

const stats = statsJson as unknown as StatsFile

describe('KPIS', () => {
  it('every KPI reads a metric that exists in the real stats.json', () => {
    for (const id of COMPARISON_KPIS) expect(stats.metrics[KPIS[id].metric], id).toBeDefined()
  })

  it('plain names: no data jargon, retention claims or removed metrics', () => {
    const labels = COMPARISON_KPIS.map((id) => KPIS[id].label).join(' ')
    expect(labels).not.toMatch(/journey|retention|return rate|in combat|movement|grid|distance|multiple matches|performance score/i)
  })

  it('the leading and trailing map are named constructively', () => {
    expect(STANDING).toEqual({ best: 'Leading', worst: 'Needs improvement' })
  })
})

describe('kpiText, all dates (verified against stats.json)', () => {
  const row = (id: (typeof COMPARISON_KPIS)[number]) => stats.maps.map((map) => kpiText(sliceFor(stats, map, ALL), id))

  it("reads each map's own stored value", () => {
    expect(row('journeys')).toEqual(['554', '57', '170'])
    expect(row('players')).toEqual(['217', '29', '79'])
    expect(row('time')).toEqual(['5:55', '6:43', '7:07'])
    expect(row('kills')).toEqual(['2.99', '3.14', '2.28'])
    expect(row('loot')).toEqual(['17.67', '15.37', '12.04'])
    // storm deaths per 100 matches played = % of matches played (a journey has at most one death)
    expect(row('storm')).toEqual(['3.07%', '8.77%', '10.00%'])
    // the stored 0–1 score out of 100, the same digits
    expect(row('score')).toEqual(['77/100', '49/100', '25/100'])
  })

  it('every value carries its reference point or stored total', () => {
    const lockdown = sliceFor(stats, 'Lockdown', ALL)
    expect(kpiContext(lockdown, 'kills')).toBe('avg per player · 388 total')
    expect(kpiContext(lockdown, 'loot')).toBe('avg per player · 2,047 total')
    expect(kpiContext(lockdown, 'storm')).toBe('of matches played · 17 total')
    expect(kpiContext(lockdown, 'score')).toBe('vs the other maps')
  })

  it('the all-maps scope has no score (it ranks maps against each other)', () => {
    expect(kpiText(sliceFor(stats, ALL, ALL), 'score')).toBe('—')
    expect(kpiContext(sliceFor(stats, ALL, ALL), 'score')).toBeNull()
  })

  it("matches played are parts of a whole: the maps' counts add up to the all-maps count (the donut's basis)", () => {
    for (const date of [ALL, ...stats.dates.map((d) => d.date)]) {
      const sum = stats.maps.reduce((n, map) => n + (countOf(sliceFor(stats, map, date), 'human_journeys') ?? 0), 0)
      expect(sum, date).toBe(countOf(sliceFor(stats, ALL, date), 'human_journeys'))
    }
  })
})

describe('bestAndWorst', () => {
  it("marks the leading map and the one with the most room to improve in the KPI's own direction", () => {
    expect(bestAndWorst(kpiByMap(stats, ALL, 'score'), true)).toEqual({ best: 'AmbroseValley', worst: 'Lockdown' })
    expect(bestAndWorst(kpiByMap(stats, ALL, 'kills'), true)).toEqual({ best: 'GrandRift', worst: 'Lockdown' })
    // storm deaths: fewer is better
    expect(bestAndWorst(kpiByMap(stats, ALL, 'storm'), false)).toEqual({ best: 'AmbroseValley', worst: 'Lockdown' })
  })

  it('needs two maps with a value, and different values', () => {
    expect(bestAndWorst(kpiByMap(stats, stats.dates[0].date, 'journeys'), true)).toBeNull() // only AmbroseValley on 2026-02-09
    expect(bestAndWorst([{ map: 'a', value: 1 }, { map: 'b', value: 1 }], true)).toBeNull()
  })

  it("a card's two small figures never repeat its main one", () => {
    expect(secondaryKpis('journeys')).toEqual(['time', 'kills'])
    expect(secondaryKpis('time')).toEqual(['kills', 'loot'])
  })
})
