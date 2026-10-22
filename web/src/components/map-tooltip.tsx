import * as React from "react"

import { cn } from "@/lib/utils"

const OFFSET = 12

// Hover card drawn at the cursor over the map stage (FRONTEND_GUIDELINES §6: map
// tooltips are ours, styled like shadcn's Popover). Position is in px relative to
// the stage, which must be `position: relative`. The card flips to the other side
// of the cursor when it would run off the stage.
function MapTooltip({
  x,
  y,
  className,
  style,
  ...props
}: React.ComponentProps<"div"> & { x: number; y: number }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [flip, setFlip] = React.useState({ x: false, y: false })

  React.useLayoutEffect(() => {
    const card = ref.current
    const stage = card?.offsetParent
    if (!card || !stage) return
    setFlip({
      x: x + OFFSET + card.offsetWidth > stage.clientWidth,
      y: y + OFFSET + card.offsetHeight > stage.clientHeight,
    })
  }, [x, y])

  return (
    <div
      ref={ref}
      role="tooltip"
      data-slot="map-tooltip"
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-50 flex max-w-70 flex-col gap-1 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10",
        className
      )}
      style={{
        ...style,
        transform: `translate(${flip.x ? `calc(${x - OFFSET}px - 100%)` : `${x + OFFSET}px`}, ${
          flip.y ? `calc(${y - OFFSET}px - 100%)` : `${y + OFFSET}px`
        })`,
      }}
      {...props}
    />
  )
}

function MapTooltipTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="map-tooltip-title"
      className={cn("flex items-center gap-2 font-medium", className)}
      {...props}
    />
  )
}

function MapTooltipMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="map-tooltip-meta"
      className={cn("font-mono text-xs text-muted-foreground tabular-nums", className)}
      {...props}
    />
  )
}

function MapTooltipNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="map-tooltip-note"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

export { MapTooltip, MapTooltipTitle, MapTooltipMeta, MapTooltipNote }
