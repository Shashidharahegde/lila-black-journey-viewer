import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Index, MatchFile } from '../data/types'
import { SPACE_WIDTH, imageBounds, spaceHeight, uvToSpace } from '../map/space'
import { HEATMAP_GRID, cellOf, cellPolygon, cellRect } from './grid'

const { maps } = indexJson as Index
const MAP_IDS = Object.keys(maps)
const G = HEATMAP_GRID

describe('heatmap grid alignment', () => {
  it.each(MAP_IDS)('%s: the four corner cells sit on the corners of the minimap', (id) => {
    const map = maps[id]
    const [left, bottom, right, top] = imageBounds(map)
    expect(cellRect(0, 0, map)).toMatchObject({ left, bottom }) // south-west
    expect(cellRect(G - 1, 0, map)).toMatchObject({ right, bottom }) // south-east
    expect(cellRect(0, G - 1, map)).toMatchObject({ left, top }) // north-west
    expect(cellRect(G - 1, G - 1, map)).toMatchObject({ right, top }) // north-east
  })

  it('GrandRift is not square, and its cells follow the image ratio', () => {
    const map = maps.GrandRift
    expect(map.width).not.toBe(map.height)
    const { left, right, top, bottom } = cellRect(10, 10, map)
    expect((bottom - top) / (right - left)).toBeCloseTo(map.height / map.width, 12)
  })

  it.each(MAP_IDS)('%s: the 64 × 64 cells tile the map exactly (no gaps, no overlaps)', (id) => {
    const map = maps[id]
    let area = 0
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const r = cellRect(i, j, map)
        area += (r.right - r.left) * (r.bottom - r.top)
        if (i + 1 < G) expect(cellRect(i + 1, j, map).left).toBe(r.right) // east neighbour shares the edge
        if (j + 1 < G) expect(cellRect(i, j + 1, map).bottom).toBe(r.top) // north neighbour shares the edge
      }
    }
    expect(area).toBeCloseTo(SPACE_WIDTH * spaceHeight(map), 6)
  })

  it('the polygon has the rectangle’s four corners', () => {
    const map = maps.AmbroseValley
    const { left, top, right, bottom } = cellRect(5, 7, map)
    expect(cellPolygon(5, 7, map)).toEqual([[left, top], [right, top], [right, bottom], [left, bottom]])
  })

  it('bins like the pipeline: floor, with 1.0 in the last cell and nothing outside the grid', () => {
    expect(cellOf(0, 0)).toEqual([0, 0])
    expect(cellOf(1, 1)).toEqual([G - 1, G - 1])
    expect(cellOf(1 / G, 1 / G)).toEqual([1, 1])
    expect(cellOf(1 / G - 1e-9, 0.5)).toEqual([0, G / 2])
    expect(cellOf(-0.1, 1.2)).toEqual([0, G - 1])
  })

  it('every human kill and death in the match files lies inside the rectangle of the cell it falls in', () => {
    const dir = 'public/data/matches'
    let checked = 0
    for (const file of readdirSync(dir)) {
      const match = JSON.parse(readFileSync(`${dir}/${file}`, 'utf-8')) as MatchFile
      const map = maps[match.map]
      for (const actor of match.actors.filter((a) => a.kind === 'human')) {
        for (const e of actor.events.filter((ev) => ev.type !== 'loot')) {
          const [i, j] = cellOf(e.u, e.v)
          const { left, top, right, bottom } = cellRect(i, j, map)
          const [x, y] = uvToSpace(e.u, e.v, map)
          expect(x).toBeGreaterThanOrEqual(left)
          expect(x).toBeLessThanOrEqual(right)
          expect(y).toBeGreaterThanOrEqual(top)
          expect(y).toBeLessThanOrEqual(bottom)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(2000)
  })
})
