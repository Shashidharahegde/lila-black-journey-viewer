import { describe, expect, it } from 'vitest'
import AmbroseValley from '../../public/data/heatmaps/AmbroseValley.json'
import GrandRift from '../../public/data/heatmaps/GrandRift.json'
import Lockdown from '../../public/data/heatmaps/Lockdown.json'
import type { HeatmapFile } from '../data/types'
import { focusedTicks, trafficTicks } from './legend'
import { layerDomain, strongPosition, trafficPosition } from './scale'

const files = { AmbroseValley, GrandRift, Lockdown } as unknown as Record<string, HeatmapFile>

describe('traffic legend ticks (kills and deaths use count classes, not a bar)', () => {
  it.each(Object.keys(files))('%s: every tick value sits at the intensity its cell would get', (id) => {
    const max = layerDomain(files[id].layers.traffic)
    const ticks = trafficTicks(max)
    expect(ticks.length).toBeGreaterThan(1)
    for (const tick of ticks) {
      expect(tick.t).toBe(trafficPosition(tick.value, max))
      expect(tick.t).toBeGreaterThan(0)
      expect(tick.t).toBeLessThanOrEqual(1)
    }
  })

  it.each(Object.keys(files))('%s: a handful of ticks that rise, keep clear of each other, and end on the domain maximum', (id) => {
    const max = layerDomain(files[id].layers.traffic)
    const ticks = trafficTicks(max)
    expect(ticks.length).toBeLessThanOrEqual(5)
    for (let k = 1; k < ticks.length; k++) {
      expect(ticks[k].value).toBeGreaterThan(ticks[k - 1].value)
      expect(ticks[k].t - ticks[k - 1].t).toBeGreaterThanOrEqual(0.2 - 1e-9)
    }
    expect(ticks.at(-1)!.value).toBe(max)
    expect(ticks.at(-1)!.t).toBe(1)
  })

  it('round times, with the maximum labelled as it is; no maximum, no ticks', () => {
    expect(trafficTicks(3059.8).map((t) => t.label)).toEqual(['1 s', '10 s', '1 min', '10 min', '51 min'])
    expect(trafficTicks(0)).toEqual([])
    expect(trafficTicks(Number.NaN)).toEqual([])
  })
})

describe('Focused traffic legend ticks (the bar starts at 60 s)', () => {
  it.each(Object.keys(files))('%s: ticks sit at the position their cell would get, rise, and end on the maximum', (id) => {
    const max = layerDomain(files[id].layers.traffic)
    const ticks = focusedTicks(max)
    expect(ticks.length).toBeGreaterThan(1)
    for (const tick of ticks) {
      expect(tick.value).toBeGreaterThanOrEqual(60)
      expect(tick.t).toBe(strongPosition(tick.value, max))
    }
    for (let k = 1; k < ticks.length; k++) expect(ticks[k].value).toBeGreaterThan(ticks[k - 1].value)
    expect(ticks.at(-1)).toMatchObject({ value: max, t: 1 })
  })

  it('no ticks when the map has nothing above the threshold', () => {
    expect(focusedTicks(60)).toEqual([])
    expect(focusedTicks(Number.NaN)).toEqual([])
  })
})
