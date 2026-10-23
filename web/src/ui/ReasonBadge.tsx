import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SliceBadge } from '@/stats/slices'

/** A data-limit badge whose reason is one Tab or hover away (guidelines §7). */
export default function ReasonBadge({ badge, className }: { badge: SliceBadge; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0} className={className}>
          {badge.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px]">{badge.reason}</TooltipContent>
    </Tooltip>
  )
}
