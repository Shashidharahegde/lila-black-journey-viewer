import { describe, expect, it } from 'vitest'
import statsJson from '../../public/data/stats.json' with { type: 'json' }
import type { StatsFile } from '../../src/data/types.ts'
import { buildSystemPrompt } from './prompt.ts'

const stats = statsJson as unknown as StatsFile
const prompt = buildSystemPrompt(stats)

describe('buildSystemPrompt', () => {
  it('ends with the stats file, unchanged', () => {
    const json = prompt.slice(prompt.indexOf('\n{"') + 1)
    expect(JSON.parse(json)).toEqual(stats)
  })

  it('is identical on every call, so the prompt cache stays valid', () => {
    expect(buildSystemPrompt(stats)).toBe(prompt)
  })

  it('names fields that exist in the data', () => {
    const slice = stats.slices.all.all
    for (const flag of ['few_matches', 'partial_date', 'empty']) {
      expect(prompt).toContain(flag)
      expect(slice.flags).toHaveProperty(flag)
    }
    for (const field of ['matches_with_human', 'human_players', 'excluded']) {
      expect(prompt).toContain(field)
      expect(slice.sample).toHaveProperty(field)
    }
    expect(prompt).toContain('paired_killed')
    expect(stats.metrics.deaths).toBeDefined()
  })
})
