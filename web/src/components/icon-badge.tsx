import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// A gameplay icon on a white circle with a 2 px ring in its token colour
// (FRONTEND_GUIDELINES §4). Used where React draws the icon: legend, actor list,
// tooltip headers. The map draws the same badge in deck.gl.
const iconBadgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2",
  {
    variants: {
      tone: {
        human: "ring-human",
        bot: "ring-bot",
        kill: "ring-kill",
        death: "ring-death",
        loot: "ring-loot",
        storm: "ring-storm",
      },
      size: {
        sm: "size-4 p-px",
        default: "size-5 p-0.5",
        lg: "size-8 p-1",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

type IconBadgeProps = Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof iconBadgeVariants> & {
    src: string
    /** Plain-English name ("Death"); empty when a text label sits next to the badge. */
    alt: string
  }

function IconBadge({ className, tone, size, src, alt, ...props }: IconBadgeProps) {
  return (
    <span
      data-slot="icon-badge"
      className={cn(iconBadgeVariants({ tone, size }), className)}
      {...props}
    >
      <img src={src} alt={alt} draggable={false} className="size-full object-contain" />
    </span>
  )
}

export { IconBadge }
