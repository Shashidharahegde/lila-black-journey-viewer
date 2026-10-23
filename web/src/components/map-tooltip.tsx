import * as React from "react"

import { cn } from "@/lib/utils"

const OFFSET = 12

// Hover card drawn at the cursor over the map stage (FRONTEND_GUIDELINES §6: map
// tooltips are ours, styled like shadcn's Popover). Position is in px relative to
// the stage, which must be the card's parent and `position: relative`. The card flips to
// the other side of the cursor when it would run off the stage.
//
// The card and stage sizes come from ResizeObserver, which reports them after layout.
// Reading offsetWidth or clientWidth while rendering, as an earlier version did on every
// pointer move, forces a synchronous layout and a second render each time (layout thrashing).
type Size = readonly [number, number]

function MapTooltip({
  x,
  y,
  className,
  style,
  ...props
}: React.ComponentProps<"div"> & { x: number; y: number }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [sizes, setSizes] = React.useState<{ card: Size; stage: Size } | null>(null)

  React.useEffect(() => {
    const card = ref.current
    const stage = card?.parentElement
    if (!card || !stage) return
    const measured = { card: [0, 0] as Size, stage: [0, 0] as Size }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.borderBoxSize?.[0]
        const size: Size = box ? [box.inlineSize, box.blockSize] : [entry.contentRect.width, entry.contentRect.height]
        if (entry.target === card) measured.card = size
        else measured.stage = size
      }
      setSizes((previous) =>
        previous && previous.card[0] === measured.card[0] && previous.card[1] === measured.card[1] && previous.stage[0] === measured.stage[0] && previous.stage[1] === measured.stage[1]
          ? previous
          : { card: measured.card, stage: measured.stage },
      )
    })
    observer.observe(card)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const flipX = !!sizes && x + OFFSET + sizes.card[0] > sizes.stage[0]
  const flipY = !!sizes && y + OFFSET + sizes.card[1] > sizes.stage[1]

  return (
    <div
      ref={ref}
      role="tooltip"
      data-slot="map-tooltip"
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-50 flex max-w-70 flex-col gap-1 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 will-change-transform",
        className
      )}
      style={{
        ...style,
        transform: `translate(${flipX ? `calc(${x - OFFSET}px - 100%)` : `${x + OFFSET}px`}, ${
          flipY ? `calc(${y - OFFSET}px - 100%)` : `${y + OFFSET}px`
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
