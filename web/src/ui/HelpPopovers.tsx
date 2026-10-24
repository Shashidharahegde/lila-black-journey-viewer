import { ExternalLinkIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Kbd } from '@/components/ui/kbd'
import { PopoverDescription, PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { SHORTCUTS } from './shortcuts'

const EDGE_CASES_URL = 'https://github.com/Shashidharahegde/lila-black-journey-viewer/blob/main/EDGE_CASES.md'

/** The keyboard shortcuts, opened from the settings menu or with "?" (the list itself says so). */
export function ShortcutsContent() {
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>Keyboard shortcuts</PopoverTitle>
      </PopoverHeader>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
        {SHORTCUTS.map(({ keys, action }) => (
          <div key={action} className="contents">
            <dt>
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </dt>
            <dd className="text-muted-foreground">{action}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

// The data limits that affect a reading, collected in one place (FRONTEND_GUIDELINES §7).
// Each one is also shown where it matters: tooltips, legend, match card, date list.
const NOTES: { badge?: string; text: string }[] = [
  { text: 'Positions are sampled about every 5 s and joined with straight lines, so a path can cross a wall. No line is drawn across a gap over 30 s.' },
  { text: 'An event’s position is where the file’s owner stood: a kill shows where the killer stood, a death where the victim fell.' },
  { badge: 'Timing uncertain', text: 'A few events were logged after the player’s death; they are kept and flagged.' },
  { badge: 'Numeric ID', text: 'Some journeys have a bot-style ID but player-client events. They are shown as Unknown and counted as neither human nor bot.' },
  { text: 'A Kill and a Killed logged by one player in the same second are both shown; the data can’t tell what caused them.' },
  { badge: 'Partial', text: 'Dates at the edge of the collection window cover less than a full day.' },
  { text: 'Event counts have three scopes: the match card counts events in human files; the legend counts markers on the map, bot events included; the journey card counts one journey.' },
  { text: 'Heatmaps add up all recorded human journeys on a map and date. Traffic is an estimate of observed player time from positions about 5 s apart; a cell with no value means no observed human traffic, not that the area is unreachable. Telemetry covers recorded players only.' },
  { text: 'There is no extraction event, so any extraction view is inferred.' },
]

/** What the recordings can and can't tell you, opened from the settings menu on the map pages. */
export function AboutDataContent() {
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>About this data</PopoverTitle>
        <PopoverDescription>What the recordings can and can’t tell you.</PopoverDescription>
      </PopoverHeader>
      <ul className="flex list-disc flex-col gap-2 pl-4">
        {NOTES.map(({ badge, text }) => (
          <li key={text}>
            {badge && (
              <Badge variant="outline" className="mr-1.5 align-text-bottom">
                {badge}
              </Badge>
            )}
            {text}
          </li>
        ))}
      </ul>
      <a
        href={EDGE_CASES_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-brand-strong underline-offset-4 hover:underline"
      >
        Every data issue and how it’s handled
        <ExternalLinkIcon className="size-3.5" />
      </a>
    </>
  )
}
