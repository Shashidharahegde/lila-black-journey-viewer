import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { HeatmapLayerKey } from '@/data/types'
import { passingZones, shareOf, sharePercent, zoneKey, zoneLayer, zoneMetric } from '@/heatmap/zones'
import { cn } from '@/lib/utils'
import { currentZones, useStore } from '@/state/store'

export const PICK_HOTSPOT_TEXT = 'Click on the specific hotspot to get more information.'

/** The card's content eases in when a hotspot is picked or cleared (a new key remounts it); instant under reduced motion. */
const REVEAL = 'animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none'

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse gap-0.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value.toLocaleString('en-US')}</dd>
    </div>
  )
}

/**
 * The space under the summary: a prompt until a hotspot is clicked on the map, then that hotspot's figures. It follows the store's
 * selected region, so the map and the panel always agree; Esc, the close button or a click on empty map bring the prompt back.
 */
export default function HotspotDetails({ layer, date }: { layer: HeatmapLayerKey; date: string | null }) {
  const zones = useStore(currentZones)
  const key = useStore((s) => s.selectedZone)
  const outlinesOn = useStore((s) => s.outlinesOn)
  const selectZone = useStore((s) => s.selectZone)
  const result = zones.status === 'ready' ? zoneLayer(zones.data, date, layer) : undefined
  const hotspots = result ? passingZones(result) : []
  const rank = key ? hotspots.findIndex((z) => zoneKey(z) === key) : -1
  const zone = rank >= 0 ? hotspots[rank] : undefined

  const prompt =
    zones.status === 'loading'
      ? 'Loading hotspots…'
      : !result || hotspots.length === 0
        ? 'No hotspots stand out for this map and date.'
        : outlinesOn
          ? PICK_HOTSPOT_TEXT
          : 'Turn on hotspot outlines to pick a hotspot.'

  return (
    <section
      aria-label="Hotspot details"
      aria-live="polite"
      className={cn(
        'flex min-h-36 flex-col rounded-xl p-3 transition-[background-color,border-color,box-shadow] duration-300 ease-out',
        zone ? 'bg-brand/8 ring-1 ring-brand/50' : 'items-center justify-center border border-dashed text-center',
      )}
    >
      {!zone ? (
        <p key="prompt" className={cn('max-w-56 text-sm text-muted-foreground', REVEAL)}>
          {prompt}
        </p>
      ) : (
        <div key={key} className={REVEAL}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden className="flex size-5 items-center justify-center rounded-full bg-brand text-[11px] text-white tabular-nums">
                {rank + 1}
              </span>
              Hotspot {rank + 1}
            </h3>
            <Button variant="ghost" size="icon-sm" aria-label="Close hotspot details (Esc)" onClick={() => selectZone(null)}>
              <XIcon />
            </Button>
          </div>
          <p className="mt-2 tabular-nums">
            <span className="text-2xl font-semibold">{zoneMetric(layer, zone.value).value}</span>{' '}
            <span className="text-xs text-muted-foreground">{zoneMetric(layer, zone.value).unit}</span>
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(2, Math.min(100, zone.share * 100))}%` }} />
            </span>
            <span className="shrink-0 tabular-nums">
              {sharePercent(zone.share)} {shareOf(layer)}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
            <Figure label="matches" value={zone.matches} />
            <Figure label="players" value={zone.players} />
            {zone.journeys !== undefined && <Figure label="journeys" value={zone.journeys} />}
            {zone.storm_deaths !== undefined && zone.storm_deaths > 0 && <Figure label="storm deaths" value={zone.storm_deaths} />}
          </dl>
        </div>
      )}
    </section>
  )
}
