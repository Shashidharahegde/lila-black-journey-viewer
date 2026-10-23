import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { dataUrl, loadIndex } from './data/load'
import { buildJourneys } from './map/journeys'
import { loadMinimap, prefetchMinimap } from './map/minimap'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { overviewLinkFor } from './state/statsUrl'
import { useStore } from './state/store'
import { useHeatmapFile, useZonesFile } from './state/useHeatmap'
import { useMatchFile } from './state/useMatchFile'
import { useUrlSync } from './state/useUrlSync'
import JourneyCard from './ui/JourneyCard'
import MapStage from './ui/MapStage'
import PlaybackDock from './ui/PlaybackDock'
import PrimaryNav from './ui/PrimaryNav'
import SidePanel from './ui/SidePanel'
import HeatmapMapControls from './ui/HeatmapMapControls'
import TabBar from './ui/TabBar'
import TopBar, { ExploreUtilities } from './ui/TopBar'
import { isTypingTarget } from './ui/shortcuts'

/** Side panel width on desktop (w-80). */
const PANEL_WIDTH = 320
/** Room kept under the map for the playback dock (one row), on both tabs, so opening a match never rescales the map. */
const DOCK_RESERVE = 56

const desktopQuery = '(min-width: 1024px)'
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(desktopQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const isDesktop = () => window.matchMedia(desktopQuery).matches

/** The rendered height of an element, followed with a ResizeObserver (0 while it isn't mounted). */
function useHeight<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [height, setHeight] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node) return setHeight(0)
    observer.current = new ResizeObserver(([entry]) => setHeight(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height))
    observer.current.observe(node)
  }, [])
  return [ref, height]
}

export default function App() {
  const index = useStore((s) => s.index)
  const selection = useStore((s) => s.selection)
  const matchFile = useStore((s) => s.matchFile)
  const tab = useStore((s) => s.tab)
  const setIndex = useStore((s) => s.setIndex)
  const pinActor = useStore((s) => s.pinActor)
  const collapsed = useStore((s) => s.panelCollapsed)
  const setCollapsed = useStore((s) => s.setPanelCollapsed)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop)
  const [dockRef, dockHeight] = useHeight<HTMLDivElement>()

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

  // The map, date and tab are already on screen in the controls; only a selected match's id is new information on the map.
  const viewTitle = tab === 'journeys' && selection?.match ? `Match ${selection.match}` : null

  // The map is framed once, with room for the side panel and the dock reserved, so opening or closing either never moves it.
  const frame = { left: desktop ? PANEL_WIDTH : 0, bottom: DOCK_RESERVE }
  const covered = { left: desktop && !collapsed ? PANEL_WIDTH : 0, bottom: summary ? dockHeight : 0 }

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
      <PrimaryNav
        current="explore"
        overviewHref={overviewLinkFor(selection?.date ?? null)}
        utilities={<ExploreUtilities ready={Boolean(index && selection)} />}
        theme={false}
      />
      <TopBar index={index} selection={selection} onOpenPanel={() => setPanelOpen(true)} />
      <TabBar />
      {/* The stage never changes size: the panel and the dock are drawn over the map, in room the camera keeps clear (MapView `frame`). */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-stage">
        <main className="absolute inset-0">
          {map && selection && <MapStage mapId={selection.map} map={map} journeys={journeys} reserved={frame} covered={covered} />}
        </main>
        {/* Hiding slides the panel away but keeps it mounted, so its list, search, scroll and open sections are as they were on reopening. */}
        <aside
          id="side-panel"
          aria-label="Side panel"
          inert={collapsed}
          className={cn(
            'absolute inset-y-0 left-0 z-20 hidden w-80 flex-col border-r bg-card transition-transform duration-200 ease-out motion-reduce:transition-none lg:flex',
            collapsed && '-translate-x-full',
          )}
        >
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
        {/* map controls follow the uncovered part of the stage */}
        <div
          className="pointer-events-none absolute inset-0 z-10 transition-[left,bottom] duration-200 ease-out motion-reduce:transition-none *:pointer-events-auto"
          style={{ left: covered.left, bottom: covered.bottom }}
        >
          {/* desktop only: below 1024 px the panel is a drawer opened from the top bar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-3 left-3 hidden lg:inline-flex"
                aria-label={collapsed ? 'Show side panel' : 'Hide side panel'}
                aria-expanded={!collapsed}
                aria-controls="side-panel"
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? 'Show side panel' : 'Hide side panel'}</TooltipContent>
          </Tooltip>
          {viewTitle && (
            <h2 className="pointer-events-none absolute top-3 left-3 rounded-md bg-card/80 px-2.5 py-1 font-mono text-sm font-medium text-card-foreground shadow-sm backdrop-blur-sm lg:left-14">
              {viewTitle}
            </h2>
          )}
          {tab === 'heatmaps' && map && (
            <div className="absolute right-3 bottom-3">
              <HeatmapMapControls />
            </div>
          )}
          {loaded && map && (
            <div className="absolute right-3 bottom-3 max-h-[calc(100%-9rem)] overflow-y-auto">
              <JourneyCard match={loaded} map={map} />
            </div>
          )}
        </div>
        {/* keyed by match, so nothing of the previous match's timeline survives a switch */}
        {summary && (
          <div
            ref={dockRef}
            className="absolute right-0 bottom-0 z-10 transition-[left] duration-200 ease-out motion-reduce:transition-none"
            style={{ left: covered.left }}
          >
            <PlaybackDock key={summary.id} match={summary} markers={journeys?.markers ?? null} />
          </div>
        )}
      </div>
    </div>
  )
}
