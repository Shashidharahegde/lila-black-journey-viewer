import * as React from "react"

import { cn } from "@/lib/utils"

// Label + number pair for the match card and heatmap sample-size line. Numbers
// use tabular figures so they don't jitter as they change (FRONTEND_GUIDELINES §5).
// Renders a dt/dd group, so place it inside a <dl>.
function Stat({
  label,
  value,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode
  value: React.ReactNode
}) {
  return (
    <div data-slot="stat" className={cn("flex flex-col gap-0.5", className)} {...props}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

export { Stat }
