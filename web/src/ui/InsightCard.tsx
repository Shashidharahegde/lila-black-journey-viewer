import { ArrowRightIcon, CloudLightningIcon, LightbulbIcon, PackageIcon, TrophyIcon, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Card } from '@/components/ui/card'
import type { Insight } from '@/stats/insights'

// Each finding's icon, tinted with the colour its subject already has elsewhere (brand blue, storm violet, loot gold).
const LOOK: Record<string, { icon: LucideIcon; tint: string }> = {
  map_score: { icon: TrophyIcon, tint: 'text-brand bg-brand/15' },
  storm_death_rate: { icon: CloudLightningIcon, tint: 'text-storm bg-storm/15' },
  loot_rate: { icon: PackageIcon, tint: 'text-loot bg-loot/15' },
}

/** One computed observation (curated, tested, never an invented conclusion), with a link to the map it is about. */
export default function InsightCard({ insight, href }: { insight: Insight; href: string }) {
  const { icon: Icon, tint } = LOOK[insight.id] ?? { icon: LightbulbIcon, tint: 'text-brand bg-brand/15' }
  return (
    <Card className="relative gap-3 bg-gradient-to-br from-card via-card to-brand-tint/60 px-4 py-4">
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tint}`} aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <p className="text-base leading-snug font-semibold">{insight.headline}</p>
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">{insight.detail}</p>
      <Link
        to={href}
        className="mt-auto inline-flex w-fit items-center gap-1 rounded text-sm font-medium text-brand-strong outline-none dark:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Open {insight.map}
        <ArrowRightIcon className="size-3.5" aria-hidden="true" />
      </Link>
    </Card>
  )
}
