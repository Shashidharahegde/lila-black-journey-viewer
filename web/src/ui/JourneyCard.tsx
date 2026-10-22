import { XIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Stat } from '@/components/stat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { MapInfo, MatchFile } from '@/data/types'
import { ACTOR } from '@/map/encoding'
import { AFTER_DEATH_NOTE, ID_MISMATCH_NOTE, SAMPLING_NOTE, actorInfos, actorStats } from '@/map/journeys'
import { durationLabel } from '@/state/matches'
import { useStore } from '@/state/store'
import ActorAvatar from './ActorAvatar'

// Statistics for the journey whose route (or marker) was clicked, in the map's bottom-right
// corner. Kept until Esc, the close button, a click on empty map or another match.
export default function JourneyCard({ match, map }: { match: MatchFile; map: MapInfo }) {
  const pinned = useStore((s) => s.pinnedActor)
  const pinActor = useStore((s) => s.pinActor)
  const journey = useMemo(() => {
    const actor = match.actors.find((a) => a.id === pinned)
    return actor ? { actor, info: actorInfos(match).get(actor)!, stats: actorStats(actor, map) } : null
  }, [match, map, pinned])

  if (!journey) {
    return (
      <p className="pointer-events-none rounded-md bg-card/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
        Click a route to see its statistics
      </p>
    )
  }
  const { actor, info, stats } = journey
  const isBot = actor.kind === 'bot'

  return (
    <Card size="sm" className="w-72" aria-live="polite">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ActorAvatar kind={actor.kind} />
          {[ACTOR[actor.kind].label, info.tag].filter(Boolean).join(' ')}
          {actor.id_mismatch && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" tabIndex={0}>
                  Numeric ID
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{ID_MISMATCH_NOTE}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <CardDescription className="font-mono text-xs">{actor.id}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="Close journey statistics (Esc)" onClick={() => pinActor(null)}>
            <XIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="font-medium">{stats.end}</p>
        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Kills" value={stats.kills} />
          <Stat label="Deaths" value={stats.deaths} />
          {!isBot && <Stat label="Loot" value={stats.loot} />}
          <Stat label="Recorded" value={<span className="font-mono">{durationLabel(stats.firstT)}–{durationLabel(stats.lastT)}</span>} className="col-span-2" />
          <Stat label="Distance" value={Math.round(stats.distance).toLocaleString()} title="World units along straight lines between samples" />
        </dl>
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          <li>{SAMPLING_NOTE}; distance is in world units and leaves out gaps over 30 s.</li>
          {stats.segments > 1 && <li>{stats.segments} path pieces: no line is drawn across gaps over 30 s.</li>}
          {stats.afterDeath > 0 && (
            <li>
              {stats.afterDeath} {stats.afterDeath === 1 ? 'event' : 'events'} not counted. {AFTER_DEATH_NOTE}.
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
