// The in-between frames of a count-up: a formatted figure ("12,714", "2.85", "4.99%", "6:07", "77/100") drawn as if its
// number were `progress` (0–1) of the way there. Display only: the last frame is always the exact text it was given.

const CLOCK = /^(\d+):(\d{2})$/
const NUMBER = /\d[\d,]*(?:\.(\d+))?/

/** Smooth start, gentle landing. */
export function easeOut(t: number): number {
  return 1 - (1 - t) ** 3
}

export function countUpText(text: string, progress: number): string {
  if (progress >= 1) return text
  const p = Math.max(0, progress)
  const clock = CLOCK.exec(text)
  if (clock) {
    const seconds = Math.floor((Number(clock[1]) * 60 + Number(clock[2])) * p)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  }
  const match = NUMBER.exec(text)
  if (!match) return text
  const decimals = match[1]?.length ?? 0
  const target = Number(match[0].replace(/,/g, ''))
  const value = decimals ? target * p : Math.floor(target * p)
  const digits = match[0].includes(',')
    ? value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : value.toFixed(decimals)
  return text.slice(0, match.index) + digits + text.slice(match.index + match[0].length)
}
