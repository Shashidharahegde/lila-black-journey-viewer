// Cross-checks the shipped heatmap files (computed by the pipeline from the raw rows) against the
// shipped match files and index (a different path through the same data). Spec 06, commit 1.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import AmbroseValley from '../../public/data/heatmaps/AmbroseValley.json'
import GrandRift from '../../public/data/heatmaps/GrandRift.json'
import Lockdown from '../../public/data/heatmaps/Lockdown.json'
import indexJson from '../../public/data/index.json'
import type { Actor, HeatmapCell, HeatmapFile, HeatmapLayerKey, Index, MatchEvent, MatchFile } from '../data/types'
import { cellOf } from './grid'

const index = indexJson as Index
const heatmaps = { AmbroseValley, GrandRift, Lockdown } as unknown as Record<string, HeatmapFile>
const MAP_IDS = Object.keys(heatmaps)

const matches: MatchFile[] = readdirSync('public/data/matches').map(
  (f) => JSON.parse(readFileSync(`public/data/matches/${f}`, 'utf-8')) as MatchFile,
)

/** `all` and the match's own date: the two keys a match's data belongs to. */
const keysOf = (m: MatchFile) => ['all', m.date]

const isKill = (e: MatchEvent) => e.type === 'kill' && !e.kill_killed_pair
const isDeath = (e: MatchEvent) => e.type === 'death' || e.type === 'storm_death'

type Totals = Record<string, number> // `${map}|${key}` → value

/** Event counts from the match files, for the actors `kinds` allows. */
function eventTotals(layer: 'kills' | 'deaths', kinds: Actor['kind'][]): Totals {
  const out: Totals = {}
  for (const m of matches) {
    for (const a of m.actors.filter((x) => kinds.includes(x.kind))) {
      const n = a.events.filter(layer === 'kills' ? isKill : isDeath).length
      for (const key of keysOf(m)) out[`${m.map}|${key}`] = (out[`${m.map}|${key}`] ?? 0) + n
    }
  }
  return out
}

/** Traffic seconds from the match files: the gaps between consecutive points inside human segments. */
function trafficTotals(kinds: Actor['kind'][]): Totals {
  const out: Totals = {}
  for (const m of matches) {
    for (const a of m.actors.filter((x) => kinds.includes(x.kind))) {
      let seconds = 0
      for (const segment of a.segments) for (let k = 1; k < segment.length; k++) seconds += segment[k][0] - segment[k - 1][0]
      for (const key of keysOf(m)) out[`${m.map}|${key}`] = (out[`${m.map}|${key}`] ?? 0) + seconds
    }
  }
  return out
}

const sumCells = (cells: HeatmapCell[]) => cells.reduce((s, c) => s + c[2], 0)
const dateKeys = (file: HeatmapFile) => Object.keys(file.samples)

describe('kill and death totals', () => {
  const fromEvents = { kills: eventTotals('kills', ['human']), deaths: eventTotals('deaths', ['human']) }

  it.each(MAP_IDS.flatMap((id) => (['kills', 'deaths'] as const).map((layer) => [id, layer] as const)))(
    '%s %s: cells, totals, index counts and the match files agree for every date key',
    (id, layer) => {
      const file = heatmaps[id]
      for (const key of dateKeys(file)) {
        const total = file.totals[layer][key]
        expect(sumCells(file.layers[layer][key] ?? [])).toBe(total)
        expect(fromEvents[layer][`${id}|${key}`] ?? 0).toBe(total)
        const fromIndex = index.matches
          .filter((m) => m.map === id && (key === 'all' || m.date === key))
          .reduce((s, m) => s + (layer === 'kills' ? m.counts.kill : m.counts.death + m.counts.storm_death), 0)
        expect(fromIndex).toBe(total)
      }
    },
  )

  it('kills are the BotKill rows of human files (2,236); deaths are BotKilled + KilledByStorm + paired Killed (443)', () => {
    const raw: Record<string, number> = {}
    for (const m of matches) {
      for (const a of m.actors.filter((x) => x.kind === 'human')) {
        for (const e of a.events) if (isKill(e) || isDeath(e)) raw[e.raw] = (raw[e.raw] ?? 0) + 1
      }
    }
    expect(raw).toEqual({ BotKill: 2236, BotKilled: 401, KilledByStorm: 39, Killed: 3 })
    const sum = (layer: HeatmapLayerKey) => MAP_IDS.reduce((s, id) => s + heatmaps[id].totals[layer].all, 0)
    expect(sum('kills')).toBe(2236)
    expect(sum('deaths')).toBe(443)
  })

  it('counts each human storm death once: 39 in all, no journey with a second death, each in one cell', () => {
    let storm = 0
    for (const m of matches) {
      for (const a of m.actors.filter((x) => x.kind === 'human')) {
        expect(a.events.filter(isDeath).length).toBeLessThanOrEqual(1)
        storm += a.events.filter((e) => e.type === 'storm_death').length
      }
    }
    expect(storm).toBe(39)
  })

  it('keeps the 3 Kill/Killed pairs as separate events, with the Kill out of kills and the Killed in deaths', () => {
    const pairKills: MatchEvent[] = []
    const pairKilled: MatchEvent[] = []
    for (const m of matches) {
      for (const a of m.actors.filter((x) => x.kind === 'human')) {
        for (const e of a.events) if (e.kill_killed_pair) (e.raw === 'Kill' ? pairKills : pairKilled).push(e)
      }
    }
    expect(pairKills).toHaveLength(3)
    expect(pairKilled).toHaveLength(3)
    // the paired Kill is not in the kill totals (2,236 above is BotKill only); the Killed is in the death totals
    expect(pairKilled.every(isDeath)).toBe(true)
    expect(pairKills.some(isKill)).toBe(false)
    expect(index.matches.reduce((s, m) => s + m.counts.kill_killed_pair, 0)).toBe(3)
  })

  it('leaves out bot and unknown journeys: counting them too would give different totals', () => {
    const everyone = { kills: eventTotals('kills', ['human', 'bot', 'unknown']), deaths: eventTotals('deaths', ['human', 'bot', 'unknown']) }
    for (const layer of ['kills', 'deaths'] as const) {
      const key = `AmbroseValley|all`
      expect(everyone[layer][key]).toBeGreaterThan(heatmaps.AmbroseValley.totals[layer].all)
    }
  })

  it.each(['kills', 'deaths'] as const)('%s: per cell, the match files differ only where 4-decimal positions cross a cell edge (≤ 1 %)', (layer) => {
    let different = 0
    let events = 0
    for (const id of MAP_IDS) {
      const recount = new Map<string, number>()
      for (const m of matches.filter((x) => x.map === id)) {
        for (const a of m.actors.filter((x) => x.kind === 'human')) {
          for (const e of a.events.filter(layer === 'kills' ? isKill : isDeath)) {
            const k = cellOf(e.u, e.v).join()
            recount.set(k, (recount.get(k) ?? 0) + 1)
          }
        }
      }
      const stored = new Map(heatmaps[id].layers[layer].all.map(([i, j, v]) => [`${i},${j}`, v]))
      for (const k of new Set([...recount.keys(), ...stored.keys()])) different += Math.abs((recount.get(k) ?? 0) - (stored.get(k) ?? 0))
      events += heatmaps[id].totals[layer].all
    }
    expect(different / events).toBeLessThanOrEqual(0.01)
  })
})

describe('traffic', () => {
  const fromSegments = trafficTotals(['human'])

  it.each(MAP_IDS)('%s: cell sums match the total within cell rounding, and the total is the sum of the 30 s-or-shorter steps', (id) => {
    const file = heatmaps[id]
    for (const key of dateKeys(file)) {
      const cells = file.layers.traffic[key] ?? []
      expect(Math.abs(sumCells(cells) - file.totals.traffic[key])).toBeLessThanOrEqual(0.05 * cells.length + 1e-6)
      expect(fromSegments[`${id}|${key}`] ?? 0).toBe(file.totals.traffic[key])
    }
  })

  it('segments are split at gaps over 30 s, and such gaps exist (so gaps adding nothing is actually tested)', () => {
    let gaps = 0
    for (const m of matches) {
      for (const a of m.actors.filter((x) => x.kind === 'human')) {
        for (let k = 1; k < a.segments.length; k++) {
          const gap = a.segments[k][0][0] - a.segments[k - 1].at(-1)![0]
          expect(gap).toBeGreaterThan(30)
          gaps++
        }
        for (const segment of a.segments) for (let k = 1; k < segment.length; k++) expect(segment[k][0] - segment[k - 1][0]).toBeLessThanOrEqual(30)
      }
    }
    expect(gaps).toBeGreaterThan(0)
  })

  it('leaves out bot and unknown journeys', () => {
    const everyone = trafficTotals(['human', 'bot', 'unknown'])
    expect(everyone['AmbroseValley|all']).toBeGreaterThan(heatmaps.AmbroseValley.totals.traffic.all)
  })
})

describe('dates (UTC start date of the match)', () => {
  it('every match is filed under the UTC date of its first recorded event', () => {
    for (const m of index.matches) expect(m.start_utc.slice(0, 10)).toBe(m.date)
  })

  it('the heatmap date keys are the dates of matches with a human journey on that map', () => {
    for (const id of MAP_IDS) {
      const expected = new Set<string>()
      for (const m of index.matches) if (m.map === id && m.humans > 0) expected.add(m.date)
      expect(new Set(dateKeys(heatmaps[id]).filter((k) => k !== 'all'))).toEqual(expected)
    }
  })

  it('the match that runs past midnight (starts 2026-02-09 23:58:55 UTC) is wholly in 2026-02-09', () => {
    const m = matches.find((x) => x.id === 'e325a53a')!
    expect(m.date).toBe('2026-02-09')
    const seconds = m.actors
      .filter((a) => a.kind === 'human')
      .reduce((s, a) => s + a.segments.reduce((t, seg) => t + (seg.length ? seg.at(-1)![0] - seg[0][0] : 0), 0), 0)
    const file = heatmaps[m.map]
    expect(file.totals.traffic['2026-02-09']).toBe(seconds)
    expect(file.samples['2026-02-09']).toEqual({ matches: 1, human_journeys: 1 })
  })

  it.each(MAP_IDS.flatMap((id) => (['kills', 'deaths', 'traffic'] as const).map((layer) => [id, layer] as const)))(
    '%s %s: all dates equals the sum of the days (counts exactly, traffic within 0.2 s per cell)',
    (id, layer) => {
      const byDate = heatmaps[id].layers[layer]
      const sum = new Map<string, number>()
      for (const [key, cells] of Object.entries(byDate)) {
        if (key !== 'all') for (const [i, j, v] of cells) sum.set(`${i},${j}`, (sum.get(`${i},${j}`) ?? 0) + v)
      }
      const all = new Map(byDate.all.map(([i, j, v]) => [`${i},${j}`, v]))
      expect(new Set(all.keys())).toEqual(new Set(sum.keys()))
      const tolerance = layer === 'traffic' ? 0.2 + 1e-6 : 0
      for (const [k, v] of all) expect(Math.abs(v - (sum.get(k) ?? 0))).toBeLessThanOrEqual(tolerance)
    },
  )
})

describe('empty selections', () => {
  it('GrandRift has no human data on 2026-02-09: no key anywhere, though the date list offers it', () => {
    const file = heatmaps.GrandRift
    expect(index.dates.some((d) => d.date === '2026-02-09')).toBe(true)
    expect(file.samples['2026-02-09']).toBeUndefined()
    for (const layer of ['kills', 'deaths', 'traffic'] as const) {
      expect(file.layers[layer]['2026-02-09']).toBeUndefined()
      expect(file.totals[layer]['2026-02-09']).toBeUndefined()
    }
  })

  it('AmbroseValley deaths on 2026-02-09: the key exists, the layer is empty and the total is 0', () => {
    const file = heatmaps.AmbroseValley
    expect(file.layers.deaths['2026-02-09']).toEqual([])
    expect(file.totals.deaths['2026-02-09']).toBe(0)
    expect(file.samples['2026-02-09'].matches).toBe(1)
  })

  it('every stored cell is positive and inside the grid', () => {
    for (const file of Object.values(heatmaps)) {
      for (const byDate of Object.values(file.layers)) {
        for (const cells of Object.values(byDate)) {
          for (const [i, j, v] of cells) {
            expect(v).toBeGreaterThan(0)
            expect(i).toBeGreaterThanOrEqual(0)
            expect(i).toBeLessThan(file.grid)
            expect(j).toBeGreaterThanOrEqual(0)
            expect(j).toBeLessThan(file.grid)
          }
        }
      }
    }
  })
})
