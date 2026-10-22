import { useCallback, useMemo } from 'react'
import type { MapInfo } from '@/data/types'
import MapView from '@/map/MapView'
import { zoomStyle } from '@/map/encoding'
import { journeyLayers } from '@/map/journeyLayers'
import type { JourneyData, PathDatum } from '@/map/journeys'
import { playbackFrames } from '@/map/playback'
import { useStore } from '@/state/store'
import JourneyTooltip from './JourneyTooltip'

/** The actor id of anything picked on the journey layers. */
function pickedActor(object: unknown): string | null {
  return (object as Partial<PathDatum> | null)?.actor?.id ?? null
}

interface Props {
  mapId: string
  map: MapInfo
  /** the selected match's journeys, or null (no match, or its file is still loading) */
  journeys: JourneyData | null
}

/**
 * The map with the selected match drawn at the playback time. This is the only part of the page
 * that re-renders on every frame of playback; while paused nothing is recomputed.
 */
export default function MapStage({ mapId, map, journeys }: Props) {
  const time = useStore((s) => s.playback.time)
  const fullPaths = useStore((s) => s.fullPaths)
  const hovered = useStore((s) => s.hoveredActor)
  const pinned = useStore((s) => s.pinnedActor)
  const hoverActor = useStore((s) => s.hoverActor)
  const pinActor = useStore((s) => s.pinActor)

  const frames = useMemo(() => (journeys ? playbackFrames(journeys) : null), [journeys])
  const frame = useMemo(() => frames?.(time) ?? null, [frames, time])
  const overlays = useCallback(
    (levelsIn: number) => {
      if (!journeys || !frame) return []
      const focus = { hovered, pinned }
      // full paths: the static view of feature 4, with the current positions on top
      return fullPaths
        ? journeyLayers(journeys, focus, zoomStyle(levelsIn), { heads: frame.heads, growing: false })
        : journeyLayers(frame, focus, zoomStyle(levelsIn), { heads: frame.heads, growing: true })
    },
    [journeys, frame, fullPaths, hovered, pinned],
  )
  const onHoverObject = useCallback((object: unknown) => hoverActor(pickedActor(object)), [hoverActor])
  const onClickObject = useCallback((object: unknown) => pinActor(pickedActor(object)), [pinActor])

  return (
    <MapView
      mapId={mapId}
      map={map}
      overlays={overlays}
      renderTooltip={(object) => <JourneyTooltip object={object} />}
      onHoverObject={onHoverObject}
      onClickObject={onClickObject}
    />
  )
}
