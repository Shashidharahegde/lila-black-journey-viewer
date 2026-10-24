import { describe, expect, it } from 'vitest'
import { MATCH_FRAMING, boundsOf, cameraAt, easeInOutCubic, frameRect, moveDuration, ZOOM_MOTION } from './zoom'

describe('eased camera moves', () => {
  it('eases in and out: starts and ends still, halfway at the middle', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1)
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9)
  })

  it('starts at the first camera and ends at the second', () => {
    const from = { target: [100, 200] as [number, number], zoom: -2 }
    const to = { target: [300, 50] as [number, number], zoom: 1.5 }
    expect(cameraAt(from, to, 0)).toEqual(from)
    const end = cameraAt(from, to, 1)
    expect(end.zoom).toBeCloseTo(1.5)
    expect(end.target[0]).toBeCloseTo(300)
    expect(end.target[1]).toBeCloseTo(50)
  })

  it('keeps one point still on screen while zooming in (no swing past and back)', () => {
    const from = { target: [0, 0] as [number, number], zoom: 0 }
    const to = { target: [100, 0] as [number, number], zoom: 2 }
    // the fixed point P satisfies to = P + (from - P)·s0/s1 → P = 400 / 3
    const p = 400 / 3
    for (const t of [0.25, 0.5, 0.75]) {
      const at = cameraAt(from, to, t)
      const screenX = (p - at.target[0]) * 2 ** at.zoom
      expect(screenX).toBeCloseTo(p) // P's screen offset from the centre at zoom 0
    }
  })

  it('pans in a straight line when the zoom stays the same', () => {
    const at = cameraAt({ target: [0, 0], zoom: 1 }, { target: [10, 20], zoom: 1 }, 0.3)
    expect(at.target[0]).toBeCloseTo(3)
    expect(at.target[1]).toBeCloseTo(6)
  })
})

describe('framing a match', () => {
  it('boxes every point, and none for no points', () => {
    expect(boundsOf([[1, 5], [4, 2], [3, 9]])).toEqual({ left: 1, top: 2, right: 4, bottom: 9 })
    expect(boundsOf([])).toBeNull()
  })

  it('fills the view with the journeys, centred', () => {
    const cam = frameRect({ left: 100, top: 100, right: 200, bottom: 150 }, 800, 600, 2) // whole map at zoom 2, so the cap is not reached
    expect(cam.target).toEqual([150, 125])
    expect(2 ** cam.zoom * 100).toBeCloseTo(800 * MATCH_FRAMING.fill) // the width is the tighter side
  })

  it(`stops ${MATCH_FRAMING.maxLevelsIn} levels in for a tiny journey or a single point`, () => {
    expect(frameRect({ left: 5, top: 5, right: 5, bottom: 5 }, 800, 600, -2).zoom).toBe(-2 + MATCH_FRAMING.maxLevelsIn)
  })
})

describe('how long a move takes', () => {
  const from = { target: [0, 0] as [number, number], zoom: 0 }
  it('is the base duration for a move that goes nowhere', () => {
    expect(moveDuration(from, from, 1000, 600)).toBe(ZOOM_MOTION.duration)
  })
  it('grows with the zoom levels crossed and the distance panned, and is capped', () => {
    const near = moveDuration(from, { target: [0, 0], zoom: 1 }, 1000, 600)
    const far = moveDuration(from, { target: [500, 0], zoom: 3 }, 1000, 600)
    expect(near).toBeGreaterThan(ZOOM_MOTION.duration)
    expect(far).toBeGreaterThan(near)
    expect(moveDuration(from, { target: [1e6, 0], zoom: 10 }, 1000, 600)).toBe(1600)
  })
})
