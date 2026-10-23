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

function pairCount(index: Index, map: string, date: string | null): number {
  return index.matches
    .filter((m) => m.map === map && (date === null || m.date === date))
    .reduce((sum, m) => sum + m.counts.kill_killed_pair, 0)
}

export function heatmapEvidence(index: Index, file: HeatmapFile, layer: HeatmapLayerKey, date: string | null): Evidence {
  const key = date ?? 'all'
  const sample = file.samples[key]
  if (!sample) {
    return { kind: 'no-data', total: 0, humanJourneys: 0, matchesWithHumans: 0, contributing: 0, low: false, pairs: 0 }
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
    pairs: layer === 'traffic' ? 0 : pairCount(index, file.map, date),
  }
}

/** "315 deaths in 314 matches", "About 26 min of estimated player time". */
export function layerEvidenceText(layer: HeatmapLayerKey, e: Evidence): string {
  if (layer === 'traffic') return `About ${formatPlayerTime(e.total)} of estimated player time`
  return `${plural(e.total, layer === 'kills' ? 'kill' : 'death')} in ${plural(e.contributing, 'match', 'matches')}`
}

/** "554 human journeys in 553 matches". */
export function journeysText(e: Evidence): string {
  return `${plural(e.humanJourneys, 'human journey')} in ${plural(e.matchesWithHumans, 'match', 'matches')}`
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

export const COVERAGE_NOTE = 'Telemetry covers recorded players only; most matches have one recorded human.'
