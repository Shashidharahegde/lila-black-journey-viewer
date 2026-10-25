import { Kbd } from '@/components/ui/kbd'
import { PopoverHeader, PopoverTitle } from '@/components/ui/popover'
import { useStore } from '@/state/store'
import { GLOSSARY } from '@/stats/terms'
import { shortcutsFor } from './shortcuts'

export const REPO_URL = 'https://github.com/Shashidharahegde/lila-black-journey-viewer'
export const EDGE_CASES_URL = 'https://github.com/Shashidharahegde/lila-black-journey-viewer/blob/main/docs/reports/EDGE_CASES.md'

/** The keyboard shortcuts of the page shown, opened from the settings menu or with "?" (the list itself says so). */
export function ShortcutsContent() {
  const page = useStore((s) => s.tab)
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>Keyboard shortcuts</PopoverTitle>
      </PopoverHeader>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
        {shortcutsFor(page).map(({ keys, action }) => (
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
export const NOTES: { badge?: string; text: string }[] = [
  { text: 'Positions are sampled about every 5 s and joined with straight lines, so a path can cross a wall. No line is drawn across a gap over 30 s.' },
  { text: 'An event’s position is where the file’s owner stood: a kill shows where the killer stood, a death where the victim fell.' },
  { badge: 'Timing uncertain', text: 'A few events were logged after the player’s death; they are kept and flagged.' },
  { badge: 'Numeric ID', text: 'Some journeys have a bot-style ID but player-client events. They are counted as humans; nothing in the data shows whether a person played them.' },
  { text: 'A Kill and a Killed logged by one player in the same second are both shown; the data can’t tell what caused them.' },
  { badge: 'Partial', text: 'Dates at the edge of the collection window cover less than a full day.' },
  { text: 'Event counts have three scopes: the match card counts events in human files; the legend counts markers on the map, bot events included; the journey card counts one journey.' },
  { text: 'Heatmaps add up all recorded human journeys on a map and date. Traffic is an estimate of observed player time from positions about 5 s apart; a cell with no value means no observed human traffic, not that the area is unreachable. Telemetry covers recorded players only.' },
  { text: 'There is no extraction event, so any extraction view is inferred.' },
]

/** The shared words (stats/terms.ts), so every page's labels can be looked up in one place (UX-01). */
export function Glossary() {
  return (
    <section aria-labelledby="glossary-title" className="flex flex-col gap-1.5">
      <h3 id="glossary-title" className="text-xs font-semibold">Terms</h3>
      <dl className="flex flex-col gap-1.5">
        {GLOSSARY.map(({ term, text }) => (
          <div key={term}>
            <dt className="inline font-medium">{term}: </dt>
            <dd className="inline text-muted-foreground">{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
