// deck.gl layers for one match, styled from encoding.ts (FRONTEND_GUIDELINES §4).
import { CollisionFilterExtension, PathStyleExtension, type CollisionFilterExtensionProps } from '@deck.gl/extensions'
import { IconLayer, PathLayer, TextLayer, type Layer } from 'deck.gl'
import type { ActorKind } from '../data/types'
import {
  ACTOR,
  ACTOR_ORDER,
  ACTOR_PRIORITY,
  ARROW_ICON,
  ARROW_SIZE,
  ARROW_SPACING,
  BOT_DASH,
  BOT_MARKER_OPACITY,
  BOT_MARKER_SCALE,
  CASING_WIDTH,
  COLOR,
  DIM_OPACITY,
  ENDPOINT_SIZE,
  EVENT,
  HEAD_SIZE,
  EVENT_ORDER,
  HIGHLIGHT_PRIORITY,
  HOVER_SCALE,
  MARKER_PRIORITY,
  PAST_EVENT_OPACITY,
  POSITION_SIZE,
  SELECTED_GLOW,
  SELECTED_SCALE,
  WHITE,
  badgeIcon,
  endpointIcon,
  headIcon,
  positionIcon,
  rgba,
  type EventType,
  type zoomStyle,
} from './encoding'
import type { ActorInfo, ArrowDatum, EndpointDatum, JourneyData, MarkerDatum, PathDatum, PointDatum } from './journeys'
import type { HeadDatum } from './playback'

const DASH = new PathStyleExtension({ dash: true })
const COLLISION = new CollisionFilterExtension()
const POSITION_ICONS = Object.fromEntries(ACTOR_ORDER.map((k) => [k, positionIcon(k)])) as Record<
  ActorKind,
  ReturnType<typeof positionIcon>
>
const HEAD_ICONS = Object.fromEntries(ACTOR_ORDER.map((k) => [k, headIcon(k)])) as Record<ActorKind, ReturnType<typeof headIcon>>
const ENDPOINT_ICONS = Object.fromEntries(
  ACTOR_ORDER.flatMap((k) => (['start', 'end'] as const).map((w) => [`${w}-${k}`, endpointIcon(k, w)])),
) as Record<string, ReturnType<typeof endpointIcon>>
// badge and icon as one image, so the collision filter treats each marker as a whole
const BADGE_ICONS = Object.fromEntries(
  EVENT_ORDER.map((type) => [type, { ...badgeIcon(type), anchorY: 64, mask: false }]),
) as Record<EventType, ReturnType<typeof badgeIcon> & { anchorY: number; mask: boolean }>

/** Who the map emphasises: the actor under the pointer, and the one picked with a click. */
export interface Focus {
  hovered: string | null
  pinned: string | null
}

/** Playback (spec 05): where each actor is now, and whether the paths are cut at the playback time. */
export interface PlaybackLayers {
  heads: HeadDatum[]
  /** paths grow every frame, so bot dashes keep a fixed length instead of being stretched to fit */
  growing: boolean
}

function withAlpha([r, g, b]: number[], opacity: number): [number, number, number, number] {
  return [r, g, b, Math.round(255 * opacity)]
}

/**
 * Accessors give sizes at the reference zoom; `zoom` scales them through widthScale / sizeScale
 * (uniforms), so zooming never recomputes per-object data.
 */
export function journeyLayers(
  data: JourneyData,
  { hovered, pinned }: Focus = { hovered: null, pinned: null },
  zoom: ReturnType<typeof zoomStyle> = { routeScale: 1, markerScale: 1 },
  playback: PlaybackLayers | null = null,
): Layer[] {
  // hover wins over the pinned actor for dimming; the pinned actor alone gets the selected look
  const highlight = hovered ?? pinned
  const focusKey = `${hovered}|${pinned}`
  const triggers = { getColor: focusKey, getFillColor: focusKey, getSize: focusKey, getWidth: focusKey }

  /** 1 for the highlighted actor (or when nothing is highlighted), DIM_OPACITY for the rest. */
  const emphasis = (a: ActorInfo) => (highlight === null || a.id === highlight ? 1 : DIM_OPACITY)
  const widthFactor = (a: ActorInfo) => (a.id === pinned ? SELECTED_SCALE : a.id === highlight ? HOVER_SCALE : 1)
  // humans (and unknown) always show where they started, ended and which way they went;
  // bots only when focused, so 14 bots don't add 28 endpoints and hundreds of arrows (P15)
  const detailed = (a: ActorInfo) => a.kind !== 'bot' || a.id === highlight || a.id === pinned
  const markerScale = (m: MarkerDatum) => (m.actor.kind === 'bot' ? BOT_MARKER_SCALE : 1) * (m.actor.id === highlight ? HOVER_SCALE : 1)
  const markerOpacity = (m: MarkerDatum) =>
    (m.actor.kind === 'bot' ? BOT_MARKER_OPACITY : 1) * (m.faded ? PAST_EVENT_OPACITY : 1) * emphasis(m.actor)

  const pathsOf = (kind: ActorKind) => data.paths.filter((p) => p.actor.kind === kind)
  const pathLayer = (kind: ActorKind) => {
    const style = ACTOR[kind]
    const base = rgba(COLOR[style.tone])
    return new PathLayer<PathDatum>({
      id: `${kind}-paths`,
      data: pathsOf(kind),
      getPath: (d) => d.path,
      // the selected bot is drawn at full strength, not at its usual 60 %
      getColor: (d) => withAlpha(base, (d.actor.id === pinned ? 1 : style.opacity) * emphasis(d.actor)),
      getWidth: (d) => style.pathWidth * widthFactor(d.actor),
      widthUnits: 'pixels',
      widthScale: zoom.routeScale,
      capRounded: !style.dashed,
      jointRounded: true,
      pickable: true,
      updateTriggers: triggers,
      ...(style.dashed && {
        extensions: [DASH],
        getDashArray: BOT_DASH,
        dashJustified: !playback?.growing,
      }),
    })
  }

  const selectedPaths = pinned ? data.paths.filter((p) => p.actor.id === pinned) : []
  const lonePoints = [...data.lonePoints].sort(
    (a, b) => ACTOR_ORDER.indexOf(a.actor.kind) - ACTOR_ORDER.indexOf(b.actor.kind),
  )
  const humanTags = data.endpoints.filter((e) => e.which === 'start' && e.actor.tag)

  return [
    // bottom to top: selected glow, bot / unknown / human paths, positions, direction arrows,
    // start and end, H1/H2 tags, playback positions, then event markers (loot … kills)
    new PathLayer<PathDatum>({
      id: 'selected-glow',
      data: selectedPaths,
      getPath: (d) => d.path,
      getColor: withAlpha(WHITE, SELECTED_GLOW.opacity),
      getWidth: (d) => ACTOR[d.actor.kind].pathWidth * SELECTED_SCALE + SELECTED_GLOW.extraWidth,
      widthUnits: 'pixels',
      widthScale: zoom.routeScale,
      capRounded: true,
      jointRounded: true,
    }),
    pathLayer('bot'),
    pathLayer('unknown'),
    new PathLayer<PathDatum>({
      id: 'human-casing',
      data: pathsOf('human'),
      getPath: (d) => d.path,
      getColor: (d) => withAlpha(WHITE, 0.9 * emphasis(d.actor)),
      getWidth: (d) => (ACTOR.human.pathWidth + 2 * CASING_WIDTH) * widthFactor(d.actor),
      widthUnits: 'pixels',
      widthScale: zoom.routeScale,
      capRounded: true,
      jointRounded: true,
      updateTriggers: triggers,
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
      getColor: (d) => withAlpha(WHITE, ACTOR[d.actor.kind].opacity * emphasis(d.actor)),
      pickable: true,
      updateTriggers: triggers,
    }),
    new IconLayer<ArrowDatum, CollisionFilterExtensionProps<ArrowDatum>>({
      id: 'direction-arrows',
      data: data.arrows.filter((a) => detailed(a.actor)),
      getPosition: (d) => d.position,
      getIcon: () => ARROW_ICON,
      getAngle: (d) => d.angle,
      getSize: ARROW_SIZE,
      sizeUnits: 'pixels',
      sizeScale: zoom.markerScale,
      getColor: (d) => withAlpha(WHITE, emphasis(d.actor)),
      updateTriggers: triggers,
      // arrows that would crowd each other are hidden; zooming in spreads the route and shows more
      extensions: [COLLISION],
      collisionGroup: 'direction-arrows',
      collisionTestProps: { sizeScale: zoom.markerScale * ARROW_SPACING },
      getCollisionPriority: (d) => ACTOR_PRIORITY[d.actor.kind] + (d.actor.id === highlight ? HIGHLIGHT_PRIORITY : 0),
    }),
    new IconLayer<EndpointDatum>({
      id: 'journey-endpoints',
      data: data.endpoints.filter((e) => detailed(e.actor)),
      getPosition: (d) => d.position,
      getIcon: (d) => ENDPOINT_ICONS[`${d.which}-${d.actor.kind}`],
      getSize: (d) => ENDPOINT_SIZE * (d.actor.id === highlight ? HOVER_SCALE : 1),
      sizeUnits: 'pixels',
      sizeScale: zoom.markerScale,
      getColor: (d) => withAlpha(WHITE, emphasis(d.actor)),
      pickable: true,
      updateTriggers: triggers,
    }),
    new TextLayer<EndpointDatum>({
      id: 'human-tags',
      data: humanTags,
      getPosition: (d) => d.position,
      getText: (d) => d.actor.tag ?? '',
      getSize: 12,
      sizeUnits: 'pixels',
      fontFamily: 'Inter, sans-serif',
      fontWeight: 600,
      characterSet: 'H0123456789',
      getColor: (d) => withAlpha(rgba(COLOR.human), emphasis(d.actor)),
      background: true,
      getBackgroundColor: (d) => withAlpha(WHITE, emphasis(d.actor)),
      backgroundPadding: [4, 2],
      // side by side above the start ring, so tags of humans who start together don't overlap
      getPixelOffset: (d) => [(d.actor.humanIndex ?? 0) * 24, -16],
      updateTriggers: triggers,
    }),
    // playback: where each actor is now, above the routes and below the event markers, so the
    // kill or death logged where an actor stands isn't hidden under it (rare events on top, §4);
    // humans last so they win where they meet bots
    ...(playback
      ? [
          new IconLayer<HeadDatum>({
            id: 'playback-heads',
            data: [...playback.heads].sort((a, b) => ACTOR_ORDER.indexOf(a.actor.kind) - ACTOR_ORDER.indexOf(b.actor.kind)),
            getPosition: (d) => d.position,
            getIcon: (d) => HEAD_ICONS[d.actor.kind],
            getSize: (d) => HEAD_SIZE[d.actor.kind] * (d.actor.id === highlight || d.actor.id === pinned ? HOVER_SCALE : 1),
            sizeUnits: 'pixels',
            sizeScale: zoom.routeScale,
            getColor: (d) => withAlpha(WHITE, emphasis(d.actor)),
            pickable: true,
            updateTriggers: triggers,
          }),
        ]
      : []),
    new IconLayer<MarkerDatum, CollisionFilterExtensionProps<MarkerDatum>>({
      id: 'event-markers',
      data: data.markers, // already in draw order: loot first, kills last
      getPosition: (d) => d.position,
      getIcon: (d) => BADGE_ICONS[d.type],
      getSize: (d) => EVENT[d.type].size * markerScale(d),
      sizeUnits: 'pixels',
      sizeScale: zoom.markerScale,
      // mask is off, so only the alpha is used: the badge's opacity
      getColor: (d) => withAlpha(WHITE, markerOpacity(d)),
      pickable: true,
      // where markers overlap, the rarer event (and the human's, and the highlighted actor's) wins;
      // zooming in pulls them apart and reveals the rest (FRONTEND_GUIDELINES §11 P14)
      extensions: [COLLISION],
      collisionGroup: 'event-markers',
      getCollisionPriority: (d) =>
        MARKER_PRIORITY[d.type] + ACTOR_PRIORITY[d.actor.kind] + (d.actor.id === highlight ? HIGHLIGHT_PRIORITY : 0),
      updateTriggers: { ...triggers, getCollisionPriority: focusKey },
    }),
  ]
}
