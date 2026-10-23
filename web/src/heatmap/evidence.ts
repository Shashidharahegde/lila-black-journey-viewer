// How much data a heatmap rests on, and the words that say so (spec 06, "Evidence, samples and flags").
import type { DateInfo, HeatmapFile, HeatmapLayerKey, Index } from '../data/types'
import { formatPlayerTime, plural } from './format'

/** Below this many contributing matches a layer is flagged "Few matches" (S, 2026-10-22, guidelines P7). */
export const LOW_EVIDENCE_MATCHES = 10

export interface Evidence {
  /** `no-data`: no human journey on that date; `empty`: journeys, but none of this event; `ok`: cells to draw */
  kind: 'no-data' | 'empty' | 'ok'
  /** events for kills/deaths, seconds for traffic */
  total: number
  humanJourneys: number
  /** matches on this map and date with at least one human journey */
  matchesWithHumans: number
  /** matches that have at least one of this layer's events (traffic: matches with human journeys) */
  contributing: number
  low: boolean
  /** Kill/Killed pairs on this map and date (EC-12): the Killed counts as a death, the Kill is left out of kills. Not used for traffic */
  pairs: number
  /** deaths only: storm deaths among `total` (from the index's human-file counts); 0 for the other layers */
  stormDeaths: number
}

/** Matches contributing to a layer, from the index (its per-match counts equal the heatmap totals). */
function contributingMatches(index: Index, map: string, date: string | null, layer: 'kills' | 'deaths'): number {
  let n = 0
  for (const m of index.matches) {
    if (m.map !== map || (date !== null && m.date !== date)) continue
    if ((layer === 'kills' ? m.counts.kill : m.counts.death + m.counts.storm_death) > 0) n++
  }
  return n
}

function countSum(index: Index, map: string, date: string | null, key: 'kill_killed_pair' | 'storm_death'): number {
  return index.matches
    .filter((m) => m.map === map && (date === null || m.date === date))
    .reduce((sum, m) => sum + m.counts[key], 0)
}

export function heatmapEvidence(index: Index, file: HeatmapFile, layer: HeatmapLayerKey, date: string | null): Evidence {
  const key = date ?? 'all'
  const sample = file.samples[key]
  if (!sample) {
    return { kind: 'no-data', total: 0, humanJourneys: 0, matchesWithHumans: 0, contributing: 0, low: false, pairs: 0, stormDeaths: 0 }
  }
  const contributing = layer === 'traffic' ? sample.matches : contributingMatches(index, file.map, date, layer)
  const empty = (file.layers[layer][key] ?? []).length === 0
  return {
    kind: empty ? 'empty' : 'ok',
    total: file.totals[layer][key] ?? 0,
    humanJourneys: sample.human_journeys,
    matchesWithHumans: sample.matches,
    contributing,
    low: !empty && contributing < LOW_EVIDENCE_MATCHES,
    pairs: layer === 'traffic' ? 0 : countSum(index, file.map, date, 'kill_killed_pair'),
    stormDeaths: layer === 'deaths' ? countSum(index, file.map, date, 'storm_death') : 0,
  }
}

export interface SummaryFigure {
  value: string
  label: string
}

export interface LayerSummary {
  /** the layer's total, with what it counts */
  lead: SummaryFigure
  /** at most three figures that put the total in context; every ratio says its denominator in its label */
  figures: SummaryFigure[]
}

const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–')

/**
 * The summary card of the Heatmaps panel: the total and what it means per match or per journey. Only ratios of the figures above
 * (all from the heatmap file and the index); nothing new is counted. Matches = matches on this map and date with a human journey.
 */
export function layerSummary(layer: HeatmapLayerKey, e: Evidence): LayerSummary {
  const matches = e.matchesWithHumans
  if (layer === 'traffic') {
    return {
      lead: { value: formatPlayerTime(e.total), label: 'estimated time humans spent on the map' },
      figures: [
        { value: e.humanJourneys > 0 ? formatPlayerTime(e.total / e.humanJourneys) : '–', label: 'per human journey' },
        { value: e.humanJourneys.toLocaleString('en-US'), label: 'human journeys' },
        { value: matches.toLocaleString('en-US'), label: 'matches' },
      ],
    }
  }
  const noun = layer === 'kills' ? 'kill' : 'death'
  const figures: SummaryFigure[] = [
    { value: matches > 0 ? oneDecimal(e.total / matches) : '–', label: `${noun}s per match` },
    { value: percent(e.contributing, matches), label: `of matches had a ${noun}` },
  ]
  if (layer === 'deaths') figures.push({ value: `${e.stormDeaths.toLocaleString('en-US')}`, label: `storm deaths (${percent(e.stormDeaths, e.total)})` })
  else figures.push({ value: matches.toLocaleString('en-US'), label: 'matches' })
  return { lead: { value: e.total.toLocaleString('en-US'), label: layer === 'kills' ? 'kills by human players' : 'human deaths' }, figures }
}

export function lowEvidenceText(layer: HeatmapLayerKey, e: Evidence): string {
  const basis = layer === 'traffic' ? 'with a human journey' : `with a ${layer === 'kills' ? 'kill' : 'death'}`
  return `This layer rests on ${plural(e.contributing, 'match', 'matches')} ${basis}, fewer than ${LOW_EVIDENCE_MATCHES}. Read patterns with care.`
}

/** What to say instead of cells. Null when there are cells. */
export function emptyText(layer: HeatmapLayerKey, e: Evidence, map: string, date: string | null): { title: string; hint?: string } | null {
  if (e.kind === 'no-data') {
    return { title: `No human journeys recorded on ${map} on ${date ?? 'any date'}.`, hint: 'Choose another date or All dates.' }
  }
  if (e.kind === 'empty') {
    const what = layer === 'kills' ? 'human kills' : layer === 'deaths' ? 'human deaths' : 'human movement'
    return { title: `No ${what} recorded in the ${plural(e.matchesWithHumans, 'match', 'matches')} ${date ? 'on this date' : 'in the data'}.` }
  }
  return null
}

/** The observed window of a partial day, from the index (EC-24); null for a full day. */
export function partialText(info: DateInfo | undefined): string | null {
  if (!info?.partial) return null
  const clock = (iso: string) => iso.slice(11, 16)
  return `Partial day: observed ${clock(info.observed_from_utc)}–${clock(info.observed_to_utc)} UTC`
}

/** The Kill/Killed pair rule, in words, when this selection has pairs. Null otherwise. */
export function pairNote(layer: HeatmapLayerKey, pairs: number): string | null {
  if (pairs === 0 || layer === 'traffic') return null
  const events = plural(pairs, 'event')
  return layer === 'deaths'
    ? `Includes ${events} from Kill/Killed pairs (the Killed half; cause unknown).`
    : `Leaves out ${events} from Kill/Killed pairs (the Kill half; cause unknown).`
}
