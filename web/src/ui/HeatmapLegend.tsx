import type { HeatmapLayerKey } from '@/data/types'
import { focusedTicks, trafficTicks, type Tick } from '@/heatmap/legend'
import { COUNT_BANDS, countSwatch, isCountLayer, trafficGradient, type HeatmapMode } from '@/heatmap/scale'

interface Props {
  layer: HeatmapLayerKey
  /** the fixed traffic scale of this map (largest cell over all dates) */
  max: number
  mode: HeatmapMode
}

function Bar({ ticks }: { ticks: Tick[] }) {
  return (
    <>
      <div className="h-1.5 rounded-full ring-1 ring-white/15" style={{ background: trafficGradient() }} aria-hidden />
      <div className="relative h-3.5 text-[10px] text-white/80 tabular-nums" aria-hidden>
        {ticks.map((tick) => (
          <span
            key={tick.value}
            className="absolute top-0 whitespace-nowrap"
            style={{ left: `${tick.t * 100}%`, transform: `translateX(${tick.t > 0.85 ? '-100%' : tick.t < 0.1 ? '0' : '-50%'})` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <p className="sr-only">Estimated player time per cell, log scale: {ticks.map((tick) => tick.label).join(', ')}</p>
    </>
  )
}

/**
 * Traffic: one bar, ticked with raw times (in the Focused view it starts at 60 s). Kills and deaths: four count classes (1, 2–3, 4–9,
 * 10+), the same on every date and map. Brighter and more opaque on the map means more, in both. No captions: the selected metric
 * names the unit; the full wording is kept for screen readers.
 */
export default function HeatmapLegend({ layer, max, mode }: Props) {
  if (isCountLayer(layer)) {
    return (
      <div className="flex flex-col gap-1" role="group" aria-label="Heatmap legend">
        <ul className="flex gap-1" aria-label={`${layer === 'kills' ? 'Kills' : 'Deaths'} per cell`}>
          {COUNT_BANDS.map((band, k) => (
            <li key={band.label} className="flex flex-1 flex-col items-center gap-0.5 text-[10px] text-white/80 tabular-nums">
              <span className="h-1.5 w-full rounded-full ring-1 ring-white/15" style={{ background: countSwatch(layer, k) }} aria-hidden />
              {band.label}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1" role="group" aria-label="Heatmap legend">
      <Bar ticks={mode === 'focused' ? focusedTicks(max) : trafficTicks(max)} />
    </div>
  )
}
