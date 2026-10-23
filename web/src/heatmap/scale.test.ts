import { describe, expect, it } from 'vitest'
import AmbroseValley from '../../public/data/heatmaps/AmbroseValley.json'
import GrandRift from '../../public/data/heatmaps/GrandRift.json'
import Lockdown from '../../public/data/heatmaps/Lockdown.json'
import type { HeatmapCell, HeatmapFile } from '../data/types'
import { HEATMAP_LAYERS } from '../state/url'
import {
  COUNT_BANDS,
  COUNT_STYLE,
  baseColor,
  cellStyle,
  countBand,
  countSwatch,
  layerDomain,
  TRAFFIC_FOCUS,
  strongPosition,
  trafficAllAlpha,
  trafficFocusedStyle,
  trafficColor,
  trafficGradient,
  trafficPosition,
} from './scale'

const files = { AmbroseValley, GrandRift, Lockdown } as unknown as Record<string, HeatmapFile>

describe('traffic colour', () => {
  it('runs teal to cyan to yellow, and clamps outside 0–1', () => {
    expect(trafficColor(0)).toEqual([0x1a, 0x7f, 0xa3])
    expect(trafficColor(0.85)).toEqual([0xff, 0xe9, 0x53])
    expect(trafficColor(-2)).toEqual(trafficColor(0))
    expect(trafficColor(9)).toEqual(trafficColor(1))
    for (let k = 0; k <= 20; k++) {
      const [r, g] = trafficColor(k / 20)
      expect(g).toBeGreaterThanOrEqual(r - 25) // never red or magenta
    }
    expect(trafficGradient()).toBe('linear-gradient(to right, #1a7fa3 0%, #38d3e0 50%, #ffe953 85%, #fff6a8 100%)')
  })

  it('position is log1p over the fixed domain: 0 → nothing, max → 1, low values lifted above linear', () => {
    expect(trafficPosition(0, 3000)).toBeNull()
    expect(trafficPosition(-1, 3000)).toBeNull()
    expect(trafficPosition(Number.NaN, 3000)).toBeNull()
    expect(trafficPosition(5, 0)).toBeNull()
    expect(trafficPosition(3000, 3000)).toBe(1)
    expect(trafficPosition(4000, 3000)).toBe(1)
    expect(trafficPosition(30, 3000)).toBeCloseTo(Math.log1p(30) / Math.log1p(3000), 12)
    expect(trafficPosition(30, 3000)!).toBeGreaterThan(30 / 3000)
  })

  const grid = Array.from({ length: 101 }, (_, k) => k / 100)

  it('All activity: opacity between 0 and 1, never falling as intensity rises, with a visible floor', () => {
    let last = -1
    for (const t of grid) {
      const a = trafficAllAlpha(t)
      expect(a).toBeGreaterThanOrEqual(0.15)
      expect(a).toBeLessThanOrEqual(1)
      expect(a).toBeGreaterThanOrEqual(last - 1e-12)
      last = a
    }
    expect(trafficAllAlpha(1)).toBeGreaterThanOrEqual(0.84)
  })
})

describe('traffic visibility policy (Focused view, S 2026-10-23)', () => {
  const MAX = 3060
  const alphaOf = (v: number, max = MAX) => trafficFocusedStyle(v, max)?.alpha ?? 0

  it('under 30 s of estimated player time per cell is not drawn at all', () => {
    expect(TRAFFIC_FOCUS.hideBelow).toBe(30)
    for (const v of [0, 0.1, 8.8, 29, 29.999]) expect(trafficFocusedStyle(v, MAX)).toBeNull()
    expect(trafficFocusedStyle(Number.NaN, MAX)).toBeNull()
    expect(trafficFocusedStyle(-5, MAX)).toBeNull()
  })

  it('30 to under 60 s is extremely faint (at most 6% opaque), rising a little with the value', () => {
    expect(alphaOf(30)).toBeCloseTo(0.03, 9)
    expect(alphaOf(59.999)).toBeLessThan(0.06)
    for (let v = 30; v < 60; v += 1) expect(alphaOf(v)).toBeLessThanOrEqual(0.06)
    expect(alphaOf(45)).toBeGreaterThan(alphaOf(31))
  })

  it('from 60 s it rises steadily, with a clear step up from the faint trace, and the top is far brighter than a typical visible cell', () => {
    expect(alphaOf(60)).toBeCloseTo(0.1, 9)
    expect(alphaOf(60)).toBeGreaterThan(alphaOf(59.999) + 0.03)
    let last = 0
    for (let v = 60; v <= MAX; v *= 1.07) {
      expect(alphaOf(v)).toBeGreaterThanOrEqual(last)
      last = alphaOf(v)
    }
    expect(alphaOf(MAX)).toBeCloseTo(0.95, 9)
    expect(alphaOf(MAX)).toBeGreaterThan(alphaOf(120) * 4) // the strongest cell against a typical visible one
  })

  it('values beyond the scale maximum stay at the top, and the colour warms from teal to yellow with the value', () => {
    expect(alphaOf(MAX * 2)).toBeCloseTo(alphaOf(MAX), 9)
    expect(trafficFocusedStyle(30, MAX)!.color).toEqual(trafficColor(0))
    expect(trafficFocusedStyle(60, MAX)!.color).toEqual(trafficColor(0))
    expect(trafficFocusedStyle(MAX, MAX)!.color).toEqual(trafficColor(1))
    expect(strongPosition(60, MAX)).toBe(0)
    expect(strongPosition(MAX, MAX)).toBe(1)
    expect(strongPosition(5000, 50)).toBe(1) // a map whose maximum is under the threshold has nothing to scale
  })

  it('thresholds are absolute seconds: they do not move with the map, date, or what else is in the selection', () => {
    for (const max of [327, 1000, 3060]) {
      expect(trafficFocusedStyle(29.9, max)).toBeNull()
      expect(alphaOf(30, max)).toBeCloseTo(0.03, 9)
      expect(alphaOf(60, max)).toBeCloseTo(0.1, 9)
    }
  })

  it('the style comes only from the value and the map\'s fixed maximum, so a value looks the same on every date', () => {
    for (const id of Object.keys(files)) {
      const max = layerDomain(files[id].layers.traffic)
      const seen = new Map<number, string>()
      let compared = 0
      for (const cells of Object.values(files[id].layers.traffic) as HeatmapCell[][]) {
        for (const [, , v] of cells) {
          const look = JSON.stringify(cellStyle('traffic', 'focused', v, max))
          if (seen.has(v)) compared++
          expect(seen.get(v) ?? look).toBe(look)
          seen.set(v, look)
        }
      }
      expect(compared).toBeGreaterThan(0)
    }
  })

  it('on the real grids (all dates): how much each map shows, with the share of cells in each tier from the data', () => {
    const tiers = (id: string) => {
      const cells = files[id].layers.traffic.all
      const max = layerDomain(files[id].layers.traffic)
      const hidden = cells.filter(([, , v]) => v < 30).length
      const faint = cells.filter(([, , v]) => v >= 30 && v < 60).length
      const strong = cells.filter(([, , v]) => v >= 60)
      const bright = strong.filter(([, , v]) => (trafficFocusedStyle(v, max)?.alpha ?? 0) >= 0.5).length
      return { n: cells.length, hidden: hidden / cells.length, faint: faint / cells.length, strong: strong.length / cells.length, bright: bright / cells.length }
    }
    const av = tiers('AmbroseValley')
    expect(av.hidden).toBeCloseTo(0.31, 1)
    expect(av.strong).toBeCloseTo(0.49, 1)
    expect(av.bright).toBeLessThan(0.15) // only a small share of cells is bright: the strongest concentrations dominate
    expect(av.bright).toBeGreaterThan(0.02)
    const gr = tiers('GrandRift')
    expect(gr.hidden).toBeGreaterThan(0.8) // a thin map: most of GrandRift's traffic is under 30 s per cell
    expect(gr.strong).toBeLessThan(0.08)
    const ld = tiers('Lockdown')
    expect(ld.strong).toBeCloseTo(0.3, 1)
  })

  it('a hidden cell is still in the data: its value is untouched and a lookup returns it', () => {
    const cells = files.GrandRift.layers.traffic.all
    const hiddenCell = cells.find(([, , v]) => v < 30)!
    expect(trafficFocusedStyle(hiddenCell[2], layerDomain(files.GrandRift.layers.traffic))).toBeNull()
    expect(hiddenCell[2]).toBeGreaterThan(0)
  })
})

describe('kills and deaths: absolute count classes', () => {
  it('a count falls in 1, 2–3, 4–9 or 10+; nothing below 1 has a class', () => {
    expect(COUNT_BANDS.map((b) => b.label)).toEqual(['1', '2–3', '4–9', '10+'])
    const cases: [number, number | null][] = [[0, null], [0.5, null], [-3, null], [Number.NaN, null], [1, 0], [2, 1], [3, 1], [4, 2], [9, 2], [10, 3], [25, 3]]
    for (const [value, band] of cases) expect(countBand(value)).toBe(band)
  })

  it.each(['kills', 'deaths'] as const)('%s: a count has one look, whatever the map, date, view or domain', (layer) => {
    for (const value of [1, 2, 3, 4, 9, 10, 25]) {
      const expected = cellStyle(layer, 'focused', value, 5)
      expect(cellStyle(layer, 'all', value, 5)).toEqual(expected)
      expect(cellStyle(layer, 'focused', value, 1000)).toEqual(expected)
      expect(cellStyle(layer, 'focused', value, 0)).toEqual(expected) // no scale involved at all
    }
    expect(cellStyle(layer, 'focused', 0, 25)).toBeNull()
    expect(cellStyle(layer, 'focused', -1, 25)).toBeNull()
  })

  it.each(['kills', 'deaths'] as const)('%s: classes 2–3 and 4–9 differ from their neighbours, and opacity and lightness both rise with the count', (layer) => {
    const lum = ([r, g, b]: number[]) => {
      const f = (c: number) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const styles = COUNT_STYLE[layer]
    expect(styles).toHaveLength(4)
    for (let k = 1; k < 4; k++) {
      expect(styles[k].alpha).toBeGreaterThan(styles[k - 1].alpha)
      expect(lum(styles[k].color)).toBeGreaterThan(lum(styles[k - 1].color))
    }
    expect(baseColor(layer)).toEqual(styles[0].color)
    expect(countSwatch(layer, 0)).toMatch(/^rgb\(\d+ \d+ \d+ \/ 0\.\d+\)$/)
  })

  it('kills and deaths keep their own hue families: warm for kills, purple for deaths', () => {
    for (const { color: [r, , b] } of COUNT_STYLE.kills) expect(r).toBeGreaterThan(b + 40)
    COUNT_STYLE.deaths.forEach(({ color: [r, g, b] }, k) => {
      expect(b).toBeGreaterThan(g) // blue above green throughout (the top class is a pale pink)
      if (k < 3) expect(b).toBeGreaterThan(g + 40)
      expect(r).toBeGreaterThan(0x30)
    })
  })

  // Perceptual check on the shipped styles (dE76 in CIELAB over typical minimap colours, deuteranopia and protanopia by the
  // Machado et al. 2009 matrices): neighbouring classes stay clearly apart. The long version of this is
  // docs/evidence/spatial_analysis/count_bands.json (tools/count_bands.py), over each minimap's typical, darkest and brightest colours.
  const BACKGROUNDS = [[51, 55, 44], [37, 43, 29], [119, 117, 112], [103, 69, 40], [61, 33, 18], [133, 101, 48], [55, 91, 98], [41, 49, 53], [84, 128, 140]]
  const DEUTAN = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]
  const PROTAN = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]
  const toLab = (rgb: number[], cvd?: number[][]) => {
    let lin = rgb.map((c) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4))
    if (cvd) lin = cvd.map((row) => Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])))
    const m = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]]
    const white = [0.95047, 1, 1.08883]
    const xyz = m.map((row, k) => (row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]) / white[k])
    const f = xyz.map((v) => (v > 216 / 24389 ? Math.cbrt(v) : ((24389 / 27) * v + 16) / 116))
    return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])]
  }
  const dE = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  const worst = (layer: 'kills' | 'deaths', cvd?: number[][]) => {
    let min = Infinity
    for (const bg of BACKGROUNDS) {
      const labs = COUNT_STYLE[layer].map(({ color, alpha }) => toLab(color.map((c, k) => alpha * c + (1 - alpha) * bg[k]), cvd))
      for (let k = 1; k < labs.length; k++) min = Math.min(min, dE(labs[k - 1], labs[k]))
    }
    return min
  }

  it('neighbouring kill classes are at least 15 dE apart in normal vision and in both colour-vision deficiencies', () => {
    expect(worst('kills')).toBeGreaterThan(15)
    expect(worst('kills', DEUTAN)).toBeGreaterThan(15)
    expect(worst('kills', PROTAN)).toBeGreaterThan(15)
  })

  it('neighbouring death classes are at least 12 dE apart in normal vision and at least 5 dE under colour-vision deficiency', () => {
    expect(worst('deaths')).toBeGreaterThan(12)
    expect(worst('deaths', DEUTAN)).toBeGreaterThan(5)
    expect(worst('deaths', PROTAN)).toBeGreaterThan(5)
  })

  it('on the real grids, all four classes are used for AmbroseValley kills, and the counts per class add up to the occupied cells', () => {
    const cells = files.AmbroseValley.layers.kills.all
    const perBand = [0, 0, 0, 0]
    for (const [, , v] of cells) perBand[countBand(v)!]++
    expect(perBand).toEqual([178, 137, 109, 36]) // 460 occupied cells (docs/evidence/spatial_analysis/count_bands.json)
    expect(perBand.reduce((a, b) => a + b, 0)).toBe(cells.length)
    for (const id of Object.keys(files)) {
      for (const layer of ['kills', 'deaths'] as const) {
        for (const list of Object.values(files[id].layers[layer])) for (const [, , v] of list) expect(countBand(v)).not.toBeNull()
      }
    }
  })

  it('every heatmap layer has a way to be drawn', () => {
    for (const layer of HEATMAP_LAYERS) expect(cellStyle(layer, 'focused', 100, 1000)).not.toBeNull()
  })
})
