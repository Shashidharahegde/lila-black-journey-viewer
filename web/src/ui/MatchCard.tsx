import { Stat } from '@/components/stat'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { MatchSummary } from '@/data/types'
import { durationLabel } from '@/state/matches'
import { useStore } from '@/state/store'

function FileStatus() {
  const matchFile = useStore((s) => s.matchFile)
  if (matchFile.status === 'loading') return <span>Loading journeys…</span>
  if (matchFile.status === 'error') return <span className="text-destructive">Could not load this match ({matchFile.message})</span>
  if (matchFile.status === 'ready') return <span>{matchFile.data.actors.length} journeys loaded</span>
  // reserve the line so the card doesn't change height
  return <span>&nbsp;</span>
}

export default function MatchCard({ match }: { match: MatchSummary }) {
  const c = match.counts
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          Match <span className="font-mono">{match.id}</span>
        </CardTitle>
        <CardDescription>
          {match.map} · started <span className="font-mono tabular-nums">{match.date}</span> · lasted{' '}
          <span className="font-mono tabular-nums">{durationLabel(match.duration_s)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Humans" value={match.humans} />
          <Stat label="Bots" value={match.bots} />
          {match.unknown > 0 && <Stat label="Unknown" value={match.unknown} />}
        </dl>
        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Kills" value={c.kill} />
          <Stat label="Deaths" value={c.death} />
          <Stat label="Loot" value={c.loot} />
          {c.storm_death > 0 && <Stat label="Storm deaths" value={c.storm_death} />}
          {c.kill_killed_pair > 0 && <Stat label="Kill/Killed pairs" value={c.kill_killed_pair} />}
        </dl>
        <p className="text-xs text-muted-foreground">
          Event counts are from human files only; unknown journeys aren&apos;t counted.
        </p>
      </CardContent>
      <CardFooter className="border-t py-2 text-xs text-muted-foreground">
        <FileStatus />
      </CardFooter>
    </Card>
  )
}
