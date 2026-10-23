import type { HeatmapLayerKey } from '@/data/types'
import { focusedTicks, trafficTicks, type Tick } from '@/heatmap/legend'
import { COUNT_BANDS, TRAFFIC_FOCUS, countSwatch, isCountLayer, trafficGradient, type HeatmapMode } from '@/heatmap/scale'

interface Props {
  layer: HeatmapLayerKey
  /** the fixed traffic scale of this map (largest cell over all dates) */
  max: number
  mode: HeatmapMode
}

function Bar({ ticks }: { ticks: Tick[] }) {
  return (
    <>
      <div className="h-2 rounded-full ring-1 ring-foreground/10" style={{ background: trafficGradient() }} aria-hidden />
      <div className="relative h-3.5 text-[11px] text-muted-foreground tabular-nums" aria-hidden>
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
      <p className="sr-only">Scale: {ticks.map((tick) => tick.label).join(', ')}</p>
    </>
  )
}

/**
 * Traffic: one bar, ticked with raw times; in the Focused view it starts at 60 s and says that under 30 s is not drawn and 30 to 60 s is a
 * faint trace. Kills and deaths: four count classes (1, 2–3, 4–9, 10+), the same on every date and map.
 * Brighter and more opaque on the map means more, in both.
 */
export default function HeatmapLegend({ layer, max, mode }: Props) {
  if (isCountLayer(layer)) {
    return (
      <div className="flex flex-col gap-1" role="group" aria-label="Heatmap legend">
        <p className="text-xs text-muted-foreground">{layer === 'kills' ? 'Kills' : 'Deaths'} per cell</p>
        <ul className="flex gap-1" aria-label="Count classes">
          {COUNT_BANDS.map((band, k) => (
            <li key={band.label} className="flex flex-1 flex-col items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums">
              <span className="h-2.5 w-full rounded-sm ring-1 ring-foreground/10" style={{ background: countSwatch(layer, k) }} aria-hidden />
              {band.label}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  const focused = mode === 'focused'
  return (
    <div className="flex flex-col gap-1" role="group" aria-label="Heatmap legend">
      <p className="text-xs text-muted-foreground">Estimated player time per cell (log)</p>
      <Bar ticks={focused ? focusedTicks(max) : trafficTicks(max)} />
      {focused && (
        <p className="text-[11px] text-muted-foreground">
          Under {TRAFFIC_FOCUS.hideBelow} s not drawn · {TRAFFIC_FOCUS.hideBelow}–{TRAFFIC_FOCUS.faintBelow} s a faint trace
        </p>
      )}
    </div>
  )
}
