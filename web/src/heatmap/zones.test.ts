// The interpretation layer's logic on the real generated files (spec 06, Stage 6b). The pipeline's own tests check how the
// statistics are computed; these check that what the browser reads is consistent, placed correctly and described honestly.
import { describe, expect, it } from 'vitest'
import AmbroseValleyHeat from '../../public/data/heatmaps/AmbroseValley.json'
import GrandRiftHeat from '../../public/data/heatmaps/GrandRift.json'
import LockdownHeat from '../../public/data/heatmaps/Lockdown.json'
import indexJson from '../../public/data/index.json'
import AmbroseValleyZones from '../../public/data/zones/AmbroseValley.json'
import GrandRiftZones from '../../public/data/zones/GrandRift.json'
import LockdownZones from '../../public/data/zones/Lockdown.json'
import type { HeatmapFile, Index, ZoneRecord, ZonesFile } from '../data/types'
import { imageBounds, spaceHeight } from '../map/space'
import { cellRect } from './grid'
import {
  footprintPolygon,
  insideOutline,
  layerOf,
  passingZones,
  shareOf,
  sharePercent,
  zoneFootprint,
  zoneKey,
  zoneLayer,
  zoneMetric,
  zoneOutline,
  zoneSupportText,
  zoneValueText,
} from './zones'

const index = indexJson as Index
const files = { AmbroseValley: AmbroseValleyZones, GrandRift: GrandRiftZones, Lockdown: LockdownZones } as unknown as Record<string, ZonesFile>
const heat = { AmbroseValley: AmbroseValleyHeat, GrandRift: GrandRiftHeat, Lockdown: LockdownHeat } as unknown as Record<string, HeatmapFile>
const MAPS = Object.keys(files)
const LAYERS = ['kills', 'deaths', 'traffic'] as const

/** The published rules a region failed (empty when it passes them all); a test-side reading of the rules, not used by the interface. */
function failedChecks(z: ZoneRecord, rules: ZonesFile['rules']): string[] {
  const failed: string[] = []
  if (z.matches < rules.min_matches) failed.push('matches')
  if (z.largest_match_share > rules.max_one_match_share) failed.push('one match')
  return failed
}

describe('the generated region files', () => {
  it.each(MAPS)('%s: the same selections as the heatmap, and layer totals equal the heatmap totals', (id) => {
    const f = files[id]
    expect(Object.keys(f.selections).sort()).toEqual(Object.keys(heat[id].samples).sort())
    for (const [key, selection] of Object.entries(f.selections)) {
      expect(selection.matches).toBe(heat[id].samples[key].matches)
      for (const layer of LAYERS) {
        expect(selection.layers[layer].total).toBeCloseTo(heat[id].totals[layer][key], layer === 'traffic' ? -0.3 : 6)
      }
    }
  })

  it.each(MAPS)('%s: every hotspot meets the published rules, strongest first, at most the cap, and the counts add up', (id) => {
    const { rules, selections } = files[id]
    for (const selection of Object.values(selections)) {
      for (const layer of LAYERS) {
        const result = selection.layers[layer]
        expect(result.hotspots).toBe(result.zones.length)
        expect(result.zones.length).toBeLessThanOrEqual(rules.max_hotspots)
        expect(result.zones.reduce((sum, z) => sum + z.share, 0)).toBeLessThanOrEqual(1.0001)
        expect(result.zones.map((z) => z.value)).toEqual([...result.zones.map((z) => z.value)].sort((a, b) => b - a))
        for (const z of result.zones) {
          expect(failedChecks(z, rules)).toEqual([])
          expect(z.matches).toBeLessThanOrEqual(selection.matches)
          expect(z.players).toBeLessThanOrEqual(selection.players)
        }
      }
    }
  })

  it('the approved hotspot rules are the ones the files were built with', () => {
    expect(AmbroseValleyZones.rules).toEqual({ min_matches: 5, max_one_match_share: 0.5, max_hotspots: 6 })
  })

  it.each(MAPS)('%s: storm deaths are kept inside the deaths and reported beside them', (id) => {
    const { all } = files[id].selections
    expect(all.layers.deaths.storm_deaths).toBeGreaterThan(0)
    expect(all.layers.deaths.storm_deaths).toBeLessThanOrEqual(all.layers.deaths.total)
    expect(all.layers.kills.storm_deaths).toBeUndefined()
    for (const z of all.layers.deaths.zones) expect(z.storm_deaths).toBeLessThanOrEqual(z.value)
  })

  it('storm deaths over the three maps are the 39 recorded', () => {
    const total = MAPS.reduce((sum, id) => sum + (files[id].selections.all.layers.deaths.storm_deaths ?? 0), 0)
    expect(total).toBe(39)
  })

  it('journeys are given for traffic only, and no region has more journeys than the selection has matches\' worth of players allows', () => {
    for (const id of MAPS) {
      const { all } = files[id].selections
      expect(all.layers.traffic.zones.every((z) => z.journeys !== undefined && z.journeys >= z.matches)).toBe(true)
      expect(all.layers.kills.zones.concat(all.layers.deaths.zones).every((z) => z.journeys === undefined)).toBe(true)
    }
  })
})

describe('which regions are shown', () => {
  it('hotspots are the listed regions, strongest first', () => {
    const layer = zoneLayer(AmbroseValleyZones as unknown as ZonesFile, null, 'kills')!
    const hotspots = passingZones(layer)
    expect(hotspots).toHaveLength(layer.hotspots)
    expect(hotspots.map((z) => z.value)).toEqual([...hotspots.map((z) => z.value)].sort((a, b) => b - a))
  })

  it('does not force any: some layers have none', () => {
    for (const [id, layerName] of [['GrandRift', 'deaths']] as const) {
      expect(passingZones(zoneLayer(files[id], null, layerName)!)).toHaveLength(0)
    }
  })

  it('a date with no human journeys has no region data; a date with one match cannot have a hotspot', () => {
    expect(zoneLayer(GrandRiftZones as unknown as ZonesFile, '2026-02-09', 'traffic')).toBeUndefined()
    for (const layer of LAYERS) expect(zoneLayer(AmbroseValleyZones as unknown as ZonesFile, '2026-02-09', layer)!.hotspots).toBe(0)
  })

  it('single-date selections have their own evidence, not the all-dates verdict', () => {
    const all = zoneLayer(AmbroseValleyZones as unknown as ZonesFile, null, 'traffic')!
    const day = zoneLayer(AmbroseValleyZones as unknown as ZonesFile, '2026-02-14', 'traffic')!
    expect(day.total).toBeLessThan(all.total)
    for (const z of day.zones) {
      const sample = AmbroseValleyZones.selections['2026-02-14']
      expect(z.matches).toBeLessThanOrEqual(sample.matches)
    }
  })
})

describe('where a region is drawn', () => {
  const zone = (i: number, j: number) => ({ i, j })

  it.each(MAPS)('%s: the footprint is exactly the union of its 4 × 4 heatmap cells', (id) => {
    const map = index.maps[id]
    const { zone_cells: n, grid } = files[id]
    const rect = zoneFootprint(zone(5, 9), map, n, grid)
    const cells = [] as ReturnType<typeof cellRect>[]
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) cells.push(cellRect(5 * n + a, 9 * n + b, map, grid))
    expect(rect.left).toBeCloseTo(Math.min(...cells.map((c) => c.left)), 9)
    expect(rect.right).toBeCloseTo(Math.max(...cells.map((c) => c.right)), 9)
    expect(rect.top).toBeCloseTo(Math.min(...cells.map((c) => c.top)), 9)
    expect(rect.bottom).toBeCloseTo(Math.max(...cells.map((c) => c.bottom)), 9)
    const area = cells.reduce((sum, c) => sum + (c.right - c.left) * (c.bottom - c.top), 0)
    expect((rect.right - rect.left) * (rect.bottom - rect.top)).toBeCloseTo(area, 6)
  })

  it.each(MAPS)('%s: the corner regions sit on the corners of the minimap, GrandRift included', (id) => {
    const map = index.maps[id]
    const { zone_cells: n, grid, zones_per_side: z } = files[id]
    const [left, bottom, right, top] = imageBounds(map)
    expect(zoneFootprint(zone(0, 0), map, n, grid)).toMatchObject({ left, bottom })
    expect(zoneFootprint(zone(z - 1, z - 1), map, n, grid)).toMatchObject({ right, top })
    expect(spaceHeight(map)).toBeGreaterThan(0)
  })

  it('every listed region, in every selection, lies inside the map', () => {
    for (const id of MAPS) {
      const map = index.maps[id]
      const { zone_cells: n, grid } = files[id]
      const [left, bottom, right, top] = imageBounds(map)
      for (const selection of Object.values(files[id].selections)) {
        for (const layer of LAYERS) {
          for (const z of selection.layers[layer].zones) {
            const r = zoneFootprint(z, map, n, grid)
            expect(r.left).toBeGreaterThanOrEqual(left - 1e-9)
            expect(r.right).toBeLessThanOrEqual(right + 1e-9)
            expect(r.top).toBeGreaterThanOrEqual(top - 1e-9)
            expect(r.bottom).toBeLessThanOrEqual(bottom + 1e-9)
          }
        }
      }
    }
  })

  it('the outline polygon has the footprint\'s four corners; keys identify a region', () => {
    const rect = { left: 1, top: 2, right: 3, bottom: 4 }
    expect(footprintPolygon(rect)).toEqual([[1, 2], [3, 2], [3, 4], [1, 4]])
    expect(zoneKey({ i: 3, j: 12 })).toBe('3,12')
  })

  it('the region\'s value is the sum of the heatmap cells inside its footprint (kills, all dates)', () => {
    for (const id of MAPS) {
      const f = files[id]
      for (const z of f.selections.all.layers.kills.zones) {
        const inside = heat[id].layers.kills.all.filter(([i, j]) => Math.floor(i / f.zone_cells) === z.i && Math.floor(j / f.zone_cells) === z.j)
        expect(inside.reduce((sum, c) => sum + c[2], 0)).toBe(z.value)
      }
    }
  })
})

describe('how a region is described', () => {
  const sample = (over: Partial<ZoneRecord> = {}): ZoneRecord => ({
    i: 1, j: 1, value: 139, share: 0.084, matches: 57, players: 44, largest_match_share: 0.15, ...over,
  })

  it('says what was recorded with the layer\'s own unit', () => {
    expect(zoneValueText('kills', 139)).toBe('139 kills')
    expect(zoneValueText('kills', 1)).toBe('1 kill')
    expect(zoneValueText('deaths', 25)).toBe('25 deaths')
    expect(zoneValueText('traffic', 2460)).toBe('41 min of estimated player time')
    expect(zoneSupportText(sample())).toBe('57 matches · 44 players')
    expect(zoneMetric('kills', 139)).toEqual({ value: '139', unit: 'kills' })
    expect(zoneMetric('deaths', 1)).toEqual({ value: '1', unit: 'death' })
    expect(zoneMetric('traffic', 136 * 60)).toEqual({ value: '136 min', unit: 'player time' })
    expect(shareOf('kills')).toBe('of all kills')
    expect(shareOf('traffic')).toBe('of all player time')
    expect(zoneSupportText(sample({ matches: 1, players: 1 }))).toBe('1 match · 1 player')
  })

  it('rounds shares honestly: under 1% says so', () => {
    expect(sharePercent(0.0049)).toBe('<1%')
    expect(sharePercent(0.084)).toBe('8%')
  })

  it('a layer helper reads one layer out of a selection', () => {

    expect(layerOf(AmbroseValleyZones.selections.all as never, 'kills')).toBe(AmbroseValleyZones.selections.all.layers.kills)
  })
})

describe('hotspot outlines (circles around the validated regions)', () => {
  it.each(MAPS)('%s: the circle passes through the footprint corners and is centred on it, so it stays on its region at any zoom', (id) => {
    const map = index.maps[id]
    const { zone_cells: n, grid } = files[id]
    const rect = zoneFootprint({ i: 6, j: 6 }, map, n, grid)
    const o = zoneOutline(rect)
    expect(o.cx).toBeCloseTo((rect.left + rect.right) / 2, 9)
    expect(o.cy).toBeCloseTo((rect.top + rect.bottom) / 2, 9)
    for (const [x, y] of footprintPolygon(rect)) expect(Math.hypot(x - o.cx, y - o.cy)).toBeCloseTo(o.radius, 9)
    expect(insideOutline([o.cx, o.cy], o)).toBe(true)
    expect(insideOutline([o.cx - o.radius * 0.999, o.cy], o)).toBe(true) // just inside the circle's edge
    expect(insideOutline([o.cx + o.radius * 1.01, o.cy], o)).toBe(false)
  })

  it('numbers follow the strongest-first order of the panel', () => {
    for (const layer of LAYERS) {
      const shown = passingZones(files.AmbroseValley.selections.all.layers[layer])
      for (let k = 1; k < shown.length; k++) expect(shown[k].value).toBeLessThanOrEqual(shown[k - 1].value)
    }
  })
})
