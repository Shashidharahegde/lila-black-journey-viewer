import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { StatsFile, StatsSlice } from '@/data/types'
import { KPIS, kpiText, type KpiId } from '@/stats/comparison'
import { scoreOf } from '@/stats/slices'
import MetricInfo from './MetricInfo'

// stats.py SCORE_PARTS → the KPI each part reads
const PART_KPI: Record<string, KpiId> = {
  human_journeys: 'journeys',
  journey_span_s: 'time',
  kill_rate: 'kills',
  loot_rate: 'loot',
  storm_death_rate: 'storm',
}

/** Why a map scores what it does: each of the five parts on the 0 (worst map) to 1 (best map) scale, beside the map's
 * own value for it. */
export default function ScoreBreakdown({ stats, map, slice }: { stats: StatsFile; map: string; slice: StatsSlice }) {
  const score = scoreOf(slice)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          Performance score
          <MetricInfo metric={stats.metrics.map_score} />
        </CardTitle>
        <CardDescription>
          {score
            ? `${map} against the other ${score.maps - 1} ${score.maps === 2 ? 'map' : 'maps'} at this date: 1 is the best map on a part, 0 the worst.`
            : 'No other map has human journeys at this date, so there is nothing to compare with.'}
        </CardDescription>
      </CardHeader>
      {score && (
        <CardContent className="flex flex-col gap-3">
          <p className="text-3xl font-semibold text-brand tabular-nums">{score.value.toFixed(2)}</p>
          <ul className="flex flex-col gap-2.5">
            {Object.entries(score.parts).map(([part, value]) => {
              const id = PART_KPI[part]
              return (
                <li key={part} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{id ? KPIS[id].label : part}</span>
                    {id && <span className="block text-xs text-muted-foreground tabular-nums">{kpiText(slice, id)}</span>}
                  </span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${value * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{value.toFixed(2)}</span>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-muted-foreground">Storm deaths count in reverse: fewer storm deaths scores higher.</p>
        </CardContent>
      )}
    </Card>
  )
}
