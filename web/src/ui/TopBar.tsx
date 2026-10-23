import { LinkIcon, MoonIcon, PanelLeftIcon, SunIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { DateInfo, Index } from '@/data/types'
import { useStore } from '@/state/store'
import type { Selection } from '@/state/url'
import { copyLink } from './copyLink'
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

export function ThemeToggle() {
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

const REPO_URL = 'https://github.com/Shashidharahegde/lila-black-journey-viewer'

// lucide-react dropped its brand icons, so the GitHub mark is inline (24×24, currentColor)
function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-icon="inline-start">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.82 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
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
      <Button variant="outline" className="shrink-0" asChild>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          <GithubMark />
          <span className="hidden lg:inline">GitHub</span>
          <span className="sr-only lg:hidden">GitHub (opens in a new tab)</span>
        </a>
      </Button>
      <div className="flex shrink-0 items-center">
        <ThemeToggle />
        <AboutDataPopover />
        <ShortcutsPopover />
      </div>
    </header>
  )
}
