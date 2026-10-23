import { describe, expect, it } from 'vitest'
import AmbroseValley from '../../public/data/heatmaps/AmbroseValley.json'
import GrandRift from '../../public/data/heatmaps/GrandRift.json'
import Lockdown from '../../public/data/heatmaps/Lockdown.json'
import indexJson from '../../public/data/index.json'
import type { HeatmapCell, HeatmapFile, Index } from '../data/types'
import { imageBounds, spaceHeight, uvToSpace } from '../map/space'
import { HEATMAP_GRID, cellOf, cellRect } from './grid'
import { RASTER, cellCentrePixel, cellLookup, renderRaster } from './raster'
import { HEATMAP_MODES, cellStyle, layerDomain } from './scale'

const { maps } = indexJson as Index
const files = { AmbroseValley, GrandRift, Lockdown } as unknown as Record<string, HeatmapFile>
const G = HEATMAP_GRID
const SIZE = G * RASTER.scale
const alphaAt = (data: Uint8ClampedArray, x: number, y: number) => data[(y * SIZE + x) * 4 + 3]
const pixel = ([x, y]: [number, number]) => [Math.round(x), Math.round(y)] as const

describe('painting a picture from the grid', () => {
  it('is one square texture over the whole minimap, 8 pixels per cell', () => {
    const r = renderRaster([[10, 20, 3]], 'kills', 'focused', 10)
    expect([r.width, r.height, r.data.length]).toEqual([SIZE, SIZE, SIZE * SIZE * 4])
  })

  it('an empty layer, and cells with no value, paint nothing', () => {
    expect(renderRaster([], 'traffic', 'focused', 100).data.every((v, k) => k % 4 !== 3 || v === 0)).toBe(true)
    const zero = renderRaster([[5, 5, 0]], 'kills', 'focused', 10)
    expect(zero.data.every((v, k) => k % 4 !== 3 || v === 0)).toBe(true)
  })

  it.each(['traffic', 'kills', 'deaths'] as const)('%s: an isolated cell shows exactly its own opacity and colour at its centre', (layer) => {
    const domain = layer === 'traffic' ? 500 : 12
    const value = layer === 'traffic' ? 120 : 7
    for (const mode of HEATMAP_MODES) {
      const { data } = renderRaster([[30, 40, value]], layer, mode, domain)
      const [x, y] = pixel(cellCentrePixel(30, 40))
      const style = cellStyle(layer, mode, value, domain)!
      // the centre pixel sits half a pixel off the cell's true centre, so it is within a hair of the peak
      expect(alphaAt(data, x, y) / 255).toBeGreaterThan(style.alpha * 0.98)
      expect(alphaAt(data, x, y) / 255).toBeLessThanOrEqual(style.alpha + 0.005)
      const k = (y * SIZE + x) * 4
      const [r, g, b] = style.color
      expect(Math.abs(data[k] - r) + Math.abs(data[k + 1] - g) + Math.abs(data[k + 2] - b)).toBeLessThanOrEqual(3)
    }
  })

  it('the soft edge is bounded: it fades to nothing within about 2.4 cells and never reaches a distant cell', () => {
    const { data } = renderRaster([[30, 40, 7]], 'kills', 'focused', 12)
    const [cx, cy] = pixel(cellCentrePixel(30, 40))
    expect(alphaAt(data, cx + Math.ceil(RASTER.sigmaCells * RASTER.reachSigmas * RASTER.scale) + 2, cy)).toBe(0)
    expect(alphaAt(data, cx + 4 * RASTER.scale, cy)).toBe(0)
    let last = 255
    for (let dx = 0; dx <= 20; dx++) {
      const a = alphaAt(data, cx + dx, cy)
      expect(a).toBeLessThanOrEqual(last) // falls off steadily
      last = a
    }
    expect(alphaAt(data, cx + 20, cy)).toBe(0)
  })

  it('the opacity peak is each cell\'s own: a strong cell never raises a weak isolated cell, and nothing exceeds the strongest cell', () => {
    const cells: HeatmapCell[] = [[10, 10, 2], [40, 40, 12]]
    const { data } = renderRaster(cells, 'deaths', 'focused', 12)
    const weak = pixel(cellCentrePixel(10, 10))
    const strong = pixel(cellCentrePixel(40, 40))
    expect(alphaAt(data, ...weak) / 255).toBeCloseTo(cellStyle('deaths', 'focused', 2, 12)!.alpha, 1)
    expect(alphaAt(data, ...strong)).toBeGreaterThan(alphaAt(data, ...weak))
    const top = Math.round(cellStyle('deaths', 'focused', 12, 12)!.alpha * 255)
    let strongest = 0
    for (let k = 3; k < data.length; k += 4) strongest = Math.max(strongest, data[k])
    expect(strongest).toBeLessThanOrEqual(top)
  })

  it('neighbouring cells join into one region without a hole between them', () => {
    const { data } = renderRaster([[20, 20, 6], [21, 20, 6]], 'kills', 'focused', 12)
    const [x0, y] = pixel(cellCentrePixel(20, 20))
    const [x1] = pixel(cellCentrePixel(21, 20))
    const middle = alphaAt(data, Math.round((x0 + x1) / 2), y)
    expect(middle / 255).toBeGreaterThan(cellStyle('kills', 'focused', 6, 12)!.alpha * 0.8)
  })

  it('the picture is a pure function of the cells: the same input gives the same bytes, and the input is untouched', () => {
    const cells: HeatmapCell[] = [[3, 4, 5], [4, 4, 2]]
    const copy = JSON.stringify(cells)
    const a = renderRaster(cells, 'kills', 'all', 9)
    const b = renderRaster(cells, 'kills', 'all', 9)
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true)
    expect(JSON.stringify(cells)).toBe(copy)
  })
})

describe('alignment with the minimap', () => {
  it.each(Object.keys(maps))('%s: a cell\'s centre pixel maps to the centre of its rectangle when the picture is stretched over the minimap bounds', (id) => {
    const map = maps[id]
    const [left, bottom, right, top] = imageBounds(map)
    for (const [i, j] of [[0, 0], [63, 0], [0, 63], [63, 63], [17, 42], [32, 32]] as const) {
      const [px, py] = cellCentrePixel(i, j)
      // texture pixel centres (k + 0.5) → drawing space, over the same bounds the minimap uses
      const x = left + ((px + 0.5) / SIZE) * (right - left)
      const y = top + ((py + 0.5) / SIZE) * (bottom - top)
      const rect = cellRect(i, j, map)
      expect(x).toBeCloseTo((rect.left + rect.right) / 2, 9)
      expect(y).toBeCloseTo((rect.top + rect.bottom) / 2, 9)
    }
  })

  it('north is the top row and west the left column, on every map', () => {
    expect(cellCentrePixel(0, 63)[1]).toBeLessThan(cellCentrePixel(0, 0)[1])
    expect(cellCentrePixel(0, 0)[0]).toBeLessThan(cellCentrePixel(63, 0)[0])
    expect(spaceHeight(maps.GrandRift)).not.toBe(1000) // non-square: the same picture is simply stretched to it
    const [, bottom, , top] = imageBounds(maps.GrandRift)
    expect(uvToSpace(0, 1, maps.GrandRift)[1]).toBe(top)
    expect(uvToSpace(0, 0, maps.GrandRift)[1]).toBe(bottom)
  })

  it('the cell found under a map position is the cell painted there', () => {
    const [i, j] = cellOf(0.5, 0.25)
    const { data } = renderRaster([[i, j, 4]], 'kills', 'all', 4)
    const [x, y] = pixel(cellCentrePixel(i, j))
    expect(alphaAt(data, x, y)).toBeGreaterThan(0)
  })
})

describe('hover reads the cells, never the pixels', () => {
  it('looks a cell up by position and returns its raw stored value', () => {
    const lookup = cellLookup([[3, 4, 12.5], [60, 2, 1]])
    expect(lookup.get(3 * G + 4)).toBe(12.5)
    expect(lookup.get(60 * G + 2)).toBe(1)
    expect(lookup.get(0)).toBeUndefined()
  })

  it.each(Object.keys(files))('%s: every stored cell is found with exactly its stored value, and a hover cell count equals the file\'s', (id) => {
    const cells = files[id].layers.traffic.all
    const lookup = cellLookup(cells, files[id].grid)
    expect(lookup.size).toBe(cells.length)
    for (const [i, j, v] of cells) expect(lookup.get(i * files[id].grid + j)).toBe(v)
  })
})

describe('real layers', () => {
  it.each(Object.keys(files))('%s traffic: painting takes well under a second and a Hotspots picture is mostly faint', (id) => {
    const cells = files[id].layers.traffic.all
    const start = performance.now()
    const { data } = renderRaster(cells, 'traffic', 'focused', layerDomain(files[id].layers.traffic))
    expect(performance.now() - start).toBeLessThan(1000)
    const painted = data.filter((_, k) => k % 4 === 3 && data[k] > 0)
    const strong = painted.filter((a) => a >= 128)
    expect(strong.length / painted.length).toBeLessThan(0.2)
  })
})
