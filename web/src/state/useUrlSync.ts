import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { parseSelection, parseTime, sameSelection, serializeSelection, urlTime } from './url'
import { useStore } from './store'

/** How long the playback time must stay put before `t=` is written (a drag on the timeline writes once). */
const TIME_WRITE_DELAY_MS = 300

/**
 * Keeps the store and ?map=&date=&match=&hide=&t= in step.
 * URL → store: on load, Back/Forward and pasted links; invalid values are corrected with a replace.
 * Store → URL: selection changes are pushed, so Back returns to the previous view. The playback
 * time only replaces the current entry, once it has settled and never while playing, so playback
 * and scrubbing never add history entries.
 * `synced` is the query string both sides last agreed on; neither direction writes it back again,
 * which is what stops the two directions from feeding each other.
 */
export function useUrlSync(): void {
  // Raw query strings both ways: URLSearchParams would re-encode the commas in ?hide= and never settle.
  const search = useLocation().search.replace(/^\?/, '')
  const navigate = useNavigate()
  const index = useStore((s) => s.index)
  const synced = useRef<string | null>(null)
  // react-router may hand out a new navigate on navigation; keep the latest without re-running effects.
  const navigateRef = useRef(navigate)

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    if (!index || search === synced.current) return
    const params = new URLSearchParams(search)
    const parsed = parseSelection(params, index)
    const time = parseTime(params, index, parsed.match)
    const canonical = serializeSelection(parsed, time)
    // if we already wrote this exact string, don't write it again (guards against a replace loop)
    const alreadyWritten = canonical === synced.current
    synced.current = canonical
    const { selection, playback, setSelection } = useStore.getState()
    // selection and time together, so the store never passes through "this match at 00:00" on the way
    if (!sameSelection(parsed, selection) || urlTime(parsed, playback.time) !== time) setSelection(parsed, time ?? 0)
    if (canonical !== search && !alreadyWritten) navigateRef.current({ search: `?${canonical}` }, { replace: true })
  }, [index, search])

  // Subscribing (rather than an effect on `selection`) reacts only to real selection changes,
  // never to a re-render that still holds the previous selection.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const write = (replace: boolean) => {
      const { selection, playback } = useStore.getState()
      if (!selection) return
      const next = serializeSelection(selection, urlTime(selection, playback.time))
      if (next === synced.current) return
      synced.current = next
      navigateRef.current({ search: `?${next}` }, { replace })
    }
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (!state.selection) return
      if (state.selection !== prev.selection) {
        clearTimeout(timer)
        write(false)
      } else if (state.playback !== prev.playback && !state.playback.playing) {
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
