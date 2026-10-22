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
  setIndex: (index: Index) => void
  setSelection: (selection: Selection) => void
  setMap: (map: string) => void
  setDate: (date: string | null) => void
  selectMatch: (id: string | null) => void
  toggleLayer: (key: LayerKey) => void
  setMatchFile: (matchFile: MatchFileState) => void
}

export const useStore = create<State>((set, get) => ({
  index: null,
  selection: null,
  matchFile: { status: 'idle' },
  setIndex: (index) => set({ index }),
  setSelection: (selection) => set({ selection }),
  setMap: (map) => {
    const { selection } = get()
    if (!selection || selection.map === map) return
    set({ selection: { ...selection, map, match: null } })
  },
  setDate: (date) => {
    const { selection, index } = get()
    if (!selection || !index || selection.date === date) return
    const keep = selection.match && matchFits(index, selection.match, selection.map, date)
    set({ selection: { ...selection, date, match: keep ? selection.match : null } })
  },
  selectMatch: (id) => {
    const { selection } = get()
    if (!selection || selection.match === id) return
    set({ selection: { ...selection, match: id } })
  },
  toggleLayer: (key) => {
    const { selection } = get()
    if (!selection) return
    const hide = selection.hide.includes(key) ? selection.hide.filter((k) => k !== key) : [...selection.hide, key]
    set({ selection: { ...selection, hide: canonicalHide(hide) } })
  },
  setMatchFile: (matchFile) => set({ matchFile }),
}))
