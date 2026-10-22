import { useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Index } from '@/data/types'
import { cn } from '@/lib/utils'
import { durationLabel, pickerMatches, playersLabel } from '@/state/matches'
import { useStore } from '@/state/store'
import type { Selection } from '@/state/url'
import ActorAvatar from './ActorAvatar'

/** Avatar + count per actor kind; screen readers get the same words as everywhere else. */
function Players({ match }: { match: Parameters<typeof playersLabel>[0] }) {
  return (
    <span className="flex items-center gap-3 font-medium">
      <span className="sr-only">{playersLabel(match)}</span>
      <span aria-hidden className="flex items-center gap-1.5 tabular-nums">
        <ActorAvatar kind="human" size="sm" />
        {match.humans}
      </span>
      {match.unknown > 0 && (
        <span aria-hidden className="flex items-center gap-1.5 tabular-nums">
          <ActorAvatar kind="unknown" size="sm" />
          {match.unknown}
        </span>
      )}
      <span aria-hidden className="flex items-center gap-1.5 tabular-nums">
        <ActorAvatar kind="bot" size="sm" />
        {match.bots}
      </span>
    </span>
  )
}

interface Props {
  index: Index
  selection: Selection
  /** called after a match is picked, e.g. to close the drawer */
  onPick?: () => void
}

export default function MatchList({ index, selection, onPick }: Props) {
  const selectMatch = useStore((s) => s.selectMatch)
  const matches = useMemo(
    () => pickerMatches(index.matches, selection.map, selection.date),
    [index, selection.map, selection.date],
  )

  return (
    <section aria-labelledby="match-list-title" className="flex min-h-0 flex-1 flex-col pt-4">
      <div className="px-4">
        <h2 id="match-list-title" className="text-base font-semibold">
          Matches <span className="font-normal text-muted-foreground tabular-nums">({matches.length})</span>
        </h2>
        <p className="text-xs text-muted-foreground">Most recorded players first, then longest.</p>
      </div>
      {matches.length === 0 ? (
        <p className="px-4 pt-3 text-muted-foreground">No matches on this map for this date.</p>
      ) : (
        <ScrollArea className="mt-2 min-h-0 flex-1">
          <ul className="flex flex-col gap-1 px-4 pb-4">
            {matches.map((m) => {
              const selected = m.id === selection.match
              return (
                // content-visibility: rows off screen (566 on AmbroseValley) aren't laid out or painted
                <li key={m.id} className="[contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      selectMatch(m.id)
                      onPick?.()
                    }}
                    className={cn(
                      // relative: keeps the sr-only label inside the scrolling list (it stretched the page to 33,000 px)
                      'relative w-full rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:bg-muted',
                      selected && 'border-brand bg-accent hover:bg-accent',
                    )}
                  >
                    <div className="flex justify-between gap-2">
                      <Players match={m} />
                      <span className="font-mono tabular-nums">{durationLabel(m.duration_s)}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{m.id}</span>
                      <span className="font-mono tabular-nums">{m.date}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </ScrollArea>
      )}
    </section>
  )
}
