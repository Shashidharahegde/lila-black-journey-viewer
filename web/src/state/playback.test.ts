import { beforeEach, describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Index, MatchFile } from '../data/types'
import { DEFAULT_SPEED, INITIAL_PLAYBACK, MAX_FRAME_S, advance, clampTime, clockLabel, type Playback } from './playback'
import { selectedDuration, useStore } from './store'

const index = indexJson as Index
const [match, other] = index.matches.filter((m) => m.map === 'AmbroseValley' && m.duration_s > 100)
const playing: Playback = { ...INITIAL_PLAYBACK, playing: true, speed: 1 }
const state = () => useStore.getState()
const playback = () => state().playback

/** The selected match's file as loaded; playback only needs it to be there. */
function ready(id = match.id) {
  const data = { id, map: 'AmbroseValley', duration_s: match.duration_s, actors: [] } as unknown as MatchFile
  state().setMatchFile({ status: 'ready', id, data })
}

beforeEach(() => {
  useStore.setState({
    index,
    selection: { map: 'AmbroseValley', date: null, match: match.id, hide: [] },
    matchFile: { status: 'idle' },
    hoveredActor: null,
    pinnedActor: null,
    playback: INITIAL_PLAYBACK,
    fullPaths: false,
  })
})

describe('clock', () => {
  it('advances by real elapsed time × speed', () => {
    expect(advance(playing, 0.1, 600).time).toBeCloseTo(0.1)
    expect(advance({ ...playing, speed: 4 }, 0.1, 600).time).toBeCloseTo(0.4)
    expect(advance({ ...playing, speed: 0.5 }, 0.1, 600).time).toBeCloseTo(0.05)
  })

  it('pausing freezes the time', () => {
    const paused = { ...playing, time: 42, playing: false }
    expect(advance(paused, 0.1, 600)).toBe(paused)
  })

  it('waits while the timeline is being dragged', () => {
    const held = { ...playing, time: 42, scrubbing: true }
    expect(advance(held, 0.1, 600)).toBe(held)
  })

  it('stops at the observed match end', () => {
    const next = advance({ ...playing, time: 599.95, speed: 4 }, 0.1, 600)
    expect(next).toMatchObject({ time: 600, playing: false })
  })

  it('treats a stalled frame as at most MAX_FRAME_S, so the clock never jumps', () => {
    expect(advance(playing, 5, 600).time).toBeCloseTo(MAX_FRAME_S)
    expect(advance(playing, -1, 600).time).toBe(0)
  })

  it('keeps time within the match', () => {
    expect(clampTime(-5, 120)).toBe(0)
    expect(clampTime(200, 120)).toBe(120)
    expect(clampTime(Number.NaN, 120)).toBe(0)
    expect(clampTime(10, 0)).toBe(0)
  })

  it('shows time as MM:SS', () => {
    expect(clockLabel(0)).toBe('00:00')
    expect(clockLabel(80.9)).toBe('01:20')
    expect(clockLabel(825)).toBe('13:45')
  })
})

describe('playback in the store', () => {
  it('a match opens paused at 00:00 at the default speed', () => {
    expect(playback()).toEqual({ time: 0, playing: false, speed: DEFAULT_SPEED, scrubbing: false })
    expect(selectedDuration(state())).toBe(match.duration_s)
  })

  it("can't play before the match file has loaded", () => {
    state().play()
    expect(playback().playing).toBe(false)
    state().setMatchFile({ status: 'loading', id: match.id })
    state().play()
    expect(playback().playing).toBe(false)
    ready()
    state().play()
    expect(playback().playing).toBe(true)
  })

  it('play and pause toggle; ticks only move the time while playing', () => {
    ready()
    state().setSpeed(2)
    state().togglePlay()
    state().tickPlayback(0.1)
    expect(playback().time).toBeCloseTo(0.2)
    state().togglePlay()
    state().tickPlayback(0.1)
    expect(playback()).toMatchObject({ playing: false })
    expect(playback().time).toBeCloseTo(0.2)
  })

  it('8× advances eight match seconds per real second', () => {
    expect(advance({ ...playing, speed: 8 }, 0.1, 600).time).toBeCloseTo(0.8)
    ready()
    state().setSpeed(8)
    expect(playback().speed).toBe(8)
  })

  it('a speed change applies from the next frame', () => {
    ready()
    state().setSpeed(1)
    state().play()
    state().tickPlayback(0.1)
    state().setSpeed(4)
    state().tickPlayback(0.1)
    expect(playback().time).toBeCloseTo(0.5)
  })

  it('ignores speeds that are not offered', () => {
    state().setSpeed(16 as never)
    expect(playback().speed).toBe(DEFAULT_SPEED)
  })

  it('seeking clamps to the match and keeps playing if it was', () => {
    ready()
    state().play()
    state().seek(match.duration_s + 100)
    expect(playback()).toMatchObject({ time: match.duration_s, playing: true })
    state().seek(-3)
    expect(playback().time).toBe(0)
  })

  it('stops at the end, and Play there starts again from 00:00', () => {
    ready()
    state().seek(match.duration_s - 0.05)
    state().play()
    state().tickPlayback(0.1)
    expect(playback()).toMatchObject({ time: match.duration_s, playing: false })
    state().play()
    expect(playback()).toMatchObject({ time: 0, playing: true })
  })

  it('changing the match pauses, resets to 00:00 and drops the old match file and selection', () => {
    ready()
    state().setSpeed(2)
    state().pinActor('someone')
    state().play()
    state().seek(80)
    state().selectMatch(other.id)
    expect(playback()).toEqual({ time: 0, playing: false, speed: 2, scrubbing: false })
    expect(state().matchFile).toEqual({ status: 'idle' })
    expect(state().pinnedActor).toBeNull()
  })

  it('a hidden layer or another date keeps the playback time', () => {
    ready()
    state().seek(80)
    state().toggleLayer('bots')
    state().setDate(match.date)
    expect(playback().time).toBe(80)
  })

  it('a linked time sets the selection and time in one step', () => {
    const seen: number[] = []
    const unsubscribe = useStore.subscribe((s) => seen.push(s.playback.time))
    state().setSelection({ map: 'AmbroseValley', date: null, match: other.id, hide: [] }, 95)
    unsubscribe()
    // never "the new match at 00:00" in between
    expect(seen).toEqual([Math.min(95, other.duration_s)])
    expect(playback().playing).toBe(false)
  })
})
