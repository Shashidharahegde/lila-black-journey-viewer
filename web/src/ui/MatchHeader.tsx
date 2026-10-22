import type { MatchSummary } from '../data/types'
import { durationLabel, matchCountsLabel, playersLabel } from '../state/matches'

export default function MatchHeader({ match }: { match: MatchSummary }) {
  return (
    <div className="text-sm">
      <div className="font-medium">
        Match <span className="font-mono">{match.id}</span> · {durationLabel(match.duration_s)}
      </div>
      <div className="text-slate-300">
        {playersLabel(match)} · {matchCountsLabel(match)}
      </div>
      <div className="text-xs text-slate-500">Event counts are from human files only; unknown journeys aren't counted.</div>
    </div>
  )
}
