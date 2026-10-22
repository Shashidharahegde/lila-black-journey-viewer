import { create } from 'zustand'
import type { Index, MatchFile } from '../data/types'
import { DEFAULT_SORT, type MatchSort } from './matches'
import { INITIAL_PLAYBACK, advance, clampTime, isSpeed, type Playback, type PlaybackSpeed } from './playback'
import { canonicalHide, matchFits, type LayerKey, type Selection } from './url'

export type MatchFileState =
  | { status: 'idle' }
  | { status: 'loading'; id: string }
  | { status: 'ready'; id: string; data: MatchFile }
  | { status: 'error'; id: string; message: string }

interface State {
  index: Index | null
  /** Null until the URL is parsed, so we never overwrite a shared link during initialization. */
  selection: Selection | null
  matchFile: MatchFileState
  hoveredActor: string | null
  pinnedActor: string | null
  matchSort: MatchSort
  /** the selected match's clock (spec 05); reset to 00:00, paused, whenever the match changes */
  playback: Playback
  /** show whole journeys instead of only what has happened by the playback time */
  fullPaths: boolean
  setIndex: (index: Index) => void
  /** `time` also sets the playback time (a linked `t=`); without it a new match starts at 00:00 */
  setSelection: (selection: Selection, time?: number) => void
  setMap: (map: string) => void
  setDate: (date: string | null) => void
  selectMatch: (id: string | null) => void
  toggleLayer: (key: LayerKey) => void
  setMatchFile: (matchFile: MatchFileState) => void
  hoverActor: (id: string | null) => void
  pinActor: (id: string | null) => void
  setMatchSort: (sort: MatchSort) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  /** jump to a match time (clamped to the match); keeps playing if it was */
  seek: (time: number) => void
  setSpeed: (speed: PlaybackSpeed) => void
  setScrubbing: (scrubbing: boolean) => void
  /** one animation frame of `elapsed` real seconds */
  tickPlayback: (elapsed: number) => void
  setFullPaths: (fullPaths: boolean) => void
}

/** Observed duration of the selected match (s), from the index; 0 when none is selected. */
export function selectedDuration(s: Pick<State, 'index' | 'selection'>): number {
  const id = s.selection?.match
  return (id && s.index?.matches.find((m) => m.id === id)?.duration_s) || 0
}

/** Playback needs the match's own file: until it has loaded there is nothing to play. */
function canPlay(s: State): boolean {
  return s.matchFile.status === 'ready' && s.matchFile.id === s.selection?.match && selectedDuration(s) > 0
}

export function highlightedActor(s: Pick<State, 'hoveredActor' | 'pinnedActor'>): string | null {
  return s.hoveredActor ?? s.pinnedActor
}

function withSelection(state: State, next: Selection): Partial<State> {
  const prev = state.selection
  if (prev?.match === next.match && prev?.map === next.map) return { selection: next }
  return {
    selection: next,
    hoveredActor: null,
    pinnedActor: null,
    // The old match's data must not be presented while the new match loads.
    matchFile: { status: 'idle' },
    // A new match starts paused at 00:00; the chosen speed carries over.
    playback: { ...INITIAL_PLAYBACK, speed: state.playback.speed },
  }
}

export const useStore = create<State>((set, get) => ({
  index: null,
  selection: null,
  matchFile: { status: 'idle' },
  hoveredActor: null,
  pinnedActor: null,
  matchSort: DEFAULT_SORT,
  playback: INITIAL_PLAYBACK,
  fullPaths: false,
  setIndex: (index) => set({ index }),
  setSelection: (selection, time) => {
    const state = get()
    const next = withSelection(state, selection)
    if (time === undefined) return set(next)
    const playback = next.playback ?? state.playback
    set({ ...next, playback: { ...playback, time: clampTime(time, selectedDuration({ index: state.index, selection })) } })
  },
  setMap: (map) => {
    const { selection, index } = get()
    if (!selection || selection.map === map || !index || !Object.prototype.hasOwnProperty.call(index.maps, map)) return
    set(withSelection(get(), { ...selection, map, match: null }))
  },
  setDate: (date) => {
    const { selection, index } = get()
    if (!selection || !index || selection.date === date) return
    if (date !== null && !index.dates.some((item) => item.date === date)) return
    const keep = selection.match && matchFits(index, selection.match, selection.map, date)
    set(withSelection(get(), { ...selection, date, match: keep ? selection.match : null }))
  },
  selectMatch: (id) => {
    const { selection, index } = get()
    if (!selection || selection.match === id) return
    if (id !== null && (!index || !matchFits(index, id, selection.map, selection.date))) return
    set(withSelection(get(), { ...selection, match: id }))
  },
  toggleLayer: (key) => {
    const { selection } = get()
    if (!selection) return
    const hide = selection.hide.includes(key) ? selection.hide.filter((item) => item !== key) : [...selection.hide, key]
    set({ selection: { ...selection, hide: canonicalHide(hide) } })
  },
  setMatchFile: (next) => {
    // Fetches can resolve out of order. Ignore stale results for a different selected match.
    if (next.status !== 'idle' && next.id !== get().selection?.match) return
    set({ matchFile: next })
  },
  hoverActor: (id) => {
    if (get().hoveredActor !== id) set({ hoveredActor: id })
  },
  pinActor: (id) => {
    if (get().pinnedActor !== id) set({ pinnedActor: id })
  },
  setMatchSort: (matchSort) => {
    if (get().matchSort !== matchSort) set({ matchSort })
  },
  play: () => {
    const state = get()
    if (!canPlay(state) || state.playback.playing) return
    const duration = selectedDuration(state)
    // Play at the end starts the match again
    const time = state.playback.time >= duration ? 0 : state.playback.time
    set({ playback: { ...state.playback, time, playing: true } })
  },
  pause: () => {
    const { playback } = get()
    if (playback.playing) set({ playback: { ...playback, playing: false } })
  },
  togglePlay: () => (get().playback.playing ? get().pause() : get().play()),
  seek: (time) => {
    const state = get()
    if (!state.selection?.match) return
    const next = clampTime(time, selectedDuration(state))
    if (next !== state.playback.time) set({ playback: { ...state.playback, time: next } })
  },
  setSpeed: (speed) => {
    const { playback } = get()
    if (isSpeed(speed) && playback.speed !== speed) set({ playback: { ...playback, speed } })
  },
  setScrubbing: (scrubbing) => {
    const { playback } = get()
    if (playback.scrubbing !== scrubbing) set({ playback: { ...playback, scrubbing } })
  },
  tickPlayback: (elapsed) => {
    const state = get()
    const next = advance(state.playback, elapsed, selectedDuration(state))
    if (next !== state.playback) set({ playback: next })
  },
  setFullPaths: (fullPaths) => {
    if (get().fullPaths !== fullPaths) set({ fullPaths })
  },
}))
