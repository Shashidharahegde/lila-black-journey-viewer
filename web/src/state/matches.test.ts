import { describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Index, MatchSummary } from '../data/types'
import {
  compositionLabel,
  dateLabel,
  durationLabel,
  matchCountsLabel,
  pickerGroups,
  pickerMatches,
  playersLabel,
  primaryLabel,
  recordedPlayers,
  signalLabels,
  timeOfDay,
} from './matches'

const index = indexJson as Index

function match(
  id: string,
  humans: number,
  bots: number,
  duration_s: number,
  map = 'AmbroseValley',
  date = '2026-02-10',
  unknown = 0,
): MatchSummary {
  return {
    id,
    full_id: id,
    map,
    date,
    start_utc: `${date}T00:00:00Z`,
    duration_s,
    humans,
    bots,
    unknown,
    counts: { kill: 0, death: 0, storm_death: 0, loot: 0, kill_killed_pair: 0 },
  }
}

describe('match picker', () => {
  const sample = [
    match('a', 1, 0, 900),
    match('b', 1, 6, 300),
    match('c', 2, 0, 100),
    match('d', 1, 6, 600),
    match('e', 1, 6, 600),
    match('f', 1, 14, 50, 'GrandRift'),
    match('g', 1, 7, 50, 'AmbroseValley', '2026-02-11'),
    match('h', 0, 6, 40, 'AmbroseValley', '2026-02-10', 1),
  ]

  it('filters by map and date', () => {
    expect(pickerMatches(sample, 'GrandRift', null).map((m) => m.id)).toEqual(['f'])
    expect(pickerMatches(sample, 'AmbroseValley', '2026-02-11').map((m) => m.id)).toEqual(['g'])
    expect(pickerMatches(sample, 'Lockdown', null)).toEqual([])
  })

  it('groups by start date (newest first) and sorts by the metric inside each group', () => {
    const groups = pickerGroups(sample, 'AmbroseValley', null, 'duration')
    expect(groups.map((g) => [g.date, g.matches.map((m) => m.id)])).toEqual([
      ['2026-02-11', ['g']],
      ['2026-02-10', ['a', 'd', 'e', 'b', 'c', 'h']],
    ])
    expect(pickerMatches(sample, 'AmbroseValley', null, 'duration').map((m) => m.id)).toEqual(['g', 'a', 'd', 'e', 'b', 'c', 'h'])
  })

  it('sorts by kills, deaths, loot and start time, longest and id breaking ties', () => {
    const c = (kill: number, death: number, loot: number) => ({ kill, death, storm_death: 0, loot, kill_killed_pair: 0 })
    const timed = [
      { ...match('x', 1, 0, 100), start_utc: '2026-02-10T08:00:00Z', counts: c(1, 0, 9) },
      { ...match('y', 1, 0, 100), start_utc: '2026-02-10T20:00:00Z', counts: c(0, 2, 5) },
      { ...match('z', 1, 0, 300), start_utc: '2026-02-10T12:00:00Z', counts: c(0, 2, 7) },
    ]
    const ids = (sort: Parameters<typeof pickerMatches>[3]) => pickerMatches(timed, 'AmbroseValley', null, sort).map((m) => m.id)
    expect(ids('kills')).toEqual(['x', 'z', 'y'])
    expect(ids('deaths')).toEqual(['z', 'y', 'x'])
    expect(ids('loot')).toEqual(['x', 'z', 'y'])
    expect(ids('recent')).toEqual(['y', 'z', 'x'])
  })
  it('does not change the input list', () => {
    const copy = [...sample]
    pickerMatches(sample, 'AmbroseValley', null)
    expect(sample).toEqual(copy)
  })

  it('on the real index, every sort returns all 796 matches, grouped by date and ordered by its metric', () => {
    expect(index.matches.filter((m) => recordedPlayers(m) > 1)).toHaveLength(53)
    const metrics = {
      duration: (m: MatchSummary) => m.duration_s,
      kills: (m: MatchSummary) => m.counts.kill,
      deaths: (m: MatchSummary) => m.counts.death,
      loot: (m: MatchSummary) => m.counts.loot,
      recent: (m: MatchSummary) => Date.parse(m.start_utc),
    } as const
    for (const sort of Object.keys(metrics) as (keyof typeof metrics)[]) {
      let n = 0
      for (const map of Object.keys(index.maps)) {
        const groups = pickerGroups(index.matches, map, null, sort)
        const dates = groups.map((g) => g.date)
        expect(dates).toEqual([...dates].sort().reverse())
        for (const g of groups) {
          const values = g.matches.map(metrics[sort])
          expect(values).toEqual([...values].sort((a, b) => b - a))
          n += g.matches.length
        }
      }
      expect(n).toBe(796)
    }
  })

  it('every date filter returns only matches whose start date is that date', () => {
    for (const { date } of index.dates) {
      for (const map of Object.keys(index.maps)) {
        expect(pickerMatches(index.matches, map, date).every((m) => m.date === date && m.map === map)).toBe(true)
      }
    }
  })
})

describe('labels', () => {
  it('names humans, unknown and bots separately', () => {
    expect(playersLabel({ humans: 1, unknown: 0, bots: 0 })).toBe('1 human')
    expect(playersLabel({ humans: 2, unknown: 0, bots: 0 })).toBe('2 humans')
    expect(playersLabel({ humans: 1, unknown: 0, bots: 1 })).toBe('1 human · 1 bot')
    expect(playersLabel({ humans: 2, unknown: 0, bots: 14 })).toBe('2 humans · 14 bots')
    expect(playersLabel({ humans: 0, unknown: 1, bots: 6 })).toBe('0 humans · 1 unknown · 6 bots')
  })

  it('counts Kill/Killed pairs on their own, never as kills', () => {
    const counts = { kill: 0, death: 1, storm_death: 0, loot: 3, kill_killed_pair: 1 }
    expect(matchCountsLabel({ counts })).toBe('0 kills · 1 death · 1 Kill/Killed pair · 3 loot')
  })

  it('on the real index: 781 human, 17 unknown and 444 bot journeys; 3 matches with a Kill/Killed pair', () => {
    expect(index.matches.reduce((n, m) => n + m.humans, 0)).toBe(781)
    expect(index.matches.reduce((n, m) => n + m.unknown, 0)).toBe(17)
    expect(index.matches.reduce((n, m) => n + m.bots, 0)).toBe(444)
    expect(index.matches.filter((m) => m.unknown > 0)).toHaveLength(17)
    expect(index.matches.filter((m) => m.counts.kill_killed_pair > 0)).toHaveLength(3)
  })

  it('formats dates and times of day in UTC', () => {
    expect(dateLabel('2026-02-10')).toBe('Tue, Feb 10')
    expect(timeOfDay('2026-02-10T21:54:25Z')).toBe('21:54')
  })

  it('leads with the sorted metric and hides zero-value categories', () => {
    const m = {
      ...match('m', 1, 0, 752),
      start_utc: '2026-02-10T21:54:25Z',
      counts: { kill: 16, death: 0, storm_death: 1, loot: 20, kill_killed_pair: 0 },
    }
    expect(primaryLabel(m, 'kills')).toBe('16 kills')
    expect(primaryLabel(m, 'duration')).toBe('12:32 min')
    expect(primaryLabel(m, 'recent')).toBe('21:54 UTC')
    expect(compositionLabel(m)).toBe('1 human journey')
    expect(compositionLabel({ humans: 2, unknown: 1, bots: 6 })).toBe('2 human journeys · 1 unknown · 6 bots')
    expect(signalLabels(m, 'duration')).toEqual(['16 kills', '1 storm death'])
    expect(signalLabels(m, 'kills')).toEqual(['1 storm death', '12:32 min'])
    expect(signalLabels(m, 'loot')).toEqual(['16 kills', '12:32 min'])
  })

  it('formats durations as m:ss', () => {
    expect(durationLabel(0)).toBe('0:00')
    expect(durationLabel(65)).toBe('1:05')
    expect(durationLabel(752)).toBe('12:32')
  })
})
