import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { emptyText } from '@/stats/slices'

/** A section whose figures all rest on human journeys, for a selection that has none (spec 10, States). */
export default function EmptySlice({ map, date }: { map: string; date: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{emptyText(map, date)}</CardTitle>
        <CardDescription>Pick another date or map. Map comparison still shows every map at this date.</CardDescription>
      </CardHeader>
    </Card>
  )
}
