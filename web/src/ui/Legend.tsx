import { useId, useMemo, type ReactNode } from 'react'
import { IconBadge } from '@/components/icon-badge'
import { Checkbox } from '@/components/ui/checkbox'
import type { ActorKind, MatchFile } from '@/data/types'
import { cn } from '@/lib/utils'
import { ACTOR, ARROW_ICON, EVENT, EVENT_ORDER, endpointIcon } from '@/map/encoding'
import { SCOPE, layerCounts } from '@/map/journeys'
import { useStore } from '@/state/store'
import type { LayerKey, Selection } from '@/state/url'
import ActorAvatar from './ActorAvatar'

function PathSwatch({ kind }: { kind: ActorKind }) {
  return (
    <span aria-hidden className="flex w-5 items-center">
      <span className={cn(
        'w-full',
        kind === 'human' && 'h-[3px] rounded-full bg-human ring-1 ring-white',
        kind === 'unknown' && 'h-0.5 bg-unknown',
        kind === 'bot' && 'border-t-[1.5px] border-dashed border-bot opacity-60',
      )} />
    </span>
  )
}

interface RowProps {
  symbol: ReactNode
  label: ReactNode
  count?: number
  layer?: LayerKey
  hidden: readonly LayerKey[]
}

function Row({ symbol, label, count, layer, hidden }: RowProps) {
  const toggleLayer = useStore((s) => s.toggleLayer)
  const id = useId()
  const visible = !layer || !hidden.includes(layer)
  return (
    <li className={cn('flex min-h-8 items-center gap-2', !visible && 'text-muted-foreground')}>
      {layer ? (
        <Checkbox
          id={id}
          checked={visible}
          onCheckedChange={() => toggleLayer(layer)}
          aria-label={typeof label === 'string' ? `Show ${label}` : undefined}
        />
      ) : <span aria-hidden className="size-4 shrink-0" />}
      <label htmlFor={layer ? id : undefined} className={cn('flex min-w-0 flex-1 items-center gap-2 text-sm', layer && 'cursor-pointer')}>
        {symbol}
        <span className="min-w-0 flex-1">{label}</span>
        {count !== undefined && (
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground" aria-label={`${count} recorded`}>
            {count}
          </span>
        )}
      </label>
    </li>
  )
}

/**
 * Visibility toggles with the markers drawn now (FRONTEND_GUIDELINES §7): a hidden event type still shows
 * what switching it on would add, but hiding humans or bots takes their events out of the counts.
 */
export default function Legend({ selection, match }: { selection: Selection; match: MatchFile | null }) {
  const { hide } = selection
  const counts = useMemo(() => (match ? layerCounts(match, hide) : null), [match, hide])

  return (
    <section aria-labelledby="legend-title" className="flex flex-col gap-2">
      <h3 id="legend-title" className="font-semibold">{SCOPE.onMap}</h3>
      <h4 className="text-xs font-semibold text-muted-foreground">Journeys</h4>
      <ul>
        <Row layer="humans" hidden={hide} count={counts?.actors.human} label={ACTOR.human.plural} symbol={
          <><ActorAvatar kind="human" size="sm" /><PathSwatch kind="human" /></>
        } />
        <Row layer="bots" hidden={hide} count={counts?.actors.bot} label={ACTOR.bot.plural} symbol={
          <><ActorAvatar kind="bot" size="sm" /><PathSwatch kind="bot" /></>
        } />
        {counts && counts.actors.unknown > 0 && (
          <Row hidden={hide} count={counts?.actors.unknown} label={ACTOR.unknown.plural} symbol={
            <><ActorAvatar kind="unknown" size="sm" /><PathSwatch kind="unknown" /></>
          } />
        )}
      </ul>
      <p className="flex items-center gap-3 pl-6 text-xs text-muted-foreground">
        {(
          [
            [endpointIcon('human', 'start').url, 'Start'],
            [endpointIcon('human', 'end').url, 'End'],
            [ARROW_ICON.url, 'Direction'],
          ] as const
        ).map(([src, label]) => (
          <span key={label} className="flex items-center gap-1">
            <span aria-hidden className="flex size-4 items-center justify-center rounded-sm bg-stage">
              <img src={src} alt="" className="size-3" />
            </span>
            {label}
          </span>
        ))}
      </p>
      <h4 className="text-xs font-semibold text-muted-foreground">Events</h4>
      <ul>
        {EVENT_ORDER.map((type) => (
          <Row
            key={type}
            layer={type}
            hidden={hide}
            count={counts?.events[type]}
            label={
              type === 'kill' && counts && counts.pairKills > 0 ? (
                <>
                  {EVENT[type].label} <span className="text-xs text-muted-foreground">incl. {counts.pairKills} from Kill/Killed pairs</span>
                </>
              ) : (
                EVENT[type].label
              )
            }
            symbol={<IconBadge src={EVENT[type].icon} alt="" tone={EVENT[type].tone} size="sm" />}
          />
        ))}
      </ul>
    </section>
  )
}
