import { ArrowLeftIcon, RefreshCwIcon } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Fade } from '@/components/fade'
import { Skeleton } from '@/components/ui/skeleton'
import type { Index } from '@/data/types'
import { useStore } from '@/state/store'
import type { Selection } from '@/state/url'
import HeatmapPanel from './HeatmapPanel'
import Legend from './Legend'
import MatchCard from './MatchCard'
import MatchList from './MatchList'

interface Props {
  index: Index | null
  selection: Selection | null
  indexError: string | null
  /** Called after choosing a match, e.g. to close a mobile drawer. */
  onNavigate?: () => void
  /** Optional: provide the existing loader's retry action for a failed match file. */
  onRetryMatch?: (matchId: string) => void
  /** Optional: provide the existing index loader's retry action. */
  onRetryIndex?: () => void
}

/**
 * One navigation surface at a time, with one scroll area per surface:
 * - Browse: searchable match list (map stays as-is).
 * - Inspect: controls + concise selected-match facts.
 * "Browse matches" preserves the match on the map until another is selected.
 */
export default function SidePanel({
  index,
  selection,
  indexError,
  onNavigate,
  onRetryMatch,
  onRetryIndex,
}: Props) {
  const selectMatch = useStore((s) => s.selectMatch)
  const matchFile = useStore((s) => s.matchFile)
  const tab = useStore((s) => s.tab)
  const [browsing, setBrowsing] = useState(false)
  const [matchSearch, setMatchSearch] = useState('')
  const browserScrollTop = useRef(0)
  const focusInspector = useRef(false)
  const inspectorHeading = useRef<HTMLHeadingElement>(null)
  const matchId = selection?.match ?? null

  // External navigation (URL, date/map filters, previous/next) should not leave
  // the sidebar browsing a list for a different selected match.
  useEffect(() => {
    setBrowsing(false)
  }, [matchId, selection?.map, selection?.date])

  // An old search or scroll offset does not make sense on another map/date.
  useEffect(() => {
    setMatchSearch('')
    browserScrollTop.current = 0
  }, [selection?.map, selection?.date])

  useEffect(() => {
    if (focusInspector.current && matchId && !browsing) {
      inspectorHeading.current?.focus()
      focusInspector.current = false
    }
  }, [browsing, matchId])

  if (indexError) {
    return (
      <section role="alert" className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Matches could not be loaded</h2>
        <p className="text-sm text-muted-foreground">The match index is unavailable. Try loading it again.</p>
        <Button variant="outline" size="sm" className="self-start" onClick={onRetryIndex ?? (() => window.location.reload())}>
          <RefreshCwIcon aria-hidden /> Retry
        </Button>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Technical details</summary>
          <p className="mt-2 break-words">{indexError}</p>
        </details>
      </section>
    )
  }

  if (!index) {
    return (
      <div aria-busy="true" aria-label="Loading matches" className="flex flex-col gap-3 p-4">
        <span role="status" className="text-sm text-muted-foreground">Loading matches…</span>
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    )
  }

  if (!selection) {
    return <p role="status" className="p-4 text-sm text-muted-foreground">Restoring your map and match filters…</p>
  }

  // Heatmaps has its own panel; it never shows a match, a path or a marker
  // Each page's panel fades in when the page changes; the panel itself stays mounted, so its search and scroll are kept.
  const reveal = (content: ReactNode) => (
    <Fade fadeKey={tab} className="flex min-h-0 flex-1 flex-col">
      {content}
    </Fade>
  )
  if (tab === 'heatmaps') return reveal(<HeatmapPanel index={index} selection={selection} />)

  const match = matchId ? index.matches.find((m) => m.id === matchId) : undefined
  if (matchId && !match) {
    return (
      <section role="alert" className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Match no longer available</h2>
        <p className="text-sm text-muted-foreground">The selected match could not be found in the current index.</p>
        <Button variant="outline" size="sm" className="self-start" onClick={() => selectMatch(null)}>
          Browse available matches
        </Button>
      </section>
    )
  }

  if (!match || browsing) {
    const list = (
      <MatchList
        index={index}
        selection={selection}
        focusHeading={browsing}
        searchValue={matchSearch}
        onSearchChange={setMatchSearch}
        restoreScrollTop={browserScrollTop.current}
        onScrollTopChange={(top) => { browserScrollTop.current = top }}
        onPick={() => {
          // A closing mobile drawer owns focus restoration; don't focus hidden content.
          focusInspector.current = !onNavigate
          setBrowsing(false)
          onNavigate?.()
        }}
      />
    )
    return reveal(list)
  }

  // A stale response for another match must NEVER be shown as this match's data.
  const loaded = matchFile.status === 'ready' && matchFile.id === match.id ? matchFile.data : null
  const loadingThisMatch = matchFile.status === 'loading' && matchFile.id === match.id
  const errorThisMatch = matchFile.status === 'error' && matchFile.id === match.id

  return reveal(
    <section aria-labelledby="selected-match-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="selected-match-title" ref={inspectorHeading} tabIndex={-1} className="min-w-0 text-base font-semibold outline-none">
            Selected match
          </h2>
          <Button size="sm" variant="outline" onClick={() => setBrowsing(true)}>
            <ArrowLeftIcon aria-hidden /> Browse matches
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={match.full_id}>
            {match.id}
          </span>
          <button
            type="button"
            className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => selectMatch(null)}
          >
            Clear selection
          </button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          <Card size="sm" className="px-3 py-3">
            <Legend selection={selection} match={loaded} />
          </Card>
          {!loaded && (errorThisMatch ? (
            <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-3">
              <p className="text-sm font-medium">Could not load journeys for this match.</p>
              <p className="text-xs text-muted-foreground">{matchFile.message}</p>
              {onRetryMatch && (
                <Button variant="outline" size="sm" onClick={() => onRetryMatch(match.id)}>
                  <RefreshCwIcon aria-hidden /> Retry match data
                </Button>
              )}
            </div>
          ) : (
            <div role="status" aria-live="polite" className="space-y-2 rounded-lg border p-3">
              <p className="text-sm text-muted-foreground">
                {loadingThisMatch ? 'Loading journeys and map layers…' : 'Preparing journey data…'}
              </p>
              <Skeleton className="h-4 w-4/5" />
            </div>
          ))}
          <MatchCard match={match} />
        </div>
      </ScrollArea>
    </section>,
  )
}
