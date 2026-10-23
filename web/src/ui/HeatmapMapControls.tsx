import { useMemo } from 'react'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { emptyText, heatmapEvidence } from '@/heatmap/evidence'
import { MODE_LABEL } from '@/heatmap/format'
import { HEATMAP_MODES, layerDomain, type HeatmapMode } from '@/heatmap/scale'
import { HEATMAP_OPACITY, currentHeatmap, useStore } from '@/state/store'
import HeatmapLegend from './HeatmapLegend'

const SEGMENT =
  'h-6 flex-1 px-2 text-[11px] text-white/75 hover:bg-white/10 hover:text-white data-[state=on]:bg-white/20 data-[state=on]:text-white'

/**
 * How the density overlay is drawn, next to the picture it describes: Focused / All activity (traffic only), the colour scale and the
 * opacity. Sits in the map's bottom-right corner on the Heatmaps tab, only while the density overlay is on and the layer has data.
 */
export default function HeatmapMapControls() {
  const index = useStore((s) => s.index)
  const selection = useStore((s) => s.selection)
  const layer = useStore((s) => s.heatmapLayer)
  const densityOn = useStore((s) => s.densityOn)
  const mode = useStore((s) => s.heatmapMode)
  const setMode = useStore((s) => s.setHeatmapMode)
  const opacity = useStore((s) => s.heatmapOpacity)
  const setOpacity = useStore((s) => s.setHeatmapOpacity)
  const heatmap = useStore(currentHeatmap)
  const file = heatmap.status === 'ready' ? heatmap.data : null
  const date = selection?.date ?? null
  const evidence = useMemo(() => (index && file ? heatmapEvidence(index, file, layer, date) : null), [index, file, layer, date])
  const domain = useMemo(() => (file ? layerDomain(file.layers[layer]) : 0), [file, layer])

  // nothing drawn, nothing to explain: the side panel says why the layer is empty
  if (!densityOn || !file || !evidence || !selection || emptyText(layer, evidence, selection.map, date)) return null

  return (
    // see-through over the map: the stage is dark in both themes, so the card uses white text on a blurred dark glass
    <section aria-label="Heatmap display" className="flex w-56 flex-col gap-1.5 rounded-lg bg-black/35 p-2 text-white shadow-sm ring-1 ring-white/10 backdrop-blur-md">
      {layer === 'traffic' && (
        <ToggleGroup
          type="single"
          aria-label="Traffic intensity view"
          value={mode}
          onValueChange={(value) => value && setMode(value as HeatmapMode)}
          className="w-full gap-0.5 rounded-md bg-white/10 p-0.5"
        >
          {HEATMAP_MODES.map((key) => (
            <ToggleGroupItem key={key} value={key} className={SEGMENT}>
              {MODE_LABEL[key]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <HeatmapLegend layer={layer} max={domain} mode={mode} />
      <label className="flex items-center gap-2 text-[11px] text-white/80">
        <span className="shrink-0">Opacity</span>
        <Slider
          min={HEATMAP_OPACITY.min}
          max={HEATMAP_OPACITY.max}
          step={HEATMAP_OPACITY.step}
          value={[opacity]}
          onValueChange={([value]) => setOpacity(value)}
          thumbProps={{ 'aria-label': 'Heatmap opacity' }}
        />
        <span className="w-8 shrink-0 text-right tabular-nums">{Math.round(opacity * 100)}%</span>
      </label>
    </section>
  )
}
