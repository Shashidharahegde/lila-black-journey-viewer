import type { MatchSummary } from '../data/types'

/** Matches on one map, on one date (null = all dates), busiest first. */
export function pickerMatches(matches: MatchSummary[], map: string, date: string | null): MatchSummary[] {
  return matches.filter((m) => m.map === map && (date === null || m.date === date)).sort(byRecordedPlayers)
}

/** Recorded players (humans + bots) descending, then duration descending, then id so the order is stable. */
export function byRecordedPlayers(a: MatchSummary, b: MatchSummary): number {
  return b.humans + b.bots - (a.humans + a.bots) || b.duration_s - a.duration_s || a.id.localeCompare(b.id)
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** "1 human · 6 bots": humans and bots are always named separately, never lumped into "players". */
export function playersLabel(m: Pick<MatchSummary, 'humans' | 'bots'>): string {
  const humans = plural(m.humans, 'human')
  return m.bots === 0 ? humans : `${humans} · ${plural(m.bots, 'bot')}`
}

export function durationLabel(seconds: number): string {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "4 kills · 1 death · 20 loot": kills and deaths always, the rarer types only when present. */
export function matchCountsLabel(m: Pick<MatchSummary, 'counts'>): string {
  const c = m.counts
  const parts = [plural(c.kill, 'kill'), plural(c.death, 'death')]
  if (c.storm_death) parts.push(plural(c.storm_death, 'storm death'))
  if (c.self_kill) parts.push(plural(c.self_kill, 'self-kill'))
  parts.push(`${c.loot} loot`)
  return parts.join(' · ')
}
