import { InfoIcon } from 'lucide-react'
import { Stat } from '@/components/stat'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { MatchFile, MatchSummary } from '@/data/types'
import { BOT_ACTIVITY_NOTE, SCOPE, botCombat } from '@/map/journeys'
import { dateLabel, durationText, timeOfDay } from '@/state/matches'

/**
 * Compact facts about the selected match. File loading is handled once by SidePanel; the bot combat counts come from
 * the loaded match file (they need each event's raw label), so they show a dash until it is ready.
 */
export default function MatchCard({ match, file }: { match: MatchSummary; file: MatchFile | null }) {
  const c = match.counts
  const combat = file ? botCombat(match, file) : null
  const pending = <span aria-label="loading">–</span>
  return (
    <Card size="sm">
      <CardHeader className="gap-1 pb-2">
        <CardTitle className="text-sm">Match overview</CardTitle>
        <CardDescription className="text-xs">
          {dateLabel(match.date)} at <span className="font-mono tabular-nums">{timeOfDay(match.start_utc)} UTC</span>
          {' · '}{durationText(match.duration_s)} long
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <section aria-labelledby="journeys-count-title">
          <h3 id="journeys-count-title" className="mb-1 text-xs font-medium">Recorded journeys</h3>
          {/* items-end keeps the numbers on one line when the longer label wraps */}
          <dl className="grid grid-cols-3 items-end gap-2">
            <Stat label="Humans" value={match.humans} />
            <Stat label="Recorded bot journeys" value={match.bots} />
            {match.unknown > 0 && <Stat label="Unknown" value={match.unknown} />}
          </dl>
          {combat?.withoutBotJourneys && (
            <p role="note" className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
              <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {BOT_ACTIVITY_NOTE}
            </p>
          )}
        </section>
        <section aria-labelledby="human-events-title">
          <h3 id="human-events-title" className="mb-1 text-xs font-medium">{SCOPE.humanFiles}</h3>
          <dl className="grid grid-cols-3 items-end gap-2">
            <Stat label="Bot kills" value={combat ? combat.botKills : pending} />
            <Stat label="Deaths by bots" value={combat ? combat.deathsByBots : pending} />
            <Stat label="Loot" value={c.loot} />
            {c.storm_death > 0 && <Stat label="Storm deaths" value={c.storm_death} />}
            {combat && combat.otherKills > 0 && <Stat label="Other kills" value={combat.otherKills} />}
            {combat && combat.otherDeaths > 0 && <Stat label="Other deaths" value={combat.otherDeaths} />}
            {c.kill_killed_pair > 0 && <Stat label="Kill/Killed pairs" value={c.kill_killed_pair} />}
          </dl>
        </section>
      </CardContent>
    </Card>
  )
}
