// deck.gl layers for one match, styled from encoding.ts (FRONTEND_GUIDELINES §4).
import { CollisionFilterExtension, PathStyleExtension, type CollisionFilterExtensionProps } from '@deck.gl/extensions'
import { IconLayer, PathLayer, TextLayer, type Layer } from 'deck.gl'
import type { ActorKind } from '../data/types'
import {
  ACTOR,
  ACTOR_ORDER,
  ACTOR_PRIORITY,
  BOT_DASH,
  BOT_MARKER_OPACITY,
  BOT_MARKER_SCALE,
  CASING_WIDTH,
  COLOR,
  DIM_OPACITY,
  EVENT,
  EVENT_ORDER,
  HIGHLIGHT_PRIORITY,
  HOVER_SCALE,
  MARKER_PRIORITY,
  POSITION_SIZE,
  WHITE,
  badgeIcon,
  positionIcon,
  rgba,
  type EventType,
  type zoomStyle,
} from './encoding'
import type { ActorInfo, JourneyData, MarkerDatum, PathDatum, PointDatum } from './journeys'

const DASH = new PathStyleExtension({ dash: true })
const POSITION_ICONS = Object.fromEntries(ACTOR_ORDER.map((k) => [k, positionIcon(k)])) as Record<
  ActorKind,
  ReturnType<typeof positionIcon>
>
const COLLISION = new CollisionFilterExtension()
// badge and icon as one image, so the collision filter treats each marker as a whole
const BADGE_ICONS = Object.fromEntries(
  EVENT_ORDER.map((type) => [type, { ...badgeIcon(type), anchorY: 64, mask: false }]),
) as Record<EventType, ReturnType<typeof badgeIcon> & { anchorY: number; mask: boolean }>

/** 1 for the highlighted actor (or when nothing is highlighted), DIM_OPACITY for the rest. */
function emphasis(actor: ActorInfo, highlight: string | null): number {
  return highlight === null || actor.id === highlight ? 1 : DIM_OPACITY
}

function markerScale(m: MarkerDatum, highlight: string | null): number {
  return (m.actor.kind === 'bot' ? BOT_MARKER_SCALE : 1) * (m.actor.id === highlight ? HOVER_SCALE : 1)
}

function markerOpacity(m: MarkerDatum, highlight: string | null): number {
  return (m.actor.kind === 'bot' ? BOT_MARKER_OPACITY : 1) * emphasis(m.actor, highlight)
}

function withAlpha([r, g, b]: number[], opacity: number): [number, number, number, number] {
  return [r, g, b, Math.round(255 * opacity)]
}

/** H1, H2 at the start of each tagged human's journey. */
function humanTags(data: JourneyData): { tag: string; position: [number, number]; actor: ActorInfo }[] {
  const seen = new Set<string>()
  const starts = [
    ...data.paths.map((p) => ({ actor: p.actor, position: p.path[0] })),
    ...data.lonePoints.map((p) => ({ actor: p.actor, position: p.position })),
  ]
  return starts.flatMap(({ actor, position }) => {
    if (!actor.tag || seen.has(actor.id)) return []
    seen.add(actor.id)
    return [{ tag: actor.tag, position, actor }]
  })
}

/**
 * Accessors give sizes at the reference zoom; `zoom` scales them through widthScale / sizeScale
 * (uniforms), so zooming never recomputes per-object data.
 */
export function journeyLayers(
  data: JourneyData,
  highlight: string | null,
  zoom: ReturnType<typeof zoomStyle> = { routeScale: 1, markerScale: 1 },
): Layer[] {
  const triggers = { getColor: highlight, getFillColor: highlight, getLineColor: highlight, getSize: highlight }
  const pathsOf = (kind: ActorKind) => data.paths.filter((p) => p.actor.kind === kind)
  const pathLayer = (kind: ActorKind) => {
    const style = ACTOR[kind]
    const base = rgba(COLOR[style.tone])
    return new PathLayer<PathDatum>({
      id: `${kind}-paths`,
      data: pathsOf(kind),
      getPath: (d) => d.path,
      getColor: (d) => withAlpha(base, style.opacity * emphasis(d.actor, highlight)),
      getWidth: (d) => style.pathWidth * (d.actor.id === highlight ? HOVER_SCALE : 1),
      widthUnits: 'pixels',
      widthScale: zoom.routeScale,
      capRounded: !style.dashed,
      jointRounded: true,
      pickable: true,
      updateTriggers: { ...triggers, getWidth: highlight },
      ...(style.dashed && {
        extensions: [DASH],
        getDashArray: BOT_DASH,
        dashJustified: true,
      }),
    })
  }

  const lonePoints = [...data.lonePoints].sort(
    (a, b) => ACTOR_ORDER.indexOf(a.actor.kind) - ACTOR_ORDER.indexOf(b.actor.kind),
  )
  const markers = new IconLayer<MarkerDatum, CollisionFilterExtensionProps<MarkerDatum>>({
    id: 'event-markers',
    data: data.markers, // already in draw order: loot first, kills last
    getPosition: (d) => d.position,
    getIcon: (d) => BADGE_ICONS[d.type],
    getSize: (d) => EVENT[d.type].size * markerScale(d, highlight),
    sizeUnits: 'pixels',
    sizeScale: zoom.markerScale,
    // mask is off, so only the alpha is used: the badge's opacity
    getColor: (d) => withAlpha(WHITE, markerOpacity(d, highlight)),
    pickable: true,
    // where markers overlap, the rarer event (and the human's, and the highlighted actor's) wins;
    // zooming in pulls them apart and reveals the rest (FRONTEND_GUIDELINES §11 P14)
    extensions: [COLLISION],
    collisionGroup: 'event-markers',
    getCollisionPriority: (d) =>
      MARKER_PRIORITY[d.type] + ACTOR_PRIORITY[d.actor.kind] + (d.actor.id === highlight ? HIGHLIGHT_PRIORITY : 0),
    updateTriggers: { ...triggers, getCollisionPriority: highlight },
  })

  return [
    // bottom to top: bot paths, unknown paths, human casing and paths, positions, tags, loot … kills
    pathLayer('bot'),
    pathLayer('unknown'),
    new PathLayer<PathDatum>({
      id: 'human-casing',
      data: pathsOf('human'),
      getPath: (d) => d.path,
      getColor: (d) => withAlpha(WHITE, 0.9 * emphasis(d.actor, highlight)),
      getWidth: (d) => (ACTOR.human.pathWidth + 2 * CASING_WIDTH) * (d.actor.id === highlight ? HOVER_SCALE : 1),
      widthUnits: 'pixels',
      widthScale: zoom.routeScale,
      capRounded: true,
      jointRounded: true,
      updateTriggers: { ...triggers, getWidth: highlight },
    }),
    pathLayer('human'),
    new IconLayer<PointDatum>({
      id: 'lone-samples',
      data: lonePoints,
      getPosition: (d) => d.position,
      getIcon: (d) => POSITION_ICONS[d.actor.kind],
      getSize: (d) => POSITION_SIZE[d.actor.kind],
      sizeUnits: 'pixels',
      sizeScale: zoom.routeScale,
      getColor: (d) => withAlpha(WHITE, ACTOR[d.actor.kind].opacity * emphasis(d.actor, highlight)),
      pickable: true,
      updateTriggers: triggers,
    }),
    new TextLayer<ReturnType<typeof humanTags>[number]>({
      id: 'human-tags',
      data: humanTags(data),
      getPosition: (d) => d.position,
      getText: (d) => d.tag,
      getSize: 12,
      sizeUnits: 'pixels',
      fontFamily: 'Inter, sans-serif',
      fontWeight: 600,
      characterSet: 'H0123456789',
      getColor: (d) => withAlpha(rgba(COLOR.human), emphasis(d.actor, highlight)),
      background: true,
      getBackgroundColor: (d) => withAlpha(WHITE, emphasis(d.actor, highlight)),
      backgroundPadding: [4, 2],
      // side by side, so tags of humans who start together don't overlap
      getPixelOffset: (d) => [(d.actor.humanIndex ?? 0) * 24, -14],
      updateTriggers: triggers,
    }),
    markers,
  ]
}
