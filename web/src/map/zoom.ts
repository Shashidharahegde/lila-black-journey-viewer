// How the camera moves when the app (not the user) brings something into view: the timing and easing of the move, and how a
// selected match is framed. No deck.gl here, so it can be unit-tested; MapView runs the move one frame at a time.
import type { SpaceRect } from './space'

export interface Camera {
  target: [number, number]
  zoom: number
}

export interface ZoomMotion {
  /** length of the move, ms */
  duration: number
  /** progress 0..1 → eased progress 0..1 */
  easing: (t: number) => number
}

/** Slow at both ends, fastest in the middle. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/** The one smooth camera move of the app (a selected match or hotspot); `duration` is the shortest move, see `moveDuration`. */
export const ZOOM_MOTION: ZoomMotion = { duration: 800, easing: easeInOutCubic }

/**
 * How long a move takes: the base duration, plus time for every zoom level crossed and for the distance panned (as a share of the
 * view's diagonal), so a long fly across the map doesn't rush while a short nudge stays quick. Capped so it never drags.
 */
export function moveDuration(from: Camera, to: Camera, viewWidth: number, viewHeight: number, motion = ZOOM_MOTION): number {
  const scale = 2 ** Math.max(from.zoom, to.zoom)
  const panned = Math.hypot(to.target[0] - from.target[0], to.target[1] - from.target[1]) * scale
  const share = Math.min(panned / Math.hypot(viewWidth, viewHeight), 2)
  return Math.min(motion.duration + 220 * Math.abs(to.zoom - from.zoom) + 450 * share, 1600)
}

/** How a selected match is framed: its journeys fill `fill` of the view, at most `maxLevelsIn` zoom levels in from the whole map. */
export const MATCH_FRAMING = { fill: 0.8, maxLevelsIn: 3 }

/** The user asked the system for less motion (FRONTEND_GUIDELINES §6): camera moves are then instant. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
}

/**
 * The camera `progress` (already eased, 0..1) of the way from `from` to `to`. Zoom is linear in levels; the target follows the
 * scale (linear in 1 / 2^zoom), which is how a zoom about one fixed point moves it, so a zoom in doesn't swing past and back.
 */
export function cameraAt(from: Camera, to: Camera, progress: number): Camera {
  const zoom = from.zoom + (to.zoom - from.zoom) * progress
  const [a, b] = [2 ** -from.zoom, 2 ** -to.zoom]
  const w = Math.abs(a - b) < 1e-9 * a ? progress : (a - 2 ** -zoom) / (a - b)
  return {
    target: [from.target[0] + (to.target[0] - from.target[0]) * w, from.target[1] + (to.target[1] - from.target[1]) * w],
    zoom,
  }
}

/** The box around every point given, in the drawing space; null for none. */
export function boundsOf(points: Iterable<readonly [number, number]>): SpaceRect | null {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const [x, y] of points) {
    left = Math.min(left, x)
    right = Math.max(right, x)
    top = Math.min(top, y)
    bottom = Math.max(bottom, y)
  }
  return left <= right ? { left, top, right, bottom } : null
}

/**
 * The camera that frames `rect` (drawing space) in a view of `width` × `height` px, given the zoom of the whole map. A small
 * journey stops at `maxLevelsIn`, so a lone sample doesn't zoom to the pixels.
 */
export function frameRect(rect: SpaceRect, width: number, height: number, wholeMapZoom: number, framing = MATCH_FRAMING): Camera {
  const w = Math.max(rect.right - rect.left, 1e-6)
  const h = Math.max(rect.bottom - rect.top, 1e-6)
  const zoom = Math.min(Math.log2(Math.min(width / w, height / h) * framing.fill), wholeMapZoom + framing.maxLevelsIn)
  return { target: [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2], zoom }
}
