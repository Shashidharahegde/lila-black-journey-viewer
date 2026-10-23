import { useCallback, useMemo, useState } from 'react'
import type { HeatmapCell, MapInfo, ZoneRecord } from '@/data/types'
import { cellOf } from '@/heatmap/grid'
import { heatmapLayers, outlineLayers, type OutlinedRegion } from '@/heatmap/layers'
import { cellLookup } from '@/heatmap/raster'
import { layerDomain } from '@/heatmap/scale'
import { insideOutline, passingZones, zoneFootprint, zoneKey, zoneLayer, zoneOutline } from '@/heatmap/zones'
import { zoomStyle } from '@/map/encoding'
import { journeyLayers } from '@/map/journeyLayers'
import type { JourneyData, PathDatum } from '@/map/journeys'
import MapView, { type Insets } from '@/map/MapView'
import { playbackFrames } from '@/map/playback'
import { isInsideMap, spaceToUv } from '@/map/space'
import { currentHeatmap, currentZones, useStore } from '@/state/store'
import HeatmapTooltip, { type MapHit } from './HeatmapTooltip'
import JourneyTooltip from './JourneyTooltip'

/** The actor id of anything picked on the journey layers. */
function pickedActor(object: unknown): string | null {
  return (object as Partial<PathDatum> | null)?.actor?.id ?? null
}

interface Props {
  mapId: string
  map: MapInfo
  /** the selected match's journeys on the Journeys tab, or null (no match, its file still loading, or the other tab) */
  journeys: JourneyData | null
  /** room kept clear for the side panel and the dock, and where they cover the map now (see MapView) */
  reserved: Insets
  covered: Insets
}

/**
 * The one map for both tabs. Journeys & Playback: the selected match at the playback time (this is the only part of the page that
 * re-renders on every frame of playback; while paused nothing is recomputed). Heatmaps: the aggregate for the selected map and date,
 * as a density overlay and/or hotspot outlines, never together with a match's paths or markers. The same MapView stays mounted
 * across tabs, so the minimap isn't reloaded and the camera stays where the user left it.
 */
export default function MapStage({ mapId, map, journeys, reserved, covered }: Props) {
  const tab = useStore((s) => s.tab)
  const heatmapsTab = tab === 'heatmaps'

  // --- Journeys & Playback ---
  const time = useStore((s) => s.playback.time)
  const fullPaths = useStore((s) => s.fullPaths)
  const hovered = useStore((s) => s.hoveredActor)
  const pinned = useStore((s) => s.pinnedActor)
  const hoverActor = useStore((s) => s.hoverActor)
  const pinActor = useStore((s) => s.pinActor)
  const frames = useMemo(() => (journeys ? playbackFrames(journeys) : null), [journeys])
  const frame = useMemo(() => frames?.(time) ?? null, [frames, time])

  // --- Heatmaps ---
  const densityOn = useStore((s) => s.densityOn)
  const outlinesOn = useStore((s) => s.outlinesOn)
  const mode = useStore((s) => s.heatmapMode)
  const layer = useStore((s) => s.heatmapLayer)
  const date = useStore((s) => s.selection?.date ?? null)
  const opacity = useStore((s) => s.heatmapOpacity)
  const heatmap = useStore(currentHeatmap)
  const zonesState = useStore(currentZones)
  const selectedZone = useStore((s) => s.selectedZone)
  const selectZone = useStore((s) => s.selectZone)
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null)

  const grid = heatmap.status === 'ready' ? heatmap.data.grid : 64
  const domain = useMemo(() => (heatmap.status === 'ready' ? layerDomain(heatmap.data.layers[layer]) : 0), [heatmap, layer])
  // the raw cells under the pointer, read from the grid: hover never reads painted pixels
  const cells = useMemo(() => (heatmap.status === 'ready' ? (heatmap.data.layers[layer][date ?? 'all'] ?? []) : []), [heatmap, layer, date])
  const lookup = useMemo(() => cellLookup(cells, grid), [cells, grid])
  const showDensity = heatmapsTab && densityOn && heatmap.status === 'ready'

  // the hotspots drawn: every region that passes the checks when outlines are on, and the selected one even when they are off
  const regions = useMemo(() => {
    if (!heatmapsTab || zonesState.status !== 'ready') return [] as (OutlinedRegion & { zone: ZoneRecord })[]
    const result = zoneLayer(zonesState.data, date, layer)
    if (!result) return []
    const hotspots = passingZones(result)
    const shown = outlinesOn ? hotspots : hotspots.filter((z) => zoneKey(z) === selectedZone)
    return shown.map((zone) => {
      const rank = hotspots.indexOf(zone) + 1
      const outline = zoneOutline(zoneFootprint(zone, map, zonesState.data.zone_cells, zonesState.data.grid))
      return { key: zoneKey(zone), rank, zone, ...outline }
    })
  }, [heatmapsTab, zonesState, date, layer, outlinesOn, selectedZone, map])

  // selecting a hotspot brings it into view; closing the details leaves the camera where it is
  const focus = useMemo(() => {
    const r = selectedZone ? regions.find((x) => x.key === selectedZone) : undefined
    return r ? { id: r.key, centre: [r.cx, r.cy] as [number, number], extent: r.radius * 2 } : null
  }, [regions, selectedZone])

  // The picture and the outlines are separate memos: hovering changes only the first, so the outline layers keep their identity
  // (and deck.gl does no work on them) while the pointer moves.
  const densityLayers = useMemo(
    () => (showDensity ? heatmapLayers({ mapId, map, layer, mode, dateKey: date ?? 'all', cells, domain, grid, opacity, hovered: hoveredCell }) : []),
    [showDensity, mapId, map, layer, mode, date, cells, domain, grid, opacity, hoveredCell],
  )
  const outlines = useMemo(() => outlineLayers(regions, selectedZone), [regions, selectedZone])
  const heatmapOverlay = useMemo(() => [...densityLayers, ...outlines], [densityLayers, outlines])

  const overlays = useCallback(
    (levelsIn: number) => {
      if (heatmapsTab) return heatmapOverlay
      if (!journeys || !frame) return []
      const focus = { hovered, pinned }
      // full paths: the static view of feature 4, with the current positions on top
      return fullPaths
        ? journeyLayers(journeys, focus, zoomStyle(levelsIn), { heads: frame.heads, growing: false })
        : journeyLayers(frame, focus, zoomStyle(levelsIn), { heads: frame.heads, growing: true })
    },
    [heatmapsTab, heatmapOverlay, journeys, frame, fullPaths, hovered, pinned],
  )

  const onHoverObject = useCallback(
    (object: unknown) => {
      if (!heatmapsTab) return hoverActor(pickedActor(object))
      const cell = (object as Partial<MapHit> | null)?.cell ?? null
      setHoveredCell((previous) => (previous && cell && previous[0] === cell[0] && previous[1] === cell[1] ? previous : cell))
    },
    [heatmapsTab, hoverActor],
  )

  // what is under a point of the map that deck.gl can't pick: an outlined region (a click selects it) and the heatmap cell (its raw value)
  const pickAt = useCallback(
    (x: number, y: number): MapHit | null => {
      if (!heatmapsTab || !isInsideMap(x, y, map)) return null
      let region: MapHit['region']
      let nearest = Infinity
      for (const r of regions) {
        const d = Math.hypot(x - r.cx, y - r.cy)
        if (insideOutline([x, y], r) && d < nearest) {
          nearest = d
          region = { key: r.key, rank: r.rank, zone: r.zone }
        }
      }
      let cell: HeatmapCell | undefined
      if (showDensity) {
        const [u, v] = spaceToUv(x, y, map)
        const [i, j] = cellOf(u, v, grid)
        const value = lookup.get(i * grid + j)
        if (value !== undefined) cell = [i, j, value]
      }
      return region || cell ? { region, cell } : null
    },
    [heatmapsTab, map, regions, showDensity, grid, lookup],
  )

  const onClickObject = useCallback(
    (object: unknown) => {
      if (!heatmapsTab) return pinActor(pickedActor(object))
      const key = (object as Partial<MapHit> | null)?.region?.key ?? null
      selectZone(key && key === selectedZone ? null : key) // a click on the selected outline clears it; on empty map too
    },
    [heatmapsTab, pinActor, selectZone, selectedZone],
  )

  return (
    <MapView
      mapId={mapId}
      map={map}
      overlays={overlays}
      renderTooltip={(object) => (heatmapsTab ? <HeatmapTooltip object={object} layer={layer} /> : <JourneyTooltip object={object} />)}
      pickAt={pickAt}
      onHoverObject={onHoverObject}
      onClickObject={onClickObject}
      focus={heatmapsTab ? focus : null}
      frame={reserved}
      covered={covered}
    />
  )
}
