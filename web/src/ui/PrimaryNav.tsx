import { CompassIcon, LayoutDashboardIcon, MessageSquareTextIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useStore } from '@/state/store'
import { ThemeToggle } from './TopBar'

interface Props {
  current: 'overview' | 'explore' | 'chat'
  /** where the Overview link goes; defaults to the all-maps page */
  overviewHref?: string
  /** where the Explore link goes; defaults to Explore's own map picker */
  exploreHref?: string
  /** the page's own date filter, shown beside the theme toggle */
  utilities?: ReactNode
  /** false where the page shows the theme toggle itself (Explore keeps it in its side panel, beside the date filter) */
  theme?: boolean
}

const LINK =
  'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
const ACTIVE = 'bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground'

/**
 * Brand on the left, the three destinations in the centre, the page's date filter and the theme on the right; the map
 * filter sits in the row below (it sets the data context). Leaving Explore pauses playback, as leaving the Journeys &
 * Playback tab already did.
 */
export default function PrimaryNav({ current, overviewHref = '/stats', exploreHref = '/explore', utilities, theme = true }: Props) {
  const pause = () => useStore.getState().pause()
  const items = [
    { id: 'overview', to: overviewHref, label: 'Overview', icon: LayoutDashboardIcon },
    { id: 'explore', to: exploreHref, label: 'Explore', icon: CompassIcon },
    { id: 'chat', to: '/chat', label: 'AI Chat', icon: MessageSquareTextIcon },
  ] as const

  return (
    // phones drop the brand and stop centring the links, so nothing overlaps; from md the links sit in the true centre
    <nav aria-label="Primary" className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card px-4 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-3">
      <Link
        to="/stats"
        onClick={pause}
        className="hidden justify-self-start rounded-md text-sm font-bold tracking-wide whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
      >
        LILA BLACK
      </Link>
      <div className="flex items-center gap-1">
        {items.map(({ id, to, label, icon: Icon }) => (
          <Link
            key={id}
            to={to}
            aria-current={current === id ? 'page' : undefined}
            aria-label={label}
            className={`${LINK} ${current === id ? ACTIVE : ''}`}
            onClick={id === 'explore' ? undefined : pause}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        ))}
      </div>
      <div className="flex min-w-0 items-center justify-self-end gap-2">
        {utilities}
        {theme && <ThemeToggle />}
      </div>
    </nav>
  )
}
