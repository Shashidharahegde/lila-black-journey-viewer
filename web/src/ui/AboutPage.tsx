import { ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { loadStats } from '@/data/load'
import type { StatsFile } from '@/data/types'
import { plural } from '@/stats/format'
import { shortFingerprint } from '@/stats/slices'
import { EDGE_CASES_URL, Glossary, NOTES, REPO_URL } from './HelpPopovers'
import PrimaryNav from './PrimaryNav'

const STATS_NOTES = [
  'Human journeys only. Bot journeys count only towards recorded matches.',
  'Every map and date combination is computed from its own journeys. Player counts and medians are never added or averaged across maps or dates.',
  'Players are pseudonyms. Observed in multiple matches means observed repeat activity in this sample, not retention.',
  'There is no extraction event: a journey without a death has no death recorded.',
]

// Choices made where the data or its README left a question open. Each is also a row in EDGE_CASES.md.
const ASSUMPTIONS: { title: string; text: string }[] = [
  {
    title: 'Who is a bot',
    text: 'A journey is a bot when its file logs bot positions, otherwise a human. 17 journeys have a bot-style numeric ID but log player-client events; they are counted as humans and flagged in the data. Nothing proves a person played them.',
  },
  {
    title: 'Match time',
    text: 'Timestamps are Unix seconds. Match time is the time since the earliest recorded event of that match, and a match belongs to the UTC date of that event.',
  },
  {
    title: 'Where an event happened',
    text: 'An event is placed where the file’s owner stood: a kill shows where the killer stood, a death where the victim fell.',
  },
  {
    title: 'Paths and traffic',
    text: 'Positions are sampled about every 5 s and joined with straight lines; no line is drawn across a gap over 30 s. Traffic spreads the time between two samples along the straight line, so it is an estimate of observed player time.',
  },
  {
    title: 'Kill and Killed pairs',
    text: 'Both rows of a same-second pair in one file are kept, but only the Killed counts (as a death). The data can’t tell a self-inflicted death from a trade with an unrecorded player, so no cause is claimed.',
  },
  {
    title: 'After death and duplicates',
    text: 'Positions logged after a player’s death are dropped from paths and playback. A journey logged twice in full keeps its first copy. No other row is removed for looking identical.',
  },
  {
    title: 'Extraction',
    text: 'There is no extraction event. A journey that ends without a death probably extracted, and any view built on that is labelled inferred.',
  },
  {
    title: 'Coverage',
    text: 'The data holds recorded players only. A cell or map with no value means no observed traffic, not that the area is unreachable. Dates at the edge of the collection window cover less than a full day.',
  },
]

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-base font-semibold">{title}</h2>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
      {children}
    </section>
  )
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 self-start text-sm text-brand-strong underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLinkIcon className="size-3.5" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

/** /about: how to read the data and the statistics, the assumptions behind them, and the source code. */
export default function AboutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [stats, setStats] = useState<StatsFile | null>(null)

  useEffect(() => {
    const previous = document.title
    document.title = 'About · LILA BLACK Journeys'
    return () => {
      document.title = previous
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadStats(controller.signal).then(setStats).catch(() => {})
    return () => controller.abort()
  }, [])

  // back to the page the reader came from; opened directly (no earlier page of this app), go to the Overview
  const back = () => (location.key === 'default' ? navigate('/stats') : navigate(-1))

  return (
    <div className="flex h-full flex-col">
      <PrimaryNav current={null} />
      <main className="min-h-0 flex-1 overflow-y-auto bg-background">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 pb-12">
          <div className="flex flex-col gap-3">
            <Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={back}>
              <ArrowLeftIcon aria-hidden /> Back
            </Button>
            <h1 className="text-xl font-semibold">About the data and statistics</h1>
            <p className="text-sm text-muted-foreground">
              What the recordings can and can’t tell you, and the assumptions made to show them.
            </p>
          </div>

          <Section id="terms" title="Terms">
            <Glossary />
          </Section>

          <Section id="data" title="Reading the data">
            <ul className="flex list-disc flex-col gap-2 pl-4 text-sm">
              {NOTES.map(({ badge, text }) => (
                <li key={text}>
                  {badge && <Badge variant="outline" className="mr-1.5 align-text-bottom">{badge}</Badge>}
                  {text}
                </li>
              ))}
            </ul>
          </Section>

          <Section
            id="stats"
            title="Reading the statistics"
            intro="Computed once by the data pipeline (make data); the pages only format them."
          >
            <ul className="flex list-disc flex-col gap-2 pl-4 text-sm">
              {STATS_NOTES.map((text) => <li key={text}>{text}</li>)}
            </ul>
            {stats && (
              <p className="text-xs text-muted-foreground">
                Statistics version <span className="font-mono">{stats.metrics_version}</span> · data{' '}
                <span className="font-mono">{shortFingerprint(stats)}</span> ({plural(stats.source.files, 'file')})
              </p>
            )}
          </Section>

          <Section
            id="assumptions"
            title="Assumptions"
            intro="Where the data or its README left a question open, this is the choice made."
          >
            <dl className="flex flex-col gap-3 text-sm">
              {ASSUMPTIONS.map(({ title, text }) => (
                <div key={title}>
                  <dt className="font-medium">{title}</dt>
                  <dd className="text-muted-foreground">{text}</dd>
                </div>
              ))}
            </dl>
            <ExternalLink href={EDGE_CASES_URL}>Every data issue and how it’s handled</ExternalLink>
          </Section>

          <Section id="source" title="Source code">
            <ExternalLink href={REPO_URL}>github.com/Shashidharahegde/lila-black-journey-viewer</ExternalLink>
          </Section>
        </div>
      </main>
    </div>
  )
}
