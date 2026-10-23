// The per-map image assets for the statistics pages: portrait cards in the comparison grid, wide banners on a map's own
// report. The all-maps Overview hero blends the three banners side by side. A map without an entry falls back to a plain
// tile (graceful fallback until/unless more maps are ever added).
import ambroseCard from '../assets/stats/AmbroseValley_Card.webp'
import ambroseHero from '../assets/stats/AmbroseValley_Overview.webp'
import grandriftCard from '../assets/stats/GrandRift_Card.webp'
import grandriftHero from '../assets/stats/GrandRift_Overview.webp'
import lockdownCard from '../assets/stats/Lockdown_Card.webp'
import lockdownHero from '../assets/stats/Lockdown_Overview.webp'

export const MAP_CARD_IMAGE: Record<string, string> = {
  AmbroseValley: ambroseCard,
  GrandRift: grandriftCard,
  Lockdown: lockdownCard,
}

export const MAP_HERO_IMAGE: Record<string, string> = {
  AmbroseValley: ambroseHero,
  GrandRift: grandriftHero,
  Lockdown: lockdownHero,
}
