import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import AmbroseValley from '../../public/data/heatmaps/AmbroseValley.json'
import GrandRift from '../../public/data/heatmaps/GrandRift.json'
import Lockdown from '../../public/data/heatmaps/Lockdown.json'
import indexJson from '../../public/data/index.json'
import type { HeatmapFile, HeatmapLayerKey, Index, MatchFile } from '../data/types'
import { LOW_EVIDENCE_MATCHES, emptyText, heatmapEvidence, layerSummary, lowEvidenceText, pairNote, partialText } from './evidence'

const index = indexJson as Index
const files = { AmbroseValley, GrandRift, Lockdown } as unknown as Record<string, HeatmapFile>
const evidence = (map: string, layer: HeatmapLayerKey, date: string | null) => heatmapEvidence(index, files[map], layer, date)

const matches: MatchFile[] = readdirSync('public/data/matches').map(
  (f) => JSON.parse(readFileSync(`public/data/matches/${f}`, 'utf-8')) as MatchFile,
)

describe('summary card', () => {
  it('AmbroseValley, all dates: totals and ratios of the same figures, each with its denominator in the label', () => {
    const deaths = layerSummary('deaths', evidence('AmbroseValley', 'deaths', null))
    expect(deaths.lead).toEqual({ value: '315', label: 'human deaths' })
    expect(deaths.figures.slice(0, 2)).toEqual([
      { value: '0.6', label: 'deaths per match' }, // 315 / 553
      { value: '57%', label: 'of matches had a death' }, // 314 / 553
    ])
    const traffic = layerSummary('traffic', evidence('AmbroseValley', 'traffic', null))
    expect(traffic.figures.map((f) => f.label)).toEqual(['per human journey', 'human journeys', 'matches'])
    expect(traffic.figures.slice(1).map((f) => f.value)).toEqual(['554', '553'])
  })

  it('storm deaths from the index agree with the region file, and never exceed the deaths', () => {
    for (const map of Object.keys(files)) {
      const zones = JSON.parse(readFileSync(`public/data/zones/${map}.json`, 'utf-8')) as { selections: Record<string, { layers: { deaths: { storm_deaths?: number } } }> }
      for (const key of Object.keys(files[map].samples)) {
        const e = evidence(map, 'deaths', key === 'all' ? null : key)
        expect(e.stormDeaths).toBeLessThanOrEqual(e.total)
        const fromZones = zones.selections[key]?.layers.deaths.storm_deaths
        if (fromZones !== undefined) expect(e.stormDeaths).toBe(fromZones)
      }
    }
  })
})

describe('evidence lines', () => {
  it('AmbroseValley deaths, all dates: the counts and the words, from the real files', () => {
    const e = evidence('AmbroseValley', 'deaths', null)
    expect(e).toMatchObject({ kind: 'ok', total: 315, humanJourneys: 554, matchesWithHumans: 553, contributing: 314, low: false })
  })

  it('traffic says "about" and counts the matches with a human journey', () => {
    const e = evidence('GrandRift', 'traffic', '2026-02-13')
    expect(e.contributing).toBe(5)
    expect(layerSummary('traffic', e).lead.value).toBe('26 min')
  })

  it.each(['kills', 'deaths'] as const)('%s: contributing matches equal the matches that have such an event in the match files', (layer) => {
    for (const map of Object.keys(files)) {
      for (const date of [null, ...Object.keys(files[map].samples).filter((k) => k !== 'all')]) {
        const expected = matches.filter((m) => {
          if (m.map !== map || (date !== null && m.date !== date)) return false
          return m.actors
            .filter((a) => a.kind === 'human')
            .some((a) => a.events.some((e) => (layer === 'kills' ? e.type === 'kill' && !e.kill_killed_pair : e.type === 'death' || e.type === 'storm_death')))
        }).length
        expect(evidence(map, layer, date).contributing).toBe(expected)
      }
    }
  })
})

describe('low-evidence flag', () => {
  it('uses the agreed threshold of 10 contributing matches, flagging 9 and not 10', () => {
    expect(LOW_EVIDENCE_MATCHES).toBe(10)
    const synthetic = (matchCount: number): HeatmapFile => ({
      ...GrandRift,
      samples: { all: { matches: matchCount, human_journeys: matchCount } },
      layers: { kills: { all: [[1, 1, 1]] }, deaths: { all: [[1, 1, 1]] }, traffic: { all: [[1, 1, 5]] } },
      totals: { kills: { all: 1 }, deaths: { all: 1 }, traffic: { all: 5 } },
    } as unknown as HeatmapFile)
    expect(heatmapEvidence(index, synthetic(9), 'traffic', null).low).toBe(true)
    expect(heatmapEvidence(index, synthetic(10), 'traffic', null).low).toBe(false)
  })

  it('below 10 matches covers 17 of the 57 map, date and layer selections: 16 get the badge, one has no events and shows the empty state; no all-dates view', () => {
    let low = 0
    let emptyButFew = 0
    let selections = 0
    for (const map of Object.keys(files)) {
      for (const key of Object.keys(files[map].samples)) {
        for (const layer of ['traffic', 'kills', 'deaths'] as const) {
          const e = evidence(map, layer, key === 'all' ? null : key)
          selections++
          if (e.kind === 'empty' && e.matchesWithHumans < LOW_EVIDENCE_MATCHES) emptyButFew++
          if (e.low) {
            low++
            expect(key).not.toBe('all')
          }
        }
      }
    }
    expect({ low, emptyButFew, selections }).toEqual({ low: 16, emptyButFew: 1, selections: 57 })
  })

  it('says what the flag rests on', () => {
    const e = evidence('GrandRift', 'deaths', '2026-02-13')
    expect(e.low).toBe(true)
    expect(lowEvidenceText('deaths', e)).toBe('This layer rests on 4 matches with a death, fewer than 10. Read patterns with care.')
  })
})

describe('empty states', () => {
  it('a date with no human journeys (GrandRift on 2026-02-09) says so and offers a way out', () => {
    const e = evidence('GrandRift', 'traffic', '2026-02-09')
    expect(e.kind).toBe('no-data')
    expect(e.low).toBe(false)
    expect(emptyText('traffic', e, 'GrandRift', '2026-02-09')).toEqual({
      title: 'No human journeys recorded on GrandRift on 2026-02-09.',
      hint: 'Choose another date or All dates.',
    })
  })

  it('a layer with no events (AmbroseValley deaths on 2026-02-09) names the matches it looked at', () => {
    const e = evidence('AmbroseValley', 'deaths', '2026-02-09')
    expect(e).toMatchObject({ kind: 'empty', total: 0, matchesWithHumans: 1 })
    expect(emptyText('deaths', e, 'AmbroseValley', '2026-02-09')?.title).toBe('No human deaths recorded in the 1 match on this date.')
  })

  it('a normal selection has no empty text', () => {
    expect(emptyText('kills', evidence('Lockdown', 'kills', null), 'Lockdown', null)).toBeNull()
  })
})

describe('notes', () => {
  it('names the Kill/Killed pairs on each side: the Killed is in deaths, the Kill is left out of kills', () => {
    const e = evidence('AmbroseValley', 'deaths', null)
    expect(e.pairs).toBe(2)
    expect(pairNote('deaths', e.pairs)).toBe('Includes 2 events from Kill/Killed pairs (the Killed half; cause unknown).')
    expect(pairNote('kills', e.pairs)).toBe('Leaves out 2 events from Kill/Killed pairs (the Kill half; cause unknown).')
    expect(pairNote('traffic', e.pairs)).toBeNull()
    expect(pairNote('deaths', 0)).toBeNull()
    expect(index.matches.reduce((s, m) => s + m.counts.kill_killed_pair, 0)).toBe(3)
  })

  it('a partial day gives its observed window from the index, a full day gives nothing', () => {
    const info = (date: string) => index.dates.find((d) => d.date === date)
    expect(partialText(info('2026-02-09'))).toBe('Partial day: observed 23:58–00:00 UTC')
    expect(partialText(info('2026-02-14'))).toBe('Partial day: observed 00:00–15:01 UTC')
    expect(partialText(info('2026-02-10'))).toBeNull()
    expect(partialText(undefined)).toBeNull()
  })
})
