// Every insight is read from the real stats.json; nothing here is invented (CLAUDE.md: no LLM-authored conclusions).
import { describe, expect, it } from 'vitest'
import statsJson from '../../public/data/stats.json'
import type { StatsFile } from '../data/types'
import { ALL } from '../state/statsUrl'
import { lootInsight, overviewInsights, scoreInsight, stormInsight } from './insights'

const stats = statsJson as unknown as StatsFile

describe('overviewInsights, all maps and all dates', () => {
  it('score: who leads, who has the most room to improve, and on which measures', () => {
    const insight = scoreInsight(stats, ALL)!
    expect(insight.headline).toBe('AmbroseValley leads overall; Lockdown has the most room to improve')
    // Lockdown's parts: kills, loot and storm at 0; AmbroseValley's: activity, loot and storm at 1 (stats.json map_score)
    expect(insight.detail).toBe(
      'Lockdown ranks lowest on kills, loot found and storm survival: the first areas to review. AmbroseValley ranks top on human journeys, loot found and storm survival.',
    )
    expect(insight.map).toBe('Lockdown')
  })

  it('storm: a comparison, not the card values (9.94 ÷ 2.99 = 3.3)', () => {
    const insight = stormInsight(stats, ALL)!
    expect(insight.headline).toBe('Lockdown players are caught by the storm most often')
    expect(insight.detail).toBe(
      'Storm deaths there are about 3.3× the rate on AmbroseValley. Worth checking whether routes to the safe zone are long or unclear late in a match.',
    )
  })

  it('loot: the share fewer items than the top map (1 − 11.97 ÷ 17.43 = 31%)', () => {
    const insight = lootInsight(stats, ALL)!
    expect(insight.headline).toBe('Lockdown players find the least loot')
    expect(insight.detail).toBe('About 31% fewer items per human journey than on AmbroseValley. Loot density or placement there may be worth reviewing.')
  })

  it('exactly three curated insights, never every available statistic', () => {
    expect(overviewInsights(stats, ALL).map((i) => i.map)).toEqual(['Lockdown', 'Lockdown', 'Lockdown'])
  })

  it('constructive and honest: no "worst", no retention, no claimed cause', () => {
    const text = overviewInsights(stats, ALL)
      .map((i) => `${i.headline} ${i.detail}`)
      .join(' ')
    expect(text).not.toMatch(/worst|retention|return rate|survival time|in combat|because|causes/i)
  })
})

describe('a thin date with too few comparable maps', () => {
  it('yields fewer insights, never a crash', () => {
    // 2026-02-09: GrandRift and Lockdown have no recorded human journey (EC-23/EC-24), so no two maps are comparable
    const thin = stats.dates[0].date
    expect(() => overviewInsights(stats, thin)).not.toThrow()
    expect(overviewInsights(stats, thin)).toHaveLength(0)
  })
})
