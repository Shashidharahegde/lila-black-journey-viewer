import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStore } from '@/state/store'
import type { Tab } from '@/state/url'

/**
 * The two workspaces. They share the map, the minimap and the map and date filters; each keeps its own state while the other is
 * shown (a match and its playback time on one, the metric and switches on the other).
 */
export default function TabBar() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="shrink-0 border-b bg-card px-4">
      {/* Heatmaps first: it is the tab Explore opens on */}
      <TabsList aria-label="Workspace">
        <TabsTrigger value="heatmaps">Heatmaps</TabsTrigger>
        <TabsTrigger value="journeys">Journeys &amp; Playback</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
