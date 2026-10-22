// Legend and layer toggles in one card (FRONTEND_GUIDELINES §3, §6): every row shows the same
// symbol the map draws, and its count in this match.
import { useId, type ReactNode } from 'react'
import { IconBadge } from '@/components/icon-badge'
import { Checkbox } from '@/components/ui/checkbox'
import type { ActorKind, MatchFile } from '@/data/types'
import { cn } from '@/lib/utils'
import { ACTOR, EVENT, EVENT_ORDER } from '@/map/encoding'
import { ID_MISMATCH_NOTE, layerCounts } from '@/map/journeys'
import { useStore } from '@/state/store'
import type { LayerKey, Selection } from '@/state/url'
import ActorAvatar from './ActorAvatar'

/** A short stroke drawn like the map draws that actor's path. */
function PathSwatch({ kind }: { kind: ActorKind }) {
  return (
    <span aria-hidden className="flex w-5 items-center">
      <span
        className={cn(
          'w-full',
          kind === 'human' && 'h-[3px] rounded-full bg-human ring-1 ring-white',
          kind === 'unknown' && 'h-0.5 bg-unknown',
          kind === 'bot' && 'border-t-[1.5px] border-dashed border-bot opacity-60',
        )}
      />
    </span>
  )
}

interface RowProps {
  symbol: ReactNode
  label: ReactNode
  count: number
  /** omitted for rows that can't be switched off */
  layer?: LayerKey
  hide: LayerKey[]
  title?: string
}

function Row({ symbol, label, count, layer, hide, title }: RowProps) {
  const toggleLayer = useStore((s) => s.toggleLayer)
  const id = useId()
  const on = !layer || !hide.includes(layer)
  return (
    <li className={cn('flex h-7 items-center gap-2', !on && 'text-muted-foreground')} title={title}>
      {layer ? (
        <Checkbox id={id} checked={on} onCheckedChange={() => toggleLayer(layer)} />
      ) : (
        <span aria-hidden className="size-4" />
      )}
      <label htmlFor={layer ? id : undefined} className={cn('flex flex-1 items-center gap-2', layer && 'cursor-pointer')}>
        {symbol}
        <span className="flex-1">{label}</span>
        <span className="font-mono text-xs tabular-nums">{count}</span>
      </label>
    </li>
  )
}

export default function Legend({ selection, match }: { selection: Selection; match: MatchFile }) {
  const { hide } = selection
  const counts = layerCounts(match, hide)
  // top of the draw order first, so the list reads rare → common
  const events = [...EVENT_ORDER].reverse()

  return (
    <section aria-labelledby="legend-title" className="flex flex-col gap-1">
      <h2 id="legend-title" className="font-semibold">
        On the map
      </h2>
      <ul>
        <Row
          layer="humans"
          hide={hide}
          count={counts.actors.human}
          label={ACTOR.human.plural}
          symbol={
            <>
              <ActorAvatar kind="human" size="sm" />
              <PathSwatch kind="human" />
            </>
          }
        />
        {counts.actors.unknown > 0 && (
          <Row
            hide={hide}
            count={counts.actors.unknown}
            label={ACTOR.unknown.plural}
            title={ID_MISMATCH_NOTE}
            symbol={
              <>
                <ActorAvatar kind="unknown" size="sm" />
                <PathSwatch kind="unknown" />
              </>
            }
          />
        )}
        <Row
          layer="bots"
          hide={hide}
          count={counts.actors.bot}
          label={ACTOR.bot.plural}
          symbol={
            <>
              <ActorAvatar kind="bot" size="sm" />
              <PathSwatch kind="bot" />
            </>
          }
        />
        {events.map((type) => (
          <Row
            key={type}
            layer={type}
            hide={hide}
            count={counts.events[type]}
            label={EVENT[type].label}
            symbol={<IconBadge src={EVENT[type].icon} alt="" tone={EVENT[type].tone} size="sm" />}
          />
        ))}
      </ul>
      <p className="pt-1 text-xs text-muted-foreground">
        Kills show where the killer stood; deaths, where the victim fell. Bot events are smaller and fainter. Positions
        are sampled about every 5 s; no line is drawn across a gap over 30 s.
      </p>
    </section>
  )
}
