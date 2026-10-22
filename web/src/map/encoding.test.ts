import { describe, expect, it } from 'vitest'
import {
  ACTOR_PRIORITY,
  FITTED_MARKER_SHRINK,
  MARKER_PRIORITY,
  MARKER_SCALE,
  ROUTE_SCALE,
  ZOOM_DETAIL_LEVELS,
  zoomStyle,
} from './encoding'

describe('zoom-dependent styling', () => {
  it('draws compact routes and markers on the whole map, wider routes and bigger markers zoomed in', () => {
    expect(zoomStyle(0)).toEqual({ routeScale: ROUTE_SCALE.out, markerScale: MARKER_SCALE.out * FITTED_MARKER_SHRINK.scale })
    expect(zoomStyle(ZOOM_DETAIL_LEVELS)).toEqual({ routeScale: ROUTE_SCALE.in, markerScale: MARKER_SCALE.in })
    expect(ROUTE_SCALE.in).toBeGreaterThan(ROUTE_SCALE.out)
    expect(MARKER_SCALE.in).toBeGreaterThan(MARKER_SCALE.out)
  })

  it('changes steadily in between and stays flat outside the range', () => {
    const half = zoomStyle(ZOOM_DETAIL_LEVELS / 2)
    expect(half.routeScale).toBeCloseTo((ROUTE_SCALE.out + ROUTE_SCALE.in) / 2, 12)
    expect(half.markerScale).toBeCloseTo((MARKER_SCALE.out + MARKER_SCALE.in) / 2, 12)
    expect(zoomStyle(-2)).toEqual(zoomStyle(0))
    expect(zoomStyle(ZOOM_DETAIL_LEVELS + 5)).toEqual(zoomStyle(ZOOM_DETAIL_LEVELS))
  })

  it('shrinks markers further only on the whole-map view, and leaves every other zoom as it was', () => {
    const { levels } = FITTED_MARKER_SHRINK
    const plain = (z: number) => MARKER_SCALE.out + ((MARKER_SCALE.in - MARKER_SCALE.out) * z) / ZOOM_DETAIL_LEVELS
    expect(zoomStyle(levels).markerScale).toBeCloseTo(plain(levels), 12)
    expect(zoomStyle(1).markerScale).toBeCloseTo(plain(1), 12)
    expect(zoomStyle(levels / 2).markerScale).toBeLessThan(plain(levels / 2))
    expect(zoomStyle(levels / 2).markerScale).toBeGreaterThan(zoomStyle(0).markerScale)
  })
})

describe('marker priority where markers overlap', () => {
  it('lets kills, deaths and storm deaths win over loot, whoever logged them', () => {
    const maxActorBonus = Math.max(...Object.values(ACTOR_PRIORITY))
    for (const type of ['kill', 'death', 'storm_death'] as const)
      expect(MARKER_PRIORITY[type]).toBeGreaterThan(MARKER_PRIORITY.loot + maxActorBonus)
  })

  it('puts a human’s marker above the same event from a bot', () => {
    expect(ACTOR_PRIORITY.human).toBeGreaterThan(ACTOR_PRIORITY.unknown)
    expect(ACTOR_PRIORITY.unknown).toBeGreaterThan(ACTOR_PRIORITY.bot)
  })
})
