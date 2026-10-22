// Shapes of the files the pipeline writes to web/public/data (contract: docs/02_DATA_PIPELINE.md).

export interface MapInfo {
  image: string
  /** Size of the web image in pixels; only the ratio matters for drawing. */
  width: number
  height: number
  /** World calibration: u = (x − origin_x) / scale, v = (z − origin_z) / scale. */
  scale: number
  origin_x: number
  origin_z: number
}

export interface DateInfo {
  date: string
  matches: number
  boundary: boolean
  partial: boolean
  observed_from_utc: string
  observed_to_utc: string
}

export interface MatchSummary {
  id: string
  full_id: string
  map: string
  date: string
  start_utc: string
  duration_s: number
  humans: number
  bots: number
  /** journeys whose numeric ID and player-client events disagree (EC-09); neither human nor bot */
  unknown: number
  /** from human files only; `kill` leaves out the Kill half of each Kill/Killed pair */
  counts: { kill: number; death: number; storm_death: number; loot: number; kill_killed_pair: number }
}

export interface Index {
  schema_version: number
  maps: Record<string, MapInfo>
  dates: DateInfo[]
  matches: MatchSummary[]
}

/** [t, u, v]: seconds since match start, map position 0–1. */
export type Point = [number, number, number]

export interface MatchEvent {
  t: number
  type: string
  raw: string
  u: number
  v: number
  after_death: boolean
  /** a Kill and a Killed logged by the same file in the same second; cause unknown (EC-12) */
  kill_killed_pair: boolean
}

export type ActorKind = 'human' | 'unknown' | 'bot'

export interface Actor {
  id: string
  kind: ActorKind
  id_mismatch: boolean
  segments: Point[][]
  events: MatchEvent[]
}

export interface MatchFile {
  schema_version: number
  id: string
  full_id: string
  map: string
  date: string
  duration_s: number
  actors: Actor[]
}
