import { InfoIcon, RefreshCwIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { loadStats } from '@/data/load'
import type { StatsFile } from '@/data/types'
import { ALL, parseStatsScope, serializeStatsScope, type StatsScope } from '@/state/statsUrl'
import { currentMapSearch } from '@/state/useUrlSync'
import { plural } from '@/stats/format'
import { shortFingerprint, sliceFor, statsProblem } from '@/stats/slices'
import MapReport from './MapReport'
import OverviewAllMaps from './OverviewAllMaps'
import PrimaryNav from './PrimaryNav'
import { TopBarButton } from './HelpPopovers'

type Loaded = { status: 'loading' } | { status: 'ready'; data: StatsFile } | { status: 'error'; message: string; retry: boolean }

const SEGMENT = 'h-7 px-3 text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm'

function useStatsFile(): [Loaded, () => void] {
  const [state, setState] = useState<Loaded>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    loadStats(controller.signal)
      .then((data) => {
        // a file built for other definitions is refused, never shown with today's labels
        const problem = statsProblem(data)
        setState(problem ? { status: 'error', message: problem, retry: false } : { status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: `Could not load the statistics (${String(error)}).`, retry: true })
      })
    return () => controller.abort()
  }, [attempt])
  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((a) => a + 1)
  }, [])
  return [state, retry]
}

/** The scope lives only in the URL: changes push, corrections replace (spec 10, as on the map). */
function useStatsScope(stats: StatsFile | null): [StatsScope | null, (patch: Partial<StatsScope>) => void] {
  const search = useLocation().search.replace(/^\?/, '')
  const navigate = useNavigate()
  const scope = useMemo(() => (stats ? parseStatsScope(new URLSearchParams(search), stats) : null), [stats, search])
  const canonical = scope ? serializeStatsScope(scope) : null
  useEffect(() => {
    if (canonical !== null && canonical !== search) navigate({ search: `?${canonical}` }, { replace: true })
  }, [canonical, search, navigate])
  const update = useCallback(
    (patch: Partial<StatsScope>) => scope && navigate({ search: `?${serializeStatsScope({ ...scope, ...patch })}` }),
    [scope, navigate],
  )
  return [scope, update]
}

type Update = (patch: Partial<StatsScope>) => void

/** The map filter, in the row under the primary nav: it sets the data context for the whole page. */
function MapControl({ stats, scope, update }: { stats: StatsFile; scope: StatsScope; update: Update }) {
  return (
    <>
      <span className="shrink-0 text-sm text-muted-foreground" aria-hidden="true">
        Map
      </span>
      <ToggleGroup
        type="single"
        aria-label="Map"
        value={scope.map}
        onValueChange={(map) => map && update({ map, section: 'overview' })}
        className="shrink-0 gap-0.5 bg-muted p-0.5"
      >
        {[ALL, ...stats.maps].map((id) => (
          <ToggleGroupItem key={id} value={id} className={SEGMENT}>
            {id === ALL ? 'All maps' : id}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  )
}

/** The date filter, in the primary nav's utilities beside the theme toggle. */
function DateControl({ stats, scope, update }: { stats: StatsFile; scope: StatsScope; update: Update }) {
  const selected = stats.dates.find((d) => d.date === scope.date)
  return (
    <>
      <Select value={scope.date} onValueChange={(date) => update({ date })}>
        <SelectTrigger aria-label="Match start date (UTC)" className="w-36 shrink-0 bg-card">
          <SelectValue>{selected ? <span className="font-mono tabular-nums">{selected.date}</span> : 'All dates'}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectGroup>
            <SelectLabel>Match start date (UTC) · matches on all maps</SelectLabel>
            <SelectItem value={ALL}>All dates</SelectItem>
            {stats.dates.map((d) => (
              <SelectItem key={d.date} value={d.date}>
                <span className="font-mono tabular-nums">{d.date}</span>
                <span className="text-muted-foreground tabular-nums">
                  {plural(stats.slices[ALL][d.date].sample.matches, 'match', 'matches')}
                </span>
                {d.partial && <Badge variant="outline">Partial</Badge>}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}

/** `make data` in a message becomes code. */
function WithCode({ text }: { text: string }) {
  return text.split('`').map((part, i) => (i % 2 ? <code key={i} className="font-mono text-foreground">{part}</code> : part))
}

function AboutStatsPopover({ stats }: { stats: StatsFile | null }) {
  return (
    <Popover>
      <TopBarButton label="About these statistics">
        <InfoIcon />
      </TopBarButton>
      <PopoverContent align="end" className="w-96">
        <PopoverHeader>
          <PopoverTitle>About these statistics</PopoverTitle>
          <PopoverDescription>
            Computed once by the data pipeline (<code className="font-mono">make data</code>); this page only formats them.
          </PopoverDescription>
        </PopoverHeader>
        <ul className="flex list-disc flex-col gap-2 pl-4">
          <li>Human journeys only. Bot and unknown journeys count only towards recorded matches.</li>
          <li>Every map and date combination is computed from its own journeys. Player counts and medians are never added or averaged across maps or dates.</li>
          <li>Players are pseudonyms. Observed in multiple matches means observed repeat activity in this sample, not retention.</li>
          <li>There is no extraction event: a journey without a death has no death recorded.</li>
        </ul>
        {stats && (
          <p className="text-xs text-muted-foreground">
            Statistics version <span className="font-mono">{stats.metrics_version}</span> · data{' '}
            <span className="font-mono">{shortFingerprint(stats)}</span> ({plural(stats.source.files, 'file')})
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** /stats: the all-maps Overview (the landing page) and, with `?map=`, a single map's report. Independent of Explore:
 * a broken stats file never affects the map. */
export default function StatsPage() {
  const [file, retry] = useStatsFile()
  const stats = file.status === 'ready' ? file.data : null
  const [scope, update] = useStatsScope(stats)
  const mapSearch = currentMapSearch()
  const ready = stats && scope

  useEffect(() => {
    const previous = document.title
    document.title = 'Statistics · LILA BLACK Journeys'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <PrimaryNav
        current="overview"
        exploreHref={mapSearch ? `/explore?${mapSearch}` : '/explore'}
        utilities={ready ? <DateControl stats={stats} scope={scope} update={update} /> : file.status === 'error' ? null : <Skeleton className="h-8 w-36 shrink-0" />}
      />
      <header className="flex h-12 shrink-0 items-center gap-3 overflow-x-auto border-b bg-card px-4">
        {ready ? <MapControl stats={stats} scope={scope} update={update} /> : file.status === 'error' ? null : <Skeleton className="h-8 w-96 shrink-0" />}
        <div className="ml-auto shrink-0">
          <AboutStatsPopover stats={stats} />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto bg-background">
        {file.status === 'error' ? (
          <div className="mx-auto max-w-6xl p-4 lg:p-6">
            <Card role="alert">
              <CardHeader>
                <CardTitle>Statistics unavailable</CardTitle>
                <CardDescription>
                  <WithCode text={file.message} /> The map still works.
                </CardDescription>
              </CardHeader>
              {file.retry && (
                <CardContent>
                  <Button variant="outline" onClick={retry}>
                    <RefreshCwIcon data-icon="inline-start" />
                    Try again
                  </Button>
                </CardContent>
              )}
            </Card>
          </div>
        ) : ready ? (
          scope.map === ALL ? (
            <OverviewAllMaps stats={stats} date={scope.date} />
          ) : (
            <MapReport stats={stats} scope={scope} slice={sliceFor(stats, scope.map, scope.date)} update={update} />
          )
        ) : (
          // the loaded layout's footprint: hero, KPI row, two cards
          <div aria-busy="true" aria-label="Loading statistics" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 lg:p-6">
            <Skeleton className="h-56 w-full sm:h-64" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
        )}
      </main>
    </div>
  )
}
