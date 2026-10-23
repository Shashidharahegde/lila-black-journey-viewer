import type { BreakdownValue, StatsFile, StatsSlice } from '@/data/types'
import { combatFigures } from '@/stats/figures'
import { DEATH_SERIES, histogramRows } from '@/stats/histogram'
import { distributionOf } from '@/stats/slices'
import FigureCard from './FigureCard'
import HistogramChart from './HistogramChart'
import ShareBar from './ShareBar'

export default function CombatSection({ stats, slice }: { stats: StatsFile; slice: StatsSlice }) {
  const deathTimes = distributionOf(slice, 'death_time_s')?.histogram
  const deaths = slice.values.deaths as BreakdownValue | null
  const keys = DEATH_SERIES.map((s) => s.key)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {combatFigures(stats, slice).map((figure) => (
          <FigureCard key={figure.id} stats={stats} figure={figure} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {deaths && (
          <ShareBar
            title="Death causes"
            metric={stats.metrics.deaths}
            description="Share of deaths by cause."
            parts={DEATH_SERIES.map((s) => ({ key: s.key, label: s.label, value: deaths.parts[s.key], color: s.color }))}
            unit="deaths"
          />
        )}
        {deathTimes && (
          <div className="lg:col-span-2">
            <HistogramChart
              compact
              title={stats.metrics.death_time_s.label}
              metric={stats.metrics.death_time_s}
              description="Deaths by match time and cause."
              rows={histogramRows(deathTimes, 'minutes', false, keys)}
              series={DEATH_SERIES}
              unit="deaths"
              xLabel="match time"
              xTitle="Match time (minutes)"
              yTitle="Deaths"
            />
          </div>
        )}
      </div>
    </div>
  )
}
