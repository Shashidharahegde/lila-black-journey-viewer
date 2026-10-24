// Turns a match file into what the map draws: paths, lone samples and event markers,
// all in the drawing space from space.ts. No deck.gl here, so it can be unit-tested.
import type { Actor, ActorKind, MapInfo, MatchEvent, MatchFile, MatchSummary } from '../data/types'
import { durationLabel } from '../state/matches'
import type { LayerKey } from '../state/url'
import { EVENT_ORDER, type EventType } from './encoding'
import type { HeadDatum } from './playback'
import { uvToSpace } from './space'

export { EVENT_ORDER, type EventType }

export interface ActorInfo {
  id: string
  kind: ActorKind
  idMismatch: boolean
  /** 0, 1, … for humans in file order (humans come first); null for unknown and bots */
  humanIndex: number | null
  /** "H1", "H2" when a match has two or more humans (they share one colour); otherwise null */
  tag: string | null
  segments: number
}

export interface PathDatum {
  actor: ActorInfo
  path: [number, number][]
  /** match time (s) of each point of `path` */
  times: number[]
}

export interface PointDatum {
  actor: ActorInfo
  position: [number, number]
  t: number
}

export interface MarkerDatum {
  actor: ActorInfo
  type: EventType
  raw: string
  t: number
  afterDeath: boolean
  killKilledPair: boolean
  position: [number, number]
  /** playback: happened a while before the playback time, so drawn slightly faded */
  faded?: boolean
}

/** Where a journey was first and last recorded (its first and last position samples). */
export interface EndpointDatum {
  actor: ActorInfo
  which: 'start' | 'end'
  position: [number, number]
  t: number
}

/** A direction mark halfway along one step between two samples, pointing the way the actor moved. */
export interface ArrowDatum {
  actor: ActorInfo
  position: [number, number]
  /** degrees, counter-clockwise on screen from pointing right (deck.gl IconLayer `getAngle`) */
  angle: number
  /** match time (s) at the end of the step, when playback has drawn all of it */
  t: number
}

export interface JourneyData {
  /** segments with two or more samples; a gap over 30 s already starts a new segment */
  paths: PathDatum[]
  /** segments with a single sample, which a line can't show */
  lonePoints: PointDatum[]
  /** sorted in EVENT_ORDER, then by time */
  markers: MarkerDatum[]
  /** start and end of each shown journey; a journey with one sample has only a start */
  endpoints: EndpointDatum[]
  /** one candidate per step; the map hides those that would crowd (collision filter) */
  arrows: ArrowDatum[]
}

export function actorInfos(match: MatchFile): Map<Actor, ActorInfo> {
  const tagged = match.actors.filter((a) => a.kind === 'human').length > 1
  let humans = 0
  return new Map(
    match.actors.map((a) => {
      const humanIndex = a.kind === 'human' ? humans++ : null
      return [
        a,
        {
          id: a.id,
          kind: a.kind,
          idMismatch: a.id_mismatch,
          humanIndex,
          tag: tagged && humanIndex !== null ? `H${humanIndex + 1}` : null,
          segments: a.segments.length,
        },
      ]
    }),
  )
}

/** Humans and bots have toggles; unknown journeys are always shown (EC-09). */
function actorHidden(kind: ActorKind, hide: readonly LayerKey[]): boolean {
  return (kind === 'bot' && hide.includes('bots')) || (kind === 'human' && hide.includes('humans'))
}

function isEventType(type: string): type is EventType {
  return (EVENT_ORDER as string[]).includes(type)
}

export function buildJourneys(match: MatchFile, map: MapInfo, hide: readonly LayerKey[] = []): JourneyData {
  const infos = actorInfos(match)
  const paths: PathDatum[] = []
  const lonePoints: PointDatum[] = []
  const markers: MarkerDatum[] = []
  const endpoints: EndpointDatum[] = []
  const arrows: ArrowDatum[] = []

  for (const actor of match.actors) {
    if (actorHidden(actor.kind, hide)) continue
    const info = infos.get(actor)!
    for (const segment of actor.segments) {
      if (segment.length === 1) {
        const [t, u, v] = segment[0]
        lonePoints.push({ actor: info, position: uvToSpace(u, v, map), t })
      } else {
        const path = segment.map(([, u, v]) => uvToSpace(u, v, map))
        const times = segment.map(([t]) => t)
        paths.push({ actor: info, path, times })
        arrows.push(...stepArrows(path, times, info))
      }
    }
    const first = actor.segments.at(0)?.at(0)
    const last = actor.segments.at(-1)?.at(-1)
    if (first) endpoints.push({ actor: info, which: 'start', position: uvToSpace(first[1], first[2], map), t: first[0] })
    if (last && last !== first) endpoints.push({ actor: info, which: 'end', position: uvToSpace(last[1], last[2], map), t: last[0] })
    for (const e of actor.events) {
      if (!isEventType(e.type) || hide.includes(e.type)) continue
      markers.push(toMarker(e, e.type, info, map))
    }
  }
  markers.sort((a, b) => EVENT_ORDER.indexOf(a.type) - EVENT_ORDER.indexOf(b.type) || a.t - b.t)
  return { paths, lonePoints, markers, endpoints, arrows }
}

/** Steps where the actor stood still have no direction, so they get no arrow. */
function stepArrows(path: [number, number][], times: number[], actor: ActorInfo): ArrowDatum[] {
  const arrows: ArrowDatum[] = []
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1]
    const [x1, y1] = path[i]
    if (x0 === x1 && y0 === y1) continue
    // drawing-space Y points down the screen, so it is negated for a screen angle
    const angle = (Math.atan2(-(y1 - y0), x1 - x0) * 180) / Math.PI
    arrows.push({ actor, position: [(x0 + x1) / 2, (y0 + y1) / 2], angle, t: times[i] })
  }
  return arrows
}

function toMarker(e: MatchEvent, type: EventType, actor: ActorInfo, map: MapInfo): MarkerDatum {
  return {
    actor,
    type,
    raw: e.raw,
    t: e.t,
    afterDeath: e.after_death,
    killKilledPair: e.kill_killed_pair,
    position: uvToSpace(e.u, e.v, map),
  }
}

// Wording follows the file owner's point of view (EC-11): x/z is always where the owner stood.
// Unknown journeys log the same events as the player client, so their events read like a human's.
const PLAYER_WHAT: Record<EventType, string> = {
  kill: 'Killed a bot',
  death: 'Killed by a bot',
  storm_death: 'Killed by the storm',
  loot: 'Picked up loot',
}
const WHAT: Record<ActorKind, Record<EventType, string>> = {
  human: PLAYER_WHAT,
  unknown: PLAYER_WHAT,
  bot: {
    kill: 'Bot killed someone',
    death: 'Bot was killed',
    storm_death: 'Bot killed by the storm',
    loot: 'Bot picked up loot',
  },
}
// `Kill` / `Killed` (EC-12): the README's meaning, stated as the README's, not as a fact.
const RAW_WHAT: Partial<Record<string, string>> = {
  Kill: 'Kill logged (README: killed a human player)',
  Killed: 'Killed logged (README: killed by a human player)',
}

const KIND_LABEL: Record<ActorKind, string> = { human: 'Human', unknown: 'Unknown actor', bot: 'Bot' }

export const ID_MISMATCH_NOTE =
  'Unknown: numeric (bot-style) ID but player-client events (Position, Loot); not counted as human or bot'
export const AFTER_DEATH_NOTE = "Logged after this player's death; timing uncertain"
// shown on the match card when human files log bot combat but no bot journey was recorded
export const BOT_ACTIVITY_NOTE = 'Bot activity detected, but no bot movement data is available for playback.'
export const KILL_KILLED_PAIR_NOTE =
  "Kill and Killed logged in the same second; the data can't show whether this was self-inflicted or a trade with an unrecorded player"

// What each place that shows event counts is counting (map pass M4). The numbers differ on purpose.
export const SCOPE = {
  humanFiles: 'In human files',
  onMap: 'On the map',
  journey: 'This journey',
} as const

/** "human h1", or "human H1 h1" when humans are tagged */
function actorLabel(a: ActorInfo): string {
  return [a.kind, a.tag, a.id].filter(Boolean).join(' ')
}

/** Tooltip text in the order §6 asks for: what happened, who and when, then notes. */
export interface TooltipText {
  title: string
  who: string
  when: string | null
  notes: string[]
}

export function markerText(m: MarkerDatum): TooltipText {
  const what = RAW_WHAT[m.raw] ?? WHAT[m.actor.kind][m.type]
  const notes: string[] = []
  if (m.killKilledPair) notes.push(KILL_KILLED_PAIR_NOTE)
  if (m.afterDeath) notes.push(AFTER_DEATH_NOTE)
  if (m.actor.idMismatch) notes.push(ID_MISMATCH_NOTE)
  return { title: `${what} (${m.raw})`, who: actorLabel(m.actor), when: durationLabel(m.t), notes }
}

export function actorText(a: ActorInfo): TooltipText {
  const notes: string[] = []
  if (a.segments > 1) notes.push(`${a.segments} path pieces: no line is drawn across gaps over 30 s`)
  if (a.idMismatch) notes.push(ID_MISMATCH_NOTE)
  return { title: [KIND_LABEL[a.kind], a.tag].filter(Boolean).join(' '), who: a.id, when: null, notes }
}

/** "Journey start" / "Last recorded position", with who and when. Neither is a death or an extraction (EC-13). */
export function endpointText(e: EndpointDatum): TooltipText {
  const start = e.which === 'start'
  return {
    title: start ? 'Journey start' : 'Last recorded position',
    who: actorLabel(e.actor),
    when: durationLabel(e.t),
    notes: [start ? 'First position sample of this journey' : 'Last position sample; the journey may have ended here or just after'],
  }
}

export const ESTIMATED_POSITION_NOTE = 'Between two position samples: estimated on the straight line between them'

/** Playback: where the actor is at the playback time, and whether that was recorded or estimated. */
export function headText(h: HeadDatum): TooltipText {
  return {
    title: h.recorded ? 'Recorded position' : 'Estimated position',
    who: actorLabel(h.actor),
    when: durationLabel(h.t),
    notes: h.recorded ? [] : [ESTIMATED_POSITION_NOTE],
  }
}

/** "Killed a bot (BotKill) at 4:12 — human h1", then where, then any notes. */
export function describeMarker(m: MarkerDatum): string {
  const t = markerText(m)
  return [`${t.title} at ${t.when} — ${t.who}`, ...t.notes].join('\n')
}

export function describeActor(a: ActorInfo): string {
  const t = actorText(a)
  return [`${t.title} ${t.who}`, ...t.notes].join('\n')
}

export interface ActorStats {
  /** "Killed by a bot at 1:58", or "No death recorded" */
  end: string
  /** match time (s) of the first and last recorded sample or event */
  firstT: number
  lastT: number
  /** world units along straight lines between samples; gaps over 30 s add nothing */
  distance: number
  /** path pieces (a gap over 30 s starts a new one) */
  segments: number
  /** the Kill of a Kill/Killed pair isn't a kill here (EC-12); it's counted in killKilledPairs */
  kills: number
  deaths: number
  loot: number
  killKilledPairs: number
  /** events logged after death (EC-14); not counted above */
  afterDeath: number
}

/** Statistics for one journey, for the card shown when its route is clicked. Rows after death are left out. */
export function actorStats(actor: Actor, map: MapInfo): ActorStats {
  const live = actor.events.filter((e) => !e.after_death)
  const death = live.find((e) => e.type === 'death' || e.type === 'storm_death')
  const count = (type: string) => live.filter((e) => e.type === type && !(type === 'kill' && e.kill_killed_pair)).length
  let distance = 0
  for (const segment of actor.segments)
    for (let i = 1; i < segment.length; i++) {
      const [, u0, v0] = segment[i - 1]
      const [, u1, v1] = segment[i]
      distance += Math.hypot(u1 - u0, v1 - v0) * map.scale
    }
  const times = [...actor.segments.flat().map(([t]) => t), ...live.map((e) => e.t)]
  return {
    end: death ? `${RAW_WHAT[death.raw] ?? WHAT[actor.kind][death.type as EventType]} at ${durationLabel(death.t)}` : 'No death recorded',
    firstT: times.length ? Math.min(...times) : 0,
    lastT: times.length ? Math.max(...times) : 0,
    distance,
    segments: actor.segments.length,
    kills: count('kill'),
    deaths: count('death') + count('storm_death'),
    loot: count('loot'),
    killKilledPairs: live.filter((e) => e.type === 'kill' && e.kill_killed_pair).length,
    afterDeath: actor.events.length - live.length,
  }
}

export interface BotCombat {
  /** `BotKill` rows in human files: a recorded human killed a bot */
  botKills: number
  /** `BotKilled` rows in human files: a recorded human was killed by a bot */
  deathsByBots: number
  /** counted kills and deaths in human files that aren't bot combat (unpaired `Kill` / `Killed`) */
  otherKills: number
  otherDeaths: number
  /** bot combat was logged, but the match has no recorded bot journey to draw or play back */
  withoutBotJourneys: boolean
}

/**
 * Bot combat for the match card, kept apart from recorded bot journeys: human files log fights with bots whose own
 * files are often not in the data, so "no bot journey" doesn't mean "no bots". Same scope as the card's other counts
 * (events in human files, late events included); the Killed half of a Kill/Killed pair is counted as a pair, not here.
 */
export function botCombat(summary: MatchSummary, match: MatchFile): BotCombat {
  let botKills = 0
  let deathsByBots = 0
  for (const a of match.actors) {
    if (a.kind !== 'human') continue
    for (const e of a.events) {
      if (e.raw === 'BotKill') botKills++
      else if (e.raw === 'BotKilled') deathsByBots++
    }
  }
  const c = summary.counts
  return {
    botKills,
    deathsByBots,
    otherKills: c.kill - botKills,
    otherDeaths: c.death - deathsByBots - c.kill_killed_pair,
    withoutBotJourneys: summary.bots === 0 && botKills + deathsByBots > 0,
  }
}

/**
 * What the legend counts: actors of each kind, and the markers each event toggle controls.
 * Hidden actor kinds take their events with them; hidden event types are still counted,
 * so a switched-off layer shows what switching it on would add.
 */
export function layerCounts(match: MatchFile, hide: readonly LayerKey[] = []) {
  const actors: Record<ActorKind, number> = { human: 0, unknown: 0, bot: 0 }
  const events: Record<EventType, number> = { kill: 0, death: 0, storm_death: 0, loot: 0 }
  // kill markers that are the Kill of a Kill/Killed pair: drawn, so in `events.kill`, but not kills (EC-12)
  let pairKills = 0
  for (const a of match.actors) {
    actors[a.kind]++
    if (actorHidden(a.kind, hide)) continue
    for (const e of a.events) {
      if (!isEventType(e.type)) continue
      events[e.type]++
      if (e.type === 'kill' && e.kill_killed_pair) pairKills++
    }
  }
  return { actors, events, pairKills }
}
