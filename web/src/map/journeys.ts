// Turns a match file into what the map draws: paths, lone samples and event markers,
// all in the drawing space from space.ts. No deck.gl here, so it can be unit-tested.
import type { Actor, ActorKind, MapInfo, MatchEvent, MatchFile } from '../data/types'
import { durationLabel } from '../state/matches'
import type { LayerKey } from '../state/url'
import { EVENT_ORDER, type EventType } from './encoding'
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
}

export interface JourneyData {
  /** segments with two or more samples; a gap over 30 s already starts a new segment */
  paths: PathDatum[]
  /** segments with a single sample, which a line can't show */
  lonePoints: PointDatum[]
  /** sorted in EVENT_ORDER, then by time */
  markers: MarkerDatum[]
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

  for (const actor of match.actors) {
    if (actorHidden(actor.kind, hide)) continue
    const info = infos.get(actor)!
    for (const segment of actor.segments) {
      if (segment.length === 1) {
        const [t, u, v] = segment[0]
        lonePoints.push({ actor: info, position: uvToSpace(u, v, map), t })
      } else {
        paths.push({ actor: info, path: segment.map(([, u, v]) => uvToSpace(u, v, map)) })
      }
    }
    for (const e of actor.events) {
      if (!isEventType(e.type) || hide.includes(e.type)) continue
      markers.push(toMarker(e, e.type, info, map))
    }
  }
  markers.sort((a, b) => EVENT_ORDER.indexOf(a.type) - EVENT_ORDER.indexOf(b.type) || a.t - b.t)
  return { paths, lonePoints, markers }
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

const WHERE: Record<EventType, string> = {
  kill: 'Marker shows where the killer stood',
  death: 'Marker shows where the victim fell',
  storm_death: 'Marker shows where they died',
  loot: 'Marker shows where they picked it up',
}
const PAIR_WHERE = 'Marker shows where this player stood; both events of the pair carry that position'

const KIND_LABEL: Record<ActorKind, string> = { human: 'Human', unknown: 'Unknown actor', bot: 'Bot' }

export const ID_MISMATCH_NOTE =
  'Unknown: numeric (bot-style) ID but player-client events (Position, Loot); not counted as human or bot'
export const AFTER_DEATH_NOTE = "Logged after this player's death; timing uncertain"
export const KILL_KILLED_PAIR_NOTE =
  "Kill and Killed logged in the same second; the data can't show whether this was self-inflicted or a trade with an unrecorded player"

/** "human h1", or "human H1 h1" when humans are tagged */
function actorLabel(a: ActorInfo): string {
  return [a.kind, a.tag, a.id].filter(Boolean).join(' ')
}

/** Tooltip text in the order §6 asks for: what happened, who and when, then position meaning and notes. */
export interface TooltipText {
  title: string
  who: string
  when: string | null
  notes: string[]
}

export function markerText(m: MarkerDatum): TooltipText {
  const what = RAW_WHAT[m.raw] ?? WHAT[m.actor.kind][m.type]
  const notes = [m.killKilledPair ? PAIR_WHERE : WHERE[m.type]]
  if (m.killKilledPair) notes.push(KILL_KILLED_PAIR_NOTE)
  if (m.afterDeath) notes.push(AFTER_DEATH_NOTE)
  if (m.actor.idMismatch) notes.push(ID_MISMATCH_NOTE)
  return { title: `${what} (${m.raw})`, who: actorLabel(m.actor), when: durationLabel(m.t), notes }
}

export const SAMPLING_NOTE = 'Positions are sampled about every 5 s; lines are straight between samples'

export function actorText(a: ActorInfo): TooltipText {
  const notes = [SAMPLING_NOTE]
  if (a.segments > 1) notes.push(`${a.segments} path pieces: no line is drawn across gaps over 30 s`)
  if (a.idMismatch) notes.push(ID_MISMATCH_NOTE)
  return { title: [KIND_LABEL[a.kind], a.tag].filter(Boolean).join(' '), who: a.id, when: null, notes }
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
  kills: number
  deaths: number
  loot: number
  /** events logged after death (EC-14); not counted above */
  afterDeath: number
}

/** Statistics for one journey, for the card shown when its route is clicked. Rows after death are left out. */
export function actorStats(actor: Actor, map: MapInfo): ActorStats {
  const live = actor.events.filter((e) => !e.after_death)
  const death = live.find((e) => e.type === 'death' || e.type === 'storm_death')
  const count = (type: string) => live.filter((e) => e.type === type).length
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
    afterDeath: actor.events.length - live.length,
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
  for (const a of match.actors) {
    actors[a.kind]++
    if (actorHidden(a.kind, hide)) continue
    for (const e of a.events) if (isEventType(e.type)) events[e.type]++
  }
  return { actors, events }
}
