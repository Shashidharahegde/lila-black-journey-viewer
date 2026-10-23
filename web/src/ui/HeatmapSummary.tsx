import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { DateInfo, HeatmapLayerKey } from '@/data/types'
import { emptyText, layerSummary, lowEvidenceText, pairNote, partialText, type Evidence } from '@/heatmap/evidence'

interface Props {
  layer: HeatmapLayerKey
  evidence: Evidence
  map: string
  date: string | null
  dateInfo: DateInfo | undefined
}

/**
 * One card with the selected layer's numbers: the total and what it counts, then three figures that put it in context (per match or
 * per journey, how many matches it touches). Exceptions only below it: a partial day, Kill/Killed pairs, a thin sample.
 */
export default function HeatmapSummary({ layer, evidence, map, date, dateInfo }: Props) {
  const empty = emptyText(layer, evidence, map, date)
  const notes = [partialText(dateInfo), pairNote(layer, evidence.pairs)].filter(Boolean)

  if (empty) {
    return (
      <section role="status" aria-label="Summary" className="rounded-xl bg-muted/40 p-3 text-sm ring-1 ring-foreground/10">
        <p>{empty.title}</p>
        {empty.hint && <p className="mt-1 text-xs text-muted-foreground">{empty.hint}</p>}
      </section>
    )
  }

  const { lead, figures } = layerSummary(layer, evidence)
  return (
    <section aria-label="Summary" className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl leading-tight font-semibold tabular-nums">{lead.value}</p>
          <p className="text-xs text-muted-foreground">{lead.label}</p>
        </div>
        {evidence.low && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" tabIndex={0} className="shrink-0 border-amber-500/60 text-amber-600 dark:text-amber-400">
                Few matches
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-60">{lowEvidenceText(layer, evidence)}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-2 border-t pt-3">
        {figures.map((figure) => (
          <div key={figure.label} className="flex min-w-0 flex-col-reverse gap-0.5">
            <dt className="text-[11px] leading-tight text-muted-foreground">{figure.label}</dt>
            <dd className="text-sm font-semibold tabular-nums">{figure.value}</dd>
          </div>
        ))}
      </dl>
      {notes.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
    </section>
  )
}
