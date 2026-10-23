import { RefreshCwIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { HeatmapLayerKey, Index } from '@/data/types'
import { heatmapEvidence } from '@/heatmap/evidence'
import { LAYER_LABEL } from '@/heatmap/format'
import { currentHeatmap, useStore } from '@/state/store'
import { HEATMAP_LAYERS, type Selection } from '@/state/url'
import HeatmapSummary from './HeatmapSummary'
import HotspotDetails from './HotspotDetails'
import { ContextRow } from './TopBar'

interface Props {
  index: Index
  selection: Selection
}

const SEGMENT =
  'h-7 flex-1 px-3 text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm'

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  )
}

/** The summary card for the loaded heatmap file, or its loading and error states at the same place. */
function Summary({ index, selection, layer }: Props & { layer: HeatmapLayerKey }) {
  const heatmap = useStore(currentHeatmap)
  const retry = useStore((s) => s.retryHeatmap)
  const file = heatmap.status === 'ready' ? heatmap.data : null
  const evidence = useMemo(() => (file ? heatmapEvidence(index, file, layer, selection.date) : null), [index, file, layer, selection.date])

  if (evidence) {
    return (
      <HeatmapSummary
        layer={layer}
        evidence={evidence}
        map={selection.map}
        date={selection.date}
        dateInfo={index.dates.find((d) => d.date === selection.date)}
      />
    )
  }
  if (heatmap.status === 'error') {
    return (
      <div role="alert" className="space-y-2 rounded-xl border border-destructive/40 p-3">
        <p className="text-sm font-medium">Could not load the {selection.map} heatmap.</p>
        <p className="text-xs text-muted-foreground">{heatmap.message}</p>
        <Button variant="outline" size="sm" onClick={retry}>
          <RefreshCwIcon aria-hidden /> Retry
        </Button>
      </div>
    )
  }
  // the card's own height, so nothing below moves when the file arrives
  return <Skeleton role="status" aria-label={`Loading the ${selection.map} heatmap`} className="h-[8.75rem] rounded-xl" />
}

/**
 * The Heatmaps workspace's side panel: the metric, the date and theme, one summary card, the two display switches, and the clicked
 * hotspot's details. It never shows a match, a path or a marker (spec 06).
 */
export default function HeatmapPanel({ index, selection }: Props) {
  const layer = useStore((s) => s.heatmapLayer)
  const setHeatmapLayer = useStore((s) => s.setHeatmapLayer)
  const densityOn = useStore((s) => s.densityOn)
  const setDensityOn = useStore((s) => s.setDensityOn)
  const outlinesOn = useStore((s) => s.outlinesOn)
  const setOutlinesOn = useStore((s) => s.setOutlinesOn)

  return (
    <ScrollArea className="min-h-0 flex-1">
      <section aria-labelledby="heatmap-title" className="flex flex-col gap-3 p-4">
        <h2 id="heatmap-title" className="sr-only">
          Heatmap
        </h2>
        <ToggleGroup
          type="single"
          aria-label="Heatmap metric"
          value={layer}
          // a second click on the current metric would clear the value; one metric is always shown
          onValueChange={(value) => value && setHeatmapLayer(value as HeatmapLayerKey)}
          className="w-full gap-0.5 bg-muted p-0.5"
        >
          {HEATMAP_LAYERS.map((key) => (
            <ToggleGroupItem key={key} value={key} className={SEGMENT}>
              {LAYER_LABEL[key]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ContextRow index={index} selection={selection} />
        <Summary index={index} selection={selection} layer={layer} />
        <div className="flex flex-col gap-2 px-1">
          <SwitchRow label="Density overlay" checked={densityOn} onChange={setDensityOn} />
          <SwitchRow label="Hotspot outlines" checked={outlinesOn} onChange={setOutlinesOn} />
        </div>
        <HotspotDetails layer={layer} date={selection.date} />
      </section>
    </ScrollArea>
  )
}
