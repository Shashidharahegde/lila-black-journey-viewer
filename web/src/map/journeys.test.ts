import { describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Actor, Index, MatchEvent, MatchFile, MatchSummary } from '../data/types'
import {
  AFTER_DEATH_NOTE,
  EVENT_ORDER,
  ID_MISMATCH_NOTE,
  KILL_KILLED_PAIR_NOTE,
  actorStats,
  botCombat,
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

describe('start, end and direction', () => {
  const data = buildJourneys(sample, grandRift)

  it('marks where each journey was first and last recorded, across all its pieces', () => {
    const h1 = data.endpoints.filter((e) => e.actor.id === 'h1')
    expect(h1.map((e) => [e.which, e.t])).toEqual([
      ['start', 0],
      ['end', 110],
    ])
    expect(h1[0].position).toEqual(uvToSpace(0.1, 0.9, grandRift))
    expect(h1[1].position).toEqual(uvToSpace(0.8, 0.2, grandRift))
    // b1 ends on a lone sample after a gap
    expect(data.endpoints.find((e) => e.actor.id === 'b1' && e.which === 'end')?.t).toBe(200)
  })

  it('gives a one-sample journey a start but no end', () => {
    const one = { ...sample, actors: [actor('x', 'human', [[[7, 0.5, 0.5]]])] }
    expect(buildJourneys(one, grandRift).endpoints.map((e) => e.which)).toEqual(['start'])
  })

  it('puts one arrow on each step that moved, never across a gap', () => {
    // h1: 1 + 2 steps (the lone sample has none); u1, h2, b1: 1 step each
    expect(data.arrows.map((a) => a.actor.id)).toEqual(['h1', 'h1', 'h1', 'u1', 'h2', 'b1'])
    const still = { ...sample, actors: [actor('x', 'human', [[[0, 0.5, 0.5], [5, 0.5, 0.5]]])] }
    expect(buildJourneys(still, grandRift).arrows).toEqual([])
  })

  it('points arrows the way the actor moved on screen (counter-clockwise from right)', () => {
    const [x0, y0] = uvToSpace(0.5, 0.5, grandRift)
    const [x1, y1] = uvToSpace(0.5, 0.51, grandRift)
    const h2 = data.arrows.find((a) => a.actor.id === 'h2')!
    expect(h2.angle).toBeCloseTo(90, 9) // v grows northwards = up the screen
    expect(h2.position).toEqual([(x0 + x1) / 2, (y0 + y1) / 2])
    // h1's first step goes east and south: below the horizontal
    expect(data.arrows[0].angle).toBeLessThan(0)
    expect(data.arrows[0].angle).toBeGreaterThan(-90)
  })

  it('leaves hidden actors out', () => {
    const noBots = buildJourneys(sample, grandRift, ['bots'])
    expect([...noBots.endpoints, ...noBots.arrows].some((d) => d.actor.kind === 'bot')).toBe(false)
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
    expect(find('kill', 'h1')).toBe('Killed a bot (BotKill) at 4:12 — human H1 h1')
  })

  it('describe a human death from the victim’s side', () => {
    expect(find('death', 'h1')).toBe('Killed by a bot (BotKilled) at 1:50 — human H1 h1')
  })

  it('describe bot events from the bot’s side and flag late events', () => {
    expect(find('kill', 'b1')).toBe('Bot killed someone (BotKill) at 0:50 — bot b1')
    expect(find('death', 'b1')).toBe(
      `Bot was killed (BotKilled) at 1:20 — bot b1\n${AFTER_DEATH_NOTE}`,
    )
  })

  it('label unknown journeys on markers and paths', () => {
    expect(find('storm_death', 'u1')).toBe(
      `Killed by the storm (KilledByStorm) at 0:30 — unknown u1\n${ID_MISMATCH_NOTE}`,
    )
    const u1 = buildJourneys(sample, grandRift).paths.find((p) => p.actor.id === 'u1')!.actor
    expect(describeActor(u1)).toBe(`Unknown actor u1\n${ID_MISMATCH_NOTE}`)
  })

  it('show both halves of a Kill/Killed pair with neutral wording, never as a self-kill', () => {
    expect(find('kill', 'h2')).toBe(
      `Kill logged (README: killed a human player) (Kill) at 1:30 — human H2 h2\n${KILL_KILLED_PAIR_NOTE}`,
    )
    expect(find('death', 'h2')).toBe(
      `Killed logged (README: killed by a human player) (Killed) at 1:30 — human H2 h2\n${KILL_KILLED_PAIR_NOTE}`,
    )
    const text = buildJourneys(sample, grandRift).markers.map(describeMarker).join('\n')
    expect(text).not.toMatch(/self-kill|killed themselves/i)
  })

  it('mention gaps on a path with several pieces', () => {
    const h1 = buildJourneys(sample, grandRift).paths[0].actor
    expect(describeActor(h1)).toBe(`Human H1 h1\n3 path pieces: no line is drawn across gaps over 30 s`)
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
      killKilledPairs: 0,
      afterDeath: 0,
    })
    expect(actorStats(u1, grandRift).end).toBe('Killed by the storm at 0:30')
    expect(actorStats(h2, grandRift).end).toBe('Killed logged (README: killed by a human player) at 1:30')
  })

  it('count the Kill of a Kill/Killed pair as a pair, not a kill (EC-12)', () => {
    expect(actorStats(h2, grandRift)).toMatchObject({ kills: 0, deaths: 1, killKilledPairs: 1 })
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
      pairKills: 1,
    })
    expect(layerCounts(sample, ['bots', 'loot']).events).toEqual({ kill: 2, death: 2, storm_death: 1, loot: 2 })
    expect(layerCounts(sample, ['humans']).pairKills).toBe(0)
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

  it('keeps every flagged journey (id_mismatch) as a human and both events of every Kill/Killed pair', () => {
    const actors = files.flatMap((m) => m.actors)
    expect(actors.filter((a) => a.id_mismatch && a.kind === 'human')).toHaveLength(17)
    const paired = actors.flatMap((a) => a.events.filter((e) => e.kill_killed_pair))
    expect(paired.map((e) => e.raw).sort()).toEqual(['Kill', 'Kill', 'Kill', 'Killed', 'Killed', 'Killed'])
  })

  it('agrees with the match card: human journeys add up to the human-file counts in the index', () => {
    // the only difference: the card counts events logged after death (D2), the journey card leaves them out
    const byId = new Map(index.matches.map((m) => [m.id, m]))
    let lateKills = 0
    for (const match of files) {
      const map = index.maps[match.map]
      const sum = { kill: 0, death: 0, loot: 0, pairs: 0 }
      for (const a of match.actors.filter((a) => a.kind === 'human')) {
        const s = actorStats(a, map)
        const late = a.events.filter((e) => e.after_death && e.type === 'kill').length
        expect(s.afterDeath).toBe(late)
        lateKills += late
        sum.kill += s.kills + late
        sum.death += s.deaths
        sum.loot += s.loot
        sum.pairs += s.killKilledPairs
      }
      const c = byId.get(match.id)!.counts
      expect(sum).toEqual({ kill: c.kill, death: c.death + c.storm_death, loot: c.loot, pairs: c.kill_killed_pair })
    }
    expect(lateKills).toBe(2)
  })

  it('uses only event types the map knows how to draw', () => {
    const types = new Set(files.flatMap((m) => m.actors.flatMap((a) => a.events.map((e) => e.type))))
    expect([...types].every((t) => (EVENT_ORDER as string[]).includes(t))).toBe(true)
  })
})

describe('botCombat', () => {
  const summary: MatchSummary = {
    id: 'test0001', full_id: 'test0001', map: 'GrandRift', date: '2026-02-10', start_utc: '2026-02-10T00:00:00Z',
    duration_s: 300, humans: 2, bots: 1, unknown: 1,
    counts: { kill: 1, death: 2, storm_death: 0, loot: 2, kill_killed_pair: 1 },
  }

  it('counts bot kills and deaths by bots in human files only, apart from recorded bot journeys', () => {
    // h1: one BotKill, one BotKilled; h2: a Kill/Killed pair (counted as a pair); b1's own BotKill/BotKilled ignored
    expect(botCombat(summary, sample)).toEqual({
      botKills: 1, deathsByBots: 1, otherKills: 0, otherDeaths: 0, withoutBotJourneys: false,
    })
  })

  it('flags bot combat in a match without a recorded bot journey', () => {
    const noBots = { ...sample, actors: sample.actors.filter((a) => a.kind !== 'bot') }
    expect(botCombat({ ...summary, bots: 0 }, noBots).withoutBotJourneys).toBe(true)
    const quiet = { ...noBots, actors: noBots.actors.filter((a) => a.id !== 'h1') }
    expect(botCombat({ ...summary, bots: 0, counts: { ...summary.counts, kill: 0, death: 1 } }, quiet).withoutBotJourneys).toBe(false)
  })

  it('reports counted kills and deaths that are not bot combat', () => {
    const counts = { ...summary.counts, kill: 2, death: 3 } // one unpaired Kill and one unpaired Killed besides
    expect(botCombat({ ...summary, counts }, sample)).toMatchObject({ otherKills: 1, otherDeaths: 1 })
  })

  it('accounts for every counted kill and death on the real match cards', () => {
    const files = import.meta.glob<MatchFile>('../../public/data/matches/*.json', { eager: true, import: 'default' })
    const byId = new Map(Object.values(files).map((f) => [f.id, f]))
    for (const m of index.matches) {
      const c = botCombat(m, byId.get(m.id)!)
      expect([c.otherKills, c.otherDeaths]).toEqual([0, 0])
      if (c.withoutBotJourneys) expect(m.bots).toBe(0)
    }
    // a match with one human file, eight bot kills and a death by a bot, and no bot journey
    expect(botCombat(index.matches.find((m) => m.id === '95042608')!, byId.get('95042608')!)).toEqual({
      botKills: 8, deathsByBots: 1, otherKills: 0, otherDeaths: 0, withoutBotJourneys: true,
    })
  })
})
