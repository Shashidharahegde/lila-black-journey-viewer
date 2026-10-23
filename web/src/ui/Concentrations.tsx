import { cn } from '@/lib/utils'
import type { HeatmapLayerKey, ZoneRecord } from '@/data/types'
import { plural } from '@/heatmap/format'
import {
  DEFAULT_SHOWN,
  NO_CONSISTENT_TEXT,
  OUTLINE_NOTE,
  regionWorldUnits,
  summarizeZones,
  zoneKey,
  zoneLayer,
  zoneRowText,
  zoneSupportText,
} from '@/heatmap/zones'
import { currentZones, useStore } from '@/state/store'
import type { Selection } from '@/state/url'

interface RowProps {
  rank: number | null
  zone: ZoneRecord
  layer: HeatmapLayerKey
  selected: boolean
  onToggle: () => void
}

function RegionRow({ rank, zone, layer, selected, onToggle }: RowProps) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onToggle}
        className={cn(
          'flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
          selected && 'border-brand bg-brand/5 ring-1 ring-brand',
          zone.tier === 'observed' && 'text-muted-foreground',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums',
            rank === null ? 'border border-dashed' : 'bg-foreground text-background',
          )}
        >
          {rank ?? ''}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground tabular-nums">{zoneRowText(layer, zone)}</span>
          <span className="block tabular-nums">{zoneSupportText(zone)}</span>
        </span>
      </button>
    </li>
  )
}

interface Props {
  layer: HeatmapLayerKey
  selection: Selection
  /** the minimap's world scale, for "about N units across" */
  mapScale: number
}

/**
 * The strongest supported regions of the selected map, date and layer (spec 06, Stage 6b): up to three consistent
 * concentrations at first, with their values, shares and how many matches and players stand behind them; or, when none
 * qualifies, the plain sentence and the highest observed regions with their measurements. Click a row or an outline to zoom to it and see its details.
 */
export default function Concentrations({ layer, selection, mapScale }: Props) {
  const zones = useStore(currentZones)
  const selected = useStore((s) => s.selectedZone)
  const toggleZone = useStore((s) => s.toggleZone)
  const expanded = useStore((s) => s.zonesExpanded)
  const setExpanded = useStore((s) => s.setZonesExpanded)
  const outlinesOn = useStore((s) => s.outlinesOn)

  if (zones.status === 'loading') return <p className="text-xs text-muted-foreground">Loading regions…</p>
  if (zones.status !== 'ready') return zones.status === 'error' ? <p className="text-xs text-muted-foreground">Region summary unavailable.</p> : null
  const result = zoneLayer(zones.data, selection.date, layer)
  if (!result) return null
  const summary = summarizeZones(result, expanded ? Infinity : DEFAULT_SHOWN)
  const nothing = summary.consistent.length === 0
  const listed = nothing ? summary.observed.slice(0, DEFAULT_SHOWN) : summary.shown

  return (
    <section aria-label="Concentrations" className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold">{nothing ? 'Concentrations' : plural(summary.consistent.length, 'consistent concentration')}</h3>
        {layer === 'deaths' && result.storm_deaths !== undefined && (
          <span className="text-xs text-muted-foreground tabular-nums">incl. {plural(result.storm_deaths, 'storm death')}</span>
        )}
      </div>
      {nothing && (
        <p role="status" className="text-xs">
          {NO_CONSISTENT_TEXT}
          {listed.length > 0 && <span className="text-muted-foreground"> Highest observed regions, not consistent:</span>}
        </p>
      )}
      {listed.length > 0 && (
        <ol className="flex flex-col gap-1">
          {listed.map((zone, k) => (
            <RegionRow
              key={zoneKey(zone)}
              rank={nothing ? null : k + 1}
              zone={zone}
              layer={layer}
              selected={selected === zoneKey(zone)}
              onToggle={() => toggleZone(zoneKey(zone))}
            />
          ))}
        </ol>
      )}
      {!nothing && (summary.hidden > 0 || expanded) && (
        <button
          type="button"
          className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show fewer' : `Show ${summary.hidden} more`}
        </button>
      )}
      {!nothing && outlinesOn && (
        <p className="text-[11px] text-muted-foreground">
          {OUTLINE_NOTE} Each is about {regionWorldUnits(mapScale, zones.data.zones_per_side)} world units across.
        </p>
      )}
    </section>
  )
}
