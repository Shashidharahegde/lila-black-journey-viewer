import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { loadIndex } from './data/load'
import MapView from './map/MapView'
import { buildJourneys } from './map/journeys'
import { journeyLayers, journeyTooltip } from './map/journeyLayers'
import { useStore } from './state/store'
import { useMatchFile } from './state/useMatchFile'
import { useUrlSync } from './state/useUrlSync'
import Filters from './ui/Filters'
import Layers from './ui/Layers'
import MatchHeader from './ui/MatchHeader'
import MatchList from './ui/MatchList'

export default function App() {
  const index = useStore((s) => s.index)
  const selection = useStore((s) => s.selection)
  const matchFile = useStore((s) => s.matchFile)
  const setIndex = useStore((s) => s.setIndex)

  useEffect(() => {
    loadIndex()
      .then(setIndex)
      .catch((error: unknown) => toast.error(`Could not load the match index: ${String(error)}`))
  }, [setIndex])
  useUrlSync()
  useMatchFile()

  const map = index && selection ? index.maps[selection.map] : null
  const loaded = matchFile.status === 'ready' && matchFile.data.map === selection?.map ? matchFile.data : null
  const hide = selection?.hide
  const overlays = useMemo(
    () => (loaded && map && hide ? journeyLayers(buildJourneys(loaded, map, hide)) : []),
    [loaded, map, hide],
  )
  const summary = index?.matches.find((m) => m.id === selection?.match)

  return (
    <main className="flex h-full bg-slate-950 text-slate-100">
      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 p-4">
        <h1 className="text-lg font-semibold">LILA BLACK Journey Viewer</h1>
        {index && selection ? (
          <>
            <Filters index={index} selection={selection} />
            {summary && <MatchHeader match={summary} />}
            {summary && <Layers selection={selection} />}
            <MatchList index={index} selection={selection} />
          </>
        ) : (
          <p className="text-sm text-slate-400">Loading…</p>
        )}
      </aside>
      <section className="min-w-0 flex-1">
        {map && selection && (
          <MapView key={selection.map} mapId={selection.map} map={map} overlays={overlays} getTooltip={journeyTooltip} />
        )}
      </section>
    </main>
  )
}
