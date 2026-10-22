// The gameplay encoding, defined once (FRONTEND_GUIDELINES §4): colours, icons, sizes, labels
// and draw order. Map layers, legend, tooltips and lists import from here. The colours are
// mirrored as CSS tokens in index.css; change both together.
import botAvatar from '@/assets/Bot_player.webp'
// Event icons are inlined (5–9 KB each) so the map can draw each one inside its badge as a single image.
import deathIcon from '@/assets/Dead_icon.webp?inline'
import humanAvatar from '@/assets/Human_player.webp'
import killIcon from '@/assets/kill-crosshair-skull.svg?inline'
import lootIcon from '@/assets/Loot.webp?inline'
import stormIcon from '@/assets/Cel-Shaded_Thundercloud_Emblem.webp?inline'
import type { ActorKind } from '../data/types'

export type EventType = 'kill' | 'death' | 'storm_death' | 'loot'
export type Rgba = [number, number, number, number]
/** Tone names used by IconBadge, TickSlider and the CSS tokens. */
export type Tone = 'human' | 'bot' | 'unknown' | 'kill' | 'death' | 'loot' | 'storm'

export const COLOR: Record<Tone, string> = {
  human: '#2589F5',
  bot: '#E99124',
  // EC-09: neutral, so an unknown journey reads as neither kind
  unknown: '#C3CCD8',
  kill: '#E5484D',
  death: '#344256',
  loot: '#D99A19',
  storm: '#8B5CF6',
}
export const WHITE: Rgba = [255, 255, 255, 255]

export function rgba(hex: string, opacity = 1): Rgba {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round(opacity * 255)]
}

/** Draw order, bottom to top: loot first so the rare events stay on top. */
export const EVENT_ORDER: EventType[] = ['loot', 'storm_death', 'death', 'kill']

export const EVENT: Record<EventType, { label: string; tone: Tone; icon: string; size: number }> = {
  loot: { label: 'Loot', tone: 'loot', icon: lootIcon, size: 28 },
  storm_death: { label: 'Storm death', tone: 'storm', icon: stormIcon, size: 40 },
  death: { label: 'Death', tone: 'death', icon: deathIcon, size: 40 },
  kill: { label: 'Kill', tone: 'kill', icon: killIcon, size: 40 },
}

/** Draw order for paths, bottom to top: bots, unknown, humans. */
export const ACTOR_ORDER: ActorKind[] = ['bot', 'unknown', 'human']

export const ACTOR: Record<
  ActorKind,
  { label: string; plural: string; tone: Tone; avatar: string | null; pathWidth: number; opacity: number; dashed: boolean }
> = {
  human: { label: 'Human', plural: 'Humans', tone: 'human', avatar: humanAvatar, pathWidth: 6, opacity: 1, dashed: false },
  unknown: { label: 'Unknown', plural: 'Unknown', tone: 'unknown', avatar: null, pathWidth: 4, opacity: 0.9, dashed: false },
  bot: { label: 'Bot', plural: 'Bots', tone: 'bot', avatar: botAvatar, pathWidth: 2, opacity: 0.65, dashed: true },
}

/** White casing on each side of a human path, so blue reads on dark ground. */
export const CASING_WIDTH = 1.5
export const BOT_DASH: [number, number] = [3, 2]

/** Screen px at the reference zoom (see zoomStyle). Bot-owned markers are smaller and fainter: humans are the focus. */
export const BOT_MARKER_SCALE = 0.75
export const BOT_MARKER_OPACITY = 0.75
export const HOVER_SCALE = 1.25
/** Opacity of everything that isn't the hovered or selected actor. */
export const DIM_OPACITY = 0.3
/** The icon's share of its badge; the rest is white badge and ring. */
export const ICON_IN_BADGE = 0.72
export const BADGE_RING = 3

/** Collision priority (higher wins where markers overlap; FRONTEND_GUIDELINES §11 P14). */
export const MARKER_PRIORITY: Record<EventType, number> = { kill: 40, death: 30, storm_death: 30, loot: 0 }
export const ACTOR_PRIORITY: Record<ActorKind, number> = { human: 10, unknown: 5, bot: 0 }
export const HIGHLIGHT_PRIORITY = 100

/**
 * Zoom-dependent styling, measured in zoom levels in from the whole map (0 = fitted).
 * Zoomed out, routes and markers are compact so the whole match reads at a glance; zoomed in,
 * both grow so they stay bold on the enlarged map and are easy to click (S, 2026-10-22: routes
 * were too faint zoomed in). Interpolation is linear in zoom levels, flat outside the range.
 */
export const ZOOM_DETAIL_LEVELS = 3
export const ROUTE_SCALE = { out: 1, in: 1.5 }
export const MARKER_SCALE = { out: 0.85, in: 1.3 }
/**
 * Extra shrink for markers on the whole-map view only (S, 2026-10-22): `scale` at the fitted
 * zoom, easing back to 1 (no change) within the first `levels` zoom levels in.
 */
export const FITTED_MARKER_SHRINK = { scale: 0.6, levels: 0.5 }

export function zoomStyle(levelsIn: number): { routeScale: number; markerScale: number } {
  const t = Math.min(1, Math.max(0, levelsIn / ZOOM_DETAIL_LEVELS))
  const lerp = ({ out, in: zoomedIn }: { out: number; in: number }) => out + (zoomedIn - out) * t
  const { scale, levels } = FITTED_MARKER_SHRINK
  const shrink = scale + (1 - scale) * Math.min(1, Math.max(0, levelsIn / levels))
  return { routeScale: lerp(ROUTE_SCALE), markerScale: lerp(MARKER_SCALE) * shrink }
}

/** An event icon on its badge (white disc, ring in the event colour) as one SVG image. */
export function badgeIcon(type: EventType) {
  const { icon, tone } = EVENT[type]
  const px = 128
  const ring = (BADGE_RING / EVENT[type].size) * px
  const inner = px * ICON_IN_BADGE
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">` +
    `<circle cx="${px / 2}" cy="${px / 2}" r="${px / 2 - ring / 2}" fill="#fff" stroke="${COLOR[tone]}" stroke-width="${ring}"/>` +
    `<image href="${icon}" xlink:href="${icon}" x="${(px - inner) / 2}" y="${(px - inner) / 2}" width="${inner}" height="${inner}"/>` +
    `</svg>`
  return { id: `badge-${type}`, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: px, height: px }
}

/** Single-sample positions: humans a circle, bots a diamond, unknown a square; white outline. */
export const POSITION_SIZE: Record<ActorKind, number> = { human: 18, unknown: 16, bot: 16 }

const POSITION_SHAPE: Record<ActorKind, string> = {
  human: '<circle cx="16" cy="16" r="12"/>',
  unknown: '<rect x="5" y="5" width="22" height="22" rx="2"/>',
  bot: '<path d="M16 2L30 16L16 30L2 16Z"/>',
}

export function positionIcon(kind: ActorKind) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="${COLOR[ACTOR[kind].tone]}" stroke="#fff" stroke-width="3">${POSITION_SHAPE[kind]}</g></svg>`
  return { id: `position-${kind}`, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: 32, height: 32 }
}

/**
 * Playback (spec 05): where each actor is at the playback time. The same shape as a single
 * sample, larger and with a dark edge outside the white one, so it stands out from the route
 * history and from the white casing of human paths.
 */
export const HEAD_SIZE: Record<ActorKind, number> = { human: 28, unknown: 24, bot: 22 }

export function headIcon(kind: ActorKind) {
  const shape = POSITION_SHAPE[kind]
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-2 -2 36 36">` +
    `<g fill="none" stroke="#0E1520" stroke-width="7" stroke-linejoin="round">${shape}</g>` +
    `<g fill="${COLOR[ACTOR[kind].tone]}" stroke="#fff" stroke-width="3" stroke-linejoin="round">${shape}</g></svg>`
  return { id: `head-${kind}`, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: 32, height: 32 }
}

/** Playback: events more than RECENT_EVENT_S (playback.ts) in the past keep this much of their opacity. */
export const PAST_EVENT_OPACITY = 0.8

/**
 * Journey start and end (map pass M3): an open ring where the journey was first recorded,
 * a filled square where it was last recorded, in the actor's colour with a white outline.
 * Shape tells them apart; neither is a death (that has its own marker).
 */
export const ENDPOINT_SIZE = 24

const ENDPOINT_SHAPE: Record<'start' | 'end', (fill: string) => string> = {
  start: (c) => `<circle cx="16" cy="16" r="10" fill="#fff" stroke="${c}" stroke-width="6"/>`,
  end: (c) => `<rect x="5" y="5" width="22" height="22" rx="3" fill="${c}" stroke="#fff" stroke-width="3"/>`,
}

export function endpointIcon(kind: ActorKind, which: 'start' | 'end') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${ENDPOINT_SHAPE[which](COLOR[ACTOR[kind].tone])}</svg>`
  return { id: `${which}-${kind}`, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: 32, height: 32 }
}

/** Direction chevron drawn on the route, pointing right before rotation; white with a dark edge so it reads on any colour. */
export const ARROW_SIZE = 24
/** The collision test draws arrows this much larger, which sets the minimum gap between them. */
export const ARROW_SPACING = 3
export const ARROW_ICON = {
  id: 'arrow',
  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M9 6L22 16L9 26" fill="none" stroke="#182638" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 6L22 16L9 26" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  )}`,
  width: 32,
  height: 32,
}

/** The selected journey: wider, with a soft white glow underneath, so it can't be mistaken for a hovered one. */
export const SELECTED_SCALE = 1.5
export const SELECTED_GLOW = { extraWidth: 14, opacity: 0.35 }
