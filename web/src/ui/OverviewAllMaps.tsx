import { ArrowRightIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import type { StatsFile } from '@/data/types'
import { ALL, statsLinkFor } from '@/state/statsUrl'
import { headlineFigures } from '@/stats/figures'
import { MAP_HERO_IMAGE } from '@/stats/images'
import { overviewInsights } from '@/stats/insights'
import { sliceFor } from '@/stats/slices'
import AnalyticsStrip from './AnalyticsStrip'
import FigureCard from './FigureCard'
import InsightCard from './InsightCard'
import MapComparisonCards from './MapComparisonCards'
import MapScorecard from './MapScorecard'
import PageHero from './PageHero'
import ScopeLine from './ScopeLine'

/** The landing page: a cinematic hero over all three maps, the headline KPIs, a comparative card per map, the key
 * insights, a strip of comparison charts and the map scorecard. Nothing here sums or averages across maps. */
export default function OverviewAllMaps({ stats, date }: { stats: StatsFile; date: string }) {
  const [selected, setSelected] = useState(stats.maps[0])
  const slice = sliceFor(stats, ALL, date)
  const insights = overviewInsights(stats, date)
  const reportHref = (map: string) => statsLinkFor(map, date === ALL ? null : date)
  const heroImages = stats.maps.map((map) => MAP_HERO_IMAGE[map]).filter(Boolean)

  return (
    <>
      <PageHero images={heroImages} eyebrow="Game analytics" title="Overview" description="How players play each map, side by side.">
        <ScopeLine stats={stats} slice={slice} map={ALL} date={date} />
      </PageHero>

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-8 lg:px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {headlineFigures(slice).map((figure) => (
            <FigureCard key={figure.id} stats={stats} figure={figure} />
          ))}
        </div>

        <MapComparisonCards stats={stats} date={date} selected={selected} onSelect={setSelected} />

        <section aria-labelledby="key-insights" className="relative flex flex-col gap-3">
          {/* a soft brand glow behind the findings, fading out on every side */}
          <div aria-hidden="true" className="pointer-events-none absolute -inset-x-6 -inset-y-4 -z-10 rounded-3xl bg-brand/10 mask-radial-from-30% mask-radial-to-75%" />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="key-insights" className="text-xl font-semibold">
                Key insights
              </h2>
              <p className="text-sm text-muted-foreground">What the figures suggest, and where to look first.</p>
            </div>
            <Button asChild variant="outline" className="bg-card">
              <Link to={reportHref(selected)}>
                View detailed analysis of {selected}
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>
          {insights.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} href={reportHref(insight.map)} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
              Too few maps have matches on this date to compare them.
            </p>
          )}
        </section>

        <AnalyticsStrip stats={stats} date={date} selected={selected} />

        <MapScorecard stats={stats} date={date} />
      </div>
    </>
  )
}
