import { describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Actor, Index, MatchEvent, MatchFile } from '../data/types'
import { AFTER_DEATH_NOTE, EVENT_ORDER, ID_MISMATCH_NOTE, buildJourneys, describeActor, describeMarker } from './journeys'
import { isInsideMap, uvToSpace } from './space'

const index = indexJson as Index
const grandRift = index.maps.GrandRift

function event(t: number, type: string, raw: string, after_death = false): MatchEvent {
  return { t, type, raw, u: 0.25, v: 0.75, after_death }
}

function actor(id: string, kind: 'human' | 'bot', segments: Actor['segments'], events: MatchEvent[] = [], id_mismatch = false): Actor {
  return { id, kind, id_mismatch, segments, events }
}

const sample: MatchFile = {
  schema_version: 1,
  id: 'test0001',
  full_id: 'test0001',
  map: 'GrandRift',
  date: '2026-02-10',
  duration_s: 300,
  actors: [
    actor(
      'h1',
      'human',
      [
        [[0, 0.1, 0.9], [5, 0.2, 0.8]],
        [[60, 0.5, 0.5]], // a lone sample after a gap
        [[100, 0.6, 0.4], [105, 0.7, 0.3], [110, 0.8, 0.2]],
      ],
      [event(252, 'kill', 'BotKill'), event(10, 'loot', 'Loot'), event(110, 'death', 'BotKilled'), event(20, 'loot', 'Loot')],
    ),
    actor('h2', 'human', [[[0, 0.3, 0.3], [5, 0.31, 0.31]]], [event(30, 'storm_death', 'KilledByStorm')], true),
    actor('b1', 'bot', [[[0, 0.9, 0.9], [5, 0.91, 0.91]], [[200, 0.4, 0.4]]], [event(50, 'kill', 'BotKill'), event(80, 'death', 'BotKilled', true)]),
  ],
}

describe('paths', () => {
  const data = buildJourneys(sample, grandRift)

  it('draws each segment as its own path, so no line crosses a gap', () => {
    expect(data.paths.map((p) => [p.actor.id, p.path.length])).toEqual([
      ['h1', 2],
      ['h1', 3],
      ['h2', 2],
      ['b1', 2],
    ])
  })

  it('keeps single-sample segments as points instead of dropping them', () => {
    expect(data.lonePoints.map((p) => [p.actor.id, p.t])).toEqual([
      ['h1', 60],
      ['b1', 200],
    ])
  })

  it('converts uv to the shared drawing space', () => {
    expect(data.paths[0].path[0]).toEqual(uvToSpace(0.1, 0.9, grandRift))
    expect(data.lonePoints[0].position).toEqual(uvToSpace(0.5, 0.5, grandRift))
  })

  it('numbers humans in file order and leaves bots without a colour index', () => {
    const byId = Object.fromEntries(data.paths.map((p) => [p.actor.id, p.actor.humanIndex]))
    expect(byId).toEqual({ h1: 0, h2: 1, b1: null })
  })
})

describe('markers', () => {
  it('are drawn loot first and kills last, then by time', () => {
    const { markers } = buildJourneys(sample, grandRift)
    expect(markers.map((m) => `${m.type}@${m.t}`)).toEqual([
      'loot@10',
      'loot@20',
      'storm_death@30',
      'death@80',
      'death@110',
      'kill@50',
      'kill@252',
    ])
    expect(EVENT_ORDER.at(0)).toBe('loot')
    expect(EVENT_ORDER.at(-1)).toBe('kill')
  })

  it('hiding bots removes their paths, lone samples and events', () => {
    const data = buildJourneys(sample, grandRift, ['bots'])
    expect([...data.paths, ...data.lonePoints, ...data.markers].some((d) => d.actor.kind === 'bot')).toBe(false)
    expect(data.markers).toHaveLength(5)
  })

  it('hiding an event type removes only that type', () => {
    const data = buildJourneys(sample, grandRift, ['loot', 'death'])
    expect(data.markers.map((m) => m.type).sort()).toEqual(['kill', 'kill', 'storm_death'])
    expect(data.paths).toHaveLength(4)
  })
})

describe('tooltips', () => {
  const { markers } = buildJourneys(sample, grandRift)
  const find = (type: string, actorId: string) => describeMarker(markers.find((m) => m.type === type && m.actor.id === actorId)!)

  it('describe a human kill from the killer’s side', () => {
    expect(find('kill', 'h1')).toBe('Killed a bot (BotKill) at 4:12 — human h1\nMarker shows where the killer stood')
  })

  it('describe a human death from the victim’s side', () => {
    expect(find('death', 'h1')).toBe('Killed by a bot (BotKilled) at 1:50 — human h1\nMarker shows where the victim fell')
  })

  it('describe bot events from the bot’s side and flag late events', () => {
    expect(find('kill', 'b1')).toBe('Bot killed someone (BotKill) at 0:50 — bot b1\nMarker shows where the killer stood')
    expect(find('death', 'b1')).toBe(
      `Bot was killed (BotKilled) at 1:20 — bot b1\nMarker shows where the victim fell\n${AFTER_DEATH_NOTE}`,
    )
  })

  it('flag id_mismatch humans on markers and paths', () => {
    expect(find('storm_death', 'h2')).toBe(
      `Killed by the storm (KilledByStorm) at 0:30 — human h2\nMarker shows where they died\n${ID_MISMATCH_NOTE}`,
    )
    const h2 = buildJourneys(sample, grandRift).paths.find((p) => p.actor.id === 'h2')!.actor
    expect(describeActor(h2)).toBe(`Human h2\n${ID_MISMATCH_NOTE}`)
  })

  it('mention gaps on a path with several pieces', () => {
    const h1 = buildJourneys(sample, grandRift).paths[0].actor
    expect(describeActor(h1)).toBe('Human h1\n3 path pieces: no line is drawn across gaps over 30 s')
  })
})

describe('every generated match file', () => {
  const files = Object.values(
    import.meta.glob<MatchFile>('../../public/data/matches/*.json', { eager: true, import: 'default' }),
  )

  it('is one per match in the index', () => {
    expect(files).toHaveLength(index.matches.length)
  })

  it('draws every segment and every event exactly once, inside its map', () => {
    for (const match of files) {
      const map = index.maps[match.map]
      const data = buildJourneys(match, map)
      const segments = match.actors.reduce((n, a) => n + a.segments.length, 0)
      const events = match.actors.reduce((n, a) => n + a.events.length, 0)
      expect(data.paths.length + data.lonePoints.length).toBe(segments)
      expect(data.markers).toHaveLength(events)
      for (const p of data.paths) for (const [x, y] of p.path) expect(isInsideMap(x, y, map)).toBe(true)
      for (const m of data.markers) expect(isInsideMap(...m.position, map)).toBe(true)
    }
  })

  it('never puts a gap of more than 30 s inside one path', () => {
    for (const match of files)
      for (const a of match.actors)
        for (const segment of a.segments)
          for (let i = 1; i < segment.length; i++) expect(segment[i][0] - segment[i - 1][0]).toBeLessThanOrEqual(30)
  })

  it('uses only event types the map knows how to draw', () => {
    const types = new Set(files.flatMap((m) => m.actors.flatMap((a) => a.events.map((e) => e.type))))
    expect([...types].every((t) => (EVENT_ORDER as string[]).includes(t))).toBe(true)
  })
})
