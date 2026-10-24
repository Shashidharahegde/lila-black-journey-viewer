import { describe, expect, it } from 'vitest'
import { countUpText, easeOut } from './countUp'

describe('countUpText', () => {
  it('ends on the exact text, and starts from zero in the same format', () => {
    for (const text of ['781', '12,714', '2.85', '4.99%', '10.00%', '6:07', '77/100', '56.6%']) expect(countUpText(text, 1)).toBe(text)
    expect(countUpText('12,714', 0)).toBe('0')
    expect(countUpText('2.85', 0)).toBe('0.00')
    expect(countUpText('4.99%', 0)).toBe('0.00%')
    expect(countUpText('6:07', 0)).toBe('0:00')
    expect(countUpText('77/100', 0)).toBe('0/100') // only the first number runs; the scale stays put
  })

  it('keeps the format part-way: separators, decimals and minutes:seconds', () => {
    expect(countUpText('12,714', 0.5)).toBe('6,357')
    expect(countUpText('2.85', 0.5)).toBe('1.43')
    expect(countUpText('6:07', 0.5)).toBe('3:03') // 367 s × 0.5 = 183 s
  })

  it('leaves text without a number alone', () => {
    expect(countUpText('—', 0)).toBe('—')
  })

  it('eases from 0 to 1', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
  })
})
