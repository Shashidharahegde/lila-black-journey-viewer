import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useStore } from './store'
import {
  mapPageLink,
  matchFits,
  parseHeatmapView,
  parseSelection,
  parseTime,
  sameSelection,
  serializeSelection,
  tabFromPath,
  urlTime,
  type HeatmapView,
  type Tab,
} from './url'

/** How long the playback time must stay put before `t=` is written (a drag on the timeline writes once). */
const TIME_WRITE_DELAY_MS = 300

const viewOf = (s: ReturnType<typeof useStore.getState>): HeatmapView => ({
  layer: s.heatmapLayer,
  density: s.densityOn,
  outlines: s.outlinesOn,
  mode: s.heatmapMode,
})

/** The current map page's path and query string for the state in the store (what the URL should be). Null before a map page parsed a URL. */
function currentMapPath(): string | null {
  const state = useStore.getState()
  const { selection, playback, tab } = state
  if (!selection) return null
  return `/${tab}?${serializeSelection(selection, tab === 'journeys' ? urlTime(selection, playback.time) : null, viewOf(state), tab)}`
}

/** The link to a map page keeping everything chosen so far (see `mapPageLink`); read when it is clicked, so it has the latest playback time. */
export function mapPageHref(tab: Tab, context?: { map: string | null; date: string | null }): string {
  const state = useStore.getState()
  return mapPageLink({ index: state.index, selection: state.selection, time: state.playback.time, view: viewOf(state) }, tab, context)
}

/**
 * Keeps the store and the URL in step (contract in url.ts: /heatmaps or /journeys, ?map=&date= plus that page's own parameters).
 * URL → store: on load, Back/Forward, nav links and pasted links; invalid values are corrected with a replace. A URL only speaks
 * for the page it names: a Heatmaps link doesn't clear the Journeys page's match, hidden layers or playback time, and the other
 * way round, so switching pages never loses the other page's state.
 * Store → URL: selection and view changes are pushed, so Back returns to the previous view. The playback time only replaces the
 * current entry, once it has settled and never while playing, so playback and scrubbing never add history entries.
 * `synced` is the path and query string both sides last agreed on; neither direction writes it back again,
 * which is what stops the two directions from feeding each other.
 */
export function useUrlSync(): void {
  // Raw query strings both ways: URLSearchParams would re-encode the commas in ?hide= and never settle.
  const location = useLocation()
  const search = location.search.replace(/^\?/, '')
  // App is mounted only on the two map paths
  const tab = tabFromPath(location.pathname) ?? 'heatmaps'
  const here = `/${tab}?${search}`
  const navigate = useNavigate()
  const index = useStore((s) => s.index)
  const synced = useRef<string | null>(null)
  // true while a URL is being applied: the store passes through mixed states (new page, old selection) that must not be written back
  const applying = useRef(false)
  // react-router may hand out a new navigate on navigation; keep the latest without re-running effects.
  const navigateRef = useRef(navigate)

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    if (!index || here === synced.current) return
    const params = new URLSearchParams(search)
    const state = useStore.getState()
    const fromUrl = parseSelection(params, index)
    // the other page's state is kept: a Heatmaps URL has no match or hidden layers to restore
    const keptMatch = state.selection?.match && matchFits(index, state.selection.match, fromUrl.map, fromUrl.date) ? state.selection.match : null
    const parsed = tab === 'journeys' ? fromUrl : { ...fromUrl, match: keptMatch, hide: state.selection?.hide ?? [] }
    const view = tab === 'heatmaps' ? parseHeatmapView(params) : viewOf(state)
    const time = tab === 'journeys' ? parseTime(params, index, parsed.match) : null
    const query = serializeSelection(parsed, time, view, tab)
    const canonical = `/${tab}?${query}`
    // if we already wrote this exact string, don't write it again (guards against a replace loop)
    const alreadyWritten = canonical === synced.current
    synced.current = canonical
    applying.current = true
    // selection and time together, so the store never passes through "this match at 00:00" on the way
    if (tab === 'journeys' && (!sameSelection(parsed, state.selection) || urlTime(parsed, state.playback.time) !== time)) {
      state.setSelection(parsed, time ?? 0)
    } else if (tab === 'heatmaps' && !sameSelection(parsed, state.selection)) {
      state.setSelection(parsed) // the same match and map keep their playback time
    }
    state.setHeatmapView(view)
    state.setTab(tab)
    applying.current = false
    if (canonical !== here && !alreadyWritten) navigateRef.current({ pathname: `/${tab}`, search: `?${query}` }, { replace: true })
  }, [index, here, search, tab])

  // Subscribing (rather than an effect on `selection`) reacts only to real changes,
  // never to a re-render that still holds the previous state.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const write = (replace: boolean) => {
      const next = currentMapPath()
      if (next === null || next === synced.current) return
      synced.current = next
      const [pathname, query] = next.split('?')
      navigateRef.current({ pathname, search: `?${query}` }, { replace })
    }
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (!state.selection || applying.current) return
      const viewChanged =
        state.heatmapLayer !== prev.heatmapLayer ||
        state.densityOn !== prev.densityOn ||
        state.outlinesOn !== prev.outlinesOn ||
        state.heatmapMode !== prev.heatmapMode
      if (state.selection !== prev.selection || state.tab !== prev.tab || (viewChanged && state.tab === 'heatmaps')) {
        clearTimeout(timer)
        write(false)
      } else if (state.tab === 'journeys' && state.playback !== prev.playback && !state.playback.playing) {
        // a drag on the timeline changes the time many times a second; only the last one is written
        clearTimeout(timer)
        timer = setTimeout(() => write(true), TIME_WRITE_DELAY_MS)
      }
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [])
}
