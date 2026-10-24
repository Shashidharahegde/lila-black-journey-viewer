// The words every page uses for the same populations and rates (UX-01). Stats pages, Heatmaps and Journeys import these, so one
// figure has one name and one denominator everywhere. The populations differ on purpose and are never made to agree:
// AmbroseValley, all dates, has 566 matches, 566 of them with a human journey, and 568 human journeys.
import { formatCount } from './format'

export const TERMS = {
  /** one recorded game session, whoever is in it (index.json `matches`; the Journeys list counts these) */
  match: { one: 'match', many: 'matches' },
  /** matches with at least one human journey (stats `matches_with_human`, heatmap `samples.matches`) */
  matchWithHuman: { one: 'match with a human journey', many: 'matches with a human journey' },
  /** one recorded human player in one match (stats `human_journeys`): the denominator of every per-journey rate */
  journey: { one: 'human journey', many: 'human journeys' },
  /** distinct hashed player IDs (stats `human_players`), not necessarily distinct people */
  player: { one: 'player observed', many: 'players observed' },
} as const

export type Term = keyof typeof TERMS

/** "568 human journeys", "1 match". */
export function count(n: number, term: Term): string {
  return `${formatCount(n)} ${n === 1 ? TERMS[term].one : TERMS[term].many}`
}

/** The labels of the rates, shared by the stats KPI tiles and the Heatmaps summary. */
export const RATE_LABEL = {
  kills: 'Kills per human journey',
  loot: 'Items looted per human journey',
  storm: 'Storm deaths per 100 human journeys',
  deaths: 'Human journeys ending in a recorded death',
} as const

/** Per-journey rates as stats.json stores them: 2 decimals. `ratePerJourney(1669, 568)` → "2.94", the stored kill_rate. */
export function ratePerJourney(total: number, journeys: number): string {
  return round(total / journeys, 2).toFixed(2)
}

/** A share as stats.json stores it (4 decimals) shown with one decimal: `sharePercent(316, 568)` → "55.6%". */
export function sharePercent(part: number, whole: number): string {
  return `${(round(part / whole, 4) * 100).toFixed(1)}%`
}

// rounds like stats.py's Python round(): on the exact binary value, exact halves to the even neighbour (tested against every slice)
function round(x: number, digits: number): number {
  const scaled = x * 10 ** digits
  const floor = Math.floor(scaled)
  if (scaled - floor === 0.5) return (floor % 2 === 0 ? floor : floor + 1) / 10 ** digits
  return Number(x.toFixed(digits))
}

/** The short definitions for the About panels (the glossary). */
export const GLOSSARY: { term: string; text: string }[] = [
  { term: 'Match', text: 'One recorded game session. Most have a single recorded player.' },
  { term: 'Human journey', text: 'One recorded human player in one match. Per-journey rates divide by this.' },
  { term: 'Players observed', text: 'Distinct recorded player IDs (hashed); not necessarily distinct people.' },
  { term: 'Recorded span', text: 'Time from a journey’s first to its last record; not session length or survival time.' },
  { term: 'Recorded death', text: 'A journey with a death event. A journey without one may have extracted, but there is no extraction event.' },
  { term: 'Estimated player time', text: 'Traffic: time between position samples about 5 s apart, spread along the straight line between them. An estimate, not measured play time.' },
]
