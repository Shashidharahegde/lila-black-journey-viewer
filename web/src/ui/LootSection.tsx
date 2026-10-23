import type { StatsFile, StatsSlice } from '@/data/types'
import { lootFigures } from '@/stats/figures'
import { histogramRows } from '@/stats/histogram'
import { distributionOf } from '@/stats/slices'
import FigureCard from './FigureCard'
import HistogramChart from './HistogramChart'

const LOOT_SERIES = [{ key: 'value', label: 'Matches played', color: 'var(--chart-5)' }]

export default function LootSection({ stats, slice }: { stats: StatsFile; slice: StatsSlice }) {
  const firstLoot = distributionOf(slice, 'first_loot_s')?.histogram

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {lootFigures(slice).map((figure) => (
          <FigureCard key={figure.id} stats={stats} figure={figure} />
        ))}
      </div>
      {firstLoot && (
        <HistogramChart
          title={stats.metrics.first_loot_s.label}
          metric={stats.metrics.first_loot_s}
          description="A long wait can point to little loot near where players start. Matches with no loot are left out."
          rows={histogramRows(firstLoot, 'seconds', true)}
          series={LOOT_SERIES}
          unit="matches played"
          xLabel="time to first loot"
          xTitle="Time to first pickup (seconds into the match)"
          yTitle="Matches played"
        />
      )}
    </div>
  )
}
