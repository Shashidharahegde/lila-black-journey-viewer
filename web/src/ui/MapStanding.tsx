import { ArrowUpRightIcon, TrophyIcon, WrenchIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { MEASURES, STANDING_LABEL, rankText, type Assessment, type Standing } from '@/stats/assessment'
import { STAT_ICON, tintOf } from './statIcons'

const STANDING_ICON = { leading: TrophyIcon, middle: ArrowUpRightIcon, improve: WrenchIcon } as const
const STANDING_STYLE: Record<Standing, string> = {
  leading: 'bg-brand-strong text-white border-transparent',
  middle: 'bg-muted text-foreground border-transparent',
  improve: 'bg-transparent text-foreground',
}

/** The reference for the relative score, said once wherever the score is shown. */
export const SCORE_SCALE = '100 = top of the maps on all five measures, 0 = lowest on all five.'

function Measures({ title, parts }: { title: string; parts: string[] }) {
  if (!parts.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="flex flex-wrap gap-1.5">
        {parts.map((part) => {
          const Icon = STAT_ICON[part]
          return (
            <li key={part} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
              {Icon && <Icon className={`size-3.5 ${tintOf(part)}`} aria-hidden="true" />}
              {MEASURES[part]?.label ?? part}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * A map's overall standing against the other maps: the assessment (rank and standing), the relative score with its
 * scale, then the evidence: the measures where it is top and lowest of the maps. No raw values: those are on the KPI
 * tiles, so this only adds where the map ranks.
 */
export default function MapStanding({ assessment: a, href, showName = true }: { assessment: Assessment; href?: string; showName?: boolean }) {
  const Icon = STANDING_ICON[a.standing]
  const percent = Math.round(a.score.value * 100)
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex items-start gap-2 ${showName ? 'justify-between' : ''}`}>
        {!showName ? null : href ? (
          <Link to={href} className="rounded font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            {a.map}
          </Link>
        ) : (
          <span className="font-semibold">{a.map}</span>
        )}
        <Badge variant="outline" className={STANDING_STYLE[a.standing]}>
          <Icon data-icon="inline-start" aria-hidden="true" />
          {STANDING_LABEL[a.standing]}
        </Badge>
      </div>
      <div>
        <p className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold text-brand tabular-nums">{percent}</span>
          <span className="text-sm text-muted-foreground">/100 relative score · {rankText(a)}</span>
        </p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <Measures title="Leads on" parts={a.strengths} />
      <Measures title="Room to improve" parts={a.improve} />
      {!a.strengths.length && !a.improve.length && <p className="text-xs text-muted-foreground">Between the other maps on every measure.</p>}
    </div>
  )
}
