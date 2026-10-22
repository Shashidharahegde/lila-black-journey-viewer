// The playback clock (spec 05): one match time, advanced by real elapsed time × speed.
// Pure, so the store and its tests share it; the animation loop is usePlaybackClock.

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]
/** Matches last up to ~15 min; at 4× one takes under 4 min to watch (spec 05). */
export const DEFAULT_SPEED: PlaybackSpeed = 4
/** ← / → move this many match seconds. */
export const SEEK_STEP_S = 5
/** A frame longer than this (a stall, a debugger pause) counts as this long, so the clock never jumps. */
export const MAX_FRAME_S = 0.25

export interface Playback {
  /** seconds since the match's first recorded event */
  time: number
  playing: boolean
  speed: PlaybackSpeed
  /** the timeline thumb is held down: the clock waits so it doesn't fight the drag */
  scrubbing: boolean
}

export const INITIAL_PLAYBACK: Playback = { time: 0, playing: false, speed: DEFAULT_SPEED, scrubbing: false }

export function isSpeed(value: number): value is PlaybackSpeed {
  return (PLAYBACK_SPEEDS as readonly number[]).includes(value)
}

export function clampTime(time: number, duration: number): number {
  const end = Number.isFinite(duration) && duration > 0 ? duration : 0
  return Number.isFinite(time) ? Math.min(end, Math.max(0, time)) : 0
}

/** One animation frame: `elapsed` real seconds at the current speed. Stops at the match end. */
export function advance(p: Playback, elapsed: number, duration: number): Playback {
  if (!p.playing || p.scrubbing) return p
  const step = Math.min(MAX_FRAME_S, Math.max(0, elapsed)) * p.speed
  const time = clampTime(p.time + step, duration)
  return { ...p, time, playing: time < duration }
}

/** "02:14": match time as zero-padded minutes and seconds, for the timeline. */
export function clockLabel(seconds: number): string {
  const s = Math.floor(Math.max(0, Number.isFinite(seconds) ? seconds : 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
