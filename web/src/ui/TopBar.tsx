import { LinkIcon, PanelLeftIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { DateInfo, Index } from '@/data/types'
import { mapDateCounts } from '@/state/matches'
import { useStore } from '@/state/store'
import type { Selection } from '@/state/url'
import { ContextBar, FILTER_TRIGGER, MapToggle } from './ContextBar'
import { copyLink } from './copyLink'

// Radix Select can't use '' as a value, so "all dates" gets its own token.
const ALL_DATES = 'all'

function utc(iso: string): string {
  return iso.replace('T', ' ').replace('Z', ' UTC')
}

function partialReason(d: DateInfo): string {
  return `Partial day: data observed from ${utc(d.observed_from_utc)} to ${utc(d.observed_to_utc)}`
}

/** The map pages' date filter. Counts are for the selected map, and a date without a match on it can't be picked (it stays shown
 * if it is already selected, e.g. after switching maps). Partial days are marked in its list only. */
function DatePicker({ index, selection }: { index: Index; selection: Selection }) {
  const setDate = useStore((s) => s.setDate)
  const counts = useMemo(() => mapDateCounts(index.matches, selection.map), [index.matches, selection.map])
  return (
    <Select value={selection.date ?? ALL_DATES} onValueChange={(value) => setDate(value === ALL_DATES ? null : value)}>
      <SelectTrigger aria-label="Match start date (UTC)" className={`${FILTER_TRIGGER} w-40`}>
        {/* the trigger shows only the date; counts and labels stay in the list */}
        <SelectValue>{selection.date ? <span className="font-mono tabular-nums">{selection.date}</span> : 'All dates'}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectGroup>
          <SelectLabel>Match start date (UTC) · matches on {selection.map}</SelectLabel>
          <SelectItem value={ALL_DATES}>All dates</SelectItem>
          {index.dates.map((d) => {
            const n = counts.get(d.date) ?? 0
            return (
              <SelectItem key={d.date} value={d.date} disabled={n === 0} title={d.partial ? partialReason(d) : undefined}>
                <span className="font-mono tabular-nums">{d.date}</span>
                <span className="text-muted-foreground tabular-nums">
                  {n} {n === 1 ? 'match' : 'matches'}
</span>
                {d.partial && <Badge variant="outline">Partial</Badge>}
              </SelectItem>
            )
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** Copies the current view's link: the map pages' one action beside the settings menu (the Overview has none, by decision). */
export function CopyLinkButton({ ready }: { ready: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Copy link to this view" onClick={copyLink} disabled={!ready}>
          <LinkIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Copy link to this view</TooltipContent>
    </Tooltip>
  )
}

interface Props {
  index: Index | null
  selection: Selection | null
  /** opens the side panel drawer below 1024 px */
  onOpenPanel: () => void
}

/** Row 2 of the map pages: the map and date filters, shared with the Overview through the nav links. */
export default function TopBar({ index, selection, onOpenPanel }: Props) {
  const setMap = useStore((s) => s.setMap)
  const ready = index && selection

  return (
    <ContextBar label="Map and date">
      <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="Open side panel" onClick={onOpenPanel}>
        <PanelLeftIcon />
      </Button>
      {ready ? (
        <>
          <MapToggle maps={Object.keys(index.maps)} value={selection.map} onChange={setMap} />
          <DatePicker index={index} selection={selection} />
        </>
      ) : (
        // the controls' own footprint, so nothing moves when the index arrives
        <Skeleton className="h-8 w-[32rem] shrink-0" />
      )}
    </ContextBar>
  )
}
