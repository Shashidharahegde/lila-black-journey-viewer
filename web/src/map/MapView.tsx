import { BitmapLayer, DeckGL, OrthographicView, type Layer, type OrthographicViewState, type PickingInfo } from 'deck.gl'
import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { FadeCover } from '@/components/fade'
import { LoadingIndicator } from '@/components/loading-indicator'
import { MapTooltip } from '@/components/map-tooltip'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { dataUrl } from '../data/load'
import type { MapInfo } from '../data/types'
import { isTypingTarget } from '../ui/shortcuts'
import { MapOverview } from './MapOverview'
import { measureContent } from './content'
import { useMinimap } from './minimap'
import { SPACE_WIDTH, type SpaceRect, clampTarget, contentRect, fitRectZoom, fitZoom, focusZoom, imageBounds, isInsideMap, spaceHeight, spaceToUv, uvToWorld, viewportRect } from './space'
import { type Camera, ZOOM_MOTION, cameraAt, frameRect, moveDuration, prefersReducedMotion } from './zoom'

const VIEW = new OrthographicView({ id: 'map', flipY: true })

/** The overview appears once the view is this many zoom levels in from the whole map (about 2.8× closer). */
const OVERVIEW_MIN_LEVELS = 1.5

interface MapButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}

function MapButton({ label, onClick, disabled, children }: MapButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

// One deck.gl canvas for every map: switching maps swaps layers and refits the camera
// instead of creating a new WebGL context.
interface Props {
  mapId: string
  map: MapInfo
  /**
   * Layers drawn on top of the minimap, in the same drawing space. Called with the zoom in
   * levels from the whole map (0 = fitted), so styles can follow the zoom.
   */
  overlays?: (levelsIn: number) => Layer[]
  /** content of the hover card for a picked object; null shows none */
  renderTooltip?: (object: unknown) => ReactNode
  /** the picked object under the pointer, or null */
  onHoverObject?: (object: unknown) => void
  /** what is under a point of the map that deck.gl can't pick (a painted picture has no objects); used when nothing was picked */
  pickAt?: (x: number, y: number) => unknown
  /** the clicked object, or null for a click on empty map */
  onClickObject?: (object: unknown) => void
  /** extra classes for the hover card, to restyle it for one view */
  tooltipClassName?: string
  /** when this changes (not on first render) the camera eases back out to the whole map, e.g. on a change of page */
  refitKey?: string
  /**
   * Something to bring into view, with the eased move of `zoom.ts`. It moves once per `id` (an id seen before, e.g. on returning to a
   * tab, changes nothing; null changes nothing).
   */
  focus?: MapFocus | null
  /** what is loading for the map's overlays (e.g. "Loading match…"), or null; shown only if it takes a while */
  loading?: string | null
  /**
   * Space kept clear for panels drawn over the map, in screen px: the camera fits, zooms and stops panning inside the rest. It should
   * stay the same while panels open, close or change (it reserves their room instead), so the map never moves or rescales with them.
   */
  frame?: Insets
  /** where panels cover the map right now, so the coordinate readout and the overview move out from under them */
  covered?: Insets
}

/**
 * A spot (a hotspot): the camera centres on `centre` (drawing space) and zooms in until `extent` (its width in drawing units) fills
 * about a third of the view, never zooming out. A rect (a match's journeys): the camera frames it, zooming in or out (`MATCH_FRAMING`).
 */
export type MapFocus = { id: string; centre: [number, number]; extent: number } | { id: string; rect: SpaceRect }

export interface Insets {
  left: number
  bottom: number
}

const NO_INSETS: Insets = { left: 0, bottom: 0 }

/** The part of the canvas inside the insets, where the camera frames the map. */
function framed(size: Size, frame: Insets): Size {
  return { width: Math.max(1, size.width - frame.left), height: Math.max(1, size.height - frame.bottom) }
}

/**
 * The camera is kept for the framed part of the canvas; deck.gl's target is the centre of the whole canvas, which lies `left / 2` px to
 * the left of the frame's centre and `bottom / 2` px lower (with flipY, lower on screen is larger y).
 */
function canvasTarget([x, y]: readonly number[], zoom: number, frame: Insets): [number, number] {
  const scale = 2 ** zoom
  return [x - frame.left / 2 / scale, y + frame.bottom / 2 / scale]
}

function frameTarget([x, y]: readonly number[], zoom: number, frame: Insets): [number, number] {
  const scale = 2 ** zoom
  return [x + frame.left / 2 / scale, y - frame.bottom / 2 / scale]
}



// The camera stores only target and zoom (`Camera` in zoom.ts). deck.gl hands back view states carrying transition settings
// (from scroll zoom and inertia); keeping those made later button zooms look like part of a finished transition, and deck ignored
// them. So nothing else is ever stored, and eased moves are run here, frame by frame, not by deck.gl.

/** A camera the user has moved on one map. Null (or another map's) means "fitted". */
type MovedCamera = Camera & { mapId: string }

interface Size {
  width: number
  height: number
}

/** Zoomed out = the whole map (the fitted view); zoomed in = 4× the image's own resolution. */
function zoomLimits(map: MapInfo, size: Size): { minZoom: number; maxZoom: number } {
  return { minZoom: fitZoom(size.width, size.height, map), maxZoom: Math.log2(map.width / SPACE_WIDTH) + 2 }
}

/** Zoom kept within the limits and the map kept on screen (FRONTEND_GUIDELINES §6: no getting lost in the black). */
function bounded(map: MapInfo, size: Size, target: readonly number[], zoom: number): Camera {
  const { minZoom, maxZoom } = zoomLimits(map, size)
  const z = Math.min(maxZoom, Math.max(minZoom, zoom))
  return { target: clampTarget(target, z, size.width, size.height, map), zoom: z }
}

/** The default view: the part of the map that has content, or the whole image until it is measured. */
function fitted(map: MapInfo, size: Size, content: SpaceRect | null): Camera {
  if (!content) return bounded(map, size, [SPACE_WIDTH / 2, spaceHeight(map) / 2], -Infinity)
  const centre: [number, number] = [(content.left + content.right) / 2, (content.top + content.bottom) / 2]
  return bounded(map, size, centre, fitRectZoom(size.width, size.height, content))
}

const CONTROLLER = {
  // no smooth scroll: deck.gl's smoothing lags behind the wheel; one notch ≈ ¾ of a zoom level
  scrollZoom: { speed: 0.02, smooth: false },
  inertia: 250,
  doubleClickZoom: false, // handled in MapView so it is eased
  keyboard: false, // our own shortcuts (F, Esc, ?) are global; arrows are kept for playback (spec 05)
}

/**
 * A value that only its readers re-render for. Hover changes on every mouse move; keeping it
 * out of MapView's state means a move redraws the readout and hover card, not the map.
 */
interface Signal<T> {
  get: () => T
  set: (value: T) => void
  subscribe: (listener: () => void) => () => void
}

function createSignal<T>(initial: T): Signal<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (next === value) return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function useSignal<T>(signal: Signal<T>): T {
  return useSyncExternalStore(signal.subscribe, signal.get)
}

type WorldPoint = { x: number; z: number } | null

function CoordinateReadout({ point }: { point: Signal<WorldPoint> }) {
  const hover = useSignal(point)
  // shown only while the pointer is over the map; the stage is black in both themes, so it uses white on a faint black
  if (!hover) return null
  return (
    // fixed size, so the box doesn't change shape as the numbers change
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-3 left-3 flex h-5 w-36 items-center gap-2.5 rounded bg-black/35 px-2 font-mono text-[11px] whitespace-nowrap text-white/90 tabular-nums [contain:layout_paint]"
    >
      <span className="w-[9ch]">
        <span className="text-white/55">x </span>
        {hover.x.toFixed(1)}
      </span>
      <span>
        <span className="text-white/55">z </span>
        {hover.z.toFixed(1)}
      </span>
    </div>
  )
}

type Picked = { x: number; y: number; object: unknown } | null

function HoverCard({ picked: signal, render, className }: { picked: Signal<Picked>; render?: (object: unknown) => ReactNode; className?: string }) {
  const picked = useSignal(signal)
  const content = picked && render ? render(picked.object) : null
  return picked && content ? (
    <MapTooltip x={picked.x} y={picked.y} className={className}>
      {content}
    </MapTooltip>
  ) : null
}

export default function MapView({ mapId: wantedId, map: wantedMap, overlays, renderTooltip, onHoverObject, pickAt, onClickObject, tooltipClassName, refitKey, focus, loading, frame: frameProp, covered: coveredProp }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [canvas, setCanvas] = useState<Size | null>(null)
  const [moved, setMoved] = useState<MovedCamera | null>(null)
  const [readout] = useState(() => createSignal<WorldPoint>(null))
  const [hoverCard] = useState(() => createSignal<Picked>(null))
  const minimap = useMinimap(dataUrl(wantedMap.image))
  // The map on screen is the last one whose minimap has loaded: on a map switch the previous map stays (dimmed, without overlays)
  // until the next one is ready, then the next one fades in. No black flash, and no overlay is ever drawn on another map's image.
  const [shown, setShown] = useState<{ mapId: string; map: MapInfo; image: ImageBitmap } | null>(null)
  if (minimap.status === 'ready' && shown?.image !== minimap.image) setShown({ mapId: wantedId, map: wantedMap, image: minimap.image })
  const mapId = shown?.mapId ?? wantedId
  const map = shown?.map ?? wantedMap
  const image = shown?.image ?? null
  const switching = shown !== null && shown.mapId !== wantedId
  const frameLeft = frameProp?.left ?? 0
  const frameBottom = frameProp?.bottom ?? 0
  const frame = useMemo<Insets>(() => ({ left: frameLeft, bottom: frameBottom }), [frameLeft, frameBottom])
  const covered = coveredProp ?? NO_INSETS
  // every camera rule works in the framed part of the canvas, so panels can't move the map
  const size = useMemo(() => (canvas ? framed(canvas, frame) : null), [canvas, frame])
  const content = useMemo(() => {
    const bounds = image ? measureContent(image) : null
    return bounds ? contentRect(bounds, map) : null
  }, [image, map])

  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setCanvas({ width, height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Until the user zooms or pans, the map stays fitted (also after a resize or a map switch).
  // A moved camera is re-bounded on every render, so a resize can't push the map off screen.
  const camera: Camera | null = !size ? null : moved?.mapId === mapId ? bounded(map, size, moved.target, moved.zoom) : fitted(map, size, content)
  const limits = size ? zoomLimits(map, size) : null

  // An eased move in progress (its animation frame), stopped by any user move of the camera.
  const tween = useRef(0)
  const stopTween = useCallback(() => {
    cancelAnimationFrame(tween.current)
    tween.current = 0
  }, [])
  useEffect(() => stopTween, [stopTween])
  const userMove = useCallback(
    (next: MovedCamera | null) => {
      stopTween()
      setMoved(next)
    },
    [stopTween],
  )

  // The latest camera and view, for moves started from an event handler or an effect.
  const cameraNow = useRef({ camera, size })
  cameraNow.current = { camera, size }

  // Ease the camera to `to` (ZOOM_MOTION, longer for farther moves), or jump at once when the user prefers reduced motion.
  // Every move the app makes goes through here: a picked match or hotspot, the +/− buttons, Fit and a double-click.
  const flyTo = useCallback(
    (to: Camera, done?: () => void) => {
      const { camera: from, size: view } = cameraNow.current
      stopTween()
      if (!from || !view) return
      const end = bounded(map, view, to.target, to.zoom)
      if (prefersReducedMotion()) {
        setMoved({ mapId, ...end })
        return done?.()
      }
      // the clock starts at the first frame, not when the move was asked for, so a slow render doesn't eat the start of it
      const duration = moveDuration(from, end, view.width, view.height)
      let start: number | null = null
      const step = (now: number) => {
        start ??= now
        const t = Math.min(1, (now - start) / duration)
        const at = cameraAt(from, end, ZOOM_MOTION.easing(t))
        setMoved({ mapId, ...bounded(map, view, at.target, at.zoom) })
        if (t < 1) tween.current = requestAnimationFrame(step)
        else {
          tween.current = 0
          done?.()
        }
      }
      tween.current = requestAnimationFrame(step)
    },
    [map, mapId, stopTween],
  )

  // Fit goes back to the fitted camera, then lets go of it so a resize refits again.
  const fit = useCallback(() => {
    const { size: view } = cameraNow.current
    if (view) flyTo(fitted(map, view, content), () => setMoved(null))
  }, [flyTo, map, content])

  // F fits the map (FRONTEND_GUIDELINES §6 Keyboard)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
      event.preventDefault()
      fit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fit])

  // Buttons zoom one level around the centre of the view, like Google Maps' +/−.
  const zoomBy = (step: number) => {
    if (camera) flyTo({ target: camera.target, zoom: camera.zoom + step })
  }

  // Changing page zooms back out to the whole map; a pick on the new page then zooms in again.
  const refitSeen = useRef(refitKey)
  useEffect(() => {
    if (refitSeen.current === refitKey) return
    refitSeen.current = refitKey
    fit()
  }, [refitKey, fit])

  // Bring a newly selected thing into view.
  const focusId = focus?.id
  const focusAt = useRef(focus)
  focusAt.current = focus
  const focused = useRef(new Set<string>())
  const ready = size !== null && !switching
  useEffect(() => {
    const target = focusAt.current
    const { camera: from, size: view } = cameraNow.current
    if (!ready || !focusId || !target || !from || !view || focused.current.has(focusId)) return
    focused.current.add(focusId)
    const { minZoom } = zoomLimits(map, view)
    flyTo(
      'rect' in target
        ? frameRect(target.rect, view.width, view.height, minZoom)
        : { target: target.centre, zoom: Math.max(from.zoom, focusZoom(view.width, view.height, target.extent)) },
    )
  }, [focusId, ready, map, flyTo])

  // A double-click zooms one level in about the clicked point, eased like every other move (deck.gl's own would jump).
  const lastClick = useRef({ time: 0, x: 0, y: 0 })
  const zoomAbout = (point: [number, number]) => {
    if (!camera) return
    const [px, py] = point
    flyTo({ target: [px + (camera.target[0] - px) / 2, py + (camera.target[1] - py) / 2], zoom: camera.zoom + 1 })
  }

  // Pointer events can arrive faster than frames; picking and the readout are done once per frame, for the latest position.
  const pendingHover = useRef<PickingInfo | null>(null)
  const hoverFrame = useRef(0)
  const applyHover = useCallback(
    (info: PickingInfo) => {
      const [px, py] = info.coordinate ?? []
      const inside = px !== undefined && py !== undefined && isInsideMap(px, py, map)
      const object = info.object ?? (inside ? (pickAt?.(px, py) ?? null) : null)
      hoverCard.set(object ? { x: info.x, y: info.y, object } : null)
      onHoverObject?.(object)
      if (!inside) return readout.set(null)
      const [u, v] = spaceToUv(px, py, map)
      readout.set(uvToWorld(u, v, map))
    },
    [map, onHoverObject, pickAt, readout, hoverCard],
  )
  const onHover = useCallback(
    (info: PickingInfo) => {
      pendingHover.current = info
      if (hoverFrame.current) return
      hoverFrame.current = requestAnimationFrame(() => {
        hoverFrame.current = 0
        const latest = pendingHover.current
        pendingHover.current = null
        if (latest) applyHover(latest)
      })
    },
    [applyHover],
  )
  useEffect(() => () => cancelAnimationFrame(hoverFrame.current), [])

  const leave = () => {
    cancelAnimationFrame(hoverFrame.current)
    hoverFrame.current = 0
    pendingHover.current = null
    readout.set(null)
    hoverCard.set(null)
    onHoverObject?.(null)
  }

  const background = useMemo(
    () => (image ? new BitmapLayer({ id: `minimap-${mapId}`, image, bounds: imageBounds(map) }) : null),
    [image, map, mapId],
  )
  const levelsIn = camera && limits ? camera.zoom - limits.minZoom : 0
  // overlays appear with the minimap, so nothing floats on an empty stage
  const drawn = useMemo(() => (overlays && background && !switching ? overlays(levelsIn) : []), [overlays, background, switching, levelsIn])
  const layers = useMemo(() => (background ? [background, ...drawn] : []), [background, drawn])

  return (
    <div ref={container} className="relative h-full w-full bg-stage" onMouseLeave={leave}>
      {camera && size && limits && (
        <DeckGL
          views={VIEW}
          viewState={{ target: canvasTarget(camera.target, camera.zoom, frame), zoom: camera.zoom, ...limits }}
          onViewStateChange={({ viewState: next }) => {
            // only user input reaches here, because the view is controlled
            const { target, zoom } = next as OrthographicViewState
            const z = Number(zoom)
            userMove({ mapId, ...bounded(map, size, target ? frameTarget(target, z, frame) : camera.target, z) })
          }}
          controller={CONTROLLER}
          layers={layers}
          onHover={onHover}
          onClick={(info) => {
            const [px, py] = info.coordinate ?? []
            const object = info.object ?? (px !== undefined && py !== undefined && isInsideMap(px, py, map) ? (pickAt?.(px, py) ?? null) : null)
            const now = performance.now()
            const again = now - lastClick.current.time < 350 && Math.hypot(info.x - lastClick.current.x, info.y - lastClick.current.y) < 8
            lastClick.current = again ? { time: 0, x: 0, y: 0 } : { time: now, x: info.x, y: info.y }
            if (again && px !== undefined && py !== undefined) return zoomAbout([px, py])
            onClickObject?.(object)
          }}
          getCursor={({ isDragging, isHovering }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
        />
      )}
      {/* a switch: the previous map dims while the next loads; the next fades in from the stage colour */}
      <div aria-hidden className={`pointer-events-none absolute inset-0 bg-stage transition-opacity duration-200 ${switching ? 'opacity-60' : 'opacity-0'}`} />
      {shown && <FadeCover fadeKey={shown.mapId} className="bg-stage" />}
      {/* the minimap first (a map switch), then what is drawn on it (a match) */}
      <LoadingIndicator
        active={switching || (!shown && minimap.status === 'loading') || !!loading}
        label={switching || !shown ? `Loading ${wantedId}…` : loading}
        style={{ left: frame.left, bottom: frame.bottom }}
      />
      {minimap.status === 'error' && (
        <p role="alert" className="absolute inset-x-0 top-1/2 text-center text-sm text-white">
          Could not load the {wantedId} minimap ({minimap.message}). Reload the page to try again.
        </p>
      )}
      <HoverCard picked={hoverCard} render={renderTooltip} className={tooltipClassName} />
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <MapButton label="Zoom in" onClick={() => zoomBy(1)} disabled={!camera || !limits || camera.zoom >= limits.maxZoom}>
          <PlusIcon />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomBy(-1)} disabled={!camera || !limits || camera.zoom <= limits.minZoom}>
          <MinusIcon />
        </MapButton>
        <MapButton label="Fit map (F)" onClick={fit}>
          <MaximizeIcon />
        </MapButton>
      </div>
      <div className="pointer-events-none absolute inset-0 transition-[left,bottom] duration-200 *:pointer-events-auto" style={{ left: covered.left, bottom: covered.bottom }}>
        {image && camera && size && levelsIn >= OVERVIEW_MIN_LEVELS && (
          <MapOverview
            map={map}
            image={image}
            viewport={viewportRect(camera.target, camera.zoom, size.width, size.height, map)}
            onNavigate={(x, y) => userMove({ mapId, ...bounded(map, size, [x, y], camera.zoom) })}
          />
        )}
        <CoordinateReadout point={readout} />
      </div>
    </div>
  )
}
