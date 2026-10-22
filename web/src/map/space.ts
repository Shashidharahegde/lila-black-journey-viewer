// The one drawing space shared by the minimap image and everything drawn on it.
// X = u · 1000, Y = (1 − v) · 1000 · H/W. Y grows downward because image rows
// count from the top; the H/W factor keeps non-square maps (GrandRift) in proportion.
import type { MapInfo } from '../data/types'

export const SPACE_WIDTH = 1000

export function spaceHeight(map: MapInfo): number {
  return (SPACE_WIDTH * map.height) / map.width
}

export function uvToSpace(u: number, v: number, map: MapInfo): [number, number] {
  return [u * SPACE_WIDTH, (1 - v) * spaceHeight(map)]
}

export function spaceToUv(x: number, y: number, map: MapInfo): [number, number] {
  return [x / SPACE_WIDTH, 1 - y / spaceHeight(map)]
}

/** BitmapLayer bounds [left, bottom, right, top]; with Y downward the top edge is Y = 0. */
export function imageBounds(map: MapInfo): [number, number, number, number] {
  return [0, spaceHeight(map), SPACE_WIDTH, 0]
}

export function isInsideMap(x: number, y: number, map: MapInfo): boolean {
  return x >= 0 && x <= SPACE_WIDTH && y >= 0 && y <= spaceHeight(map)
}

/**
 * Map position back to world x/z, for the hover readout only.
 * Generated data is never converted in the browser (the pipeline does that).
 */
export function uvToWorld(u: number, v: number, map: MapInfo): { x: number; z: number } {
  return { x: u * map.scale + map.origin_x, z: v * map.scale + map.origin_z }
}

/** deck.gl orthographic zoom (log2 of screen pixels per unit) that fits the whole map. */
export function fitZoom(viewWidth: number, viewHeight: number, map: MapInfo, margin = 0.95): number {
  const pixelsPerUnit = Math.min(viewWidth / SPACE_WIDTH, viewHeight / spaceHeight(map)) * margin
  return Math.log2(pixelsPerUnit)
}
