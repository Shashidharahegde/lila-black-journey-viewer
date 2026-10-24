import { Card } from '@/components/ui/card'
import type { StatsFile } from '@/data/types'
import type { Figure } from '@/stats/figures'
import CountUp from './CountUp'
import MetricInfo from './MetricInfo'
import ReasonBadge from './ReasonBadge'
import { STAT_ICON, tintOf } from './statIcons'

/** One headline figure as a compact tile: the stored value first with its icon, its label (with the definition) under
 * it, then one short line of context. With `place` (the page it sits on), the value counts up the first time it is seen. */
export default function FigureCard({ stats, figure, place }: { stats: StatsFile; figure: Figure; place?: string }) {
  const cut = figure.label.lastIndexOf(' ')
  const head = cut > 0 ? figure.label.slice(0, cut) : ''
  const last = figure.label.slice(cut + 1)
  const Icon = STAT_ICON[figure.id]
  const metric = stats.metrics[figure.id]
  return (
    <Card size="sm" className="gap-0.5 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {place ? (
            <CountUp id={`${place}:${figure.id}`} value={figure.value} className="text-2xl leading-tight font-semibold tabular-nums" />
          ) : (
            <span className="text-2xl leading-tight font-semibold tabular-nums">{figure.value}</span>
          )}
          {figure.fewValues && (
            <ReasonBadge badge={{ label: 'Few values', reason: `Fewer than ${stats.thresholds.few_values} values behind this figure: it may not hold.` }} />
          )}
        </div>
        {Icon && (
          <span className={`grid size-7 shrink-0 place-items-center rounded-md bg-muted ${tintOf(figure.id)}`} aria-hidden="true">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      {/* the ⓘ is glued to the label's last word, so a wrapped label never leaves it alone on a line */}
      <p className="text-xs font-medium text-foreground/80">
        {head && `${head} `}
        <span className="whitespace-nowrap">
          {last}
          {metric && <MetricInfo metric={metric} label={figure.label} className="-my-1 ml-0.5 align-middle" />}
        </span>
      </p>
      {figure.detail && <p className="text-xs text-muted-foreground tabular-nums">{figure.detail}</p>}
    </Card>
  )
}
