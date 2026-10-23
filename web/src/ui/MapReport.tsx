import { CompassIcon, LayoutDashboardIcon, PackageIcon, SwordsIcon, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { StatsFile, StatsSlice } from '@/data/types'
import { ALL, SECTIONS, SECTION_LABEL, exploreLinkFor, type Section, type StatsScope } from '@/state/statsUrl'
import { headlineFigures } from '@/stats/figures'
import { MAP_HERO_IMAGE } from '@/stats/images'
import CombatSection from './CombatSection'
import EmptySlice from './EmptySlice'
import FigureCard from './FigureCard'
import LootSection from './LootSection'
import MapOverviewSection from './MapOverviewSection'
import PageHero from './PageHero'
import ScopeLine from './ScopeLine'

interface Props {
  stats: StatsFile
  scope: StatsScope
  slice: StatsSlice
  update: (patch: Partial<StatsScope>) => void
}

const SECTION_ICON: Record<Section, LucideIcon> = {
  overview: LayoutDashboardIcon,
  combat: SwordsIcon,
  loot: PackageIcon,
}

const SECTION_INTRO: Record<Section, (map: string) => string> = {
  overview: (map) => `How ${map} ranks against the other maps, and how long matches last.`,
  combat: (map) => `What kills players on ${map}, and when.`,
  loot: (map) => `How soon players on ${map} find loot.`,
}

/** One coherent per-map report: a hero, the six headline KPIs, and a section sidebar
 * (Overview/Combat & survival/Loot), never separate top-level pages. */
export default function MapReport({ stats, scope, slice, update }: Props) {
  const hero = MAP_HERO_IMAGE[scope.map]
  const empty = <EmptySlice map={scope.map} date={scope.date} />
  const body = (section: Section) => {
    if (slice.flags.empty) return empty
    if (section === 'overview') return <MapOverviewSection stats={stats} map={scope.map} date={scope.date} slice={slice} />
    if (section === 'combat') return <CombatSection stats={stats} slice={slice} />
    return <LootSection stats={stats} slice={slice} />
  }

  return (
    <>
      <PageHero
        images={hero ? [hero] : []}
        eyebrow="Map analytics"
        title={scope.map}
        description="Engagement, combat and loot on this map."
        actions={
          <>
            <Button asChild>
              <Link to={exploreLinkFor(scope.map, scope.date === ALL ? null : scope.date)}>
                <CompassIcon data-icon="inline-start" />
                Explore this map
              </Link>
            </Button>
          </>
        }
      >
        <ScopeLine stats={stats} slice={slice} map={scope.map} date={scope.date} />
      </PageHero>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-8 lg:px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {headlineFigures(slice).map((figure) => (
            <FigureCard key={figure.id} stats={stats} figure={figure} />
          ))}
        </div>

        <Tabs
          orientation="vertical"
          value={scope.section}
          onValueChange={(value) => update({ section: value as Section })}
          className="gap-4 lg:flex-row lg:items-start lg:gap-6"
        >
          <TabsList
            aria-label="Report section"
            className="-mx-4 items-stretch overflow-x-auto px-4 lg:sticky lg:top-4 lg:mx-0 lg:w-52 lg:shrink-0 lg:flex-col lg:rounded-xl lg:bg-card lg:p-2 lg:ring-1 lg:ring-foreground/10"
          >
            {SECTIONS.map((section) => {
              const Icon = SECTION_ICON[section]
              return (
                <TabsTrigger
                  key={section}
                  value={section}
                  className="mb-0 h-9 justify-start gap-2.5 rounded-lg border-b-0 px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground lg:h-10"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {SECTION_LABEL[section]}
                </TabsTrigger>
              )
            })}
          </TabsList>
          {SECTIONS.map((section) => (
            <TabsContent key={section} value={section} className="flex min-w-0 flex-1 flex-col gap-4">
              <div>
                <h2 className="text-xl font-semibold">{SECTION_LABEL[section]}</h2>
                <p className="text-sm text-muted-foreground">{SECTION_INTRO[section](scope.map)}</p>
              </div>
              {body(section)}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  )
}
