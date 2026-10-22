import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { Index } from '@/data/types'
import { useStore } from '@/state/store'
import type { Selection } from '@/state/url'
import Legend from './Legend'
import MatchCard from './MatchCard'
import MatchList from './MatchList'

interface Props {
  index: Index | null
  selection: Selection | null
  indexError: string | null
  /** called after a navigation inside the panel, e.g. to close the drawer */
  onNavigate?: () => void
}

// Overview (no match): the match list. Match: back link, match card, then the legend and layer toggles (FRONTEND_GUIDELINES §3).
export default function SidePanel({ index, selection, indexError, onNavigate }: Props) {
  const selectMatch = useStore((s) => s.selectMatch)
  const matchFile = useStore((s) => s.matchFile)

  if (indexError) {
    return (
      <p role="alert" className="p-4 text-destructive">
        Could not load the match index ({indexError}). Reload the page to try again.
      </p>
    )
  }
  if (!index || !selection) {
    return (
      <div aria-busy className="flex flex-col gap-2 p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="mt-1 h-13 w-full" />
        ))}
      </div>
    )
  }

  const match = selection.match ? index.matches.find((m) => m.id === selection.match) : undefined
  if (!match) return <MatchList index={index} selection={selection} onPick={onNavigate} />
  const loaded = matchFile.status === 'ready' && matchFile.id === match.id ? matchFile.data : null

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-4 p-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start"
          onClick={() => {
            selectMatch(null)
            onNavigate?.()
          }}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Overview
        </Button>
        <MatchCard match={match} />
        {loaded ? (
          <Card size="sm" className="px-3">
            <Legend selection={selection} match={loaded} />
          </Card>
        ) : (
          matchFile.status === 'loading' && <Skeleton className="h-64 w-full" />
        )}
      </div>
    </ScrollArea>
  )
}
