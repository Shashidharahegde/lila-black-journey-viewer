import { create } from 'zustand'
import type { Index, MatchFile } from '../data/types'
import { canonicalHide, matchFits, type LayerKey, type Selection } from './url'

export type MatchFileState =
  | { status: 'idle' }
  | { status: 'loading'; id: string }
  | { status: 'ready'; id: string; data: MatchFile }
  | { status: 'error'; id: string; message: string }

interface State {
  index: Index | null
  /** null until the URL has been read, so defaults never overwrite a shared link. */
  selection: Selection | null
  matchFile: MatchFileState
  /** actor under the pointer (map or actor list); highlighted everywhere */
  hoveredActor: string | null
  /** actor picked with a click; kept until Esc, a click on empty map or another match */
  pinnedActor: string | null
  setIndex: (index: Index) => void
  setSelection: (selection: Selection) => void
  setMap: (map: string) => void
  setDate: (date: string | null) => void
  selectMatch: (id: string | null) => void
  toggleLayer: (key: LayerKey) => void
  setMatchFile: (matchFile: MatchFileState) => void
  hoverActor: (id: string | null) => void
  pinActor: (id: string | null) => void
}

/** The actor the map, legend and lists emphasise: hover wins over the pinned one. */
export function highlightedActor(s: Pick<State, 'hoveredActor' | 'pinnedActor'>): string | null {
  return s.hoveredActor ?? s.pinnedActor
}

// actor ids only mean something inside one match
function withSelection(prev: Selection | null, next: Selection): Partial<State> {
  return prev?.match === next.match ? { selection: next } : { selection: next, hoveredActor: null, pinnedActor: null }
}

export const useStore = create<State>((set, get) => ({
  index: null,
  selection: null,
  matchFile: { status: 'idle' },
  hoveredActor: null,
  pinnedActor: null,
  setIndex: (index) => set({ index }),
  setSelection: (selection) => set(withSelection(get().selection, selection)),
  setMap: (map) => {
    const { selection } = get()
    if (!selection || selection.map === map) return
    set(withSelection(selection, { ...selection, map, match: null }))
  },
  setDate: (date) => {
    const { selection, index } = get()
    if (!selection || !index || selection.date === date) return
    const keep = selection.match && matchFits(index, selection.match, selection.map, date)
    set(withSelection(selection, { ...selection, date, match: keep ? selection.match : null }))
  },
  selectMatch: (id) => {
    const { selection } = get()
    if (!selection || selection.match === id) return
    set(withSelection(selection, { ...selection, match: id }))
  },
  toggleLayer: (key) => {
    const { selection } = get()
    if (!selection) return
    const hide = selection.hide.includes(key) ? selection.hide.filter((k) => k !== key) : [...selection.hide, key]
    set({ selection: { ...selection, hide: canonicalHide(hide) } })
  },
  setMatchFile: (matchFile) => set({ matchFile }),
  hoverActor: (id) => get().hoveredActor !== id && set({ hoveredActor: id }),
  pinActor: (id) => set({ pinnedActor: id }),
}))
