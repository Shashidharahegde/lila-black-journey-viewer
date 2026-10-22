import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { dataUrl, loadIndex } from './data/load'
import MapView from './map/MapView'
import { buildJourneys, type PathDatum } from './map/journeys'
import { zoomStyle } from './map/encoding'
import { journeyLayers } from './map/journeyLayers'
import { loadMinimap, prefetchMinimap } from './map/minimap'
import { useStore } from './state/store'
import { useMatchFile } from './state/useMatchFile'
import { useUrlSync } from './state/useUrlSync'
import JourneyTooltip from './ui/JourneyTooltip'
import JourneyCard from './ui/JourneyCard'
import SidePanel from './ui/SidePanel'
import TopBar from './ui/TopBar'
import { isTypingTarget } from './ui/shortcuts'

/** The actor id of anything picked on the journey layers. */
function pickedActor(object: unknown): string | null {
  return (object as Partial<PathDatum> | null)?.actor?.id ?? null
}

export default function App() {
  const index = useStore((s) => s.index)
  const selection = useStore((s) => s.selection)
  const matchFile = useStore((s) => s.matchFile)
  const setIndex = useStore((s) => s.setIndex)
  const hovered = useStore((s) => s.hoveredActor)
  const pinned = useStore((s) => s.pinnedActor)
  const hoverActor = useStore((s) => s.hoverActor)
  const pinActor = useStore((s) => s.pinActor)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((error: unknown) => {
        setIndexError(String(error))
        toast.error('Could not load the match index')
      })
  }, [setIndex])
  useUrlSync()
  useMatchFile()

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

  // Esc clears the selected actor (FRONTEND_GUIDELINES §6 Keyboard); open menus and dialogs handle their own Esc
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !isTypingTarget(event.target)) pinActor(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinActor])

  const map = index && selection ? index.maps[selection.map] : null
  const loaded = matchFile.status === 'ready' && matchFile.data.map === selection?.map ? matchFile.data : null
  const hide = selection?.hide
  const journeys = useMemo(() => (loaded && map && hide ? buildJourneys(loaded, map, hide) : null), [loaded, map, hide])
  const overlays = useCallback(
    (levelsIn: number) => (journeys ? journeyLayers(journeys, { hovered, pinned }, zoomStyle(levelsIn)) : []),
    [journeys, hovered, pinned],
  )
  const onHoverObject = useCallback((object: unknown) => hoverActor(pickedActor(object)), [hoverActor])
  const onClickObject = useCallback((object: unknown) => pinActor(pickedActor(object)), [pinActor])

  // Every view says what it shows (FRONTEND_GUIDELINES §2, rule 1).
  const viewTitle = selection
    ? selection.match
      ? `Match ${selection.match} · ${selection.map}`
      : `${selection.map} · ${selection.date ?? 'all dates'}`
    : null

  const panel = (
    <SidePanel
      index={index}
      selection={selection}
      indexError={indexError}
      onNavigate={() => setPanelOpen(false)}
    />
  )

  return (
    <div className="flex h-full flex-col">
      <TopBar index={index} selection={selection} onOpenPanel={() => setPanelOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Side panel" className="hidden w-80 shrink-0 flex-col border-r bg-card lg:flex">
          {panel}
        </aside>
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetContent side="left" className="w-80 gap-0 p-0 lg:hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>Side panel</SheetTitle>
              <SheetDescription>Matches and the selected match</SheetDescription>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
        <main className="relative min-w-0 flex-1 bg-stage">
          {map && selection && (
            <MapView
              mapId={selection.map}
              map={map}
              overlays={overlays}
              renderTooltip={(object) => <JourneyTooltip object={object} />}
              onHoverObject={onHoverObject}
              onClickObject={onClickObject}
            />
          )}
          {viewTitle && (
            <h2 className="pointer-events-none absolute top-3 left-3 rounded-md bg-card/90 px-2.5 py-1 font-medium text-card-foreground shadow-sm">
              {viewTitle}
            </h2>
          )}
          {loaded && map && (
            <div className="absolute right-3 bottom-3 max-h-[calc(100%-9rem)] overflow-y-auto">
              <JourneyCard match={loaded} map={map} />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
