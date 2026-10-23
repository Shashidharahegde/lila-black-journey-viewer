import { XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { plural } from '@/heatmap/format'
import { OUTLINE_NOTE, failedChecks, regionWorldUnits, zoneDetails, zoneKey, zoneLayer, zoneRowText } from '@/heatmap/zones'
import { currentZones, useStore } from '@/state/store'

const LAYER_NAME = { traffic: 'Traffic', kills: 'Kills', deaths: 'Deaths' } as const

/**
 * What is recorded in the region the user clicked (an outline on the map or a row in the list): the same figures as the list row,
 * in the map's bottom-right corner, kept until Esc, the close button or a click on empty map. Heatmaps tab only.
 */
export default function RegionCard({ mapScale }: { mapScale: number }) {
  const key = useStore((s) => s.selectedZone)
  const layer = useStore((s) => s.heatmapLayer)
  const date = useStore((s) => s.selection?.date ?? null)
  const zones = useStore(currentZones)
  const selectZone = useStore((s) => s.selectZone)
  if (!key || zones.status !== 'ready') return null
  const result = zoneLayer(zones.data, date, layer)
  const zone = result?.zones.find((z) => zoneKey(z) === key)
  if (!result || !zone) return null

  const consistent = zone.tier === 'consistent'
  const rank = consistent ? result.zones.filter((z) => z.tier === 'consistent').indexOf(zone) + 1 : 0
  const failed = consistent ? [] : failedChecks(zone, zones.data.rules)

  return (
    <Card size="sm" className="w-80" aria-live="polite" role="region" aria-label="Selected region">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span
            aria-hidden
            className={
              consistent
                ? 'flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white tabular-nums'
                : 'flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed'
            }
          >
            {consistent ? rank : ''}
          </span>
          {LAYER_NAME[layer]} region
          <Badge variant="outline">{consistent ? 'Consistent' : 'Observed'}</Badge>
        </CardTitle>
        <CardDescription>
          {plural(zone.matches, 'match', 'matches')} · {plural(zone.players, 'player')} · about {regionWorldUnits(mapScale, zones.data.zones_per_side)} world units across
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="Close region details (Esc)" onClick={() => selectZone(null)}>
            <XIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-xs">
        <p className="text-sm font-medium tabular-nums">{zoneRowText(layer, zone)}</p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
          {zoneDetails(layer, zone, zones.data.rules).slice(2).map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground">
          {consistent
            ? 'Passed every check. Repeat tests use the recorded matches only; they don’t show the pattern holds for all players.'
            : `Recorded here, but not shown as a consistent concentration: ${failed.join('; ')}.`}
        </p>
        <p className="text-muted-foreground">{OUTLINE_NOTE}</p>
      </CardContent>
    </Card>
  )
}
