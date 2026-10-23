import { useEffect } from 'react'
import { toast } from 'sonner'
import { loadHeatmap, loadZones } from '../data/load'
import type { HeatmapFile, ZonesFile } from '../data/types'
import { useStore } from './store'

/** Files already loaded; a failed load is not kept, so a retry asks again. */
const loaded = new Map<string, HeatmapFile>()

/** Loads the selected map's heatmap file while the Heatmaps tab is shown (the Journeys tab never needs it). */
export function useHeatmapFile(): void {
  const map = useStore((s) => s.selection?.map ?? null)
  const on = useStore((s) => s.tab === 'heatmaps')
  const attempt = useStore((s) => s.heatmapAttempt)
  const setHeatmap = useStore((s) => s.setHeatmap)

  useEffect(() => {
    if (!map || !on) return
    const cached = loaded.get(map)
    if (cached) {
      setHeatmap({ status: 'ready', map, data: cached })
      return
    }
    const controller = new AbortController()
    setHeatmap({ status: 'loading', map })
    loadHeatmap(map, controller.signal)
      .then((data) => {
        loaded.set(map, data)
        setHeatmap({ status: 'ready', map, data })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setHeatmap({ status: 'error', map, message: error instanceof Error ? error.message : String(error) })
        toast.error(`Could not load the ${map} heatmap`)
      })
    return () => controller.abort()
  }, [map, on, attempt, setHeatmap])
}

const loadedZones = new Map<string, ZonesFile>()

/**
 * Loads the selected map's region statistics (the interpretation layer) with the heatmap. If they fail to load the
 * heatmap itself still works; the region list just says they are unavailable.
 */
export function useZonesFile(): void {
  const map = useStore((s) => s.selection?.map ?? null)
  const on = useStore((s) => s.tab === 'heatmaps')
  const attempt = useStore((s) => s.heatmapAttempt)
  const setZones = useStore((s) => s.setZones)

  useEffect(() => {
    if (!map || !on) return
    const cached = loadedZones.get(map)
    if (cached) {
      setZones({ status: 'ready', map, data: cached })
      return
    }
    const controller = new AbortController()
    setZones({ status: 'loading', map })
    loadZones(map, controller.signal)
      .then((data) => {
        loadedZones.set(map, data)
        setZones({ status: 'ready', map, data })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setZones({ status: 'error', map, message: error instanceof Error ? error.message : String(error) })
      })
    return () => controller.abort()
  }, [map, on, attempt, setZones])
}
