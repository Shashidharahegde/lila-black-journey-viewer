import { useEffect, useRef, type PointerEvent } from 'react'
import type { MapInfo } from '../data/types'
import { SPACE_WIDTH, overviewToSpace, spaceHeight, type SpaceRect } from './space'

/** CSS width of the overview; the height follows the map's aspect ratio. */
const WIDTH = 120

interface Props {
  map: MapInfo
  image: ImageBitmap
  /** the part of the map the main view shows */
  viewport: SpaceRect
  /** the drawing-space position the main view should centre on */
  onNavigate: (x: number, y: number) => void
}

/**
 * The whole map in a corner with a rectangle for the region the main map shows.
 * Click or drag on it to move the main view there.
 */
export function MapOverview({ map, image, viewport, onNavigate }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const height = Math.round((WIDTH * map.height) / map.width)
  const h = spaceHeight(map)

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return
    const ratio = window.devicePixelRatio || 1
    element.width = Math.round(WIDTH * ratio)
    element.height = Math.round(height * ratio)
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, element.width, element.height)
  }, [image, height])

  const navigate = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const [x, y] = overviewToSpace((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height, map)
    onNavigate(x, y)
  }

  return (
    <div
      role="img"
      aria-label="Overview of the whole map. The white rectangle is the region shown; click or drag to move it."
      className="absolute bottom-11 left-3 cursor-crosshair touch-none overflow-hidden opacity-70 transition-opacity hover:opacity-100 rounded-md border border-border bg-stage shadow-sm select-none"
      style={{ width: WIDTH, height }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        navigate(event)
      }}
      onPointerMove={(event) => event.buttons === 1 && navigate(event)}
    >
      <canvas ref={canvas} className="size-full" />
      <div
        className="pointer-events-none absolute border-2 border-white bg-white/15 shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
        style={{
          left: `${(viewport.left / SPACE_WIDTH) * 100}%`,
          top: `${(viewport.top / h) * 100}%`,
          width: `${((viewport.right - viewport.left) / SPACE_WIDTH) * 100}%`,
          height: `${((viewport.bottom - viewport.top) / h) * 100}%`,
        }}
      />
    </div>
  )
}
