import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { dataUrl, loadIndex } from './data/load'
import { buildJourneys } from './map/journeys'
import { loadMinimap, prefetchMinimap } from './map/minimap'
import { useStore } from './state/store'
import { useHeatmapFile, useZonesFile } from './state/useHeatmap'
import { useMatchFile } from './state/useMatchFile'
import { useUrlSync } from './state/useUrlSync'
import JourneyCard from './ui/JourneyCard'
import MapStage from './ui/MapStage'
import PlaybackDock from './ui/PlaybackDock'
import RegionCard from './ui/RegionCard'
import SidePanel from './ui/SidePanel'
import TabBar from './ui/TabBar'
import TopBar from './ui/TopBar'
import { isTypingTarget } from './ui/shortcuts'

export default function App() {
  const index = useStore((s) => s.index)
  const selection = useStore((s) => s.selection)
  const matchFile = useStore((s) => s.matchFile)
  const tab = useStore((s) => s.tab)
  const setIndex = useStore((s) => s.setIndex)
  const pinActor = useStore((s) => s.pinActor)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const fetchIndex = useCallback(() => {
    setIndexError(null)
    loadIndex()
      .then(setIndex)
      .catch((error: unknown) => {
        setIndexError(String(error))
        toast.error('Could not load the match index')
      })
  }, [setIndex])
  useEffect(fetchIndex, [fetchIndex])
  useUrlSync()
  useMatchFile()
  useHeatmapFile()
  useZonesFile()

  // Once the first minimap is in, download the other maps quietly so switching is quick.
  const currentMap = index && selection ? index.maps[selection.map].image : null
  useEffect(() => {
    if (!index || !currentMap) return
    loadMinimap(dataUrl(currentMap))
      .then(() => {
        // already-fetched maps come straight from the HTTP cache
        for (const m of Object.values(index.maps)) if (m.image !== currentMap) prefetchMinimap(dataUrl(m.image))
      })
      .catch(() => {})
  }, [index, currentMap])

  // the drawer exists only below 1024 px; don't leave its overlay behind when the window widens
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)')
    const close = () => wide.matches && setPanelOpen(false)
    wide.addEventListener('change', close)
    return () => wide.removeEventListener('change', close)
  }, [])

  // Esc clears the selected actor on the Journeys tab and the selected region on the Heatmaps tab (FRONTEND_GUIDELINES §6 Keyboard);
  // open menus and dialogs handle their own Esc
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isTypingTarget(event.target)) return
      if (useStore.getState().tab === 'heatmaps') useStore.getState().selectZone(null)
      else pinActor(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinActor])

  const map = index && selection ? index.maps[selection.map] : null
  // only the selected match's own file: never a previous match's data while the next one loads
  // Journeys & Playback only: the Heatmaps tab never draws a match, so none is built while it is shown
  const loaded =
    tab === 'journeys' && matchFile.status === 'ready' && matchFile.id === selection?.match && matchFile.data.map === selection.map ? matchFile.data : null
  const hide = selection?.hide
  const journeys = useMemo(() => (loaded && map && hide ? buildJourneys(loaded, map, hide) : null), [loaded, map, hide])
  const summary = tab === 'journeys' && index && selection?.match ? index.matches.find((m) => m.id === selection.match) : undefined

  // Every view says what it shows (FRONTEND_GUIDELINES §2, rule 1).
  const viewTitle = selection
    ? tab === 'heatmaps'
      ? `Heatmaps · ${selection.map} · ${selection.date ?? 'all dates'}`
      : selection.match
        ? `Match ${selection.match} · ${selection.map}`
        : `${selection.map} · ${selection.date ?? 'all dates'}`
    : null

  const panel = (
    <SidePanel
      index={index}
      selection={selection}
      indexError={indexError}
      onNavigate={() => setPanelOpen(false)}
      onRetryIndex={fetchIndex}
    />
  )

  return (
    <div className="flex h-full flex-col">
      <TopBar index={index} selection={selection} onOpenPanel={() => setPanelOpen(true)} />
      <TabBar />
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Side panel" className="hidden w-80 shrink-0 flex-col border-r bg-card lg:flex">
          {panel}
        </aside>
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetContent side="left" className="w-80 gap-0 p-0 lg:hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>Side panel</SheetTitle>
              <SheetDescription>{tab === 'heatmaps' ? 'Heatmap controls' : 'Matches and the selected match'}</SheetDescription>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
        <main className="flex min-w-0 flex-1 flex-col bg-stage">
          <div className="relative min-h-0 flex-1">
            {map && selection && <MapStage mapId={selection.map} map={map} journeys={journeys} />}
            {viewTitle && (
              <h2 className="pointer-events-none absolute top-3 left-3 rounded-md bg-card/90 px-2.5 py-1 font-medium text-card-foreground shadow-sm">
                {viewTitle}
              </h2>
            )}
            {tab === 'heatmaps' && map && (
              <div className="absolute right-3 bottom-3 max-h-[calc(100%-9rem)] overflow-y-auto">
                <RegionCard mapScale={map.scale} />
              </div>
            )}
            {loaded && map && (
              <div className="absolute right-3 bottom-3 max-h-[calc(100%-9rem)] overflow-y-auto">
                <JourneyCard match={loaded} map={map} />
              </div>
            )}
          </div>
          {/* keyed by match, so nothing of the previous match's timeline survives a switch */}
          {summary && <PlaybackDock key={summary.id} match={summary} markers={journeys?.markers ?? null} />}
        </main>
      </div>
    </div>
  )
}
