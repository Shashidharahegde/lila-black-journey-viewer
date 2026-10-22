import { PauseIcon, PlayIcon, RotateCcwIcon, SkipBackIcon, SkipForwardIcon } from 'lucide-react'
import { useEffect, useId, useMemo, type ComponentProps, type ReactNode } from 'react'
import { TickSlider, type Tick } from '@/components/tick-slider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { MatchSummary } from '@/data/types'
import { EVENT, type EventType } from '@/map/encoding'
import type { MarkerDatum } from '@/map/journeys'
import { nextCombatTime, previousCombatTime, timelineTicks } from '@/map/playback'
import { PLAYBACK_SPEEDS, SEEK_STEP_S, clockLabel, isSpeed } from '@/state/playback'
import { highlightedActor, useStore } from '@/state/store'
import { usePlaybackClock } from '@/state/usePlaybackClock'
import { isTypingTarget } from './shortcuts'

const TICK_SHAPE: Record<EventType, Tick['shape']> = { kill: 'bar', death: 'capped', storm_death: 'capped', loot: 'short' }

function DockButton({ label, children, ...props }: { label: string; children: ReactNode } & ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} size="icon" variant="ghost" {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Space, ← and → for playback, except where the key already means something (a button, a slider, a menu). */
function usePlaybackKeys(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
      const target = event.target instanceof HTMLElement ? event.target : null
      const { togglePlay, seek, playback } = useStore.getState()
      if (event.key === ' ') {
        // Space already presses a focused button or ticks a checkbox
        if (target?.closest('button, a, [role="checkbox"], [role="radio"], [role="switch"], summary')) return
        event.preventDefault()
        togglePlay()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // the timeline and the speed buttons use arrows themselves
        if (target?.closest('[role="slider"], [role="radio"], [role="radiogroup"], [role="tablist"]')) return
        event.preventDefault()
        seek(playback.time + (event.key === 'ArrowLeft' ? -SEEK_STEP_S : SEEK_STEP_S))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

interface Props {
  match: MatchSummary
  /** the markers on the map (hidden layers left out), or null while the match file loads */
  markers: MarkerDatum[] | null
}

const seekTo = (tick: Tick) => useStore.getState().seek(tick.value)

/** "02:14 / 14:47"; one of the two parts of the dock that re-render on every frame. */
function Clock({ duration }: { duration: number }) {
  const time = useStore((s) => s.playback.time)
  return (
    // fixed width, so the controls don't shift as the digits change
    <output aria-live="off" className="w-[13ch] shrink-0 font-mono text-sm tabular-nums">
      {clockLabel(time)} / {clockLabel(duration)}
    </output>
  )
}

/** The seek slider with event ticks; the other part that re-renders on every frame (the ticks don't). */
function Timeline({ duration, ready, ticks }: { duration: number; ready: boolean; ticks: Tick[] }) {
  const time = useStore((s) => s.playback.time)
  const { seek, setScrubbing } = useStore.getState()
  return (
    <TickSlider
      className="order-last min-w-0 basis-full pb-1 @3xl:order-none @3xl:flex-1 @3xl:basis-auto"
      min={0}
      max={Math.max(duration, 1)}
      step={1}
      value={[time]}
      disabled={!ready}
      ticks={ticks}
      onTickClick={seekTo}
      onValueChange={([value]) => seek(value)}
      onPointerDown={() => setScrubbing(true)}
      onValueCommit={() => setScrubbing(false)}
      thumbProps={{ 'aria-label': 'Match time', 'aria-valuetext': `${clockLabel(time)} of ${clockLabel(duration)}` }}
    />
  )
}

/**
 * The timeline under the map (spec 05, FRONTEND_GUIDELINES §3): play, restart, jump between kills
 * and deaths, seek, speed and full paths. Shown as soon as a match is selected, disabled until its
 * file has loaded, so the layout doesn't move when the data arrives. Only the clock and the slider
 * follow the time on every frame; the rest re-renders when what it shows changes.
 */
export default function PlaybackDock({ match, markers }: Props) {
  const playing = useStore((s) => s.playback.playing)
  const speed = useStore((s) => s.playback.speed)
  const atStart = useStore((s) => s.playback.time === 0)
  const previous = useStore((s) => (markers ? previousCombatTime(markers, s.playback.time) : null))
  const next = useStore((s) => (markers ? nextCombatTime(markers, s.playback.time) : null))
  const fullPaths = useStore((s) => s.fullPaths)
  const highlight = useStore(highlightedActor)
  const { togglePlay, seek, setSpeed, setFullPaths } = useStore.getState()
  const fullPathsId = useId()
  const duration = match.duration_s
  const ready = markers !== null && duration > 0

  usePlaybackClock()
  usePlaybackKeys(ready)

  // a released pointer always ends a scrub, even if it lands off the slider
  useEffect(() => {
    const end = () => useStore.getState().setScrubbing(false)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  const ticks = useMemo<Tick[]>(
    () =>
      (markers ? timelineTicks(markers, duration) : []).map((tick) => ({
        id: `${tick.t}-${tick.type}`,
        value: tick.t,
        tone: EVENT[tick.type].tone,
        shape: TICK_SHAPE[tick.type],
        dimmed: highlight !== null && !tick.actors.includes(highlight),
        label: `${clockLabel(tick.t)} · ${tick.label}`,
      })),
    [markers, duration, highlight],
  )

  return (
    <section aria-label="Match playback" className="@container shrink-0 border-t bg-card px-3 py-2 text-card-foreground">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 @3xl:flex-nowrap">
        <div className="flex shrink-0 items-center gap-0.5">
          <DockButton label="Restart" onClick={() => seek(0)} disabled={!ready || atStart}>
            <RotateCcwIcon />
          </DockButton>
          <DockButton label="Previous kill or death" onClick={() => previous !== null && seek(previous)} disabled={previous === null}>
            <SkipBackIcon />
          </DockButton>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay} disabled={!ready}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{playing ? 'Pause (Space)' : 'Play (Space)'}</TooltipContent>
          </Tooltip>
          <DockButton label="Next kill or death" onClick={() => next !== null && seek(next)} disabled={next === null}>
            <SkipForwardIcon />
          </DockButton>
        </div>
        <Clock duration={duration} />
        <Timeline duration={duration} ready={ready} ticks={ticks} />
        <ToggleGroup
          type="single"
          aria-label="Playback speed"
          value={String(speed)}
          // a second click on the current speed would clear the value; a speed is always selected
          onValueChange={(value) => isSpeed(Number(value)) && setSpeed(Number(value) as typeof speed)}
          className="shrink-0 gap-0.5 bg-muted p-0.5"
        >
          {PLAYBACK_SPEEDS.map((s) => (
            <ToggleGroupItem
              key={s}
              value={String(s)}
              aria-label={`${s}× speed`}
              className="h-7 px-2 font-mono text-xs text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {s}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex shrink-0 items-center gap-2">
              <Checkbox id={fullPathsId} checked={fullPaths} onCheckedChange={(checked) => setFullPaths(checked === true)} />
              <label htmlFor={fullPathsId} className="cursor-pointer text-sm whitespace-nowrap">
                Full paths
              </label>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            Show whole journeys and every event, as without playback. The timeline still moves the current positions.
          </TooltipContent>
        </Tooltip>
      </div>
    </section>
  )
}
