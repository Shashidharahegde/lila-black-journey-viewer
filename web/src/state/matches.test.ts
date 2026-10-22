import { describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Index, MatchSummary } from '../data/types'
import { durationLabel, pickerMatches, playersLabel } from './matches'

const index = indexJson as Index

function match(id: string, humans: number, bots: number, duration_s: number, map = 'AmbroseValley', date = '2026-02-10'): MatchSummary {
  return {
    id,
    full_id: id,
    map,
    date,
    start_utc: `${date}T00:00:00Z`,
    duration_s,
    humans,
    bots,
    counts: { kill: 0, death: 0, storm_death: 0, loot: 0, self_kill: 0 },
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
  ]

  it('filters by map and date', () => {
    expect(pickerMatches(sample, 'GrandRift', null).map((m) => m.id)).toEqual(['f'])
    expect(pickerMatches(sample, 'AmbroseValley', '2026-02-11').map((m) => m.id)).toEqual(['g'])
    expect(pickerMatches(sample, 'Lockdown', null)).toEqual([])
  })

  it('sorts by recorded players (humans + bots), then duration, then id', () => {
    expect(pickerMatches(sample, 'AmbroseValley', null).map((m) => m.id)).toEqual(['g', 'd', 'e', 'b', 'c', 'a'])
  })

  it('does not change the input list', () => {
    const copy = [...sample]
    pickerMatches(sample, 'AmbroseValley', null)
    expect(sample).toEqual(copy)
  })

  it('on the real index, the 53 matches with more than one recorded player come first', () => {
    const all = Object.keys(index.maps).flatMap((map) => pickerMatches(index.matches, map, null))
    expect(all).toHaveLength(796)
    expect(index.matches.filter((m) => m.humans + m.bots > 1)).toHaveLength(53)
    for (const map of Object.keys(index.maps)) {
      const list = pickerMatches(index.matches, map, null)
      const players = list.map((m) => m.humans + m.bots)
      expect(players).toEqual([...players].sort((a, b) => b - a))
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
  it('names humans and bots separately', () => {
    expect(playersLabel({ humans: 1, bots: 0 })).toBe('1 human')
    expect(playersLabel({ humans: 2, bots: 0 })).toBe('2 humans')
    expect(playersLabel({ humans: 1, bots: 1 })).toBe('1 human · 1 bot')
    expect(playersLabel({ humans: 2, bots: 14 })).toBe('2 humans · 14 bots')
  })

  it('formats durations as m:ss', () => {
    expect(durationLabel(0)).toBe('0:00')
    expect(durationLabel(65)).toBe('1:05')
    expect(durationLabel(752)).toBe('12:32')
  })
})
