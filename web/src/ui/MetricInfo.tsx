import { InfoIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { MetricInfo as Metric } from '@/data/types'

/** The ⓘ next to a figure or chart: its definition, population and limitations, as written in stats.json (spec 10). */
export default function MetricInfo({ metric, label = metric.label, className = '' }: { metric: Metric; label?: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${className}`}
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="flex max-w-[280px] flex-col gap-1 text-left">
        {/* the page's label first; the stored metric name is kept when it differs, so the chat's wording can be matched */}
        <p className="font-medium">{label}</p>
        {label !== metric.label && <p className="opacity-80">Stored as “{metric.label}”.</p>}
        <p>{metric.definition}</p>
        {metric.population && <p>Counted over: {metric.population}.</p>}
        {metric.limitations.length > 0 && (
          <ul className="list-disc pl-4">
            {metric.limitations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
