import {
  ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, BugIcon, CheckIcon, ChevronDownIcon, CircleCheckIcon, DatabaseIcon, ExternalLinkIcon,
  FileStackIcon, FlaskConicalIcon, GitBranchIcon, InfoIcon, LayersIcon, MapPinnedIcon, MonitorCheckIcon, ShieldCheckIcon,
  SwordsIcon, type LucideIcon,
} from 'lucide-react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { Fragment, type MouseEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { MAP_HERO_IMAGE } from '@/stats/images'
import { EDGE_CASES_URL } from './HelpPopovers'
import PageHero from './PageHero'
import PrimaryNav from './PrimaryNav'

/*
 * /how-i-built-this: how the viewer was built (Decisions table, 2026-10-25). Every figure was traced on 2026-10-25 to a
 * file in the repo: docs/evidence/build_report.json (files, rows, flags), web/public/data (matches, journeys, storm
 * deaths, slices, output size), docs/reports/EDGE_CASES.md (30 rows), docs/evidence/frontend_verification (8,011 and 815
 * checks), pipeline/tools/insight_stats.py on the cleaned data (the three insights) and a run of both test suites
 * (130 pipeline + 476 web). Re-check them when the data or the tests change.
 */

const SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'system', label: 'System' },
  { id: 'coordinates', label: 'Coordinates' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'insights', label: 'Insights' },
  { id: 'checks', label: 'Checks' },
  { id: 'references', label: 'References' },
]

const KPIS: { value: string; label: string; detail: string; icon: LucideIcon }[] = [
  { value: '1,243', label: 'Files read', detail: 'One parquet file per player per match', icon: FileStackIcon },
  { value: '796', label: 'Matches', detail: 'On three maps over six days', icon: SwordsIcon },
  { value: '30', label: 'Data issues documented', detail: 'Each with evidence and a rule', icon: BugIcon },
  { value: '606', label: 'Tests passing', detail: '130 pipeline + 476 web, 25 Oct 2026', icon: FlaskConicalIcon },
]

const FLOW: { label: string; value: string; icon: LucideIcon }[] = [
  { label: 'Raw input', value: '1,243 parquet files', icon: DatabaseIcon },
  { label: 'Build', value: 'Python pipeline', icon: GitBranchIcon },
  { label: 'Output', value: 'Static JSON and WebP', icon: LayersIcon },
  { label: 'Interface', value: 'React and deck.gl', icon: MapPinnedIcon },
]

const STAGES = [
  { name: 'Ingest', tag: '1,243 files', detail: 'Reads every parquet file, checks its columns, decodes the event names and skips the one file that appears in two day folders.', output: 'Rows, with every failure and duplicate counted in a build report.', why: 'A file the pipeline can’t read stops the build instead of quietly disappearing.' },
  { name: 'Normalize', tag: 'One clock', detail: 'Reads timestamps as Unix seconds, sorts each journey, removes the three journeys that were logged twice and decides who is a bot from what each file logs.', output: 'One clock per match and an actor type per journey.', why: 'Every page uses the same clock and the same bot rule, so no two pages can disagree.' },
  { name: 'Journeys', tag: 'Paths and events', detail: 'Turns rows into paths and events. Positions after a death are dropped, gaps over 30 s break the path, and unclear events are kept with a flag.', output: 'Path pieces and events, each with the flags that explain it.', why: 'No route is drawn and no cause is claimed that the logs don’t show.' },
  { name: 'Project', tag: 'World → map', detail: 'Converts world x and z into map positions from 0 to 1 with one tested function.', output: 'One set of positions for paths, markers and heatmaps.', why: 'With one conversion, the layers can’t drift apart.' },
  { name: 'Aggregate', tag: '64 × 64 grid', detail: 'Builds grids of time spent, kills and deaths, 16 × 16 hotspot regions, and the statistics for 28 map and date combinations.', output: 'Small, sparse files that are ready to draw.', why: 'The browser reads answers; it never recomputes them.' },
  { name: 'Export', tag: '5 MB output', detail: 'Writes the index, one file per match, the heatmap and hotspot files, and minimaps resized to WebP. Player IDs are hashed and only map positions leave the pipeline.', output: 'About 3.7 MB of JSON and 1.3 MB of minimaps.', why: 'A rebuild gives byte-identical files, and no raw data is published.' },
  { name: 'Render', tag: 'React + deck.gl', detail: 'Loads the index first and a match only when it’s opened, draws every layer in one WebGL space and keeps the view in the URL.', output: 'The Overview, Journeys and Heatmaps pages.', why: 'There is no server to start and no API key to expire.' },
]

const PROBLEMS = [
  { id: 'EC-01', title: 'Timestamps looked like 1970', subtitle: 'Seconds stored as milliseconds', found: 'The time column is typed as milliseconds, which put the whole dataset into a few minutes of January 1970.', decided: 'Read the values as Unix seconds and measure match time from each match’s first event.', evidence: 'Dates now line up with the day folders, and matches last 13–887 s.', status: 'Verified' },
  { id: 'EC-09', title: 'A bot-style ID doesn’t make a bot', subtitle: '17 journeys', found: '17 files with numeric, bot-style IDs log player positions, and 14 of them pick up loot, which no bot file ever does.', decided: 'A journey is a bot only if it logs bot positions. The 17 count as human and keep an id_mismatch flag.', evidence: 'Their events and speeds fit the player client, but nothing proves a person played them. Counting them changes any heatmap total by at most 1.63 %.', status: 'Flagged' },
  { id: 'EC-06, 29', title: 'Identical rows aren’t always duplicates', subtitle: '190 rows removed', found: 'Three journeys were logged twice in full. Elsewhere, several loot pickups share the same second and look identical.', decided: 'Remove only the copied halves of those three journeys (190 rows). Keep same-second pickups and kills.', evidence: 'Tests check that real repeated pickups survive. Whether every repeat is a separate pickup can’t be proven.', status: 'Conservative' },
  { id: 'EC-12', title: 'A kill without a cause', subtitle: '3 Kill and Killed pairs', found: 'Three times, one file logs a Kill and a Killed in the same second at the same spot, with no other player recorded.', decided: 'Keep both events and flag the pair. The Killed counts as a death; the Kill is left out of kill totals.', evidence: 'The same spot is expected, because an event records where the file’s owner stood. The logs can’t say whether the death was self-inflicted.', status: 'No cause claimed' },
  { id: 'EC-14, 16', title: 'Players moving after death', subtitle: '173 positions dropped', found: 'Some journeys log positions after the player died, and some have gaps longer than 30 s.', decided: 'Drop the 173 positions logged after a death, break paths and playback at gaps over 30 s, and keep the 2 late bot kills with a flag.', evidence: 'No path is drawn after a recorded death. Time between samples is still estimated along a straight line.', status: 'Known limit' },
]

const TRADEOFFS = [
  { decision: 'Backend', considered: 'FastAPI and DuckDB on a server', chosen: 'Precomputed static files', why: 'The data is fixed, so every question is known in advance. A server would only add cold starts and ways to fail.', revisit: 'The data becomes live or much larger.' },
  { decision: 'Where parquet is read', considered: 'DuckDB-WASM in the browser', chosen: 'Python pipeline before deploy', why: 'The 1,243 files are read once, reproducibly, instead of on every visit.', revisit: 'Users upload or query their own data.' },
  { decision: 'Coordinate conversion', considered: 'Each layer converts its own', chosen: 'One world → map function', why: 'Paths, markers, playback and heatmaps can’t disagree, whatever the image size.', revisit: 'Never; keep it even if the renderer changes.' },
  { decision: 'Bot detection', considered: 'A numeric ID means bot', chosen: 'What the file logs; mismatches flagged', why: 'The logs contradict the ID rule for 17 journeys, and the flag keeps the choice reversible.', revisit: 'The game logs an actor type.' },
  { decision: 'Playback', considered: 'TripsLayer with a fading trail', chosen: 'Full paths cut at the playback time', why: 'Looks exactly like the static view, is testable without a GPU and is cheap with up to 16 actors.', revisit: 'Matches have far more actors.' },
  { decision: 'Hotspots', considered: 'A resampling stability test', chosen: '≥ 5 matches, ≤ 50 % from one, top 6', why: 'Simple to explain and guards against one-match spikes. It no longer claims stability under resampling.', revisit: 'There is much more data.' },
]

interface Insight {
  id: string
  kicker: string
  title: string
  status: string
  summary: string
  evidence: string
  caveat: string
  action: string
  why: string
  metrics: string
  /** the series colour: the token that encodes the same thing on the map (guidelines §6) */
  tint: string
  bars: { title: string; max: number; rows: { label: string; value: number }[]; caption: string }
  image: { src: string; alt: string }
}

// pipeline/tools/insight_stats.py on the cleaned pipeline output, 2026-10-25 (human journeys only)
const INSIGHTS: Insight[] = [
  {
    id: 'storm', kicker: 'Storm deaths', title: 'Lockdown loses more players to the storm', status: 'Observed · cause unknown',
    summary: 'Lockdown, the small close-quarters map, has about three times AmbroseValley’s share of storm deaths.',
    evidence: '17 of 171 human journeys on Lockdown end in a storm death (9.9 %), against 17 of 568 on AmbroseValley (3.0 %). GrandRift: 5 of 59 (8.5 %, a small sample).',
    caveat: 'A comparison, not a cause: the data can’t tell whether exits, storm timing or player choices are behind it.',
    action: 'Play back Lockdown matches with a storm death and watch the last minutes. Were players heading for an exit and cut off, or staying put?',
    why: 'A storm death feels like losing to the map rather than to an opponent.',
    metrics: 'Storm death rate, journey length, extraction rate.',
    tint: 'bg-storm',
    bars: {
      title: 'Storm deaths, % of human journeys', max: 11,
      rows: [{ label: 'Lockdown', value: 9.9 }, { label: 'GrandRift', value: 8.5 }, { label: 'AmbroseValley', value: 3.0 }],
      caption: 'GrandRift has only 59 human journeys.',
    },
    image: { src: '/case-study/journeys.webp', alt: 'An earlier build of the viewer showing the AmbroseValley deaths heatmap' },
  },
  {
    id: 'endpoints', kicker: 'Where journeys end', title: 'Journeys end in a handful of places', status: 'Inferred · no extraction event',
    summary: 'Journeys without a recorded death finish in very few spots on the map.',
    evidence: 'On a 20 × 20 grid, the six busiest end cells hold 68.3 % of the 252 such journeys on AmbroseValley and 67.6 % of the 74 on Lockdown.',
    caveat: 'With no extraction event, a last position isn’t a confirmed exit, and some short journeys (the shortest is 25 s) may be disconnects.',
    action: 'Compare the end cells with the extraction points on the minimap, and look for deaths clustered on the way to the busiest one.',
    why: 'If everyone takes the same route to the same exit, much of the map goes unused.',
    metrics: 'Route variety, deaths near exits, use of each extraction point.',
    tint: 'bg-chart-1',
    bars: {
      title: 'Journeys without a death ending in the top 6 cells, %', max: 75,
      rows: [{ label: 'AmbroseValley', value: 68.3 }, { label: 'Lockdown', value: 67.6 }],
      caption: 'GrandRift (29 such journeys) is left out as too small a sample.',
    },
    image: { src: '/case-study/hotspots.webp', alt: 'An earlier build of the viewer showing numbered traffic hotspots on AmbroseValley' },
  },
  {
    id: 'coverage', kicker: 'Unused space', title: 'Almost half of Lockdown has no recorded human path', status: 'Observed · sample sizes differ',
    summary: 'Many on-map areas have no recorded human path, most of all on Lockdown.',
    evidence: 'On a 64 × 64 grid, 44.7 % of Lockdown’s on-map cells have no recorded human path, against 19.1 % on AmbroseValley. Cut to Lockdown’s 171 journeys, AmbroseValley still leaves 25.8 % uncrossed (median of 200 random draws).',
    caveat: 'Some on-map cells are walls or roofs, and no recorded path doesn’t mean nobody ever went there.',
    action: 'Open the Lockdown traffic heatmap: are the empty areas playable spaces or blocked geometry?',
    why: 'Unvisited space is level-design work players never see. On a small map, every unused room is lost space for fights.',
    metrics: 'Map coverage, loot pickups by area, where fights happen.',
    tint: 'bg-chart-1',
    bars: {
      title: 'On-map cells with no human path, %', max: 50,
      rows: [{ label: 'Lockdown', value: 44.7 }, { label: 'GrandRift', value: 25.8 }, { label: 'AmbroseValley', value: 19.1 }],
      caption: 'More journeys cover more ground: 171, 59 and 568 human journeys.',
    },
    image: { src: '/case-study/hero-app.webp', alt: 'An earlier build of the viewer showing the AmbroseValley traffic heatmap' },
  },
]

const CHECKS: { value: string; label: string; detail: string; icon: LucideIcon }[] = [
  { value: '606', label: 'Tests passing', detail: '130 pipeline + 476 web, 25 Oct 2026', icon: ShieldCheckIcon },
  { value: '8,011', label: 'Cross-file checks, 0 mismatches', detail: 'Index, statistics, heatmaps, hotspots and match files agree', icon: LayersIcon },
  { value: '815', label: 'Page checks, 0 mismatches', detail: 'Headless Chrome on every map and date', icon: MonitorCheckIcon },
]

// AmbroseValley's calibration (pipeline/src/lila_pipeline/projection.py) and the width of its web image
const AMBROSE = { scale: 900, originX: -370, originZ: -473, imagePx: 4096 }

// titles and authors as published (checked 2026-10-25; the Medium page refused the check, so its title is from its URL)
const REFERENCES = [
  { title: 'Mapping the lessons of psychology to game design', source: 'Jason VandenBerghe, Game Developer, 2013', href: 'https://www.gamedeveloper.com/design/mapping-the-lessons-of-psychology-to-game-design' },
  { title: 'Behavioral Game Design', source: 'John Hopson, Game Developer, 2001', href: 'https://www.gamedeveloper.com/design/behavioral-game-design' },
  { title: 'Unity Analytics Overview', source: 'Unity Manual, version 2020.1', href: 'https://docs.unity3d.com/2020.1/Documentation/Manual/UnityAnalyticsOverview.html' },
  { title: 'A heatmap guide for game level analysis', source: 'Medium', href: 'https://medium.com/@dariarodionovano/a-heatmap-guide-for-game-level-analysis-68cb6a7bcb2b' },
  { title: 'Balance and Flow Maps', source: 'Sean Houghton (guest writer) and Anders Drachen, GameAnalytics blog', href: 'https://www.gameanalytics.com/blog/balance-and-flow-maps' },
]

const LINK = 'inline-flex items-center gap-1 rounded text-sm font-medium text-brand-strong outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring dark:text-brand'

/** Scroll the page's own scroll area to a section; the URL is left alone. */
function jumpTo(id: string) {
  return (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
}

function Section({ id, eyebrow, title, intro, children, className }: { id: string; eyebrow: string; title: string; intro: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('flex scroll-mt-16 flex-col gap-4', className)}>
      <div className="flex max-w-2xl flex-col gap-1">
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{eyebrow}</p>
        <h2 id={`${id}-title`} className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      {children}
    </section>
  )
}

function Tile({ value, label, detail, icon: Icon }: { value: string; label: string; detail: string; icon: LucideIcon }) {
  return (
    <Card className="flex-row items-start gap-3 px-4 py-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      {/* the value reads first; the label stays first in the markup, as a dt must */}
      <div className="flex min-w-0 flex-col">
        <dt className="order-2 text-sm font-medium">{label}</dt>
        <dd className="order-1 text-2xl font-semibold tabular-nums">{value}</dd>
        <dd className="order-3 text-xs text-muted-foreground">{detail}</dd>
      </div>
    </Card>
  )
}

/** The page's section links, marking the section in view. The page has no map or date, so this takes row 2's place. */
function SectionBar({ scroller }: { scroller: RefObject<HTMLElement | null> }) {
  const [active, setActive] = useState(SECTIONS[0].id)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(visible.target.id)
      },
      { root: scroller.current, rootMargin: '-15% 0px -60% 0px', threshold: [0, 0.15, 0.4] },
    )
    for (const { id } of SECTIONS) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [scroller])
  return (
    <div className="sticky top-0 z-10 border-b bg-card/90 backdrop-blur-sm">
      <nav aria-label="Sections" className="mx-auto flex h-12 max-w-6xl items-center gap-1 overflow-x-auto px-4 lg:px-6">
        {SECTIONS.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={active === id ? 'location' : undefined}
            onClick={jumpTo(id)}
            className={cn(
              'flex h-8 shrink-0 items-center rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
              active === id && 'bg-brand-tint text-foreground',
            )}
          >
            {label}
          </a>
        ))}
      </nav>
    </div>
  )
}

function SystemSection() {
  const [selected, setSelected] = useState(3)
  const stage = STAGES[selected]
  return (
    <Section id="system" eyebrow="System design" title="Python prepares the data once; the browser only draws it" intro="A Python pipeline reads the raw files before deploy and writes small JSON and image files. The browser downloads those files and draws them, so the site runs without a database or a server.">
      <Card className="grid grid-cols-2 gap-4 px-4 py-4 md:flex md:flex-row md:items-center md:justify-between">
        {FLOW.map(({ label, value, icon: Icon }, i) => (
          <Fragment key={label}>
            <div className="flex items-center gap-3">
              <Icon className="size-5 shrink-0 text-brand" aria-hidden="true" />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-sm font-medium">{value}</span>
              </div>
            </div>
            {i < FLOW.length - 1 && <ArrowRightIcon className="hidden size-4 shrink-0 text-muted-foreground md:block" aria-hidden="true" />}
          </Fragment>
        ))}
      </Card>
      <p className="text-sm text-muted-foreground">Pick a stage to see what it does.</p>
      <div role="group" aria-label="Pipeline stages" className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-7 lg:overflow-visible">
        {STAGES.map((s, i) => (
          <button
            key={s.name}
            type="button"
            aria-pressed={i === selected}
            onClick={() => setSelected(i)}
            className={cn(
              'flex min-w-32 flex-col items-start gap-1 rounded-lg border bg-card px-3 py-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
              i === selected && 'border-brand bg-brand-tint hover:bg-brand-tint',
            )}
          >
            <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
            <span className="text-sm font-semibold">{s.name}</span>
            <span className="text-xs text-muted-foreground">{s.tag}</span>
          </button>
        ))}
      </div>
      <Card aria-live="polite" className="grid gap-4 px-4 py-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Stage {selected + 1} of {STAGES.length}</p>
          <h3 className="text-base font-semibold">{stage.name}</h3>
          <p className="text-sm">{stage.detail}</p>
        </div>
        <dl className="flex flex-col gap-3 text-sm md:border-l md:pl-4">
          <div><dt className="text-xs text-muted-foreground">Output</dt><dd>{stage.output}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Why it matters</dt><dd>{stage.why}</dd></div>
        </dl>
      </Card>
      <ul className="grid gap-4 md:grid-cols-3">
        {[
          ['Byte-identical rebuilds', 'The same raw files always give the same output.'],
          ['Load on demand', 'The index first; a match file only when it’s opened.'],
          ['One drawing space', 'Map, paths, markers and heatmaps share one coordinate system.'],
        ].map(([title, text]) => (
          <li key={title} className="flex gap-2 text-sm">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
            <span><span className="font-medium">{title}.</span> <span className="text-muted-foreground">{text}</span></span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function MappingSection() {
  // the data README's worked example
  const [x, setX] = useState(-301.45)
  const [z, setZ] = useState(-355.55)
  const [flip, setFlip] = useState(true)
  const u = (x - AMBROSE.originX) / AMBROSE.scale
  const v = (z - AMBROSE.originZ) / AMBROSE.scale
  const row = flip ? 1 - v : v
  const px = u * AMBROSE.imagePx
  const py = row * AMBROSE.imagePx
  return (
    <Section id="coordinates" eyebrow="Coordinates" title="Putting every event in the right place" intro="Game positions are in world units and the minimap is in pixels. A wrong scale or a missing axis flip still draws a plausible map, with every event in the wrong place.">
      <Card className="grid gap-0 overflow-hidden p-0 md:grid-cols-[2fr_3fr]">
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">Try it on AmbroseValley</h3>
            <p className="text-sm text-muted-foreground">Move the sliders to place a world position on the map.</p>
          </div>
          {([['World x', x, setX, AMBROSE.originX], ['World z', z, setZ, AMBROSE.originZ]] as const).map(([label, value, set, min]) => (
            <div key={label} className="flex flex-col gap-2">
              <div className="flex justify-between text-sm"><span>{label}</span><span className="font-mono tabular-nums">{value.toFixed(2)}</span></div>
              <Slider min={min} max={min + AMBROSE.scale} step={0.01} value={[value]} onValueChange={([next]) => set(next)} thumbProps={{ 'aria-label': label }} />
            </div>
          ))}
          <label className="flex items-center justify-between gap-3 border-y py-3 text-sm">
            Flip the image’s y axis
            <Switch checked={flip} onCheckedChange={setFlip} />
          </label>
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-muted px-3 py-2"><dt className="text-xs text-muted-foreground">Map position (u, v)</dt><dd className="font-mono text-sm tabular-nums">{u.toFixed(4)}, {v.toFixed(4)}</dd></div>
            <div className="rounded-md bg-muted px-3 py-2"><dt className="text-xs text-muted-foreground">Pixel on the {AMBROSE.imagePx.toLocaleString('en-US')} px image</dt><dd className="font-mono text-sm tabular-nums">{px.toFixed(0)}, {py.toFixed(0)}</dd></div>
          </dl>
          <p className={cn('flex gap-2 text-sm', flip ? 'text-muted-foreground' : 'text-destructive')}>
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {flip ? 'Correct: image rows count down while world z counts up.' : 'Wrong on purpose: the point is mirrored top to bottom.'}
          </p>
        </div>
        <div className="flex flex-col justify-center gap-2 bg-stage p-4 text-white/70">
          <div className="flex justify-between text-xs">
            <span className="flex items-center gap-2 text-white">
              <span className={cn('size-2 rounded-full', flip ? 'bg-sort-recent' : 'bg-kill')} />
              {flip ? 'Correct projection' : 'Mirrored'}
            </span>
            <span>Schematic, not the real minimap</span>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-md border border-white/15 bg-[linear-gradient(to_right,rgb(255_255_255/0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.06)_1px,transparent_1px)] bg-[size:10%_10%]">
            <svg viewBox="0 0 500 500" aria-hidden="true" className="absolute inset-0 size-full fill-none stroke-white/20 [stroke-linecap:round] [stroke-width:5]">
              <path d="M6 400 Q95 315 120 338 T270 240 T480 122" />
              <path d="M38 115 Q145 152 205 240 T460 440" />
              <path d="M122 14 Q155 145 350 230 T385 485" />
              <path d="M16 260 Q200 285 270 130 T492 96" />
              <circle cx="285" cy="194" r="60" className="fill-white/5" />
              <rect x="192" y="310" width="105" height="56" rx="11" transform="rotate(-20 245 330)" className="fill-white/5" />
            </svg>
            <div className="absolute size-6 -translate-1/2" style={{ left: `${Math.min(100, Math.max(0, u * 100))}%`, top: `${Math.min(100, Math.max(0, row * 100))}%` }}>
              <span className="absolute inset-0 rounded-full border-2 border-brand bg-brand/25 shadow-[0_0_0_6px_rgb(37_137_245/0.2)]" />
              <span className="absolute left-7 -top-3 font-mono text-xs whitespace-nowrap text-white">{px.toFixed(0)}, {py.toFixed(0)}</span>
            </div>
            <span className="absolute top-2 left-2 font-mono text-xs">+z</span>
            <span className="absolute bottom-2 left-2 font-mono text-xs">−z</span>
            <span className="absolute right-2 bottom-2 font-mono text-xs">+x</span>
          </div>
        </div>
      </Card>
      <ol className="grid gap-2 md:grid-cols-3">
        {[
          ['World', ['x, z'], 'Height (y) is ignored'],
          ['Map position', ['u = (x − origin x) / scale', 'v = (z − origin z) / scale'], 'The same for any image size'],
          ['Pixel', ['px = u × width', 'py = (1 − v) × height'], 'Image rows count downwards'],
        ].map(([title, lines, note], i) => (
          <li key={title as string} className="flex flex-col gap-1 rounded-lg border bg-card px-3 py-3">
            <span className="text-xs text-muted-foreground">{i + 1}. {title}</span>
            {(lines as string[]).map((line) => <code key={line} className="font-mono text-sm">{line}</code>)}
            <span className="text-xs text-muted-foreground">{note}</span>
          </li>
        ))}
      </ol>
      <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <figure className="flex flex-col gap-2">
          <img src="/case-study/mapping-comparison.webp" alt="The same AmbroseValley window drawn with the real mapping and with the y flip removed" loading="lazy" className="w-full rounded-lg border bg-stage" />
          <figcaption className="text-xs text-muted-foreground">
            The same AmbroseValley window with the real mapping (left) and with the y flip removed (right). Without the flip, paths land on empty ground.
          </figcaption>
        </figure>
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">Checked four ways</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {[
              'Unit tests on the corners, the centre, the axis directions and the data README’s worked example.',
              'Overlays of the correct mapping and deliberately wrong ones on the real minimaps.',
              'A round trip from the browser’s positions back to world units: at most 0.07 units off, which is the rounding in the JSON.',
              'An independent audit: 99.7–100 % of positions land on map art.',
            ].map((text) => (
              <li key={text} className="flex gap-2"><CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />{text}</li>
            ))}
          </ul>
          <p className="flex gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            These show the mapping is consistent, not that it is exact: there were no surveyed landmarks to compare against.
          </p>
        </div>
      </div>
    </Section>
  )
}

function DecisionsSection() {
  const [open, setOpen] = useState<number | null>(0)
  const toggle = (i: number) => setOpen(open === i ? null : i)
  return (
    <Section id="decisions" eyebrow="Data issues" title="When the data is unclear, the decision is written down" intro="Each issue has evidence, a rule for handling it and an edge-case ID with a test named after it.">
      <TabsPrimitive.Root defaultValue={PROBLEMS[0].id} orientation="vertical" className="grid overflow-hidden rounded-xl border bg-card md:grid-cols-[2fr_3fr]">
        <TabsPrimitive.List aria-label="Data issues" className="flex flex-col gap-1 border-b bg-muted/40 p-2 md:border-r md:border-b-0">
          {PROBLEMS.map((p) => (
            <TabsPrimitive.Trigger
              key={p.id}
              value={p.id}
              className="flex items-start gap-3 rounded-md px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{p.id}</span>
              <span className="flex flex-col">
                <span className="text-sm font-medium">{p.title}</span>
                <span className="text-xs text-muted-foreground">{p.subtitle}</span>
              </span>
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        {PROBLEMS.map((p) => (
          <TabsPrimitive.Content key={p.id} value={p.id} className="flex flex-col gap-4 px-4 py-4 outline-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">{p.title}</h3>
              <Badge variant="outline">{p.status}</Badge>
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">What I found</dt><dd>{p.found}</dd></div>
              <div><dt className="text-xs text-muted-foreground">What I decided</dt><dd>{p.decided}</dd></div>
              <div className="flex gap-2 border-t pt-3 sm:col-span-2">
                <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                <div><dt className="text-xs text-muted-foreground">Evidence and limits</dt><dd>{p.evidence}</dd></div>
              </div>
            </dl>
          </TabsPrimitive.Content>
        ))}
      </TabsPrimitive.Root>

      <div className="mt-4 flex flex-col gap-1">
        <h3 className="text-base font-semibold">What I considered, what I chose and why</h3>
        <p className="text-sm text-muted-foreground">Open a row to see when the choice should be revisited.</p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Decision</th>
              <th scope="col" className="px-3 py-2 font-medium">Considered</th>
              <th scope="col" className="px-3 py-2 font-medium">Chosen</th>
              <th scope="col" className="px-3 py-2 font-medium">Why</th>
              <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Revisit</span></th>
            </tr>
          </thead>
          <tbody>
            {TRADEOFFS.map((t, i) => (
              <Fragment key={t.decision}>
                <tr className={cn('cursor-pointer border-t align-top hover:bg-muted/50', open === i && 'bg-muted/50')} onClick={() => toggle(i)}>
                  <th scope="row" className="px-3 py-3 font-medium">{t.decision}</th>
                  <td className="px-3 py-3 text-muted-foreground">{t.considered}</td>
                  <td className="px-3 py-3"><span className="flex gap-1.5 font-medium"><CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />{t.chosen}</span></td>
                  <td className="px-3 py-3 text-muted-foreground">{t.why}</td>
                  <td className="px-3 py-3">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`When to revisit: ${t.decision}`}
                      aria-expanded={open === i}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggle(i)
                      }}
                    >
                      <ChevronDownIcon className={cn('transition-transform motion-reduce:transition-none', open === i && 'rotate-180')} />
                    </Button>
                  </td>
                </tr>
                {open === i && (
                  <tr className="bg-brand-tint/60">
                    <td colSpan={5} className="px-3 py-2"><span className="font-medium">Revisit when:</span> {t.revisit}</td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Bars({ bars, tint }: { bars: Insight['bars']; tint: string }) {
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm font-medium">{bars.title}</figcaption>
      <dl className="flex flex-col gap-2">
        {bars.rows.map((d) => (
          <div key={d.label} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-sm">
            <dt className="text-muted-foreground">{d.label}</dt>
            <div className="h-3 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
              <div className={cn('h-full rounded-sm', tint)} style={{ width: `${(100 * d.value) / bars.max}%` }} />
            </div>
            <dd className="text-right font-medium tabular-nums">{d.value.toFixed(1)} %</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{bars.caption}</p>
    </figure>
  )
}

function InsightsSection() {
  return (
    <Section id="insights" eyebrow="What the data shows" title="Three patterns for level designers to check" intro="Each one lists the numbers, what to look at next in the viewer, and what the recordings can’t tell you.">
      <p className="flex gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        All three are computed from the cleaned data, human journeys only. They describe what was recorded; none of them proves a cause.
      </p>
      <Tabs defaultValue={INSIGHTS[0].id} className="gap-4">
        <TabsList className="overflow-x-auto border-b">
          {INSIGHTS.map((i) => <TabsTrigger key={i.id} value={i.id}>{i.kicker}</TabsTrigger>)}
        </TabsList>
        {INSIGHTS.map((i) => (
          <TabsContent key={i.id} value={i.id}>
            <Card className="grid gap-6 px-4 py-4 md:grid-cols-2">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Badge variant="outline">{i.status}</Badge>
                  <h3 className="text-base font-semibold">{i.title}</h3>
                  <p className="text-sm text-muted-foreground">{i.summary}</p>
                </div>
                <dl className="flex flex-col gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">What I noticed</dt><dd>{i.evidence}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">What to check next</dt><dd>{i.action}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Why it matters for level design</dt><dd>{i.why}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Metrics it affects</dt><dd>{i.metrics}</dd></div>
                </dl>
              </div>
              <div className="flex flex-col gap-4">
                <Bars bars={i.bars} tint={i.tint} />
                <figure className="flex flex-col gap-2">
                  <img src={i.image.src} alt={i.image.alt} loading="lazy" className="aspect-[1.9] w-full rounded-lg border bg-stage object-cover" />
                  <figcaption className="text-xs text-muted-foreground">An earlier build of the viewer, for illustration; not proof of this pattern.</figcaption>
                </figure>
                <p className="flex gap-2 text-sm text-muted-foreground">
                  <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {i.caveat}
                </p>
              </div>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
      <a href={EDGE_CASES_URL} target="_blank" rel="noreferrer" className={LINK}>
        Every data issue, its evidence and its test
        <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </Section>
  )
}

/** /how-i-built-this: how the viewer was built: the pipeline, the coordinates, the data decisions and what the data shows. */
export default function CaseStudyPage() {
  const scroller = useRef<HTMLElement>(null)

  useEffect(() => {
    const previous = document.title
    document.title = 'How I built this · LILA BLACK Journeys'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <PrimaryNav current={null} />
      {/* the page itself never scrolls (guidelines §8); this area does, with the section bar sticky at its top */}
      <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto bg-background">
        <SectionBar scroller={scroller} />
        <div id="summary" className="scroll-mt-16">
          <PageHero
            images={Object.values(MAP_HERO_IMAGE)}
            eyebrow="How I built this"
            title="How the LILA BLACK viewer was built"
            description="LILA BLACK logged player movement, combat and loot on three maps. This page covers how those logs became the Overview, Journeys and Heatmaps pages, and the assumptions behind them."
            actions={
              <>
                <Button variant="outline" onClick={jumpTo('system')}>
                  Read how it works <ArrowDownIcon aria-hidden="true" />
                </Button>
                <Button asChild>
                  <Link to="/heatmaps">Open Heatmaps <ArrowRightIcon aria-hidden="true" /></Link>
                </Button>
              </>
            }
          >
            <p className="text-xs text-muted-foreground">Everything here describes what was recorded, not every player or every match.</p>
          </PageHero>
        </div>
        <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 pt-4 pb-12 lg:px-6">
          <dl aria-label="The work at a glance" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {KPIS.map((k) => <Tile key={k.label} {...k} />)}
          </dl>
          <SystemSection />
          <MappingSection />
          <DecisionsSection />
          <InsightsSection />
          <Section id="checks" eyebrow="Verification and limits" title="How it was checked" intro="Both test suites were run on 25 Oct 2026. The cross-file and page checks are from the verification run on 24 Oct 2026 (docs/evidence/frontend_verification).">
            <dl className="grid gap-3 md:grid-cols-3">
              {CHECKS.map((c) => <Tile key={c.label} {...c} />)}
            </dl>
          </Section>
          <div className="flex flex-col gap-3 border-t pt-6">
            <p className="max-w-2xl text-sm text-muted-foreground">
              The five issues above are a selection. All 30, with the evidence and the test for each, are in the{' '}
              <a href={EDGE_CASES_URL} target="_blank" rel="noreferrer" className={LINK}>
                edge-case register<span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/heatmaps">Open Heatmaps <ArrowRightIcon aria-hidden="true" /></Link>
              </Button>
              <Button variant="ghost" onClick={() => scroller.current?.scrollTo({ top: 0 })}>
                Back to top <ArrowUpIcon aria-hidden="true" />
              </Button>
            </div>
          </div>
          <section id="references" aria-labelledby="references-title" className="flex scroll-mt-16 flex-col gap-3 border-t pt-6">
            <h2 id="references-title" className="text-base font-semibold">References</h2>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              {REFERENCES.map(({ title, source, href }) => (
                <li key={href}>
                  <a href={href} target="_blank" rel="noreferrer" className={LINK}>
                    {title}
                    <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                  <span className="text-muted-foreground"> · {source}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </div>
  )
}
