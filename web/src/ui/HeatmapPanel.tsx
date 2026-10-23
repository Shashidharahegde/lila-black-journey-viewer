import { RefreshCwIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { HeatmapFile, HeatmapLayerKey, Index } from '@/data/types'
import {
  COVERAGE_NOTE,
  emptyText,
  heatmapEvidence,
  journeysText,
  layerEvidenceText,
  lowEvidenceText,
  pairNote,
  partialText,
} from '@/heatmap/evidence'
import { LAYER_LABEL, LAYER_NOTE, MODE_LABEL, MODE_NOTE, scopeLine } from '@/heatmap/format'
import { HEATMAP_MODES, layerDomain, type HeatmapMode } from '@/heatmap/scale'
import { HEATMAP_OPACITY, currentHeatmap, useStore } from '@/state/store'
import { HEATMAP_LAYERS, type Selection } from '@/state/url'
import Concentrations from './Concentrations'
import HeatmapLegend from './HeatmapLegend'

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

function Loaded({ index, selection, file, layer }: Props & { file: HeatmapFile; layer: HeatmapLayerKey }) {
  const mode = useStore((s) => s.heatmapMode)
  const setMode = useStore((s) => s.setHeatmapMode)
  const densityOn = useStore((s) => s.densityOn)
  const opacity = useStore((s) => s.heatmapOpacity)
  const setOpacity = useStore((s) => s.setHeatmapOpacity)
  const evidence = useMemo(() => heatmapEvidence(index, file, layer, selection.date), [index, file, layer, selection.date])
  const domain = useMemo(() => layerDomain(file.layers[layer]), [file, layer])
  const empty = emptyText(layer, evidence, selection.map, selection.date)
  const partial = partialText(index.dates.find((d) => d.date === selection.date))
  const pairs = pairNote(layer, evidence.pairs)
  const map = index.maps[selection.map]

  return (
    <>
      {layer === 'traffic' && densityOn && (
        <ToggleGroup
          type="single"
          aria-label="Traffic intensity view"
          value={mode}
          onValueChange={(value) => value && setMode(value as HeatmapMode)}
          className="w-full gap-0.5 bg-muted p-0.5"
        >
          {HEATMAP_MODES.map((key) => (
            <ToggleGroupItem key={key} value={key} className={`${SEGMENT} h-6 text-xs`}>
              {MODE_LABEL[key]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      <p className="text-xs font-medium">{scopeLine(selection.map, selection.date)}</p>
      {partial && <p className="text-xs text-muted-foreground">{partial}</p>}

      {empty ? (
        <div role="status" className="rounded-lg border border-dashed p-3 text-sm">
          <p>{empty.title}</p>
          {empty.hint && <p className="mt-1 text-xs text-muted-foreground">{empty.hint}</p>}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-0.5 text-xs tabular-nums">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{layerEvidenceText(layer, evidence)}</span>
              {evidence.low && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" tabIndex={0} className="border-amber-500/60 text-amber-600 dark:text-amber-400">
                      Few matches
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-60">{lowEvidenceText(layer, evidence)}</TooltipContent>
                </Tooltip>
              )}
            </div>
            <span className="text-muted-foreground">{journeysText(evidence)}</span>
          </div>
          <Concentrations key={`${selection.map}|${selection.date}|${layer}`} layer={layer} selection={selection} mapScale={map?.scale ?? 0} />
          {densityOn && <HeatmapLegend layer={layer} max={domain} mode={mode} />}
          {densityOn && (
            <label className="flex items-center gap-3 text-xs">
              <span className="shrink-0">Opacity</span>
              <Slider
                min={HEATMAP_OPACITY.min}
                max={HEATMAP_OPACITY.max}
                step={HEATMAP_OPACITY.step}
                value={[opacity]}
                onValueChange={([value]) => setOpacity(value)}
                thumbProps={{ 'aria-label': 'Heatmap opacity' }}
              />
              <span className="w-9 shrink-0 text-right text-muted-foreground tabular-nums">{Math.round(opacity * 100)}%</span>
            </label>
          )}
        </>
      )}

      {/* the method stays one click away, so the panel stays short */}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          About this heatmap
        </summary>
        <div className="mt-1.5 flex flex-col gap-1.5">
          <p>{LAYER_NOTE[layer]}, from human journeys only. It covers the selected map and date, never a single match.</p>
          <p>{layer === 'traffic' ? MODE_NOTE[mode] : 'Kills and deaths are coloured by count: 1, 2–3, 4–9 and 10 or more per cell, on every map and date. Classes colour the detailed cells, not the regions.'}</p>
          {pairs && <p>{pairs}</p>}
          <p>Strength follows a scale fixed for this map, so colours compare between dates.</p>
          <p>Soft edges are for display only, about one cell wide. Hover gives the exact value of the cell under the pointer, including cells too faint to see.</p>
          <p>No colour means no observed human data there, not that the area is unreachable.</p>
          <p>{COVERAGE_NOTE}</p>
        </div>
      </details>
    </>
  )
}

/**
 * The Heatmaps workspace's side panel: one metric, two independent switches (the density overlay and the hotspot outlines), and the
 * facts a heatmap needs next to it. It never shows a match, a path or a marker, and says so (spec 06).
 */
export default function HeatmapPanel({ index, selection }: Props) {
  const layer = useStore((s) => s.heatmapLayer)
  const setHeatmapLayer = useStore((s) => s.setHeatmapLayer)
  const densityOn = useStore((s) => s.densityOn)
  const setDensityOn = useStore((s) => s.setDensityOn)
  const outlinesOn = useStore((s) => s.outlinesOn)
  const setOutlinesOn = useStore((s) => s.setOutlinesOn)
  const retry = useStore((s) => s.retryHeatmap)
  const heatmap = useStore(currentHeatmap)

  return (
    <ScrollArea className="min-h-0 flex-1">
      <section aria-labelledby="heatmap-title" className="flex flex-col gap-2.5 p-4">
        <h2 id="heatmap-title" className="text-base font-semibold">
          Heatmaps
        </h2>
        <p className="text-xs text-muted-foreground">
          Aggregated recorded human telemetry for this map and date. Not filtered by the selected match or the playback time.
        </p>
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
        <div className="flex flex-col gap-1.5 rounded-lg border p-2.5">
          <SwitchRow label="Show density overlay" checked={densityOn} onChange={setDensityOn} />
          <SwitchRow label="Show hotspot outlines" checked={outlinesOn} onChange={setOutlinesOn} />
        </div>

        {heatmap.status === 'ready' ? (
          <Loaded index={index} selection={selection} file={heatmap.data} layer={layer} />
        ) : heatmap.status === 'error' ? (
          <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-3">
            <p className="text-sm font-medium">Could not load the {selection.map} heatmap.</p>
            <p className="text-xs text-muted-foreground">{heatmap.message}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              <RefreshCwIcon aria-hidden /> Retry
            </Button>
          </div>
        ) : (
          <div role="status" aria-live="polite" className="space-y-2">
            <p className="text-xs text-muted-foreground">Loading the {selection.map} heatmap…</p>
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}
      </section>
    </ScrollArea>
  )
}
