import { describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Index } from '../data/types'
import { contentBounds } from './content'
import { SPACE_WIDTH, contentRect, fitRectZoom, fitZoom, spaceHeight } from './space'

const { maps } = indexJson as Index

/** An image of width × height: black, with a bright rectangle (pixel columns x0..x1, rows y0..y1) as the map. */
function image(width: number, height: number, [x0, y0, x1, y1]: number[], level = 120) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([level, level, level, 255], (y * width + x) * 4)
  return data
}

describe('contentBounds', () => {
  it('finds the box of the bright pixels as fractions of the image, top = 0', () => {
    const b = contentBounds(image(100, 50, [20, 10, 80, 40]), 100, 50)
    expect(b).toEqual({ left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 })
  })

  it('an image that is all black has no content', () => {
    expect(contentBounds(new Uint8ClampedArray(100 * 50 * 4), 100, 50)).toBeNull()
  })

  it('ignores a stray speck, but not a real edge', () => {
    const data = image(100, 100, [30, 30, 70, 70])
    data.set([255, 255, 255, 255], (5 * 100 + 5) * 4) // one bright pixel in the corner
    expect(contentBounds(data, 100, 100)).toEqual({ left: 0.3, top: 0.3, right: 0.7, bottom: 0.7 })
  })

  it('dark pixels below the threshold are not map', () => {
    expect(contentBounds(image(100, 100, [30, 30, 70, 70], 30), 100, 100)).toBeNull()
    expect(contentBounds(image(100, 100, [30, 30, 70, 70], 41), 100, 100)).not.toBeNull()
  })
})

describe('fitting the content instead of the whole image', () => {
  // measured with pipeline-side Pillow on the shipped images (threshold 40): GrandRift's island is the case that matters
  const grandRiftBounds = { left: 0.078, top: 0.195, right: 0.957, bottom: 0.879 }

  it('adds a margin on every side and stays on the map', () => {
    const r = contentRect({ left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 }, maps.AmbroseValley, 0.05)
    expect(r.left).toBeCloseTo(200 - 30, 9)
    expect(r.right).toBeCloseTo(800 + 30, 9)
    const edge = contentRect({ left: 0, top: 0, right: 1, bottom: 1 }, maps.AmbroseValley, 0.05)
    expect(edge).toEqual({ left: 0, top: 0, right: SPACE_WIDTH, bottom: spaceHeight(maps.AmbroseValley) })
  })

  it('GrandRift: the default view is closer than fitting the whole image, and still shows the whole island', () => {
    const map = maps.GrandRift
    const rect = contentRect(grandRiftBounds, map)
    const [w, h] = [1120, 740]
    const closer = fitRectZoom(w, h, rect)
    expect(closer).toBeGreaterThan(fitZoom(w, h, map) + 0.4)
    // every edge of the island is inside the view
    const scale = 2 ** closer
    expect((rect.right - rect.left) * scale).toBeLessThanOrEqual(w)
    expect((rect.bottom - rect.top) * scale).toBeLessThanOrEqual(h)
  })

  it('a rectangle that is the whole map fits like the whole map', () => {
    const map = maps.Lockdown
    const rect = { left: 0, top: 0, right: SPACE_WIDTH, bottom: spaceHeight(map) }
    expect(fitRectZoom(900, 600, rect)).toBeCloseTo(fitZoom(900, 600, map), 12)
  })
})
