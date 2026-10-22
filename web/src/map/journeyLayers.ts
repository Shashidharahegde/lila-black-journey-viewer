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

export function actorColor(a: ActorInfo): Color {
  return a.humanIndex === null ? BOT_COLOR : HUMAN_COLORS[a.humanIndex % HUMAN_COLORS.length]
}

export const EVENT_STYLE: Record<EventType, { label: string; color: Color; size: number; svg: string }> = {
  loot: { label: 'Loot', color: [250, 204, 21, 255], size: 7, svg: '<circle cx="32" cy="32" r="22" fill="#fff"/>' },
  self_kill: {
    label: 'Self-kill',
    color: [255, 255, 255, 255],
    size: 18,
    svg:
      '<mask id="m"><rect width="64" height="64" fill="#fff"/><path d="M12 12L52 52M52 12L12 52" stroke="#000" stroke-width="6"/></mask>' +
      '<path d="M12 12L52 52M52 12L12 52" stroke="#fff" stroke-width="16" stroke-linecap="square" mask="url(#m)"/>',
  },
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
function markerColor(m: MarkerDatum): Color {
  const [r, g, b] = EVENT_STYLE[m.type].color
  return [r, g, b, m.actor.kind === 'bot' ? 150 : 255]
}

export function journeyLayers(data: JourneyData): Layer[] {
  const botPaths = data.paths.filter((p) => p.actor.kind === 'bot')
  const humanPaths = data.paths.filter((p) => p.actor.kind === 'human')
  const pathProps = {
    getPath: (d: PathDatum) => d.path,
    getColor: (d: PathDatum) => actorColor(d.actor),
    widthUnits: 'pixels' as const,
    capRounded: true,
    jointRounded: true,
    pickable: true,
  }
  return [
    new PathLayer<PathDatum>({ id: 'bot-paths', data: botPaths, getWidth: 1.25, ...pathProps }),
    new PathLayer<PathDatum>({ id: 'human-paths', data: humanPaths, getWidth: 3, ...pathProps }),
    new ScatterplotLayer<PointDatum>({
      id: 'lone-samples',
      data: data.lonePoints,
      getPosition: (d) => d.position,
      getFillColor: (d) => actorColor(d.actor),
      getRadius: (d) => (d.actor.kind === 'human' ? 3 : 2),
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
