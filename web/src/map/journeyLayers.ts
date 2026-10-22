// deck.gl layers for one match. Styling here is provisional (functionality first; UI pass later).
import { IconLayer, PathLayer, ScatterplotLayer, type Layer, type PickingInfo } from 'deck.gl'
import {
  EVENT_ORDER,
  describeActor,
  describeMarker,
  type ActorInfo,
  type EventType,
  type JourneyData,
  type MarkerDatum,
  type PathDatum,
  type PointDatum,
} from './journeys'

type Color = [number, number, number, number]

// Okabe–Ito, without black (the minimaps are dark). At most 2 humans share a match today.
const HUMAN_COLORS: Color[] = [
  [230, 159, 0, 255],
  [86, 180, 233, 255],
  [0, 158, 115, 255],
  [240, 228, 66, 255],
  [0, 114, 178, 255],
  [213, 94, 0, 255],
  [204, 121, 167, 255],
]
const BOT_COLOR: Color = [200, 200, 200, 115]
// Unknown journeys (EC-09): neutral, but brighter and wider than bots so they don't read as either kind.
export const UNKNOWN_COLOR: Color = [255, 255, 255, 210]

export function actorColor(a: ActorInfo): Color {
  if (a.kind === 'unknown') return UNKNOWN_COLOR
  return a.humanIndex === null ? BOT_COLOR : HUMAN_COLORS[a.humanIndex % HUMAN_COLORS.length]
}

const PATH_WIDTH: Record<ActorInfo['kind'], number> = { human: 3, unknown: 2, bot: 1.25 }
const POINT_RADIUS: Record<ActorInfo['kind'], number> = { human: 3, unknown: 2.5, bot: 2 }

export const EVENT_STYLE: Record<EventType, { label: string; color: Color; size: number; svg: string }> = {
  loot: { label: 'Loot', color: [250, 204, 21, 255], size: 7, svg: '<circle cx="32" cy="32" r="22" fill="#fff"/>' },
  storm_death: { label: 'Storm death', color: [168, 85, 247, 255], size: 16, svg: '<path d="M32 4L60 32L32 60L4 32Z" fill="#fff"/>' },
  death: {
    label: 'Death',
    color: [255, 255, 255, 255],
    size: 16,
    svg: '<path d="M12 12L52 52M52 12L12 52" stroke="#fff" stroke-width="12" stroke-linecap="round"/>',
  },
  kill: { label: 'Kill', color: [239, 68, 68, 255], size: 16, svg: '<path d="M32 6L58 54H6Z" fill="#fff"/>' },
}

export function iconUrl(type: EventType): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${EVENT_STYLE[type].svg}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const ICONS = Object.fromEntries(
  EVENT_ORDER.map((type) => [type, { id: type, url: iconUrl(type), width: 64, height: 64, mask: true }]),
) as Record<EventType, { id: string; url: string; width: number; height: number; mask: boolean }>

// Markers from bot files are fainter: humans are the focus.
const MARKER_ALPHA: Record<ActorInfo['kind'], number> = { human: 255, unknown: 200, bot: 150 }

function markerColor(m: MarkerDatum): Color {
  const [r, g, b] = EVENT_STYLE[m.type].color
  return [r, g, b, MARKER_ALPHA[m.actor.kind]]
}

export function journeyLayers(data: JourneyData): Layer[] {
  const pathsOf = (kind: ActorInfo['kind']) => data.paths.filter((p) => p.actor.kind === kind)
  const pathProps = {
    getPath: (d: PathDatum) => d.path,
    getColor: (d: PathDatum) => actorColor(d.actor),
    getWidth: (d: PathDatum) => PATH_WIDTH[d.actor.kind],
    widthUnits: 'pixels' as const,
    capRounded: true,
    jointRounded: true,
    pickable: true,
  }
  return [
    // bottom to top: bots, unknown, humans
    new PathLayer<PathDatum>({ id: 'bot-paths', data: pathsOf('bot'), ...pathProps }),
    new PathLayer<PathDatum>({ id: 'unknown-paths', data: pathsOf('unknown'), ...pathProps }),
    new PathLayer<PathDatum>({ id: 'human-paths', data: pathsOf('human'), ...pathProps }),
    new ScatterplotLayer<PointDatum>({
      id: 'lone-samples',
      data: data.lonePoints,
      getPosition: (d) => d.position,
      getFillColor: (d) => actorColor(d.actor),
      getRadius: (d) => POINT_RADIUS[d.actor.kind],
      radiusUnits: 'pixels',
      pickable: true,
    }),
    new IconLayer<MarkerDatum>({
      id: 'event-markers',
      data: data.markers, // already in draw order: loot first, kills last
      getPosition: (d) => d.position,
      getIcon: (d) => ICONS[d.type],
      getSize: (d) => EVENT_STYLE[d.type].size,
      sizeUnits: 'pixels',
      getColor: markerColor,
      pickable: true,
    }),
  ]
}

export function journeyTooltip(info: PickingInfo): string | null {
  const object = info.object as PathDatum | PointDatum | MarkerDatum | undefined
  if (!object) return null
  if ('type' in object) return describeMarker(object)
  return describeActor(object.actor)
}
