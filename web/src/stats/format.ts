// Formatting only: every number is read from stats.json and shown as stored (spec 10, "Formatting only in the UI").
import type { RatioValue } from '../data/types'
import { durationLabel } from '../state/matches'

/** Shown for a value that doesn't exist for the slice; the reason sits beside it or in its tooltip. */
export const MISSING = '—'

export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

/** The stored 4-decimal ratio as a percentage with one decimal: 0.5659 → "56.6%". */
export function formatPercent(ratio: RatioValue): string {
  return `${(ratio.value * 100).toFixed(1)}%`
}

/** Seconds as m:ss, e.g. 367 → "6:07"; halves from even-count medians round to the nearest second. */
export function formatSeconds(seconds: number): string {
  return durationLabel(seconds)
}

export function formatDistance(units: number): string {
  return `${formatCount(Math.round(units))} units`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`
}
