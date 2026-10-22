// Turns a match file into what the map draws: paths, lone samples and event markers,
// all in the drawing space from space.ts. No deck.gl here, so it can be unit-tested.
import type { Actor, ActorKind, MapInfo, MatchEvent, MatchFile } from '../data/types'
import { durationLabel } from '../state/matches'
import type { LayerKey } from '../state/url'
import { uvToSpace } from './space'

export type EventType = 'kill' | 'death' | 'storm_death' | 'loot'

/** Draw order, bottom to top: loot first so the rare events stay visible. */
export const EVENT_ORDER: EventType[] = ['loot', 'storm_death', 'death', 'kill']

export interface ActorInfo {
  id: string
  kind: ActorKind
  idMismatch: boolean
  /** 0, 1, … for humans in file order (humans come first); null for unknown and bots */
  humanIndex: number | null
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

function actorInfos(match: MatchFile): Map<Actor, ActorInfo> {
  let humans = 0
  return new Map(
    match.actors.map((a) => [
      a,
      {
        id: a.id,
        kind: a.kind,
        idMismatch: a.id_mismatch,
        humanIndex: a.kind === 'human' ? humans++ : null,
        segments: a.segments.length,
      },
    ]),
  )
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
    if (actor.kind === 'bot' && hide.includes('bots')) continue
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

function actorLabel(a: ActorInfo): string {
  return `${a.kind} ${a.id}`
}

/** "Killed a bot (BotKill) at 4:12 — human 1a2b3c4d", then where, then any notes. */
export function describeMarker(m: MarkerDatum): string {
  const what = RAW_WHAT[m.raw] ?? WHAT[m.actor.kind][m.type]
  const where = m.killKilledPair ? PAIR_WHERE : WHERE[m.type]
  const lines = [`${what} (${m.raw}) at ${durationLabel(m.t)} — ${actorLabel(m.actor)}`, where]
  if (m.killKilledPair) lines.push(KILL_KILLED_PAIR_NOTE)
  if (m.afterDeath) lines.push(AFTER_DEATH_NOTE)
  if (m.actor.idMismatch) lines.push(ID_MISMATCH_NOTE)
  return lines.join('\n')
}

export function describeActor(a: ActorInfo): string {
  const lines = [`${KIND_LABEL[a.kind]} ${a.id}`]
  if (a.segments > 1) lines.push(`${a.segments} path pieces: no line is drawn across gaps over 30 s`)
  if (a.idMismatch) lines.push(ID_MISMATCH_NOTE)
  return lines.join('\n')
}
