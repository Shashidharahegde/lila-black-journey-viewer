// What the map shows at one moment of playback (spec 05). Pure, like journeys.ts: it cuts the
// drawing-space data from buildJourneys at the playback time and never projects anything again,
// so paths, current positions and markers all stay on the one validated mapping (space.ts).
// Nothing is invented: a position between two samples of one segment is a straight-line
// estimate, and outside a segment (before it, after it, in a gap over 30 s) there is none.
import { EVENT, EVENT_ORDER, type EventType } from './encoding'
import type { ActorInfo, JourneyData, MarkerDatum, PathDatum } from './journeys'

/** Where an actor is at the playback time. */
export interface HeadDatum {
  actor: ActorInfo
  position: [number, number]
  t: number
  /** true on a recorded sample; between two samples the position is a straight-line estimate */
  recorded: boolean
}

export interface PlaybackFrame extends JourneyData {
  heads: HeadDatum[]
}

/** Events that happened more than this many match seconds ago are drawn slightly faded. */
export const RECENT_EVENT_S = 15

/** Number of sorted `times` at or before `t`. */
export function countAtOrBefore(times: readonly number[], t: number): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** The actor's position on one path at `t`; null before its first or after its last sample. */
export function headOf(d: PathDatum, t: number): HeadDatum | null {
  const { times, path } = d
  const n = times.length
  if (n === 0 || !(t >= times[0] && t <= times[n - 1])) return null
  const i = countAtOrBefore(times, t) - 1
  if (times[i] === t || i === n - 1) return { actor: d.actor, position: path[i], t, recorded: true }
  // times[i] < t < times[i + 1], so the step has a length and the division is safe
  const f = (t - times[i]) / (times[i + 1] - times[i])
  const [x0, y0] = path[i]
  const [x1, y1] = path[i + 1]
  return { actor: d.actor, position: [x0 + f * (x1 - x0), y0 + f * (y1 - y0)], t, recorded: false }
}

/** The part of one path recorded by `t`, ending at the actor's position then; null until it has a length. */
export function trimPath(d: PathDatum, t: number): PathDatum | null {
  const n = d.times.length
  if (n < 2 || !(t > d.times[0])) return null
  if (t >= d.times[n - 1]) return d
  const i = countAtOrBefore(d.times, t) - 1
  const path = d.path.slice(0, i + 1)
  const times = d.times.slice(0, i + 1)
  if (d.times[i] < t) {
    path.push(headOf(d, t)!.position)
    times.push(t)
  }
  return { ...d, path, times }
}

/** Markers, start/end marks, lone samples and arrows: each appears at its time and then stays. */
function revealed(data: JourneyData, t: number) {
  const fadeBefore = t - RECENT_EVENT_S
  return {
    lonePoints: data.lonePoints.filter((p) => p.t <= t),
    markers: data.markers.filter((m) => m.t <= t).map((m): MarkerDatum => (m.t <= fadeBefore ? { ...m, faded: true } : m)),
    endpoints: data.endpoints.filter((e) => e.t <= t),
    arrows: data.arrows.filter((a) => a.t <= t),
  }
}

/** Everything the map draws at match time `t`. */
export function frameAt(data: JourneyData, t: number): PlaybackFrame {
  return { ...revealed(data, t), ...moving(data, t) }
}

function moving(data: JourneyData, t: number): Pick<PlaybackFrame, 'paths' | 'heads'> {
  const paths: PathDatum[] = []
  const heads: HeadDatum[] = []
  for (const d of data.paths) {
    const path = trimPath(d, t)
    if (path) paths.push(path)
    const head = headOf(d, t)
    if (head) heads.push(head)
  }
  return { paths, heads }
}

/**
 * `frameAt` for one match, for every animation frame. Markers and the other items that appear
 * at a moment are only cut again when one appears or a marker fades, so between those moments
 * deck.gl gets the same arrays and uploads nothing; paths and positions are cut every frame.
 */
export function playbackFrames(data: JourneyData): (t: number) => PlaybackFrame {
  const appearTimes = [
    ...data.lonePoints.map((p) => p.t),
    ...data.markers.map((m) => m.t),
    ...data.endpoints.map((e) => e.t),
    ...data.arrows.map((a) => a.t),
  ].sort((a, b) => a - b)
  const markerTimes = data.markers.map((m) => m.t).sort((a, b) => a - b)
  let key: string | null = null
  let cached: ReturnType<typeof revealed> | null = null
  return (t) => {
    const next = `${countAtOrBefore(appearTimes, t)}|${countAtOrBefore(markerTimes, t - RECENT_EVENT_S)}`
    if (next !== key || !cached) {
      key = next
      cached = revealed(data, t)
    }
    return { ...cached, ...moving(data, t) }
  }
}

/** Kills and deaths: what the previous/next buttons jump between (spec 05: "jump straight to the action"). */
const COMBAT: readonly EventType[] = ['kill', 'death', 'storm_death']
/** "Previous" within this many seconds after an event goes to the one before it, as in a media player. */
const PREVIOUS_GRACE_S = 1

export function nextCombatTime(markers: readonly MarkerDatum[], t: number): number | null {
  let best: number | null = null
  for (const m of markers) if (COMBAT.includes(m.type) && m.t > t + 0.01 && (best === null || m.t < best)) best = m.t
  return best
}

export function previousCombatTime(markers: readonly MarkerDatum[], t: number): number | null {
  let best: number | null = null
  for (const m of markers)
    if (COMBAT.includes(m.type) && m.t < t - PREVIOUS_GRACE_S && (best === null || m.t > best)) best = m.t
  return best
}

/** One mark on the timeline: the events that fall in one slice of the match. */
export interface TimelineTick {
  /** where a click seeks: the first event of the shown type in this slice */
  t: number
  /** the type drawn: the rarest in the slice (kill over death and storm death over loot) */
  type: EventType
  /** "1 kill, 2 loot" */
  label: string
  /** actors with an event in this slice, so a hovered actor's ticks can stand out */
  actors: string[]
}

/** Slices of the timeline; dense matches merge into these instead of piling up hundreds of ticks. */
export const TICK_SLICES = 160

function countLabel(type: EventType, n: number): string {
  const label = EVENT[type].label.toLowerCase()
  return `${n} ${type === 'loot' || n === 1 ? label : `${label}s`}`
}

/** Event ticks for the markers on the map, one per slice that has any, in time order. */
export function timelineTicks(markers: readonly MarkerDatum[], duration: number, slices = TICK_SLICES): TimelineTick[] {
  if (!(duration > 0)) return []
  const bySlice = new Map<number, MarkerDatum[]>()
  for (const m of markers) {
    const slice = Math.min(slices - 1, Math.floor((m.t / duration) * slices))
    bySlice.set(slice, [...(bySlice.get(slice) ?? []), m])
  }
  return [...bySlice.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, group]) => {
      const type = group.reduce<EventType>((top, m) => (EVENT_ORDER.indexOf(m.type) > EVENT_ORDER.indexOf(top) ? m.type : top), group[0].type)
      const counts = [...EVENT_ORDER].reverse().flatMap((k) => {
        const n = group.filter((m) => m.type === k).length
        return n ? [countLabel(k, n)] : []
      })
      return {
        t: Math.min(...group.filter((m) => m.type === type).map((m) => m.t)),
        type,
        label: counts.join(', '),
        actors: [...new Set(group.map((m) => m.actor.id))],
      }
    })
}
