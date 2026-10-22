import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

// Slider with event ticks drawn over the track (FRONTEND_GUIDELINES §6: the
// timeline is shadcn's Slider; the ticks are our own overlay). Ticks are
// decorative and ignore the pointer, so dragging and keys stay the Slider's.
const tickVariants = cva("absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full", {
  variants: {
    tone: {
      human: "bg-human",
      bot: "bg-bot",
      kill: "bg-kill",
      death: "bg-death",
      loot: "bg-loot",
      storm: "bg-storm",
    },
  },
})

type Tick = VariantProps<typeof tickVariants> & {
  value: number
  /** Stable key, e.g. the event's index in the match file. */
  id: string
}

function TickSlider({
  ticks,
  min = 0,
  max = 100,
  className,
  ...props
}: React.ComponentProps<typeof Slider> & { ticks: Tick[] }) {
  const span = max - min

  return (
    <div data-slot="tick-slider" className={cn("relative flex items-center", className)}>
      <Slider min={min} max={max} {...props} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-0">
        {span > 0 &&
          ticks.map((tick) => (
            <span
              key={tick.id}
              className={tickVariants({ tone: tick.tone })}
              style={{ left: `${((tick.value - min) / span) * 100}%` }}
            />
          ))}
      </div>
    </div>
  )
}

export { TickSlider, type Tick }
