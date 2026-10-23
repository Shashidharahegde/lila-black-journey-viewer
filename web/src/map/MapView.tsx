import { BitmapLayer, DeckGL, OrthographicView, type Layer, type OrthographicViewState, type PickingInfo } from 'deck.gl'
import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
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
  /**
   * Something to bring into view: when `id` changes to a new value the camera moves to `centre` (drawing space) and zooms in until
   * `extent` (its width in drawing units) fills about a third of the view, never zooming out. Null changes nothing.
   */
  focus?: { id: string; centre: [number, number]; extent: number } | null
}



/**
 * Only what the camera needs. deck.gl hands back view states carrying transition settings
 * (from scroll zoom and inertia); keeping those made later button zooms look like part of
 * a finished transition, and deck ignored them. So nothing else is ever stored.
 */
interface Camera {
  target: [number, number]
  zoom: number
}

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
  doubleClickZoom: true,
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

function HoverCard({ picked: signal, render }: { picked: Signal<Picked>; render?: (object: unknown) => ReactNode }) {
  const picked = useSignal(signal)
  const content = picked && render ? render(picked.object) : null
  return picked && content ? (
    <MapTooltip x={picked.x} y={picked.y}>
      {content}
    </MapTooltip>
  ) : null
}

export default function MapView({ mapId, map, overlays, renderTooltip, onHoverObject, pickAt, onClickObject, focus }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size | null>(null)
  const [moved, setMoved] = useState<MovedCamera | null>(null)
  const [readout] = useState(() => createSignal<WorldPoint>(null))
  const [hoverCard] = useState(() => createSignal<Picked>(null))
  const minimap = useMinimap(dataUrl(map.image))
  const image = minimap.status === 'ready' ? minimap.image : null
  const content = useMemo(() => {
    const bounds = image ? measureContent(image) : null
    return bounds ? contentRect(bounds, map) : null
  }, [image, map])

  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ width, height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Until the user zooms or pans, the map stays fitted (also after a resize or a map switch).
  // A moved camera is re-bounded on every render, so a resize can't push the map off screen.
  const camera: Camera | null = !size ? null : moved?.mapId === mapId ? bounded(map, size, moved.target, moved.zoom) : fitted(map, size, content)
  const limits = size ? zoomLimits(map, size) : null

  const fit = useCallback(() => setMoved(null), [])

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
    if (size && camera) setMoved({ mapId, ...bounded(map, size, camera.target, camera.zoom + step) })
  }

  // Bring a newly selected thing into view. The jump is instant (no deck.gl transition: stored transition fields broke the +/− buttons).
  const cameraNow = useRef({ camera, size })
  cameraNow.current = { camera, size }
  const focusId = focus?.id
  const focusAt = useRef(focus)
  focusAt.current = focus
  useEffect(() => {
    const target = focusAt.current
    const { camera: now, size: view } = cameraNow.current
    if (!focusId || !target || !now || !view) return
    const wanted = focusZoom(view.width, view.height, target.extent)
    setMoved({ mapId, ...bounded(map, view, target.centre, Math.max(now.zoom, wanted)) })
  }, [focusId, mapId, map])

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
  const drawn = useMemo(() => (overlays && background ? overlays(levelsIn) : []), [overlays, background, levelsIn])
  const layers = useMemo(() => (background ? [background, ...drawn] : []), [background, drawn])

  return (
    <div ref={container} className="relative h-full w-full bg-stage" onMouseLeave={leave}>
      {camera && size && limits && (
        <DeckGL
          views={VIEW}
          viewState={{ ...camera, ...limits }}
          onViewStateChange={({ viewState: next }) => {
            // only user input reaches here, because the view is controlled
            const { target, zoom } = next as OrthographicViewState
            setMoved({ mapId, ...bounded(map, size, target ?? camera.target, Number(zoom)) })
          }}
          controller={CONTROLLER}
          layers={layers}
          onHover={onHover}
          onClick={(info) => {
            const [px, py] = info.coordinate ?? []
            const object = info.object ?? (px !== undefined && py !== undefined && isInsideMap(px, py, map) ? (pickAt?.(px, py) ?? null) : null)
            onClickObject?.(object)
          }}
          getCursor={({ isDragging, isHovering }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
        />
      )}
      {minimap.status === 'error' && (
        <p role="alert" className="absolute inset-x-0 top-1/2 text-center text-sm text-white">
          Could not load the {mapId} minimap ({minimap.message}). Reload the page to try again.
        </p>
      )}
      <HoverCard picked={hoverCard} render={renderTooltip} />
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
      {image && camera && size && levelsIn >= OVERVIEW_MIN_LEVELS && (
        <MapOverview
          map={map}
          image={image}
          viewport={viewportRect(camera.target, camera.zoom, size.width, size.height, map)}
          onNavigate={(x, y) => setMoved({ mapId, ...bounded(map, size, [x, y], camera.zoom) })}
        />
      )}
      <CoordinateReadout point={readout} />
    </div>
  )
}
