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
  loot: { label: 'Loot', tone: 'loot', icon: lootIcon, size: 14 },
  storm_death: { label: 'Storm death', tone: 'storm', icon: stormIcon, size: 20 },
  death: { label: 'Death', tone: 'death', icon: deathIcon, size: 20 },
  kill: { label: 'Kill', tone: 'kill', icon: killIcon, size: 20 },
}

/** Draw order for paths, bottom to top: bots, unknown, humans. */
export const ACTOR_ORDER: ActorKind[] = ['bot', 'unknown', 'human']

export const ACTOR: Record<
  ActorKind,
  { label: string; plural: string; tone: Tone; avatar: string | null; pathWidth: number; opacity: number; dashed: boolean }
> = {
  human: { label: 'Human', plural: 'Humans', tone: 'human', avatar: humanAvatar, pathWidth: 3, opacity: 1, dashed: false },
  unknown: { label: 'Unknown', plural: 'Unknown', tone: 'unknown', avatar: null, pathWidth: 2, opacity: 0.85, dashed: false },
  bot: { label: 'Bot', plural: 'Bots', tone: 'bot', avatar: botAvatar, pathWidth: 1.5, opacity: 0.6, dashed: true },
}

/** White casing on each side of a human path, so blue reads on dark ground. */
export const CASING_WIDTH = 1
export const BOT_DASH: [number, number] = [4, 3]

/** Screen px at the reference zoom (see zoomStyle). Bot-owned markers are smaller and fainter: humans are the focus. */
export const BOT_MARKER_SCALE = 0.75
export const BOT_MARKER_OPACITY = 0.6
export const HOVER_SCALE = 1.25
/** Opacity of everything that isn't the hovered or selected actor. */
export const DIM_OPACITY = 0.3
/** The icon's share of its badge; the rest is white badge and ring. */
export const ICON_IN_BADGE = 0.72
export const BADGE_RING = 2

/** Collision priority (higher wins where markers overlap; FRONTEND_GUIDELINES §11 P14). */
export const MARKER_PRIORITY: Record<EventType, number> = { kill: 40, death: 30, storm_death: 30, loot: 0 }
export const ACTOR_PRIORITY: Record<ActorKind, number> = { human: 10, unknown: 5, bot: 0 }
export const HIGHLIGHT_PRIORITY = 100

/**
 * Zoom-dependent styling, measured in zoom levels in from the whole map (0 = fitted).
 * Like Mapbox's zoom-interpolated widths: zoomed out, routes are wider so they read at a glance
 * and markers are compact; zoomed in, routes thin out to show detail and markers grow to be
 * read and clicked. Interpolation is linear in zoom levels, flat outside the range.
 */
export const ZOOM_DETAIL_LEVELS = 3
export const ROUTE_SCALE = { out: 1.5, in: 1 }
export const MARKER_SCALE = { out: 0.85, in: 1.3 }

export function zoomStyle(levelsIn: number): { routeScale: number; markerScale: number } {
  const t = Math.min(1, Math.max(0, levelsIn / ZOOM_DETAIL_LEVELS))
  const lerp = ({ out, in: zoomedIn }: { out: number; in: number }) => out + (zoomedIn - out) * t
  return { routeScale: lerp(ROUTE_SCALE), markerScale: lerp(MARKER_SCALE) }
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
export const POSITION_SIZE: Record<ActorKind, number> = { human: 9, unknown: 8, bot: 8 }

const POSITION_SHAPE: Record<ActorKind, string> = {
  human: '<circle cx="16" cy="16" r="12"/>',
  unknown: '<rect x="5" y="5" width="22" height="22" rx="2"/>',
  bot: '<path d="M16 2L30 16L16 30L2 16Z"/>',
}

export function positionIcon(kind: ActorKind) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="${COLOR[ACTOR[kind].tone]}" stroke="#fff" stroke-width="3">${POSITION_SHAPE[kind]}</g></svg>`
  return { id: `position-${kind}`, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: 32, height: 32 }
}
