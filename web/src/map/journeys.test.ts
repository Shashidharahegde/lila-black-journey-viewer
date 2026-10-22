import { describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Actor, Index, MatchEvent, MatchFile } from '../data/types'
import {
  AFTER_DEATH_NOTE,
  EVENT_ORDER,
  ID_MISMATCH_NOTE,
  KILL_KILLED_PAIR_NOTE,
  SAMPLING_NOTE,
  actorStats,
  buildJourneys,
  describeActor,
  describeMarker,
  layerCounts,
} from './journeys'
import { isInsideMap, uvToSpace } from './space'

const index = indexJson as Index
const grandRift = index.maps.GrandRift

function event(t: number, type: string, raw: string, after_death = false, kill_killed_pair = false): MatchEvent {
  return { t, type, raw, u: 0.25, v: 0.75, after_death, kill_killed_pair }
}

function actor(id: string, kind: Actor['kind'], segments: Actor['segments'], events: MatchEvent[] = []): Actor {
  return { id, kind, id_mismatch: kind === 'unknown', segments, events }
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
    actor('u1', 'unknown', [[[0, 0.3, 0.3], [5, 0.31, 0.31]]], [event(30, 'storm_death', 'KilledByStorm')]),
    actor(
      'h2',
      'human',
      [[[0, 0.5, 0.5], [5, 0.5, 0.51]]],
      [event(90, 'kill', 'Kill', false, true), event(90, 'death', 'Killed', false, true)],
    ),
    actor('b1', 'bot', [[[0, 0.9, 0.9], [5, 0.91, 0.91]], [[200, 0.4, 0.4]]], [event(50, 'kill', 'BotKill'), event(80, 'death', 'BotKilled', true)]),
  ],
}

describe('paths', () => {
  const data = buildJourneys(sample, grandRift)

  it('draws each segment as its own path, so no line crosses a gap', () => {
    expect(data.paths.map((p) => [p.actor.id, p.path.length])).toEqual([
      ['h1', 2],
      ['h1', 3],
      ['u1', 2],
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

  it('numbers humans in file order and leaves unknown and bots without a colour index', () => {
    const byId = Object.fromEntries(data.paths.map((p) => [p.actor.id, p.actor.humanIndex]))
    expect(byId).toEqual({ h1: 0, u1: null, h2: 1, b1: null })
  })

  it('tags humans H1, H2 only when a match has more than one', () => {
    const tags = Object.fromEntries(data.paths.map((p) => [p.actor.id, p.actor.tag]))
    expect(tags).toEqual({ h1: 'H1', u1: null, h2: 'H2', b1: null })
    const solo = { ...sample, actors: sample.actors.filter((a) => a.id !== 'h2') }
    expect(buildJourneys(solo, grandRift).paths[0].actor.tag).toBeNull()
  })

  it('hiding humans removes their paths and events but keeps unknown journeys', () => {
    const hidden = buildJourneys(sample, grandRift, ['humans'])
    const kinds = new Set([...hidden.paths, ...hidden.lonePoints, ...hidden.markers].map((d) => d.actor.kind))
    expect([...kinds].sort()).toEqual(['bot', 'unknown'])
  })

  it('keeps unknown journeys when bots are hidden', () => {
    const kinds = buildJourneys(sample, grandRift, ['bots']).paths.map((p) => p.actor.kind)
    expect(kinds).toContain('unknown')
    expect(kinds).not.toContain('bot')
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
      'death@90',
      'death@110',
      'kill@50',
      'kill@90',
      'kill@252',
    ])
    expect(EVENT_ORDER.at(0)).toBe('loot')
    expect(EVENT_ORDER.at(-1)).toBe('kill')
  })

  it('hiding bots removes their paths, lone samples and events', () => {
    const data = buildJourneys(sample, grandRift, ['bots'])
    expect([...data.paths, ...data.lonePoints, ...data.markers].some((d) => d.actor.kind === 'bot')).toBe(false)
    expect(data.markers).toHaveLength(7)
  })

  it('hiding an event type removes only that type', () => {
    const data = buildJourneys(sample, grandRift, ['loot', 'death'])
    expect(data.markers.map((m) => m.type).sort()).toEqual(['kill', 'kill', 'kill', 'storm_death'])
    expect(data.paths).toHaveLength(5)
  })
})

describe('tooltips', () => {
  const { markers } = buildJourneys(sample, grandRift)
  const find = (type: string, actorId: string) => describeMarker(markers.find((m) => m.type === type && m.actor.id === actorId)!)

  it('describe a human kill from the killer’s side', () => {
    expect(find('kill', 'h1')).toBe('Killed a bot (BotKill) at 4:12 — human H1 h1\nMarker shows where the killer stood')
  })

  it('describe a human death from the victim’s side', () => {
    expect(find('death', 'h1')).toBe('Killed by a bot (BotKilled) at 1:50 — human H1 h1\nMarker shows where the victim fell')
  })

  it('describe bot events from the bot’s side and flag late events', () => {
    expect(find('kill', 'b1')).toBe('Bot killed someone (BotKill) at 0:50 — bot b1\nMarker shows where the killer stood')
    expect(find('death', 'b1')).toBe(
      `Bot was killed (BotKilled) at 1:20 — bot b1\nMarker shows where the victim fell\n${AFTER_DEATH_NOTE}`,
    )
  })

  it('label unknown journeys on markers and paths', () => {
    expect(find('storm_death', 'u1')).toBe(
      `Killed by the storm (KilledByStorm) at 0:30 — unknown u1\nMarker shows where they died\n${ID_MISMATCH_NOTE}`,
    )
    const u1 = buildJourneys(sample, grandRift).paths.find((p) => p.actor.id === 'u1')!.actor
    expect(describeActor(u1)).toBe(`Unknown actor u1\n${SAMPLING_NOTE}\n${ID_MISMATCH_NOTE}`)
  })

  it('show both halves of a Kill/Killed pair with neutral wording, never as a self-kill', () => {
    const where = 'Marker shows where this player stood; both events of the pair carry that position'
    expect(find('kill', 'h2')).toBe(
      `Kill logged (README: killed a human player) (Kill) at 1:30 — human H2 h2\n${where}\n${KILL_KILLED_PAIR_NOTE}`,
    )
    expect(find('death', 'h2')).toBe(
      `Killed logged (README: killed by a human player) (Killed) at 1:30 — human H2 h2\n${where}\n${KILL_KILLED_PAIR_NOTE}`,
    )
    const text = buildJourneys(sample, grandRift).markers.map(describeMarker).join('\n')
    expect(text).not.toMatch(/self-kill|killed themselves/i)
  })

  it('mention gaps on a path with several pieces', () => {
    const h1 = buildJourneys(sample, grandRift).paths[0].actor
    expect(describeActor(h1)).toBe(`Human H1 h1\n${SAMPLING_NOTE}\n3 path pieces: no line is drawn across gaps over 30 s`)
  })
})

describe('journey statistics', () => {
  const [h1, u1, h2, b1] = sample.actors

  it('say how a journey ended, what it did and how long it was recorded', () => {
    expect(actorStats(h1, grandRift)).toEqual({
      end: 'Killed by a bot at 1:50',
      firstT: 0,
      lastT: 252,
      distance: expect.closeTo(3 * Math.hypot(0.1, 0.1) * grandRift.scale, 6),
      segments: 3,
      kills: 1,
      deaths: 1,
      loot: 2,
      afterDeath: 0,
    })
    expect(actorStats(u1, grandRift).end).toBe('Killed by the storm at 0:30')
    expect(actorStats(h2, grandRift).end).toBe('Killed logged (README: killed by a human player) at 1:30')
  })

  it('leave rows after death out of the counts and the ending, and never measure across a gap', () => {
    // b1's death is flagged after_death; its lone sample at 200 s adds no distance
    expect(actorStats(b1, grandRift)).toMatchObject({
      end: 'No death recorded',
      deaths: 0,
      kills: 1,
      afterDeath: 1,
      lastT: 200,
      distance: expect.closeTo(Math.hypot(0.01, 0.01) * grandRift.scale, 6),
    })
  })
})

describe('legend counts', () => {
  it('count every actor, and the events of shown actor kinds even when the event layer is off', () => {
    expect(layerCounts(sample)).toEqual({
      actors: { human: 2, unknown: 1, bot: 1 },
      events: { kill: 3, death: 3, storm_death: 1, loot: 2 },
    })
    expect(layerCounts(sample, ['bots', 'loot']).events).toEqual({ kill: 2, death: 2, storm_death: 1, loot: 2 })
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

  it('keeps every unknown journey and both events of every Kill/Killed pair', () => {
    const actors = files.flatMap((m) => m.actors)
    expect(actors.filter((a) => a.kind === 'unknown')).toHaveLength(17)
    const paired = actors.flatMap((a) => a.events.filter((e) => e.kill_killed_pair))
    expect(paired.map((e) => e.raw).sort()).toEqual(['Kill', 'Kill', 'Kill', 'Killed', 'Killed', 'Killed'])
  })

  it('uses only event types the map knows how to draw', () => {
    const types = new Set(files.flatMap((m) => m.actors.flatMap((a) => a.events.map((e) => e.type))))
    expect([...types].every((t) => (EVENT_ORDER as string[]).includes(t))).toBe(true)
  })
})
