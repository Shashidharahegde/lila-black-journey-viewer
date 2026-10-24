import { describe, expect, it } from 'vitest'
import statsJson from '../../public/data/stats.json'
import type { StatsFile } from '../data/types'
import { ALL } from '../state/statsUrl'
import { MEASURES, STANDING_LABEL, assessmentFor, assessments, rankText } from './assessment'

const stats = statsJson as unknown as StatsFile

describe('assessments, all dates (from the stored map_score)', () => {
  it('ranks the maps by score and names their standing', () => {
    const ranked = assessments(stats, ALL)
    expect(ranked.map((a) => [a.map, a.score.value, rankText(a), STANDING_LABEL[a.standing]])).toEqual([
      ['AmbroseValley', 0.78, '1st of 3', 'Leading'],
      ['GrandRift', 0.44, '2nd of 3', 'In between'],
      ['Lockdown', 0.24, '3rd of 3', 'Needs improvement'],
    ])
  })

  it('the evidence is where a map is top (part = 1) or lowest (part = 0) of the maps', () => {
    const lockdown = assessmentFor(stats, ALL, 'Lockdown')!
    expect(lockdown.strengths).toEqual(['journey_span_s'])
    expect(lockdown.improve).toEqual(['kill_rate', 'loot_rate', 'storm_death_rate'])
    expect(assessmentFor(stats, ALL, 'GrandRift')!.strengths).toEqual(['kill_rate'])
  })

  it('every score part has a plain-language name', () => {
    const parts = Object.keys(assessments(stats, ALL)[0].score.parts)
    for (const part of parts) expect(MEASURES[part], part).toBeDefined()
  })

  it('nothing to rank when fewer than two maps have matches', () => {
    expect(assessments(stats, stats.dates[0].date)).toEqual([])
    expect(assessmentFor(stats, stats.dates[0].date, 'AmbroseValley')).toBeNull()
  })
})
