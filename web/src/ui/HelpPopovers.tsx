import { ExternalLinkIcon, InfoIcon, KeyboardIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SHORTCUTS, isTypingTarget } from './shortcuts'

const EDGE_CASES_URL = 'https://github.com/Shashidharahegde/lila-black-journey-viewer/blob/main/EDGE_CASES.md'

function TopBarButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={label}>
            {children}
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** "?" opens it from anywhere, as the list itself says. */
export function ShortcutsPopover() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
      event.preventDefault()
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TopBarButton label="Keyboard shortcuts (?)">
        <KeyboardIcon />
      </TopBarButton>
      <PopoverContent align="end" className="w-72">
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
      </PopoverContent>
    </Popover>
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
  { text: 'There is no extraction event, so any extraction view is inferred.' },
]

export function AboutDataPopover() {
  return (
    <Popover>
      <TopBarButton label="About this data">
        <InfoIcon />
      </TopBarButton>
      <PopoverContent align="end" className="w-96">
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
      </PopoverContent>
    </Popover>
  )
}
