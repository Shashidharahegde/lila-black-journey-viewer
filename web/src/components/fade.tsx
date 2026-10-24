import type { ReactNode } from 'react'
import { cn } from 'cn'

const FADE_IN = 'animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'

/**
 * The one fade for anything that changes with the map. `fadeKey` is the map id: when it changes the children remount and fade in.
 * (`prefers-reduced-motion` is handled globally in index.css.)
 */
export function Fade({ fadeKey, className, children }: { fadeKey: string; className?: string; children: ReactNode }) {
  return (
    <div key={fadeKey} className={cn(FADE_IN, className)}>
      {children}
    </div>
  )
}

/**
 * The same fade for what can't be remounted (the deck.gl canvas keeps its WebGL context): a cover in `color` that fades out each time
 * `fadeKey` changes. Place it over the content; it ignores the pointer.
 */
export function FadeCover({ fadeKey, className }: { fadeKey: string; className?: string }) {
  return <div key={fadeKey} aria-hidden className={cn('pointer-events-none absolute inset-0 animate-out fade-out fill-mode-forwards duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]', className)} />
}
