import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { StatsFile, StatsSlice } from '@/data/types'
import { assessmentFor } from '@/stats/assessment'
import { histogramRows } from '@/stats/histogram'
import { distributionOf } from '@/stats/slices'
import ExploreHeatmapsCard from './ExploreHeatmapsCard'
import HistogramChart from './HistogramChart'
import MapStanding, { SCORE_SCALE } from './MapStanding'
import MetricInfo from './MetricInfo'

const JOURNEYS = [{ key: 'value', label: 'Human journeys', color: 'var(--chart-1)' }]

interface Props {
  stats: StatsFile
  map: string
  date: string
  slice: StatsSlice
}

/** A map report's Overview: where the map stands against the others, how long its matches last, and where to look on
 * the map. The KPI tiles above already hold the values, so nothing here repeats them. */
export default function MapOverviewSection({ stats, map, date, slice }: Props) {
  const span = distributionOf(slice, 'journey_span_s')?.histogram
  const standing = assessmentFor(stats, date, map)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Standing
            <MetricInfo metric={stats.metrics.map_score} label="Relative score" />
          </CardTitle>
          <CardDescription>{standing ? SCORE_SCALE : 'No other map has matches on this date to compare with.'}</CardDescription>
        </CardHeader>
        {standing && (
          <CardContent>
            <MapStanding assessment={standing} showName={false} />
          </CardContent>
        )}
      </Card>
      {span && (
        <HistogramChart
          compact
          title="Recorded span"
          metric={stats.metrics.journey_span_s}
          description="Time from a journey’s first to its last record."
          rows={histogramRows(span, 'minutes', false)}
          series={JOURNEYS}
          unit="human journeys"
          xLabel="recorded span"
          xTitle="Recorded span (minutes)"
          yTitle="Human journeys"
        />
      )}
      <div className="lg:col-span-2">
        <ExploreHeatmapsCard map={map} date={date} />
      </div>
    </div>
  )
}
