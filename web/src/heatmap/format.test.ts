import { describe, expect, it } from 'vitest'
import { cellValueText, formatPlayerTime, plural, scopeLine } from './format'

describe('formatPlayerTime', () => {
  it('says "under 1 s" below a second, seconds below a minute and minutes after', () => {
    expect(formatPlayerTime(0.1)).toBe('under 1 s')
    expect(formatPlayerTime(1)).toBe('1 s')
    expect(formatPlayerTime(34.6)).toBe('35 s')
    expect(formatPlayerTime(60)).toBe('1 min')
    expect(formatPlayerTime(2460)).toBe('41 min')
    expect(formatPlayerTime(3059.8)).toBe('51 min')
  })

  it('never shows "60 s", and groups thousands', () => {
    expect(formatPlayerTime(59.6)).toBe('1 min')
    expect(formatPlayerTime(208_625 )).toBe('3,477 min')
  })
})

describe('plural and cell values', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'death')).toBe('1 death')
    expect(plural(2, 'death')).toBe('2 deaths')
    expect(plural(1, 'match', 'matches')).toBe('1 match')
    expect(plural(314, 'match', 'matches')).toBe('314 matches')
    expect(cellValueText('kills', 1)).toBe('1 kill')
    expect(cellValueText('deaths', 12)).toBe('12 deaths')
  })

  it('says traffic is an estimate', () => {
    expect(cellValueText('traffic', 2460)).toBe('41 min of estimated player time')
    expect(cellValueText('traffic', 0.1)).toBe('under 1 s of estimated player time')
  })

  it('the scope line says which journeys and dates, and never implies a match', () => {
    expect(scopeLine('AmbroseValley', null)).toBe('All human journeys · AmbroseValley · all dates')
    expect(scopeLine('GrandRift', '2026-02-13')).toBe('All human journeys · GrandRift · 2026-02-13')
  })
})
