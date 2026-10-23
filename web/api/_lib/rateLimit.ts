export interface RateLimiter {
  /** Counts one request for this visitor. Returns null if allowed, else the seconds until they may ask again. */
  take(visitor: string): number | null
}

// In memory, so each serverless instance counts on its own: a guard against a runaway loop or one eager visitor,
// not a hard cap. The monthly spend limit set in the Anthropic Console is the real cap.
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>()
  return {
    take(visitor) {
      const t = now()
      const recent = (hits.get(visitor) ?? []).filter((hit) => t - hit < windowMs)
      if (recent.length >= limit) {
        hits.set(visitor, recent)
        return Math.ceil((recent[0] + windowMs - t) / 1000)
      }
      recent.push(t)
      hits.set(visitor, recent)
      // Forget visitors that have gone quiet so the map cannot grow without bound.
      if (hits.size > 1000) {
        for (const [key, times] of hits) if (t - times[times.length - 1] >= windowMs) hits.delete(key)
      }
      return null
    },
  }
}
