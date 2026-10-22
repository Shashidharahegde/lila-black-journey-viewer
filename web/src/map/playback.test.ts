import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Actor, Index, MatchEvent, MatchFile } from '../data/types'
import { buildJourneys, type PathDatum } from './journeys'
import {
  RECENT_EVENT_S,
  TICK_SLICES,
  frameAt,
  headOf,
  nextCombatTime,
  playbackFrames,
  previousCombatTime,
  timelineTicks,
  trimPath,
} from './playback'
import { spaceHeight, uvToSpace } from './space'

const index = indexJson as Index
const ambrose = index.maps.AmbroseValley

function event(t: number, type: string, raw: string, kill_killed_pair = false): MatchEvent {
  return { t, type, raw, u: 0.3, v: 0.3, after_death: false, kill_killed_pair }
}

function actor(id: string, kind: Actor['kind'], segments: Actor['segments'], events: MatchEvent[] = []): Actor {
  return { id, kind, id_mismatch: kind === 'unknown', segments, events }
}

const match: MatchFile = {
  schema_version: 1,
  id: 'play0001',
  full_id: 'play0001',
  map: 'AmbroseValley',
  date: '2026-02-10',
  duration_s: 120,
  actors: [
    actor(
      'h1',
      'human',
      [
        [[0, 0.1, 0.9], [10, 0.2, 0.8]],
        // 50 s without a sample: the pipeline started a new segment
        [[60, 0.5, 0.5], [70, 0.6, 0.4]],
        [[100, 0.7, 0.3]],
      ],
      [
        event(8, 'loot', 'Loot'),
        event(60, 'kill', 'Kill', true),
        event(60, 'death', 'Killed', true),
        // two pickups in the same second are two events
        event(85, 'loot', 'Loot'),
        event(85, 'loot', 'Loot'),
      ],
    ),
    actor('b1', 'bot', [[[5, 0.8, 0.1], [15, 0.7, 0.2]]], [event(12, 'kill', 'BotKill')]),
    actor('u1', 'unknown', [[[20, 0.4, 0.4], [25, 0.42, 0.42]]], [event(24, 'loot', 'Loot')]),
  ],
}
const data = buildJourneys(match, ambrose)
const h1First = data.paths.find((p) => p.actor.id === 'h1')!
const pathTimes = (frame: ReturnType<typeof frameAt>) => frame.paths.flatMap((p) => p.times)

describe('what playback shows at a moment', () => {
  it('at 00:00 nothing from the future is drawn', () => {
    const frame = frameAt(data, 0)
    expect(frame.paths).toEqual([])
    expect(frame.markers).toEqual([])
    expect(frame.arrows).toEqual([])
    expect(frame.lonePoints).toEqual([])
    // only the human recorded at 0 s: its start mark and its position
    expect(frame.endpoints.map((e) => [e.actor.id, e.which])).toEqual([['h1', 'start']])
    expect(frame.heads.map((h) => [h.actor.id, h.recorded])).toEqual([['h1', true]])
  })

  it('at 01:20 only movement and events up to 80 s are drawn', () => {
    const frame = frameAt(data, 80)
    expect(Math.max(...pathTimes(frame))).toBeLessThanOrEqual(80)
    expect(frame.markers.every((m) => m.t <= 80)).toBe(true)
    expect(frame.markers.map((m) => m.raw).sort()).toEqual(['BotKill', 'Kill', 'Killed', 'Loot', 'Loot'])
    // the lone sample at 100 s and the pickups at 85 s are still to come
    expect(frame.lonePoints).toEqual([])
    // h1 is between segments (70 s → 100 s), the bot and the unknown actor have finished
    expect(frame.heads).toEqual([])
  })

  it('moves along a straight line between two samples of one segment', () => {
    const head = headOf(h1First, 5)!
    expect(head.recorded).toBe(false)
    const [x, y] = uvToSpace(0.15, 0.85, ambrose)
    expect(head.position[0]).toBeCloseTo(x, 9)
    expect(head.position[1]).toBeCloseTo(y, 9)
    // the drawn path ends exactly where the actor is
    const path = trimPath(h1First, 5)!
    expect(path.path).toHaveLength(2)
    expect(path.path[1]).toEqual(head.position)
    expect(path.times).toEqual([0, 5])
  })

  it('shows nothing moving across a gap over 30 s', () => {
    for (const t of [11, 30, 59]) {
      const frame = frameAt(data, t)
      expect(frame.heads.some((h) => h.actor.id === 'h1')).toBe(false)
      // no path point between the two recorded segments
      expect(frame.paths.flatMap((p) => (p.actor.id === 'h1' ? p.times : [])).some((s) => s > 10 && s < 60)).toBe(false)
    }
    expect(frameAt(data, 65).paths.filter((p) => p.actor.id === 'h1')).toHaveLength(2)
  })

  it("doesn't extrapolate before the first or after the last sample", () => {
    const bot = data.paths.find((p) => p.actor.id === 'b1')!
    expect(headOf(bot, 4.9)).toBeNull()
    expect(headOf(bot, 15)).toMatchObject({ recorded: true })
    expect(headOf(bot, 15.1)).toBeNull()
    expect(trimPath(bot, 5)).toBeNull()
    expect(trimPath(bot, 20)).toBe(bot)
  })

  it('rewinding removes later events and path sections, and leaves the source untouched', () => {
    const before = JSON.stringify(data)
    expect(frameAt(data, 90).markers).toHaveLength(7)
    const early = frameAt(data, 9)
    expect(early.markers.map((m) => m.raw)).toEqual(['Loot'])
    expect(Math.max(...pathTimes(early))).toBe(9)
    expect(JSON.stringify(data)).toBe(before)
  })

  it('keeps two events at the same time, and both halves of a Kill/Killed pair', () => {
    const frame = frameAt(data, 85)
    expect(frame.markers.filter((m) => m.t === 85 && m.type === 'loot')).toHaveLength(2)
    const pair = frame.markers.filter((m) => m.killKilledPair)
    expect(pair.map((m) => [m.type, m.raw, m.t])).toEqual([
      ['death', 'Killed', 60],
      ['kill', 'Kill', 60],
    ])
    expect(frameAt(data, 59).markers.some((m) => m.killKilledPair)).toBe(false)
  })

  it('fades events that happened a while ago', () => {
    const t = 70
    const frame = frameAt(data, t)
    for (const m of frame.markers) expect(!!m.faded).toBe(m.t <= t - RECENT_EVENT_S)
    expect(frame.markers.find((m) => m.raw === 'Kill')!.faded).toBeUndefined()
  })

  it('follows the human and bot toggles; unknown journeys are always shown', () => {
    const noBots = buildJourneys(match, ambrose, ['bots'])
    expect(frameAt(noBots, 7).heads.map((h) => h.actor.kind)).toEqual(['human'])
    expect(frameAt(noBots, 13).markers.map((m) => m.raw)).toEqual(['Loot'])
    const noHumans = frameAt(buildJourneys(match, ambrose, ['humans']), 24)
    expect(noHumans.heads.map((h) => h.actor.kind)).toEqual(['unknown'])
    // markers are in draw order: loot first
    expect(noHumans.markers.map((m) => m.actor.kind)).toEqual(['unknown', 'bot'])
  })
})

describe('positions use the validated mapping', () => {
  it('a recorded position is the sample projected once', () => {
    const head = headOf(h1First, 10)!
    expect(head).toMatchObject({ recorded: true, position: uvToSpace(0.2, 0.8, ambrose) })
  })

  it.each([
    // README example, as in pipeline/tests/test_projection.py: (u, v) → pixel on a 1024 px image
    ['AmbroseValley', 0.0762, 0.1305, 1024, 1024, 78, 890],
    // GrandRift's non-square image: the centre is (1080, 1079), not (1080, 1080)
    ['GrandRift', 0.5, 0.5, 2160, 2158, 1080, 1079],
  ])('%s: a head at (%d, %d) lands on the pipeline pixel', (id, u, v, width, height, px, py) => {
    const map = index.maps[id]
    const path: PathDatum = { actor: h1First.actor, path: [uvToSpace(u, v, map), uvToSpace(u, v, map)], times: [0, 10] }
    const [x, y] = headOf(path, 5)!.position
    expect(Math.round((x / 1000) * width)).toBe(px)
    expect(Math.round((y / spaceHeight(map)) * height)).toBe(py)
  })
})

describe('frames during playback', () => {
  it('reuses the marker arrays until an event appears, so deck.gl uploads nothing', () => {
    const frames = playbackFrames(data)
    const a = frames(30)
    const b = frames(31)
    expect(b.markers).toBe(a.markers)
    expect(b.endpoints).toBe(a.endpoints)
    expect(frames(60).markers).not.toBe(a.markers)
  })

  it('gives the same picture as frameAt, in either direction', () => {
    const frames = playbackFrames(data)
    for (const t of [0, 5, 30, 60, 75, 90, 120, 61, 12, 0]) expect(frames(t)).toEqual(frameAt(data, t))
  })
})

describe('timeline', () => {
  it('ticks the rarest event in each slice and seeks to its first occurrence', () => {
    const ticks = timelineTicks(data.markers, match.duration_s)
    expect(ticks.map((t) => [t.t, t.type, t.label])).toEqual([
      [8, 'loot', '1 loot'],
      [12, 'kill', '1 kill'],
      [24, 'loot', '1 loot'],
      [60, 'kill', '1 kill, 1 death'],
      [85, 'loot', '2 loot'],
    ])
    expect(ticks[3].actors).toEqual(['h1'])
  })

  it('merges dense events into at most TICK_SLICES ticks', () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ ...data.markers[0], t: i * 0.6 }))
    expect(timelineTicks(many, 600).length).toBe(TICK_SLICES)
    expect(timelineTicks(many, 0)).toEqual([])
  })

  it('previous and next jump between kills and deaths, not loot', () => {
    expect(nextCombatTime(data.markers, 0)).toBe(12)
    expect(nextCombatTime(data.markers, 12)).toBe(60)
    expect(nextCombatTime(data.markers, 60)).toBeNull()
    expect(previousCombatTime(data.markers, 100)).toBe(60)
    // just after an event, "previous" goes to the one before it
    expect(previousCombatTime(data.markers, 60.5)).toBe(12)
    expect(previousCombatTime(data.markers, 12)).toBeNull()
  })
})

describe('the real matches', () => {
  const files = index.matches.map(
    (m) => JSON.parse(readFileSync(new URL(`../../public/data/matches/${m.id}.json`, import.meta.url), 'utf8')) as MatchFile,
  )

  it('no actor moves after a recorded death', () => {
    let deaths = 0
    for (const file of files) {
      const journeys = buildJourneys(file, index.maps[file.map])
      for (const a of file.actors) {
        const death = a.events.find((e) => !e.after_death && (e.type === 'death' || e.type === 'storm_death'))
        if (!death) continue
        deaths++
        const paths = journeys.paths.filter((p) => p.actor.id === a.id)
        for (const dt of [0.5, 1, 5, 30]) expect(paths.some((p) => headOf(p, death.t + dt))).toBe(false)
      }
    }
    expect(deaths).toBeGreaterThan(0)
  })

  it('at the match end everything recorded is shown, as in the full-path view', () => {
    for (const file of files) {
      const journeys = buildJourneys(file, index.maps[file.map])
      const end = frameAt(journeys, file.duration_s)
      expect(end.paths).toEqual(journeys.paths)
      expect(end.markers.length).toBe(journeys.markers.length)
      expect(end.endpoints).toEqual(journeys.endpoints)
      expect(end.lonePoints).toEqual(journeys.lonePoints)
    }
  })
})
