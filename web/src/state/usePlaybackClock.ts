import { useEffect } from 'react'
import { useStore } from './store'

/**
 * Runs the animation loop while playback is playing, and only then: a paused clock costs nothing.
 * Each frame adds the real time since the previous frame (× speed, in the store). A hidden tab
 * pauses playback, so coming back never shows a jump the designer didn't see.
 */
export function usePlaybackClock(): void {
  const playing = useStore((s) => s.playback.playing)

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last: number | null = null
    const step = (now: number) => {
      // the first frame only sets the baseline
      if (last !== null) useStore.getState().tickPlayback((now - last) / 1000)
      last = now
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    const onVisibility = () => {
      if (document.hidden) useStore.getState().pause()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [playing])
}
