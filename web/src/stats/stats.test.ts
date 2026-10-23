// Read-only checks against the real stats.json: the page formats what the pipeline wrote and computes nothing itself.
import { describe, expect, it } from 'vitest'
import statsJson from '../../public/data/stats.json'
import type { StatsFile } from '../data/types'
import { formatCount, formatDistance, formatPercent, formatSeconds, plural } from './format'
import { OUT_OF_DATE, SUPPORTED_METRICS_VERSION, emptyText, sampleText, scopeWords, shortFingerprint, sliceBadges, sliceFor, statsProblem } from './slices'

const stats = statsJson as unknown as StatsFile

describe('formatting', () => {
  it('counts, percentages, times and distances', () => {
    expect(formatCount(12714)).toBe('12,714')
    expect(formatPercent({ numerator: 442, denominator: 781, value: 0.5659 })).toBe('56.6%')
    expect(formatSeconds(367)).toBe('6:07')
    expect(formatSeconds(41.5)).toBe('0:42')
    expect(formatDistance(783.3)).toBe('783 units')
    expect(plural(1, 'match', 'matches')).toBe('1 match')
    expect(plural(1619, 'cell')).toBe('1,619 cells')
  })
})

describe('version and fingerprint', () => {
  it('accepts the version this page was written for and refuses any other', () => {
    expect(stats.metrics_version).toBe(SUPPORTED_METRICS_VERSION)
    expect(statsProblem(stats)).toBeNull()
    expect(statsProblem({ metrics_version: SUPPORTED_METRICS_VERSION + 1 })).toBe(OUT_OF_DATE)
  })

  it('shows the first 8 characters of the fingerprint', () => {
    expect(shortFingerprint({ source: { fingerprint: 'sha256:d1d07a1feb5a1754', files: 800 } })).toBe('d1d07a1f')
    expect(shortFingerprint(stats)).toHaveLength(8)
  })
})

describe('slices', () => {
  it('every map and date scope has a slice', () => {
    for (const map of ['all', ...stats.maps]) for (const d of ['all', ...stats.dates.map((x) => x.date)]) expect(sliceFor(stats, map, d)).toBeDefined()
    expect(() => sliceFor(stats, 'Atlantis', 'all')).toThrow()
  })

  it('the header line for all maps and all dates (spec 10, How to verify 3)', () => {
    expect(scopeWords('all', 'all')).toBe('All maps · all dates')
    expect(sampleText(sliceFor(stats, 'all', 'all'), 'all', 'all')).toBe('781 human journeys in 780 matches · 245 players')
  })

  it('an empty slice gets the empty-state sentence and no badges (How to verify 4)', () => {
    const slice = sliceFor(stats, 'GrandRift', '2026-02-09')
    expect(slice.flags.empty).toBe(true)
    expect(sampleText(slice, 'GrandRift', '2026-02-09')).toBe('No human journeys recorded on GrandRift on 2026-02-09')
    expect(sliceBadges(stats, slice, '2026-02-09').map((b) => b.label)).toEqual(['Partial day'])
    expect(emptyText('all', 'all')).toBe('No human journeys recorded on any map on any date')
  })

  it('flags become badges with their reason', () => {
    const thin = sliceFor(stats, 'AmbroseValley', '2026-02-09')
    expect(sampleText(thin, 'AmbroseValley', '2026-02-09')).toBe('1 human journey in 1 match · 1 player')
    const badges = sliceBadges(stats, thin, '2026-02-09')
    expect(badges.map((b) => b.label)).toEqual(['Few matches', 'Partial day'])
    expect(badges[0].reason).toBe('Only 1 match with a human journey (fewer than 10): a pattern here may not hold.')
    expect(badges[1].reason).toMatch(/^Data observed from 2026-02-09 23:58:55 UTC to 2026-02-10 00:00:00 UTC only\.$/)

    expect(sliceBadges(stats, sliceFor(stats, 'GrandRift', '2026-02-13'), '2026-02-13').map((b) => b.label)).toEqual(['Few matches'])
    expect(sliceBadges(stats, sliceFor(stats, 'all', 'all'), 'all').map((b) => b.label)).toEqual(['Includes partial days'])
  })
})
