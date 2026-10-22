import { InfoIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Index, MatchSummary } from '@/data/types'
import { cn } from '@/lib/utils'
import {
  compositionLabel,
  dateLabel,
  durationLabel,
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
  return (
    <Select value={matchSort} onValueChange={(value) => setMatchSort(value as MatchSort)}>
      <SelectTrigger aria-label="Sort matches by" className="h-8 w-full bg-card">
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
  )
}

function SortNote() {
  const matchSort = useStore((s) => s.matchSort)
  const sort = SORTS.find((s) => s.value === matchSort)
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{sort?.order ?? 'Sorted'} · grouped by UTC date</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="How match counts and sorting work"
            className="rounded-full p-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <InfoIcon className="size-4" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-2 text-xs">
          <p><strong>{sort?.label ?? 'Sort'}:</strong> {sort?.explain}</p>
          <p>Matches are grouped by UTC start date; sorting applies within each day.</p>
          <p>Kill, death and loot totals use human-journey files only. Bot and unknown-journey events are excluded.</p>
          <p>The map can show events from other actors, so its counts may differ.</p>
        </PopoverContent>
      </Popover>
    </div>
  )
}

interface RowProps {
  match: MatchSummary
  sort: MatchSort
  selected: boolean
  onPick: () => void
}

function MatchRow({ match: m, sort, selected, onPick }: RowProps) {
  const details = [compositionLabel(m), ...signalLabels(m, sort)].filter(Boolean).join(' · ')
  return (
    <li className="[contain-intrinsic-size:auto_4.5rem] [content-visibility:auto]">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${selected ? 'Selected match' : 'Select match'} ${m.id}. ${playersLabel(m)}. ${matchCountsLabel(m)}. Duration ${durationLabel(m.duration_s)}.`}
        title={`${m.full_id} · ${playersLabel(m)} · ${matchCountsLabel(m)}`}
        onClick={onPick}
        className={cn(
          'w-full min-w-0 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
          selected && 'border-brand bg-brand/5 ring-1 ring-brand',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <SortChip sort={sort} className="text-xs font-semibold tabular-nums">
            {primaryLabel(m, sort)}
          </SortChip>
          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
            {sort === 'recent' ? `${durationLabel(m.duration_s)} long` : timeOfDay(m.start_utc)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate" title={details}>{details}</span>
          <span className="max-w-[42%] shrink-0 truncate font-mono" title={m.full_id}>{m.id}</span>
        </div>
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
  const filteredGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return sortedGroups
    return sortedGroups
      .map((group) => ({
        ...group,
        matches: group.matches.filter((m) =>
          m.id.toLocaleLowerCase().includes(query) ||
          m.full_id.toLocaleLowerCase().includes(query) ||
          m.date.includes(query),
        ),
      }))
      .filter((group) => group.matches.length > 0)
  }, [sortedGroups, search])
  const availableCount = sortedGroups.reduce((sum, group) => sum + group.matches.length, 0)
  const shownCount = filteredGroups.reduce((sum, group) => sum + group.matches.length, 0)
  const dateInfo = useMemo(() => new Map(index.dates.map((item) => [item.date, item])), [index.dates])
  const { icon: SortIcon, chip } = SORT_STYLE[matchSort]

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
        <h2 ref={headingRef} tabIndex={-1} id="match-list-title" className="flex items-center gap-2 text-base font-semibold outline-none">
          <span className={cn('inline-flex rounded-md p-1', chip)}><SortIcon className="size-4" aria-hidden /></span>
          Matches <span className="font-normal text-muted-foreground tabular-nums">({shownCount}{search ? ` of ${availableCount}` : ''})</span>
        </h2>
        <div className="relative">
          <SearchIcon aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search match IDs"
            type="search"
            placeholder="Search match ID"
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
        <SortNote />
      </div>
      {shownCount === 0 ? (
        <div role="status" className="flex flex-col gap-2 px-4 pt-4 text-sm text-muted-foreground">
          <p>{search ? 'No matching match IDs.' : 'No matches on this map for the selected date.'}</p>
          {search && <Button variant="outline" size="sm" className="self-start" onClick={() => setSearch('')}>Clear search</Button>}
        </div>
      ) : (
        <ScrollArea className="mt-2 min-h-0 flex-1">
          <ul ref={listRef} className="flex flex-col gap-3 px-4 pb-4">
            {filteredGroups.map((group) => {
              const coverage = dateInfo.get(group.date)
              return (
                <li key={group.date}>
                  <h3 className="flex flex-wrap items-center gap-1 px-1 pb-1 text-xs font-medium">
                    {dateLabel(group.date)}
                    <span className="font-normal text-muted-foreground tabular-nums">
                      · {group.matches.length} {group.matches.length === 1 ? 'match' : 'matches'}
                    </span>
                    {coverage?.partial && <span title="The recorded dataset covers only part of this UTC date" className="ml-1 rounded border px-1 text-[10px] text-muted-foreground">Partial coverage</span>}
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {group.matches.map((m) => (
                      <MatchRow
                        key={m.id}
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
              )
            })}
          </ul>
        </ScrollArea>
      )}
    </section>
  )
}
