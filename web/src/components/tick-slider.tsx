import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

// Slider with event ticks (FRONTEND_GUIDELINES §6: the timeline is shadcn's Slider; the ticks
// are our own overlay). The ticks sit in a strip just above the track, so they never cover
// the track or the thumb, and dragging and keys stay the Slider's. With `onTickClick` a tick
// is a mouse shortcut that seeks to it; it isn't a tab stop (there can be over a hundred), so
// keyboard users need another way to reach the same times.
const tickVariants = cva(
  "absolute bottom-0 w-0.5 -translate-x-1/2 rounded-full transition-opacity",
  {
    variants: {
      tone: {
        human: "bg-human",
        bot: "bg-bot",
        unknown: "bg-unknown",
        kill: "bg-kill",
        death: "bg-death",
        loot: "bg-loot",
        storm: "bg-storm",
      },
      // shape as well as colour, so tick kinds don't rely on colour alone
      shape: {
        bar: "h-3",
        // a dot on top of the bar
        capped:
          "h-3 before:absolute before:-top-1 before:left-1/2 before:size-1.5 before:-translate-x-1/2 before:rounded-full before:bg-inherit",
        short: "h-1.5",
      },
      dimmed: { true: "opacity-30", false: "" },
    },
    defaultVariants: { shape: "bar", dimmed: false },
  }
)

type Tick = VariantProps<typeof tickVariants> & {
  value: number
  /** Stable key, e.g. the event's index in the match file. */
  id: string
  /** Hover text, e.g. "02:14 · 1 kill". */
  label?: string
}

/** The tick strip; memoised, so moving the thumb (every frame during playback) doesn't redraw a hundred ticks. */
const TickStrip = React.memo(function TickStrip({
  ticks,
  min,
  max,
  onTickClick,
}: {
  ticks: Tick[]
  min: number
  max: number
  onTickClick?: (tick: Tick) => void
}) {
  const span = max - min
  return (
    // inset by half the 12 px thumb: Radix keeps the thumb inside the track, so its centre runs from 6 px to width − 6 px
    <div aria-hidden className="relative mx-1.5 h-4">
      {span > 0 &&
        ticks.map((tick) => {
          const style = { left: `${((tick.value - min) / span) * 100}%` }
          const look = tickVariants({ tone: tick.tone, shape: tick.shape, dimmed: tick.dimmed })
          return onTickClick ? (
            <button
              key={tick.id}
              type="button"
              tabIndex={-1}
              title={tick.label}
              // a wider invisible hit area than the 2 px mark
              className={cn(look, "cursor-pointer after:absolute after:-inset-x-1 after:-inset-y-1 hover:opacity-100")}
              style={style}
              onClick={() => onTickClick(tick)}
            />
          ) : (
            <span key={tick.id} title={tick.label} className={look} style={style} />
          )
        })}
    </div>
  )
})

/** `onTickClick` should be a stable function, or the memoised strip redraws on every render. */
function TickSlider({
  ticks,
  onTickClick,
  min = 0,
  max = 100,
  className,
  ...props
}: React.ComponentProps<typeof Slider> & {
  ticks: Tick[]
  onTickClick?: (tick: Tick) => void
}) {
  return (
    <div data-slot="tick-slider" className={cn("flex flex-col justify-center gap-1", className)}>
      <TickStrip ticks={ticks} min={min} max={max} onTickClick={onTickClick} />
      <Slider min={min} max={max} {...props} />
    </div>
  )
}

export { TickSlider, type Tick }
