// Turns a match file into what the map draws: paths, lone samples and event markers,
// all in the drawing space from space.ts. No deck.gl here, so it can be unit-tested.
import type { Actor, MapInfo, MatchEvent, MatchFile } from '../data/types'
import { durationLabel } from '../state/matches'
import type { LayerKey } from '../state/url'
import { uvToSpace } from './space'

export type EventType = 'kill' | 'death' | 'storm_death' | 'self_kill' | 'loot'

/** Draw order, bottom to top: loot first so the rare events stay visible. */
export const EVENT_ORDER: EventType[] = ['loot', 'self_kill', 'storm_death', 'death', 'kill']

export interface ActorInfo {
  id: string
  kind: 'human' | 'bot'
  idMismatch: boolean
  /** 0, 1, … for humans in file order (humans come first); null for bots */
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
  return { actor, type, raw: e.raw, t: e.t, afterDeath: e.after_death, position: uvToSpace(e.u, e.v, map) }
}

// Wording follows the file owner's point of view (EC-11): x/z is always where the owner stood.
const WHAT: Record<'human' | 'bot', Record<EventType, string>> = {
  human: {
    kill: 'Killed a bot',
    death: 'Killed by a bot',
    storm_death: 'Killed by the storm',
    self_kill: 'Killed themselves',
    loot: 'Picked up loot',
  },
  bot: {
    kill: 'Bot killed someone',
    death: 'Bot was killed',
    storm_death: 'Bot killed by the storm',
    self_kill: 'Bot killed itself',
    loot: 'Bot picked up loot',
  },
}

const WHERE: Record<EventType, string> = {
  kill: 'Marker shows where the killer stood',
  death: 'Marker shows where the victim fell',
  storm_death: 'Marker shows where they died',
  self_kill: 'Marker shows where they died',
  loot: 'Marker shows where they picked it up',
}

export const ID_MISMATCH_NOTE = 'Numeric (bot-style) ID but behaves like a human; possibly a test client'
export const AFTER_DEATH_NOTE = "Logged after this player's death; timing uncertain"

function actorLabel(a: ActorInfo): string {
  return `${a.kind} ${a.id}`
}

/** "Killed a bot (BotKill) at 4:12 — human 1a2b3c4d", then where, then any notes. */
export function describeMarker(m: MarkerDatum): string {
  const lines = [`${WHAT[m.actor.kind][m.type]} (${m.raw}) at ${durationLabel(m.t)} — ${actorLabel(m.actor)}`, WHERE[m.type]]
  if (m.afterDeath) lines.push(AFTER_DEATH_NOTE)
  if (m.actor.idMismatch) lines.push(ID_MISMATCH_NOTE)
  return lines.join('\n')
}

export function describeActor(a: ActorInfo): string {
  const lines = [`${a.kind === 'human' ? 'Human' : 'Bot'} ${a.id}`]
  if (a.segments > 1) lines.push(`${a.segments} path pieces: no line is drawn across gaps over 30 s`)
  if (a.idMismatch) lines.push(ID_MISMATCH_NOTE)
  return lines.join('\n')
}
