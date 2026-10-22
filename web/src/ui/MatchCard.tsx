import { Stat } from '@/components/stat'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { MatchSummary } from '@/data/types'
import { SCOPE } from '@/map/journeys'
import { dateLabel, durationLabel, timeOfDay } from '@/state/matches'

/** Compact facts about the selected match. File loading is handled once by SidePanel. */
export default function MatchCard({ match }: { match: MatchSummary }) {
  const c = match.counts
  return (
    <Card size="sm">
      <CardHeader className="gap-1 pb-2">
        <CardTitle className="text-sm">Match overview</CardTitle>
        <CardDescription className="text-xs">
          {dateLabel(match.date)} at <span className="font-mono tabular-nums">{timeOfDay(match.start_utc)} UTC</span>
          {' · '}{durationLabel(match.duration_s)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <section aria-labelledby="journeys-count-title">
          <h3 id="journeys-count-title" className="mb-1 text-xs font-medium">Recorded journeys</h3>
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Humans" value={match.humans} />
            <Stat label="Bots" value={match.bots} />
            {match.unknown > 0 && <Stat label="Unknown" value={match.unknown} />}
          </dl>
        </section>
        <section aria-labelledby="human-events-title">
          <h3 id="human-events-title" className="mb-1 text-xs font-medium">{SCOPE.humanFiles}</h3>
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Kills" value={c.kill} />
            <Stat label="Deaths" value={c.death} />
            <Stat label="Loot" value={c.loot} />
            {c.storm_death > 0 && <Stat label="Storm deaths" value={c.storm_death} />}
            {c.kill_killed_pair > 0 && <Stat label="Kill/Killed pairs" value={c.kill_killed_pair} />}
          </dl>
        </section>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">About these counts</summary>
          <p className="mt-1">{SCOPE.humanFilesNote}</p>
          {c.kill_killed_pair > 0 && (
            <p className="mt-1">The number of kills above excludes the Kill half of each Kill/Killed pair. Pairs are listed separately.</p>
          )}
        </details>
      </CardContent>
    </Card>
  )
}
