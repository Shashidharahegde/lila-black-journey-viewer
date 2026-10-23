import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { StatsFile } from '@/data/types'
import { ALL, statsLinkFor } from '@/state/statsUrl'
import { COMPARISON_KPIS, KPIS, STANDING, bestAndWorst, kpiByMap, kpiContext, kpiText, secondaryKpis, type KpiId } from '@/stats/comparison'
import { MAP_CARD_IMAGE } from '@/stats/images'
import { sliceBadges, sliceFor } from '@/stats/slices'
import ReasonBadge from './ReasonBadge'

interface Props {
  stats: StatsFile
  date: string
  /** the highlighted map, which "View detailed analysis" opens */
  selected: string
  onSelect: (map: string) => void
}

/** The three maps side by side, compared on one KPI (matches played by default; the scorecard below carries the overall
 * standing), with the leading map and the one with the most room to improve marked. Clicking a card selects it; its
 * chevron opens that map's report. The map filter doesn't apply here. */
export default function MapComparisonCards({ stats, date, selected, onSelect }: Props) {
  const [kpiId, setKpiId] = useState<KpiId>('journeys')
  const kpi = KPIS[kpiId]
  const ranks = bestAndWorst(kpiByMap(stats, date, kpiId), kpi.higherIsBetter)

  return (
    <section aria-labelledby="map-comparison" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="map-comparison" className="text-xl font-semibold">
            Map comparison
          </h2>
          <p className="text-sm text-muted-foreground">Select a map, or open its report.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Compare on
          <Select value={kpiId} onValueChange={(id) => setKpiId(id as KpiId)}>
            <SelectTrigger aria-label="Comparison metric" className="w-64 bg-card text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {COMPARISON_KPIS.map((id) => (
                <SelectItem key={id} value={id}>
                  {KPIS[id].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {stats.maps.map((map) => {
          const slice = sliceFor(stats, map, date)
          const isSelected = map === selected
          const image = MAP_CARD_IMAGE[map]
          const fewMatches = sliceBadges(stats, slice, date).find((b) => b.label === 'Few matches')
          const rank = ranks?.best === map ? STANDING.best : ranks?.worst === map ? STANDING.worst : null
          const context = kpiContext(slice, kpiId)
          return (
            <div
              key={map}
              className={`relative flex min-h-36 overflow-hidden rounded-xl bg-card ring-1 transition ${
                isSelected ? 'ring-2 ring-brand shadow-[0_0_24px_-6px_var(--brand)]' : 'ring-foreground/10 hover:ring-foreground/25'
              }`}
            >
              {/* the whole card selects; the chevron and badge sit above this button */}
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={`Select ${map}`}
                onClick={() => onSelect(map)}
                className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              />
              {/* the portrait art fills a fixed-width strip (the text sets the card's height) and fades into the card */}
              <div className="pointer-events-none relative w-28 shrink-0 sm:w-32" aria-hidden="true">
                {image ? <img src={image} alt="" className="absolute inset-0 size-full object-cover mask-r-from-55%" /> : <div className="size-full bg-muted" />}
              </div>
              <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1 py-3 pr-3 pl-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{map}</span>
                  <Link
                    to={statsLinkFor(map, date === ALL ? null : date)}
                    aria-label={`Open the ${map} report`}
                    className="pointer-events-auto z-10 -mr-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronRightIcon className="size-4" />
                  </Link>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl leading-tight font-semibold text-brand tabular-nums">{kpiText(slice, kpiId)}</span>
                    {rank && (
                      <Badge variant={rank === STANDING.best ? 'default' : 'outline'} className={rank === STANDING.best ? 'bg-brand-strong' : ''}>
                        {rank}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {kpi.label}
                    {context && ` · ${context}`}
                  </div>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
                  {secondaryKpis(kpiId).map((id) => (
                    <p key={id} className="flex flex-col">
                      <span className="text-sm font-semibold tabular-nums">{kpiText(slice, id)}</span>
                      <span className="text-xs text-muted-foreground">{KPIS[id].short}</span>
                    </p>
                  ))}
                </div>
                {fewMatches && <ReasonBadge badge={fewMatches} className="pointer-events-auto z-10 w-fit" />}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
