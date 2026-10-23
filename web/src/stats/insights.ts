// Computed observations for the Overview: what the stored figures suggest about the maps, in a sentence or two. The
// numbers themselves are on the cards above, so an insight names the finding and the comparison, not the raw values.
// Each one is built from stats.json only; the follow-up is phrased as something to check, never as a proven cause.
import type { StatsFile } from '../data/types'
import { MEASURES, assessments, list } from './assessment'
import { rateOf, sliceFor } from './slices'

export interface Insight {
  id: string
  /** the map the finding is about, so its card can open that map's report */
  map: string
  headline: string
  detail: string
}

const words = (parts: string[]) => list(parts.map((p) => MEASURES[p]?.word ?? p))

/** Which map leads overall, which has the most room to improve, and on which measures. */
export function scoreInsight(stats: StatsFile, date: string): Insight | null {
  const ranked = assessments(stats, date)
  if (ranked.length < 2) return null
  const lead = ranked[0]
  const last = ranked.at(-1)!
  if (lead.score.value === last.score.value) return null
  const improve = last.improve.length ? `${last.map} ranks lowest on ${words(last.improve)}: the first areas to review.` : ''
  const strong = lead.strengths.length ? ` ${lead.map} ranks top on ${words(lead.strengths)}.` : ''
  return {
    id: 'map_score',
    map: last.map,
    headline: `${lead.map} leads overall; ${last.map} has the most room to improve`,
    detail: `${improve}${strong}`.trim(),
  }
}

interface RateRow {
  map: string
  value: number
}

function rateRows(stats: StatsFile, date: string, id: string): RateRow[] {
  return stats.maps.flatMap((map) => {
    const r = rateOf(sliceFor(stats, map, date), id)
    return r ? [{ map, value: r.value }] : []
  })
}

/** "about 3.3× the rate on X", or how the top map compares when the lowest is zero. */
function multiple(top: RateRow, low: RateRow): string {
  if (low.value === 0) return `well above ${low.map}, which has none`
  return `about ${(top.value / low.value).toFixed(1)}× the rate on ${low.map}`
}

/** The map where matches end in a storm death most often. */
export function stormInsight(stats: StatsFile, date: string): Insight | null {
  const rows = [...rateRows(stats, date, 'storm_death_rate')].sort((a, b) => b.value - a.value)
  if (rows.length < 2 || rows[0].value === rows.at(-1)!.value) return null
  const [top, low] = [rows[0], rows.at(-1)!]
  return {
    id: 'storm_death_rate',
    map: top.map,
    headline: `${top.map} players are caught by the storm most often`,
    detail: `Storm deaths there are ${multiple(top, low)}. Worth checking whether routes to the safe zone are long or unclear late in a match.`,
  }
}

/** The map where players pick up the fewest items per match. */
export function lootInsight(stats: StatsFile, date: string): Insight | null {
  const rows = [...rateRows(stats, date, 'loot_rate')].sort((a, b) => a.value - b.value)
  if (rows.length < 2 || rows[0].value === rows.at(-1)!.value) return null
  const [low, top] = [rows[0], rows.at(-1)!]
  const fewer = Math.round((1 - low.value / top.value) * 100)
  return {
    id: 'loot_rate',
    map: low.map,
    headline: `${low.map} players find the least loot`,
    detail: `About ${fewer}% fewer items per match than on ${top.map}. Loot density or placement there may be worth reviewing.`,
  }
}

/** A small, curated set (never every available statistic); a selection too thin to compare drops its own insight. */
export function overviewInsights(stats: StatsFile, date: string): Insight[] {
  return [scoreInsight(stats, date), stormInsight(stats, date), lootInsight(stats, date)].filter((x): x is Insight => x !== null)
}
