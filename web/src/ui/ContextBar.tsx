import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** The filter controls' look: compact, side by side, the same on every page. */
export const FILTER_TRIGGER = 'h-8 shrink-0 gap-1.5 bg-card *:data-[slot=select-value]:flex-1'

/**
 * Row 2 on every page, under the primary nav: the map and date filters (the data context), then that page's own controls.
 * One row, so the visualisation keeps the rest of the height.
 */
export function ContextBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b bg-card px-4">
      {children}
    </div>
  )
}

const SEGMENT = 'h-7 px-3 text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm'
const ALL_LABEL = 'All maps'

// Whether the map toggle last shown had "All maps". Each page draws its own row, so the next page's toggle reads this to
// slide the segment out (Overview → a map page) or in (a map page → Overview) instead of it just appearing or vanishing.
let lastHadAll: boolean | null = null

interface MapToggleProps {
  maps: readonly string[]
  value: string
  onChange: (map: string) => void
  /** the Overview's extra first segment's value; the map pages need one map, so they leave it out */
  all?: string
}

/** The map filter, the same segmented toggle on every page (S, 2026-10-24), with "All maps" first on the Overview only. */
export function MapToggle({ maps, value, onChange, all }: MapToggleProps) {
  const hasAll = all !== undefined
  // decided once, on the first render of this page's toggle
  const [change] = useState(() => (lastHadAll !== null && lastHadAll !== hasAll ? (hasAll ? 'in' : 'out') : null))
  // on a map page, "All maps" stays drawn (disabled) only until it has slid away
  const [leaving, setLeaving] = useState(change === 'out')
  useEffect(() => {
    lastHadAll = hasAll
  }, [hasAll])

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-sm text-muted-foreground" aria-hidden="true">
        Map
      </span>
      <ToggleGroup
        type="single"
        aria-label="Map"
        value={value}
        // a second click on the current map would clear the value; a map is always selected
        onValueChange={(next) => next && next !== ALL_LEAVING && onChange(next)}
        className="shrink-0 gap-0.5 bg-muted p-0.5"
      >
        {(hasAll || leaving) && (
          <ToggleGroupItem
            value={hasAll ? all : ALL_LEAVING}
            disabled={!hasAll}
            aria-hidden={!hasAll || undefined}
            className={cn(
              SEGMENT,
              'overflow-hidden whitespace-nowrap',
              change === 'in' && 'animate-[map-all-in_220ms_ease-out]',
              !hasAll && 'animate-[map-all-out_220ms_ease-in_forwards] disabled:opacity-100',
            )}
            onAnimationEnd={() => setLeaving(false)}
          >
            {ALL_LABEL}
          </ToggleGroupItem>
        )}
        {maps.map((id) => (
          <ToggleGroupItem key={id} value={id} className={SEGMENT}>
            {id}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** The value of the "All maps" segment while it slides away on a map page: never a real choice. */
const ALL_LEAVING = '__all-leaving'
