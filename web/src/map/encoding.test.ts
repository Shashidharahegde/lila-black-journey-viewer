import { describe, expect, it } from 'vitest'
import { ACTOR_PRIORITY, MARKER_PRIORITY, MARKER_SCALE, ROUTE_SCALE, ZOOM_DETAIL_LEVELS, zoomStyle } from './encoding'

describe('zoom-dependent styling', () => {
  it('draws wide routes and compact markers on the whole map, thin routes and big markers zoomed in', () => {
    expect(zoomStyle(0)).toEqual({ routeScale: ROUTE_SCALE.out, markerScale: MARKER_SCALE.out })
    expect(zoomStyle(ZOOM_DETAIL_LEVELS)).toEqual({ routeScale: ROUTE_SCALE.in, markerScale: MARKER_SCALE.in })
    expect(ROUTE_SCALE.out).toBeGreaterThan(ROUTE_SCALE.in)
    expect(MARKER_SCALE.in).toBeGreaterThan(MARKER_SCALE.out)
  })

  it('changes steadily in between and stays flat outside the range', () => {
    const half = zoomStyle(ZOOM_DETAIL_LEVELS / 2)
    expect(half.routeScale).toBeCloseTo((ROUTE_SCALE.out + ROUTE_SCALE.in) / 2, 12)
    expect(half.markerScale).toBeCloseTo((MARKER_SCALE.out + MARKER_SCALE.in) / 2, 12)
    expect(zoomStyle(-2)).toEqual(zoomStyle(0))
    expect(zoomStyle(ZOOM_DETAIL_LEVELS + 5)).toEqual(zoomStyle(ZOOM_DETAIL_LEVELS))
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
