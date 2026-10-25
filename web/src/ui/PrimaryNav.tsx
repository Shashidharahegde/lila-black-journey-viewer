import { FlameIcon, LayoutDashboardIcon, RouteIcon } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { overviewLinkFor } from '@/state/statsUrl'
import { useStore } from '@/state/store'
import { mapPageHref } from '@/state/useUrlSync'
import AboutButton from './AboutButton'
import CaseStudyButton from './CaseStudyButton'
import SettingsMenu from './SettingsMenu'

export type Destination = 'overview' | 'heatmaps' | 'journeys'

interface Props {
  /** the page shown; null on a page outside the three destinations (About, How I built this) */
  current: Destination | null
  /** the Overview's map ('all' or a map) and date, when the Overview is the page shown; the map pages read theirs from the store */
  overview?: { map: string; date: string }
  /** page-specific actions on the right, after How I built this and About and before the settings menu (Copy link on the map pages) */
  actions?: ReactNode
}

const LINK =
  'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
const ACTIVE = 'bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground'

const ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboardIcon },
  { id: 'journeys', label: 'Journeys', icon: RouteIcon },
  { id: 'heatmaps', label: 'Heatmaps', icon: FlameIcon },
] as const

/**
 * Row 1 on every page: brand on the left, the three destinations in the centre, the secondary actions on the right (S,
 * 2026-10-24). The links carry the map and date between pages, and the map pages' own state (match, playback time, heatmap
 * view) between Heatmaps and Journeys. Leaving Journeys pauses playback.
 */
export default function PrimaryNav({ current, overview, actions }: Props) {
  const navigate = useNavigate()
  // re-render when the state the links carry changes (the playback time is read on click instead, so playing doesn't re-render the nav)
  const selection = useStore((s) => s.selection)
  const overviewMap = useStore((s) => s.overviewMap)
  useStore((s) => `${s.heatmapLayer} ${s.densityOn} ${s.outlinesOn} ${s.heatmapMode}`)

  // from the Overview, the map pages open its map ("All maps": the last map used) and date
  const context = overview ? { map: overview.map === 'all' ? null : overview.map, date: overview.date === 'all' ? null : overview.date } : undefined
  const hrefFor = (id: Destination) =>
    id === 'overview'
      ? overview
        ? overviewLinkFor(context!.date, overview.map)
        : overviewLinkFor(selection?.date ?? null, overviewMap)
      : mapPageHref(id, context)

  const go = (id: Destination) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (id !== current) useStore.getState().pause()
    // a plain click navigates with the link as it is now (the playback time included); modified clicks open the rendered href
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(hrefFor(id))
  }

  return (
    // phones drop the brand and the link labels, so nothing overlaps; from md the links sit in the true centre
    <nav aria-label="Primary" className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card px-4 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-3">
      <Link
        to={hrefFor('overview')}
        onClick={go('overview')}
        className="hidden justify-self-start rounded-md text-sm font-bold tracking-wide whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
      >
        LILA BLACK VISUALIZER
      </Link>
      <div className="flex items-center gap-1">
        {ITEMS.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            to={hrefFor(id)}
            aria-current={current === id ? 'page' : undefined}
            aria-label={label}
            className={`${LINK} ${current === id ? ACTIVE : ''}`}
            onClick={go(id)}
          >
            {/* the icon only stands in for the label on phones */}
            <Icon className="size-4 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        ))} 
      </div>
      <div className="flex min-w-0 items-center justify-self-end gap-1">
        <CaseStudyButton />
        <AboutButton />
        {actions}
        <SettingsMenu shortcuts={current === 'heatmaps' || current === 'journeys'} />
      </div>
    </nav>
  )
}
