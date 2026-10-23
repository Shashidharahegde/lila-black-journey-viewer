// One icon per statistic, shared by the KPI tiles, the analytics strip and the scorecard, so a metric looks the same
// everywhere. Keyed by stats.json metric id or score part (they use the same ids where they overlap).
import {
  ClockIcon,
  CloudLightningIcon,
  CrosshairIcon,
  Gamepad2Icon,
  HeartCrackIcon,
  PackageCheckIcon,
  PackageIcon,
  SkullIcon,
  TimerIcon,
  TrophyIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

export const STAT_ICON: Record<string, LucideIcon> = {
  map_score: TrophyIcon,
  human_journeys: Gamepad2Icon,
  human_players: UsersIcon,
  journey_span_s: ClockIcon,
  kill_rate: CrosshairIcon,
  loot_rate: PackageIcon,
  storm_death_rate: CloudLightningIcon,
  deaths: SkullIcon,
  journeys_with_death: HeartCrackIcon,
  journeys_with_loot: PackageCheckIcon,
  first_loot_s: TimerIcon,
}

/** Each icon's tint: the gameplay colour its subject already has (kills red, loot gold, storm violet), else brand blue. */
export const STAT_TINT: Record<string, string> = {
  kill_rate: 'text-kill',
  loot_rate: 'text-loot',
  journeys_with_loot: 'text-loot',
  first_loot_s: 'text-loot',
  storm_death_rate: 'text-storm',
  deaths: 'text-death',
  journeys_with_death: 'text-death',
}

export const tintOf = (id: string) => STAT_TINT[id] ?? 'text-brand'
