import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rateLimit.ts'

describe('createRateLimiter', () => {
  it('allows the limit, then says how long to wait', () => {
    let t = 0
    const limiter = createRateLimiter(2, 60_000, () => t)
    expect(limiter.take('a')).toBeNull()
    t = 10_000
    expect(limiter.take('a')).toBeNull()
    t = 20_000
    expect(limiter.take('a')).toBe(40) // the first request leaves the window at 60 s
  })

  it('lets a visitor back in once the window has passed', () => {
    let t = 0
    const limiter = createRateLimiter(1, 60_000, () => t)
    expect(limiter.take('a')).toBeNull()
    expect(limiter.take('a')).not.toBeNull()
    t = 60_000
    expect(limiter.take('a')).toBeNull()
  })

  it('counts each visitor separately', () => {
    const limiter = createRateLimiter(1, 60_000, () => 0)
    expect(limiter.take('a')).toBeNull()
    expect(limiter.take('b')).toBeNull()
    expect(limiter.take('a')).not.toBeNull()
  })
})
