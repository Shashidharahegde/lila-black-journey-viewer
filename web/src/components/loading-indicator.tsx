import { LoaderCircleIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

// One loading indicator for the map. It appears only when loading takes longer than `delay`
// (a fast load shows nothing, so nothing flickers), and once shown stays `minVisible` ms so it
// can be read (FRONTEND_GUIDELINES §6 States).
export interface LoadingConfig {
  /** ms of loading before the indicator appears */
  delay: number
  /** ms the indicator stays at least once it has appeared */
  minVisible: number
}

const LOADING: LoadingConfig = { delay: 200, minVisible: 400 }

/** True while `active` has lasted longer than the delay, and for the rest of the minimum time after. */
function useDelayedVisible(active: boolean, config: LoadingConfig = LOADING): boolean {
  const [visible, setVisible] = React.useState(false)
  const shownAt = React.useRef(0)

  React.useEffect(() => {
    if (active) {
      const timer = setTimeout(() => {
        shownAt.current = performance.now()
        setVisible(true)
      }, config.delay)
      return () => clearTimeout(timer)
    }
    if (!visible) return
    const left = config.minVisible - (performance.now() - shownAt.current)
    if (left <= 0) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(false), left)
    return () => clearTimeout(timer)
  }, [active, visible, config.delay, config.minVisible])

  return visible
}

/**
 * A spinner and label centred over the part of the map it covers (`style` places it, e.g. inside the
 * frame the camera uses). Renders nothing until the load has lasted longer than the delay.
 */
function LoadingIndicator({
  active,
  label,
  config,
  className,
  style,
}: {
  active: boolean
  label: React.ReactNode
  config?: LoadingConfig
  className?: string
  style?: React.CSSProperties
}) {
  const visible = useDelayedVisible(active, config)
  if (!visible) return null
  return (
    <div data-slot="loading-indicator" className={cn("pointer-events-none absolute inset-0 grid place-items-center", className)} style={style}>
      <p
        role="status"
        className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white backdrop-blur-sm animate-in fade-in duration-150"
      >
        <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden /> {label}
      </p>
    </div>
  )
}

export { LOADING, LoadingIndicator, useDelayedVisible }
