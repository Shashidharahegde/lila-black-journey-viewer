import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { parseSelection, sameSelection, serializeSelection } from './url'
import { useStore } from './store'

/**
 * Keeps the store and ?map=&date=&match=&hide= in step.
 * URL → store: on load, Back/Forward and pasted links; invalid values are corrected with a replace.
 * Store → URL: user changes are pushed, so Back returns to the previous view.
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
    const parsed = parseSelection(new URLSearchParams(search), index)
    const canonical = serializeSelection(parsed)
    // if we already wrote this exact string, don't write it again (guards against a replace loop)
    const alreadyWritten = canonical === synced.current
    synced.current = canonical
    if (!sameSelection(parsed, useStore.getState().selection)) useStore.getState().setSelection(parsed)
    if (canonical !== search && !alreadyWritten) navigateRef.current({ search: `?${canonical}` }, { replace: true })
  }, [index, search])

  // Subscribing (rather than an effect on `selection`) reacts only to real selection changes,
  // never to a re-render that still holds the previous selection.
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        if (!state.selection || state.selection === prev.selection) return
        const next = serializeSelection(state.selection)
        if (next === synced.current) return
        synced.current = next
        navigateRef.current({ search: `?${next}` })
      }),
    [],
  )
}
