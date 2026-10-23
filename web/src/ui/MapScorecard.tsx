import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { StatsFile } from '@/data/types'
import { ALL, statsLinkFor } from '@/state/statsUrl'
import { assessments } from '@/stats/assessment'
import MapStanding, { SCORE_SCALE } from './MapStanding'
import MetricInfo from './MetricInfo'

/** The overall verdict per map: how it ranks against the others and why. The values themselves are on the cards and
 * charts above, so the scorecard only shows standing, relative score and the measures behind it. */
export default function MapScorecard({ stats, date }: { stats: StatsFile; date: string }) {
  const ranked = assessments(stats, date)
  if (ranked.length < 2) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          Map scorecard
          <MetricInfo metric={stats.metrics.map_score} label="Relative score" />
        </CardTitle>
        <CardDescription>
          Ranked on player activity, time in match, kills, loot found and storm survival. {SCORE_SCALE}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3 md:gap-0 md:divide-x">
        {ranked.map((a) => (
          <div key={a.map} className="md:px-5 md:first:pl-0 md:last:pr-0">
            <MapStanding assessment={a} href={statsLinkFor(a.map, date === ALL ? null : date)} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
