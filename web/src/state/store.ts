import { create } from 'zustand'
import type { HeatmapFile, HeatmapLayerKey, Index, MatchFile, ZonesFile } from '../data/types'
import { DEFAULT_SORT, type MatchSort } from './matches'
import { INITIAL_PLAYBACK, advance, clampTime, isSpeed, type Playback, type PlaybackSpeed } from './playback'
import type { HeatmapMode } from '../heatmap/scale'
import { DEFAULT_HEATMAP_VIEW, HEATMAP_LAYERS, TABS, canonicalHide, matchFits, type HeatmapView, type LayerKey, type Selection, type Tab } from './url'

export type MatchFileState =
  | { status: 'idle' }
  | { status: 'loading'; id: string }
  | { status: 'ready'; id: string; data: MatchFile }
  | { status: 'error'; id: string; message: string }

export type HeatmapState =
  | { status: 'idle' }
  | { status: 'loading'; map: string }
  | { status: 'ready'; map: string; data: HeatmapFile }
  | { status: 'error'; map: string; message: string }

export type ZonesState =
  | { status: 'idle' }
  | { status: 'loading'; map: string }
  | { status: 'ready'; map: string; data: ZonesFile }
  | { status: 'error'; map: string; message: string }

/** Heatmap opacity limits and default (spec 06; the default was chosen by eye on the three maps). */
export const HEATMAP_OPACITY = { min: 0.2, max: 1, step: 0.05, initial: 1 }

interface State {
  index: Index | null
  /** Null until the URL is parsed, so we never overwrite a shared link during initialization. */
  selection: Selection | null
  matchFile: MatchFileState
  hoveredActor: string | null
  pinnedActor: string | null
  matchSort: MatchSort
  /** the match list shows only matches with bot journeys (S, 2026-10-23); like the sort, kept in the store, not the URL */
  botsOnly: boolean
  /** which heatmap layer the overview shows (spec 06) */
  heatmapLayer: HeatmapLayerKey
  /** the master switch; the layer, mode and opacity are remembered while it is off */
  densityOn: boolean
  /** the hotspot outlines, independent of the density overlay */
  outlinesOn: boolean
  heatmapMode: HeatmapMode
  heatmapOpacity: number
  /** the selected map's heatmap file; read it through `currentHeatmap`, which never shows another map's */
  heatmap: HeatmapState
  /** bumped to try loading the heatmap file again */
  heatmapAttempt: number
  /** the selected map's region statistics (the interpretation layer); read through `currentZones` */
  zones: ZonesState
  /** the region the user clicked in the region list, as "i,j"; its footprint is outlined on the map */
  selectedZone: string | null
  /** the workspace: Journeys & Playback or Heatmaps. Each keeps its own state while the other is shown */
  tab: Tab
  /** the selected match's clock (spec 05); reset to 00:00, paused, whenever the match changes */
  playback: Playback
  /** show whole journeys instead of only what has happened by the playback time; on by default (S, 2026-10-23) */
  fullPaths: boolean
  /** the desktop side panel is folded away so the map takes its width; the panel stays mounted, so nothing in it is lost */
  panelCollapsed: boolean
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
  setBotsOnly: (botsOnly: boolean) => void
  setHeatmapLayer: (layer: HeatmapLayerKey) => void
  setDensityOn: (on: boolean) => void
  setOutlinesOn: (on: boolean) => void
  /** switch workspace; leaving Journeys & Playback pauses it, keeping its match and time */
  setTab: (tab: Tab) => void
  setHeatmapMode: (mode: HeatmapMode) => void
  /** all three at once, from a link */
  setHeatmapView: (view: HeatmapView) => void
  setHeatmapOpacity: (opacity: number) => void
  setHeatmap: (heatmap: HeatmapState) => void
  retryHeatmap: () => void
  setZones: (zones: ZonesState) => void
  /** click a region: select it, or clear it when it is already selected */
  toggleZone: (key: string) => void
  /** select a region by key, or clear with null */
  selectZone: (key: string | null) => void
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
  setPanelCollapsed: (collapsed: boolean) => void
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

// Selectors must return the same object for the same state (React compares snapshots), so the "loading" placeholder is made once per map.
const loadingStates = new Map<string, { status: 'loading'; map: string }>()
function loadingFor(map: string): { status: 'loading'; map: string } {
  let state = loadingStates.get(map)
  if (!state) loadingStates.set(map, (state = { status: 'loading', map }))
  return state
}

/** The heatmap file for the selected map. Another map's file is never presented as this one's. */
export function currentHeatmap(s: Pick<State, 'heatmap' | 'selection'>): HeatmapState {
  const { heatmap, selection } = s
  if (heatmap.status === 'idle' || !selection || heatmap.map === selection.map) return heatmap
  return loadingFor(selection.map)
}

/** The region statistics for the selected map. Another map's file is never presented as this one's. */
export function currentZones(s: Pick<State, 'zones' | 'selection'>): ZonesState {
  const { zones, selection } = s
  if (zones.status === 'idle' || !selection || zones.map === selection.map) return zones
  return loadingFor(selection.map)
}

export function highlightedActor(s: Pick<State, 'hoveredActor' | 'pinnedActor'>): string | null {
  return s.hoveredActor ?? s.pinnedActor
}

function withSelection(state: State, next: Selection): Partial<State> {
  const prev = state.selection
  // a region belongs to one map, date and layer: choosing another map or date clears the highlight
  const zone: Partial<State> = prev?.map === next.map && prev?.date === next.date ? {} : { selectedZone: null }
  if (prev?.match === next.match && prev?.map === next.map) return { selection: next, ...zone }
  return {
    ...zone,
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
  botsOnly: false,
  heatmapLayer: DEFAULT_HEATMAP_VIEW.layer,
  densityOn: DEFAULT_HEATMAP_VIEW.density,
  outlinesOn: DEFAULT_HEATMAP_VIEW.outlines,
  heatmapMode: DEFAULT_HEATMAP_VIEW.mode,
  heatmapOpacity: HEATMAP_OPACITY.initial,
  heatmap: { status: 'idle' },
  heatmapAttempt: 0,
  zones: { status: 'idle' },
  selectedZone: null,
  tab: 'heatmaps',
  playback: INITIAL_PLAYBACK,
  fullPaths: true,
  panelCollapsed: false,
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
  setBotsOnly: (botsOnly) => {
    if (get().botsOnly !== botsOnly) set({ botsOnly })
  },
  setHeatmapLayer: (heatmapLayer) => {
    if (get().heatmapLayer !== heatmapLayer && HEATMAP_LAYERS.includes(heatmapLayer)) set({ heatmapLayer, selectedZone: null })
  },
  setDensityOn: (densityOn) => {
    if (get().densityOn !== densityOn) set({ densityOn })
  },
  setOutlinesOn: (outlinesOn) => {
    if (get().outlinesOn !== outlinesOn) set({ outlinesOn })
  },
  setTab: (tab) => {
    const state = get()
    if (state.tab === tab || !TABS.includes(tab)) return
    // a match left running in the background would keep drawing and ticking: pause it where it is, and return to it paused
    set({ tab, playback: state.playback.playing || state.playback.scrubbing ? { ...state.playback, playing: false, scrubbing: false } : state.playback })
  },
  setHeatmapMode: (heatmapMode) => {
    if (get().heatmapMode !== heatmapMode && (heatmapMode === 'focused' || heatmapMode === 'all')) set({ heatmapMode })
  },
  setHeatmapView: ({ layer, density, outlines, mode }) => {
    const s = get()
    if (HEATMAP_LAYERS.includes(layer) && (s.heatmapLayer !== layer || s.densityOn !== density || s.outlinesOn !== outlines || s.heatmapMode !== mode)) {
      set({
        heatmapLayer: layer,
        densityOn: density,
        outlinesOn: outlines,
        heatmapMode: mode,
        ...(s.heatmapLayer === layer ? {} : { selectedZone: null }),
      })
    }
  },
  setHeatmapOpacity: (opacity) => {
    const next = Math.min(HEATMAP_OPACITY.max, Math.max(HEATMAP_OPACITY.min, opacity))
    if (get().heatmapOpacity !== next) set({ heatmapOpacity: next })
  },
  setHeatmap: (heatmap) => {
    // Fetches can resolve out of order. Ignore results for a map that is no longer selected.
    if (heatmap.status !== 'idle' && heatmap.map !== get().selection?.map) return
    set({ heatmap })
  },
  retryHeatmap: () => set((s) => ({ heatmapAttempt: s.heatmapAttempt + 1 })),
  setZones: (zones) => {
    if (zones.status !== 'idle' && zones.map !== get().selection?.map) return
    set({ zones })
  },
  toggleZone: (key) => set((s) => ({ selectedZone: s.selectedZone === key ? null : key })),
  selectZone: (key) => {
    if (get().selectedZone !== key) set({ selectedZone: key })
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
  setPanelCollapsed: (panelCollapsed) => {
    if (get().panelCollapsed !== panelCollapsed) set({ panelCollapsed })
  },
}))
