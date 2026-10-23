import { MapTooltipNote, MapTooltipTitle } from '@/components/map-tooltip'
import type { HeatmapCell, HeatmapLayerKey, ZoneRecord } from '@/data/types'
import { cellValueText } from '@/heatmap/format'
import { shareOf, sharePercent, zoneSupportText, zoneValueText } from '@/heatmap/zones'

/** What the pointer is over on the Heatmaps tab: an outlined region and/or a heatmap cell. */
export interface MapHit {
  /** the cell's raw value, read from the cell grid (never from painted pixels); only while the density overlay is shown */
  cell?: HeatmapCell
  /** an outlined hotspot and its number */
  region?: { key: string; rank: number; zone: ZoneRecord }
}

interface Props {
  object: unknown
  layer: HeatmapLayerKey
}

/** Hover card on the Heatmaps tab: the hotspot under the pointer (value, share, matches, players) and the exact value of the cell. */
export default function HeatmapTooltip({ object, layer }: Props) {
  const hit = object as Partial<MapHit> | null
  if (!hit?.cell && !hit?.region) return null
  const region = hit.region
  return (
    <>
      {region && (
        <>
          <MapTooltipTitle>
            {region.rank > 0 ? `Hotspot ${region.rank}` : 'Hotspot'} · {zoneValueText(layer, region.zone.value)}
          </MapTooltipTitle>
          <MapTooltipNote>
            {sharePercent(region.zone.share)} {shareOf(layer)} · {zoneSupportText(region.zone)}
          </MapTooltipNote>
        </>
      )}
      {hit.cell && (
        <>
          <MapTooltipTitle>{region ? `This cell: ${cellValueText(layer, hit.cell[2])}` : cellValueText(layer, hit.cell[2])}</MapTooltipTitle>
          {layer === 'traffic' && !region && <MapTooltipNote>Estimate, human journeys</MapTooltipNote>}
        </>
      )}
    </>
  )
}
