import { CalendarClockIcon, CrosshairIcon, PackageIcon, SkullIcon, TimerIcon, type LucideIcon } from 'lucide-react'
import type { MatchSort } from '@/state/matches'

// One icon and one tint per sort. The tint colours only the chip background and its icon; label text stays
// in the foreground colour, since the event hues don't reach 4.5:1 on white (FRONTEND_GUIDELINES §4).
export const SORT_STYLE: Record<MatchSort, { icon: LucideIcon; chip: string }> = {
  duration: { icon: TimerIcon, chip: 'bg-sort-duration/12 [&>svg]:text-sort-duration' },
  kills: { icon: CrosshairIcon, chip: 'bg-kill/12 [&>svg]:text-kill' },
  deaths: { icon: SkullIcon, chip: 'bg-death/12 [&>svg]:text-death' },
  loot: { icon: PackageIcon, chip: 'bg-loot/15 [&>svg]:text-loot' },
  recent: { icon: CalendarClockIcon, chip: 'bg-sort-recent/12 [&>svg]:text-sort-recent' },
}
