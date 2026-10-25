// Shapes of the files the pipeline writes to web/public/data (contract: docs/specs/02_DATA_PIPELINE.md).

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

/** The rules a region must meet to be a hotspot (pipeline `zones.HotspotRules`); shown, never recomputed, in the browser. */
export interface ZoneRules {
  min_matches: number
  max_one_match_share: number
  max_hotspots: number
}

/** A hotspot: a block of 4 × 4 heatmap cells (zone_cells), (i, j) counted from the south-west like the grid. */
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
  /** traffic only: distinct human journeys with traced time in the region */
  journeys?: number
  /** deaths only: storm deaths among its value */
  storm_deaths?: number
}

export interface ZoneLayer {
  total: number
  occupied_zones: number
  /** how many hotspots the layer has (the length of `zones`) */
  hotspots: number
  /** deaths only: storm deaths among the deaths of the whole selection */
  storm_deaths?: number
  /** the hotspots, strongest first */
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

// web/public/data/stats.json: overall statistics for every map scope × date scope (contract: docs/specs/10_DASHBOARD.md).
// The browser only reads and formats these; it never computes a statistic of its own.

export type StatKind = 'count' | 'ratio' | 'rate' | 'distribution' | 'histogram' | 'breakdown' | 'score'

export interface MetricInfo {
  label: string
  section: string
  unit: string
  kind: StatKind
  definition: string
  population: string
  denominator: string
  limitations: string[]
  /** `per_map`: null for all maps */
  scopes: 'all' | 'per_map'
}

export interface CountValue {
  value: number
}

export interface RatioValue {
  numerator: number
  denominator: number
  /** numerator ÷ denominator, 4 decimals */
  value: number
}

/** Bins [edges[k], edges[k+1]); values at or above the last edge are in `overflow`. A split histogram has `series` instead of `counts`. */
export interface HistogramValue {
  edges: number[]
  counts?: number[]
  series?: Record<string, number[]>
  overflow: number
  n: number
}

/** With n = 0 the statistics are null and `sum` is 0. */
export interface DistributionValue {
  n: number
  min: number | null
  p25: number | null
  median: number | null
  p75: number | null
  max: number | null
  sum: number
  /** n < thresholds.few_values */
  few_values: boolean
  histogram?: HistogramValue
}

export interface BreakdownValue {
  value: number
  parts: Record<string, number>
}

/** numerator per `per` units of the denominator (e.g. storm deaths per 100 journeys), 2 decimals */
export interface RateValue {
  numerator: number
  denominator: number
  per: number
  value: number
}

/** map_score: the maps of one date compared; each part is 0 (worst map) to 1 (best map), `value` is their mean */
export interface ScoreValue {
  value: number
  parts: Record<string, number>
  /** how many maps were compared */
  maps: number
}

export type StatValue = CountValue | RatioValue | RateValue | DistributionValue | HistogramValue | BreakdownValue | ScoreValue

export interface StatsSlice {
  sample: {
    matches: number
    matches_with_human: number
    human_journeys: number
    human_players: number
    excluded: { bot_journeys: number; unknown_journeys: number }
  }
  flags: { empty: boolean; few_matches: boolean; partial_date: boolean; boundary_date: boolean }
  /** every metric id; null for an empty slice, a per-map metric on all maps, days-observed on one date, or a map score with no other map to compare */
  values: Record<string, StatValue | null>
}

export interface StatsFile {
  schema_version: number
  /** bumped whenever a definition changes; the dashboard refuses a version it wasn't written for */
  metrics_version: number
  source: { fingerprint: string; files: number }
  thresholds: { few_matches: number; few_values: number }
  grid: number
  maps: string[]
  dates: Omit<DateInfo, 'matches'>[]
  metrics: Record<string, MetricInfo>
  /** map scope ('all' or a map) → date scope ('all' or a date) → slice */
  slices: Record<string, Record<string, StatsSlice>>
}
