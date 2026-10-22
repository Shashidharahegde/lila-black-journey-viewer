import { useEffect } from 'react'
import { toast } from 'sonner'
import { loadMatch } from '../data/load'
import { useStore } from './store'

/** Loads the selected match's file. Drawing it is feature 4. */
export function useMatchFile(): void {
  const id = useStore((s) => s.selection?.match ?? null)
  const setMatchFile = useStore((s) => s.setMatchFile)

  useEffect(() => {
    if (!id) {
      setMatchFile({ status: 'idle' })
      return
    }
    const controller = new AbortController()
    setMatchFile({ status: 'loading', id })
    loadMatch(id, controller.signal)
      .then((data) => setMatchFile({ status: 'ready', id, data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : String(error)
        setMatchFile({ status: 'error', id, message })
        toast.error(`Could not load match ${id}`)
      })
    return () => controller.abort()
  }, [id, setMatchFile])
}
