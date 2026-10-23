import { describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Index } from '../data/types'
import {
  SPACE_WIDTH,
  clampTarget,
  fitZoom,
  focusZoom,
  imageBounds,
  isInsideMap,
  overviewToSpace,
  spaceHeight,
  spaceToUv,
  uvToSpace,
  uvToWorld,
  viewportRect,
} from './space'

const { maps } = indexJson as Index
const MAP_IDS = Object.keys(maps)

describe('drawing space', () => {
  it.each(MAP_IDS)('%s: Y is flipped so north (v = 1) is the top edge', (id) => {
    const map = maps[id]
    const h = spaceHeight(map)
    expect(uvToSpace(0, 1, map)).toEqual([0, 0]) // north-west = top-left
    expect(uvToSpace(0, 0, map)).toEqual([0, h]) // south-west = bottom-left
    expect(uvToSpace(1, 0, map)).toEqual([SPACE_WIDTH, h])
    expect(uvToSpace(1, 1, map)).toEqual([SPACE_WIDTH, 0])
  })

  it.each(MAP_IDS)('%s: image bounds are the same corners, so image and data share one space', (id) => {
    const map = maps[id]
    const [left, bottom, right, top] = imageBounds(map)
    expect([left, top]).toEqual(uvToSpace(0, 1, map))
    expect([right, bottom]).toEqual(uvToSpace(1, 0, map))
  })

  it.each(MAP_IDS)('%s: space → uv undoes uv → space', (id) => {
    const map = maps[id]
    for (const [u, v] of [[0.1, 0.8], [0.73, 0.27], [0.5, 0.5]]) {
      const [x, y] = uvToSpace(u, v, map)
      const back = spaceToUv(x, y, map)
      expect(back[0]).toBeCloseTo(u, 12)
      expect(back[1]).toBeCloseTo(v, 12)
    }
  })

  it('GrandRift keeps its non-square aspect ratio (2160 × 2158)', () => {
    const map = maps.GrandRift
    expect([map.width, map.height]).toEqual([2160, 2158])
    expect(spaceHeight(map)).toBeCloseTo((1000 * 2158) / 2160, 10)
    expect(SPACE_WIDTH / spaceHeight(map)).toBeCloseTo(2160 / 2158, 12)
    // north edge at Y = 0, south edge at Y = 999.07…, not 1000
    expect(uvToSpace(0.5, 0, map)[1]).toBeCloseTo(999.074, 3)
    expect(isInsideMap(500, 999.5, map)).toBe(false)
  })

  it('square maps are 1000 × 1000', () => {
    expect(spaceHeight(maps.AmbroseValley)).toBe(1000)
    expect(spaceHeight(maps.Lockdown)).toBe(1000)
  })
})

describe('cursor → world x/z (hover readout)', () => {
  it('README example: AmbroseValley pixel (78, 890) at 1024 px is about x = −301.45, z = −355.55', () => {
    // README: x = −301.45, z = −355.55 → u = 0.0762, v = 0.1305 → pixel (78, 890) on a 1024 px image.
    const map = maps.AmbroseValley
    const [u, v] = [78 / 1024, 1 - 890 / 1024]
    const world = uvToWorld(u, v, map)
    const onePixel = map.scale / 1024 // the README rounds to whole pixels
    expect(Math.abs(world.x - -301.45)).toBeLessThan(onePixel)
    expect(Math.abs(world.z - -355.55)).toBeLessThan(onePixel)
  })

  it('README example through the drawing space gives back the exact world position', () => {
    const map = maps.AmbroseValley
    const [x, y] = uvToSpace((-301.45 + 370) / 900, (-355.55 + 473) / 900, map)
    const world = uvToWorld(...spaceToUv(x, y, map), map)
    expect(world.x).toBeCloseTo(-301.45, 9)
    expect(world.z).toBeCloseTo(-355.55, 9)
  })

  // Pairs printed by the Python pipeline: lila_pipeline.projection.world_to_uv(map, x, z).
  it.each([
    ['AmbroseValley', 0, 0, 0.411111, 0.525556],
    ['AmbroseValley', -280, 247, 0.1, 0.8],
    ['AmbroseValley', 287, -230, 0.73, 0.27],
    ['GrandRift', 0, 0, 0.499139, 0.499139],
    ['GrandRift', -231.9, 174.8, 0.1, 0.8],
    ['GrandRift', 134.13, -133.13, 0.73, 0.27],
    ['Lockdown', 0, 0, 0.5, 0.5],
    ['Lockdown', -400, 300, 0.1, 0.8],
    ['Lockdown', 230, -230, 0.73, 0.27],
  ])('%s: agrees with the Python projection at x=%d, z=%d', (id, x, z, u, v) => {
    const world = uvToWorld(u, v, maps[id])
    // Python values are printed to 6 decimals: worst case 0.5e-6 × scale (1000) = 0.0005 units
    expect(Math.abs(world.x - x)).toBeLessThan(0.001)
    expect(Math.abs(world.z - z)).toBeLessThan(0.001)
  })

  it.each(MAP_IDS)('%s: map corners are the calibrated world square', (id) => {
    const map = maps[id]
    expect(uvToWorld(0, 0, map)).toEqual({ x: map.origin_x, z: map.origin_z })
    expect(uvToWorld(1, 1, map)).toEqual({ x: map.origin_x + map.scale, z: map.origin_z + map.scale })
  })
})

describe('fit to screen', () => {
  it('a wide panel is limited by height', () => {
    const map = maps.AmbroseValley
    expect(2 ** fitZoom(2000, 800, map, 1)).toBeCloseTo(0.8, 12)
  })

  it('a tall panel is limited by width', () => {
    const map = maps.Lockdown
    expect(2 ** fitZoom(600, 1200, map, 1)).toBeCloseTo(0.6, 12)
  })
})

describe('overview rectangle', () => {
  const map = maps.GrandRift
  const h = spaceHeight(map)

  it('is the visible region around the camera target', () => {
    // zoom 1 on a 400 × 300 px canvas shows 200 × 150 units
    expect(viewportRect([500, 400], 1, 400, 300, map)).toEqual({ left: 400, top: 325, right: 600, bottom: 475 })
  })

  it('is cut to the map when the screen shows more than the map', () => {
    expect(viewportRect([SPACE_WIDTH / 2, h / 2], 0, 2000, 2000, map)).toEqual({ left: 0, top: 0, right: SPACE_WIDTH, bottom: h })
  })

  it('a clamped camera keeps the rectangle inside the map and the same size', () => {
    const target = clampTarget([-100, 5000], 1, 400, 300, map)
    const rect = viewportRect(target, 1, 400, 300, map)
    expect(rect).toEqual({ left: 0, top: h - 150, right: 200, bottom: h })
  })

  it('a click on the overview maps to the same share of the map and stays on it', () => {
    expect(overviewToSpace(0.25, 0.5, map)).toEqual([250, h / 2])
    expect(overviewToSpace(-1, 2, map)).toEqual([0, h])
  })
})

describe('camera bounds', () => {
  const map = maps.GrandRift // not square, so both axes are checked
  const h = spaceHeight(map)

  it('centres the map on an axis where the whole map fits on screen', () => {
    // zoom 0 = 1 screen px per unit: a 2000 × 2000 px canvas shows more than the map
    expect(clampTarget([-500, 9999], 0, 2000, 2000, map)).toEqual([SPACE_WIDTH / 2, h / 2])
  })

  it('stops panning at the map edge when zoomed in', () => {
    // zoom 1 on a 400 × 300 px canvas shows 200 × 150 units
    expect(clampTarget([-100, -100], 1, 400, 300, map)).toEqual([100, 75])
    expect(clampTarget([5000, 5000], 1, 400, 300, map)).toEqual([SPACE_WIDTH - 100, h - 75])
  })

  it('leaves a target that is already inside alone', () => {
    expect(clampTarget([500, 400], 1, 400, 300, map)).toEqual([500, 400])
  })
})

describe('focusZoom (clicking a hotspot zooms in to it)', () => {
  it('the focused thing fills the stated share of the shorter side, whatever the window shape', () => {
    for (const [w, h] of [[1180, 708], [700, 900], [400, 400]]) {
      const extent = 120
      const pixelsPerUnit = 2 ** focusZoom(w, h, extent)
      expect(extent * pixelsPerUnit).toBeCloseTo(0.33 * Math.min(w, h), 6)
    }
  })

  it('a smaller thing needs a closer zoom, one level per halving', () => {
    expect(focusZoom(1000, 800, 50) - focusZoom(1000, 800, 100)).toBeCloseTo(1, 9)
  })

  it.each(MAP_IDS)('%s: a regional hotspot (1/16 of the map wide) is a modest zoom in from the fitted view, not the closest level', (id) => {
    const map = maps[id]
    const view = { w: 1180, h: 708 }
    const fitted = fitZoom(view.w, view.h, map)
    const levels = focusZoom(view.w, view.h, (SPACE_WIDTH / 16) * Math.SQRT2) - fitted
    expect(levels).toBeGreaterThan(0.5)
    expect(levels).toBeLessThan(Math.log2(map.width / SPACE_WIDTH) + 2 - fitted)
  })
})
