import type { StatsFile, StatsSlice } from '@/data/types'
import { ALL } from '@/state/statsUrl'
import { emptyText, sliceBadges } from '@/stats/slices'
import { formatCount, plural } from '@/stats/format'
import ReasonBadge from './ReasonBadge'

/** What the page's figures rest on, in one short line ("781 matches played by 245 players · all dates"). Only the
 * "Few matches" warning is shown as a badge; partial days are marked in the date filter instead. */
export default function ScopeLine({ stats, slice, map, date }: { stats: StatsFile; slice: StatsSlice; map: string; date: string }) {
  const few = sliceBadges(stats, slice, date).find((b) => b.label === 'Few matches')
  const { sample } = slice
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <p className="text-sm text-muted-foreground tabular-nums">
        {slice.flags.empty
          ? emptyText(map, date)
          : `${formatCount(sample.human_journeys)} matches played by ${plural(sample.human_players, 'player')} · ${date === ALL ? 'all dates' : date}`}
      </p>
      {few && <ReasonBadge badge={few} className="bg-card/70" />}
    </div>
  )
}
