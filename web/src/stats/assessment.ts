// A map's standing against the other maps at one date, read from the stored map_score (stats.py). The score is the
// equal-weight mean of five parts, each scaled 1 = top of the maps compared, 0 = lowest (all equal: 0.5), so it only
// means something relative to the other maps. This module names that standing; it computes nothing new.
import type { ScoreValue, StatsFile } from '../data/types'
import { scoreOf, sliceFor } from './slices'

/** stats.py SCORE_PARTS, in its order, as a level designer reads them */
export const MEASURES: Record<string, { label: string; word: string }> = {
  human_journeys: { label: 'Human journeys', word: 'human journeys' },
  journey_span_s: { label: 'Recorded span', word: 'recorded span' },
  kill_rate: { label: 'Kills', word: 'kills' },
  loot_rate: { label: 'Loot found', word: 'loot found' },
  storm_death_rate: { label: 'Storm survival', word: 'storm survival' },
}

export type Standing = 'leading' | 'middle' | 'improve'

export interface Assessment {
  map: string
  score: ScoreValue
  /** 1 = highest score */
  rank: number
  /** how many maps were compared */
  of: number
  standing: Standing
  /** measures where this map is top of the maps compared */
  strengths: string[]
  /** measures where this map is lowest of the maps compared */
  improve: string[]
}

/** Every scored map at the date, highest score first; empty when fewer than two maps can be compared. */
export function assessments(stats: StatsFile, date: string): Assessment[] {
  const scored = stats.maps.flatMap((map) => {
    const score = scoreOf(sliceFor(stats, map, date))
    return score ? [{ map, score }] : []
  })
  const sorted = [...scored].sort((a, b) => b.score.value - a.score.value)
  return sorted.map(({ map, score }, i) => {
    const parts = Object.keys(score.parts)
    const top = sorted[0].score.value
    const bottom = sorted.at(-1)!.score.value
    // ties share a standing: equal top scores both lead, equal bottom scores both have room to improve
    const standing: Standing = top === bottom ? 'middle' : score.value === top ? 'leading' : score.value === bottom ? 'improve' : 'middle'
    return {
      map,
      score,
      rank: i + 1,
      of: sorted.length,
      standing,
      strengths: parts.filter((p) => score.parts[p] === 1),
      improve: parts.filter((p) => score.parts[p] === 0),
    }
  })
}

export function assessmentFor(stats: StatsFile, date: string, map: string): Assessment | null {
  return assessments(stats, date).find((a) => a.map === map) ?? null
}

export const STANDING_LABEL: Record<Standing, string> = {
  leading: 'Leading',
  middle: 'In between',
  improve: 'Needs improvement',
}

/** "1st of 3" */
export function rankText(a: Pick<Assessment, 'rank' | 'of'>): string {
  const suffix = a.rank === 1 ? 'st' : a.rank === 2 ? 'nd' : a.rank === 3 ? 'rd' : 'th'
  return `${a.rank}${suffix} of ${a.of}`
}

export const list = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)
