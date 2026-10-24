import { useEffect, useRef, useState } from 'react'
import { countUpText, easeOut } from '@/stats/countUp'

const DURATION_MS = 900

// Figures that have already counted up in this visit: a figure runs only the first time it is seen, never again when the
// page is revisited or a filter changes it (S, 2026-10-24).
const seen = new Set<string>()

/**
 * A figure that counts up to its value the first time it scrolls into view. `id` names the figure's place on the page
 * (e.g. "overview:kills"), so the same figure doesn't run twice. Screen readers get the final text only; the running
 * frames are hidden from them, and an invisible copy of the final text reserves the width so nothing shifts.
 *
 * It runs under `prefers-reduced-motion` too (S, 2026-10-24; guidelines §6 exception): only the digits change in place,
 * nothing moves across the screen.
 */
export default function CountUp({ id, value, className = '' }: { id: string; value: string; className?: string }) {
  const [progress, setProgress] = useState(() => (seen.has(id) || typeof IntersectionObserver === 'undefined' ? 1 : 0))
  const ref = useRef<HTMLSpanElement>(null)
  const done = progress >= 1

  useEffect(() => {
    if (done || !ref.current) return
    let frame = 0
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      observer.disconnect()
      seen.add(id)
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / DURATION_MS)
        setProgress(t >= 1 ? 1 : easeOut(t))
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    })
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
    // starts once per mount (progress only moves forward); later value changes show the new value directly
  }, [id, done])

  if (done) return <span className={className}>{value}</span>
  return (
    <span ref={ref} className={`inline-grid ${className}`}>
      <span className="invisible col-start-1 row-start-1" aria-hidden="true">
        {value}
      </span>
      <span className="col-start-1 row-start-1" aria-hidden="true">
        {countUpText(value, progress)}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  )
}
