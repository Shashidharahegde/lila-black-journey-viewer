// Legend ticks for the colour bar (spec 06). Ticks carry raw values and sit at the same intensity the
// cells use, so the legend and the cells can't disagree.
import { formatPlayerTime } from './format'
import { TRAFFIC_FOCUS, strongPosition, trafficPosition } from './scale'

export interface Tick {
  value: number
  /** position on the scale, 0–1 */
  t: number
  label: string
}

const TRAFFIC_TICKS = [1, 10, 60, 600, 3600, 36000] // 1 s, 10 s, 1 min, 10 min, 60 min, 600 min
const FOCUSED_TICKS = [60, 120, 300, 600, 1800, 3600] // 1, 2, 5, 10, 30, 60 min
/** Ticks closer than this on the bar would overlap their labels. */
const MIN_GAP = 0.2

/** A few round times that fit under the domain, plus the domain's own maximum, spaced so labels don't collide. (Kills and deaths use classes, not a bar.) */
export function trafficTicks(max: number): Tick[] {
  if (!(max > 0)) return []
  const label = (v: number) => formatPlayerTime(v)
  const candidates = TRAFFIC_TICKS.filter((v) => v < max)
  const ticks: Tick[] = []
  for (const value of [...candidates, max]) {
    const t = trafficPosition(value, max)!
    const last = ticks.at(-1)
    if (last && t - last.t < MIN_GAP) {
      if (value !== max) continue
      ticks.pop() // the maximum always stays
    }
    ticks.push({ value, t, label: label(value) })
  }
  return ticks
}

/** Ticks of the Focused traffic bar, which starts at the 60 s threshold (shorter times are hidden or a faint trace, named in the legend). */
export function focusedTicks(max: number): Tick[] {
  const base = TRAFFIC_FOCUS.faintBelow
  if (!(max > base)) return []
  const candidates = FOCUSED_TICKS.filter((v) => v < max)
  const ticks: Tick[] = []
  for (const value of [...candidates, max]) {
    const t = strongPosition(value, max)
    const last = ticks.at(-1)
    if (last && t - last.t < MIN_GAP) {
      if (value !== max) continue
      ticks.pop() // the maximum always stays
    }
    ticks.push({ value, t, label: formatPlayerTime(value) })
  }
  return ticks
}
