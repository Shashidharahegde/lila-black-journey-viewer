import { LinkIcon, MoonIcon, PanelLeftIcon, SunIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { DateInfo, Index } from '@/data/types'
import { useStore } from '@/state/store'
import type { Selection } from '@/state/url'
import { AboutDataPopover, ShortcutsPopover } from './HelpPopovers'
import { setTheme, useTheme } from './theme'

// Radix Select can't use '' as a value, so "all dates" gets its own token.
const ALL_DATES = 'all'

function utc(iso: string): string {
  return iso.replace('T', ' ').replace('Z', ' UTC')
}

function partialReason(d: DateInfo): string {
  return `Partial day: data observed from ${utc(d.observed_from_utc)} to ${utc(d.observed_to_utc)}`
}

function MapPicker({ index, selection }: { index: Index; selection: Selection }) {
  const setMap = useStore((s) => s.setMap)
  return (
    <ToggleGroup
      type="single"
      aria-label="Map"
      value={selection.map}
      // a second click on the current map would clear the value; a map is always selected
      onValueChange={(map) => map && setMap(map)}
      className="shrink-0 gap-0.5 bg-muted p-0.5"
    >
      {Object.keys(index.maps).map((id) => (
        <ToggleGroupItem
          key={id}
          value={id}
          className="h-7 px-3 text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
        >
          {id}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function DatePicker({ index, selection }: { index: Index; selection: Selection }) {
  const setDate = useStore((s) => s.setDate)
  const selected = index.dates.find((d) => d.date === selection.date)

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Select
        value={selection.date ?? ALL_DATES}
        onValueChange={(value) => setDate(value === ALL_DATES ? null : value)}
      >
        <SelectTrigger aria-label="Match start date (UTC)" className="w-36 bg-card">
          {/* the trigger shows only the date; counts and labels stay in the list */}
          <SelectValue>
            {selection.date ? <span className="font-mono tabular-nums">{selection.date}</span> : 'All dates'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectGroup>
            <SelectLabel>Match start date (UTC) · matches on all maps</SelectLabel>
            <SelectItem value={ALL_DATES}>All dates</SelectItem>
            {index.dates.map((d) => (
              <SelectItem key={d.date} value={d.date} title={d.partial ? partialReason(d) : undefined}>
                <span className="font-mono tabular-nums">{d.date}</span>
                <span className="text-muted-foreground tabular-nums">
                  {d.matches} {d.matches === 1 ? 'match' : 'matches'}
                </span>
                {d.partial && <Badge variant="outline">Partial</Badge>}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {selected?.partial && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" tabIndex={0}>
              Partial
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{partialReason(selected)}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast.success('Link copied')
  } catch {
    toast.error('Could not copy the link; copy it from the address bar')
  }
}

function ThemeToggle() {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Switch to ${next} theme`} onClick={() => setTheme(next)}>
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Switch to {next} theme</TooltipContent>
    </Tooltip>
  )
}

interface Props {
  index: Index | null
  selection: Selection | null
  /** opens the side panel drawer below 1024 px */
  onOpenPanel: () => void
}

export default function TopBar({ index, selection, onOpenPanel }: Props) {
  const ready = index && selection

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 overflow-x-auto border-b bg-card px-4">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open side panel" onClick={onOpenPanel}>
        <PanelLeftIcon />
      </Button>
      <h1 className="hidden shrink-0 text-xl font-bold md:block">LILA BLACK Journeys</h1>
      {ready ? (
        <>
          <MapPicker index={index} selection={selection} />
          <DatePicker index={index} selection={selection} />
        </>
      ) : (
        // same footprint as the controls, so nothing moves when the index arrives
        <>
          <Skeleton className="h-8 w-80 shrink-0" />
          <Skeleton className="h-8 w-36 shrink-0" />
        </>
      )}
      <Button variant="outline" className="ml-auto shrink-0" onClick={copyLink} disabled={!ready}>
        <LinkIcon data-icon="inline-start" />
        <span className="hidden lg:inline">Copy link</span>
        <span className="sr-only lg:hidden">Copy link</span>
      </Button>
      <div className="flex shrink-0 items-center">
        <ThemeToggle />
        <AboutDataPopover />
        <ShortcutsPopover />
      </div>
    </header>
  )
}
