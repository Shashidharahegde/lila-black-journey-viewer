import type { StatsFile, StatsSlice } from '@/data/types'
import { ALL } from '@/state/statsUrl'
import { emptyText, sliceBadges } from '@/stats/slices'
import { count } from '@/stats/terms'
import ReasonBadge from './ReasonBadge'

/** What the page's figures rest on, in one short line ("798 human journeys in 796 matches · 248 players observed · all dates"). Only the
 * "Few matches" warning is shown as a badge; partial days are marked in the date filter instead. */
export default function ScopeLine({ stats, slice, map, date }: { stats: StatsFile; slice: StatsSlice; map: string; date: string }) {
  const few = sliceBadges(stats, slice, date).find((b) => b.label === 'Few matches')
  const { sample } = slice
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <p className="text-sm text-muted-foreground tabular-nums">
        {slice.flags.empty
          ? emptyText(map, date)
          : `${count(sample.human_journeys, 'journey')} in ${count(sample.matches_with_human, 'match')} · ${count(sample.human_players, 'player')} · ${date === ALL ? 'all dates' : date}`}
      </p>
      {few && <ReasonBadge badge={few} className="bg-card/70" />}
    </div>
  )
}
