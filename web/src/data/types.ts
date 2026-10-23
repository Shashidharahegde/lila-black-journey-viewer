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

export type HeatmapLayerKey = 'kills' | 'deaths' | 'traffic'

/** [i, j, value]: i = column along u (west → east), j = row along v (south → north). Only non-zero cells are stored. */
export type HeatmapCell = [number, number, number]

/** One map's aggregates, per layer and per date key (`all` or a UTC date); human journeys only. */
export interface HeatmapFile {
  schema_version: number
  map: string
  grid: number
  cells: string
  units: Record<HeatmapLayerKey, string>
  layers: Record<HeatmapLayerKey, Record<string, HeatmapCell[]>>
  /** events for kills/deaths, seconds for traffic */
  totals: Record<HeatmapLayerKey, Record<string, number>>
  /** journeys, not rows: matches with a human journey and the human journeys in them */
  samples: Record<string, { matches: number; human_journeys: number }>
}

/** The rules the regions were qualified under (pipeline `zones.Rules`); shown, never recomputed, in the browser. */
export interface ZoneRules {
  top_share: number
  min_candidates: number
  min_stability: number
  min_matches: number
  min_players: number
  max_one_match_share: number
  survival_rule: string
  survival_share: number
  required_shifts: number
  bootstraps: number
}

/** A candidate region: a block of 4 × 4 heatmap cells (zone_cells), (i, j) counted from the south-west like the grid. */
export interface ZoneRecord {
  i: number
  j: number
  /** events for kills/deaths, seconds for traffic */
  value: number
  /** of the layer's total in this selection */
  share: number
  matches: number
  players: number
  /** the largest single match's share of the region's value */
  largest_match_share: number
  /** share of resamples of the matches in which the region is again a candidate */
  stability: number
  /** how many of the three half-region-shifted grids its geographic counterpart also qualifies on */
  survived_shifts: number
  tier: 'consistent' | 'observed'
  /** traffic only: distinct human journeys with traced time in the region */
  journeys?: number
  /** deaths only: storm deaths among its value */
  storm_deaths?: number
}

export interface ZoneLayer {
  total: number
  occupied_zones: number
  candidates: number
  consistent: number
  /** deaths only: storm deaths among the deaths of the whole selection */
  storm_deaths?: number
  /** the candidates, strongest first */
  zones: ZoneRecord[]
}

export interface ZoneSelection {
  matches: number
  players: number
  layers: Record<HeatmapLayerKey, ZoneLayer>
}

export interface ZonesFile {
  schema_version: number
  map: string
  grid: number
  zone_cells: number
  zones_per_side: number
  rules: ZoneRules
  selections: Record<string, ZoneSelection>
}
