import { BitmapLayer, DeckGL, OrthographicView, type Layer, type OrthographicViewState, type PickingInfo } from 'deck.gl'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { dataUrl } from '../data/load'
import type { MapInfo } from '../data/types'
import { SPACE_WIDTH, fitZoom, imageBounds, isInsideMap, spaceHeight, spaceToUv, uvToWorld } from './space'

const VIEW = new OrthographicView({ id: 'map', flipY: true })

// App remounts this per map (key = map id), so a new map starts fitted with fresh state.
interface Props {
  mapId: string
  map: MapInfo
  /** drawn on top of the minimap, in the same drawing space */
  overlays?: Layer[]
  getTooltip?: (info: PickingInfo) => string | null
}

function fittedView(map: MapInfo, width: number, height: number): OrthographicViewState {
  const zoom = fitZoom(width, height, map)
  return {
    target: [SPACE_WIDTH / 2, spaceHeight(map) / 2, 0],
    zoom,
    minZoom: zoom - 1,
    // up to 4× the image's own resolution
    maxZoom: Math.log2(map.width / SPACE_WIDTH) + 2,
  }
}

export default function MapView({ mapId, map, overlays = [], getTooltip }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [viewState, setViewState] = useState<OrthographicViewState | null>(null)
  // Until the user zooms or pans, resizing the window keeps the whole map in view.
  const moved = useRef(false)
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null)

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

  const fit = useCallback(() => {
    if (!size) return
    moved.current = false
    setViewState(fittedView(map, size.width, size.height))
  }, [map, size])

  useEffect(() => {
    if (!moved.current) fit()
  }, [fit])

  const onHover = useCallback(
    (info: PickingInfo) => {
      const [x, y] = info.coordinate ?? []
      if (x === undefined || y === undefined || !isInsideMap(x, y, map)) return setHover(null)
      const [u, v] = spaceToUv(x, y, map)
      setHover(uvToWorld(u, v, map))
    },
    [map],
  )

  const layers = [
    new BitmapLayer({ id: `minimap-${mapId}`, image: dataUrl(map.image), bounds: imageBounds(map) }),
    ...overlays,
  ]

  return (
    <div ref={container} className="relative h-full w-full" onMouseLeave={() => setHover(null)}>
      {viewState && (
        <DeckGL
          views={VIEW}
          viewState={viewState}
          onViewStateChange={({ viewState: next }) => {
            // only user input reaches here, because the view is controlled
            moved.current = true
            setViewState(next as OrthographicViewState)
          }}
          controller={{ scrollZoom: { smooth: true }, inertia: true }}
          layers={layers}
          onHover={onHover}
          getTooltip={getTooltip}
        />
      )}
      <button
        type="button"
        onClick={fit}
        className="absolute top-3 right-3 rounded bg-slate-800/90 px-3 py-1 text-sm text-slate-100 shadow hover:bg-slate-700"
      >
        Fit map
      </button>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-900/85 px-3 py-1 font-mono text-sm text-slate-100 shadow">
        {hover ? `x ${hover.x.toFixed(1)}   z ${hover.z.toFixed(1)}` : 'world x, z'}
      </div>
    </div>
  )
}
