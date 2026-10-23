import { ArrowRightIcon, MapPinnedIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ALL, exploreLinkFor } from '@/state/statsUrl'

/** Replaces a "top POIs" list: the data has no named locations, so this points to the heatmaps and hotspot regions in
 * Explore instead of inventing place names. */
export default function ExploreHeatmapsCard({ map, date }: { map: string; date: string }) {
  return (
    <Card size="sm" className="flex-row flex-wrap items-center justify-between gap-3 px-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand" aria-hidden="true">
          <MapPinnedIcon className="size-5" />
        </span>
        <div>
          <p className="font-medium">Where it happens</p>
          <p className="text-sm text-muted-foreground">Traffic, kill and death hotspots for {map}.</p>
        </div>
      </div>
      <Button asChild>
        <Link to={exploreLinkFor(map, date === ALL ? null : date)}>
          Open heatmaps
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </Button>
    </Card>
  )
}
