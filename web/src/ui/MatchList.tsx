import { ArrowDownWideNarrowIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Toggle } from '@/components/ui/toggle'
import type { Index, MatchSummary } from '@/data/types'
import { cn } from '@/lib/utils'
import {
  botsLabel,
  compositionLabel,
  dateLabel,
  durationLabel,
  filterGroups,
  matchCountsLabel,
  pickerGroups,
  playersLabel,
  primaryLabel,
  signalLabels,
  SORTS,
  timeOfDay,
  type MatchSort,
} from '@/state/matches'
import { useStore } from '@/state/store'
import type { Selection } from '@/state/url'
import ActorAvatar from './ActorAvatar'
import { SORT_STYLE } from './sortStyle'

function SortChip({ sort, className, children }: { sort: MatchSort; className?: string; children?: ReactNode }) {
  const { icon: Icon, chip } = SORT_STYLE[sort]
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5', chip, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  )
}

function SortSelect() {
  const matchSort = useStore((s) => s.matchSort)
  const setMatchSort = useStore((s) => s.setMatchSort)
  const order = SORTS.find((s) => s.value === matchSort)?.order ?? 'Largest first'
  return (
    <div className="flex items-center gap-2">
      <Select value={matchSort} onValueChange={(value) => setMatchSort(value as MatchSort)}>
        <SelectTrigger aria-label="Sort matches by" className="h-8 min-w-0 flex-1 bg-card">
          <span className="text-muted-foreground">Sort by</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {SORTS.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              <SortChip sort={value} className="p-1" /> {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* every sort runs from the largest value down, within each day; the icon says so instead of a sentence */}
      <span role="img" aria-label={`${order}, within each day`} title={`${order}, within each day`} className="flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
        <ArrowDownWideNarrowIcon className="size-4" aria-hidden />
      </span>
    </div>
  )
}

interface RowProps {
  /** position in the list as shown (1-based), across the date groups */
  serial: number
  match: MatchSummary
  sort: MatchSort
  selected: boolean
  onPick: () => void
}

function MatchRow({ serial, match: m, sort, selected, onPick }: RowProps) {
  const details = [compositionLabel(m), ...signalLabels(m, sort)].filter(Boolean).join(' · ')
  return (
    <li className="[contain-intrinsic-size:auto_3.75rem] [content-visibility:auto]">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${serial}. ${selected ? 'Selected match' : 'Select match'} ${m.id}. ${playersLabel(m)}. ${matchCountsLabel(m)}. Duration ${durationLabel(m.duration_s)}.`}
        title={`${m.full_id} · ${playersLabel(m)} · ${matchCountsLabel(m)}`}
        onClick={onPick}
        className={cn(
          'grid w-full min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
          selected && 'border-brand/60 bg-brand/10 hover:bg-brand/15',
        )}
      >
        <span aria-hidden className="row-span-2 self-start pt-0.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {serial}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <SortChip sort={sort} className="text-xs font-semibold tabular-nums">
            {primaryLabel(m, sort)}
          </SortChip>
          {/* bots are in only 52 of 796 matches, so the few that have them are marked on the row (S, 2026-10-23) */}
          {m.bots > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-bot/15 py-0.5 pr-1.5 pl-1 text-xs font-medium tabular-nums">
              <ActorAvatar kind="bot" size="sm" />
              {botsLabel(m)}
            </span>
          )}
        </span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {sort === 'recent' ? `${durationLabel(m.duration_s)} long` : timeOfDay(m.start_utc)}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={details || undefined}>
          {details}
        </span>
        <span className="max-w-24 truncate font-mono text-[11px] text-muted-foreground/80" title={m.full_id}>
          {m.id}
        </span>
      </button>
    </li>
  )
}

interface Props {
  index: Index
  selection: Selection
  /** Called after a match has been selected (e.g. close drawer). */
  onPick?: () => void
  /** Focus heading after explicitly opening browser from inspector. */
  focusHeading?: boolean
  /** Optional controlled search, so the sidebar preserves the query when inspecting a match. */
  searchValue?: string
  onSearchChange?: (query: string) => void
  /** Restores browser position after moving from inspector back to the list. */
  restoreScrollTop?: number
  onScrollTopChange?: (top: number) => void
}

/** Adjust the scroll-area viewport rather than scrolling the entire app/page. */
function revealSelectedRow(list: HTMLUListElement) {
  const selected = list.querySelector<HTMLElement>('[aria-pressed="true"]')
  const viewport = list.closest<HTMLElement>('[data-radix-scroll-area-viewport]')
  if (!selected || !viewport) return
  const viewportBounds = viewport.getBoundingClientRect()
  const bounds = selected.getBoundingClientRect()
  if (bounds.top < viewportBounds.top) viewport.scrollTop -= viewportBounds.top - bounds.top + 8
  else if (bounds.bottom > viewportBounds.bottom) viewport.scrollTop += bounds.bottom - viewportBounds.bottom + 8
}

export default function MatchList({
  index, selection, onPick, focusHeading = false, searchValue, onSearchChange,
  restoreScrollTop = 0, onScrollTopChange,
}: Props) {
  const selectMatch = useStore((s) => s.selectMatch)
  const matchSort = useStore((s) => s.matchSort)
  const botsOnly = useStore((s) => s.botsOnly)
  const setBotsOnly = useStore((s) => s.setBotsOnly)
  const [localSearch, setLocalSearch] = useState('')
  const search = searchValue ?? localSearch
  const setSearch = onSearchChange ?? setLocalSearch
  const listRef = useRef<HTMLUListElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusOnMount = useRef(focusHeading)
  const initialPosition = useRef(restoreScrollTop)
  const scrollObserver = useRef(onScrollTopChange)
  const sortedGroups = useMemo(
    () => pickerGroups(index.matches, selection.map, selection.date, matchSort),
    [index.matches, selection.map, selection.date, matchSort],
  )
  const filteredGroups = useMemo(() => filterGroups(sortedGroups, search, botsOnly), [sortedGroups, search, botsOnly])
  const availableCount = sortedGroups.reduce((sum, group) => sum + group.matches.length, 0)
  const shownCount = filteredGroups.reduce((sum, group) => sum + group.matches.length, 0)
  const narrowed = search.trim() !== '' || botsOnly
  // serial numbers follow the list as shown: 1..n across the date groups, renumbered when the search, the filter or the sort changes
  const firstSerial = useMemo(() => {
    let next = 1
    return filteredGroups.map((group) => {
      const first = next
      next += group.matches.length
      return first
    })
  }, [filteredGroups])

  useEffect(() => {
    if (focusOnMount.current) headingRef.current?.focus({ preventScroll: true })
    const list = listRef.current
    const viewport = list?.closest<HTMLElement>('[data-radix-scroll-area-viewport]')
    if (!viewport || !list) return

    if (initialPosition.current > 0) viewport.scrollTop = initialPosition.current
    else revealSelectedRow(list)

    const update = () => scrollObserver.current?.(viewport.scrollTop)
    viewport.addEventListener('scroll', update, { passive: true })
    return () => {
      update()
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  return (
    <section aria-labelledby="match-list-title" className="flex min-h-0 flex-1 flex-col pt-3">
      <div className="flex shrink-0 flex-col gap-2 px-4">
        <div className="flex items-center justify-between gap-2">
          <h2 ref={headingRef} tabIndex={-1} id="match-list-title" className="flex items-baseline gap-1.5 text-base font-semibold outline-none">
            Matches <span className="text-sm font-normal text-muted-foreground tabular-nums">{shownCount}{narrowed ? ` of ${availableCount}` : ''}</span>
          </h2>
          <Toggle
            variant="outline"
            size="sm"
            pressed={botsOnly}
            onPressedChange={setBotsOnly}
            title="Show only matches with bot journeys"
            className="data-[state=on]:border-bot/60 data-[state=on]:bg-bot/15"
          >
            <ActorAvatar kind="bot" size="sm" />
            With bots
          </Toggle>
        </div>
        <div className="relative">
          <SearchIcon aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search matches by ID or start date"
            type="search"
            placeholder="Search match ID or date"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear match search"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <XIcon aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
        <SortSelect />
      </div>
      {shownCount === 0 ? (
        <div role="status" className="flex flex-col gap-2 px-4 pt-4 text-sm text-muted-foreground">
          <p>
            {search
              ? `No match ID or date matches the search${botsOnly ? ' among matches with bots' : ''}.`
              : botsOnly
                ? 'No match with bots on this map for the selected date.'
                : 'No matches on this map for the selected date.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {search && <Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button>}
            {botsOnly && <Button variant="outline" size="sm" onClick={() => setBotsOnly(false)}>Show all matches</Button>}
          </div>
        </div>
      ) : (
        <ScrollArea className="mt-2 min-h-0 flex-1">
          <ul ref={listRef} className="flex flex-col pb-4">
            {filteredGroups.map((group, g) => (
              <li key={group.date}>
                {/* the day stays pinned while its matches scroll, so it is always clear which date a row belongs to */}
                <h3 className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-y bg-muted/90 px-4 py-1.5 backdrop-blur-sm">
                  <span className="text-sm font-semibold">{dateLabel(group.date)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {group.matches.length} {group.matches.length === 1 ? 'match' : 'matches'}
                  </span>
                </h3>
                <ul className="flex flex-col gap-0.5 px-2 py-1.5">
                  {group.matches.map((m, k) => (
                    <MatchRow
                      key={m.id}
                      serial={firstSerial[g] + k}
                      match={m}
                      sort={matchSort}
                      selected={m.id === selection.match}
                      onPick={() => {
                        selectMatch(m.id)
                        onPick?.()
                      }}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </section>
  )
}
