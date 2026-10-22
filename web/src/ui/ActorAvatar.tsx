import { CircleHelpIcon } from 'lucide-react'
import { IconBadge } from '@/components/icon-badge'
import type { ActorKind } from '@/data/types'
import { ACTOR } from '@/map/encoding'

// Human and bot illustrations appear only where there is room: legend, lists, tooltip headers (§4).
// Unknown journeys have no illustration of their own (EC-09), so they get a neutral "?".
export default function ActorAvatar({ kind, size }: { kind: ActorKind; size?: 'sm' | 'default' | 'lg' }) {
  const { avatar, tone, label } = ACTOR[kind]
  return avatar ? (
    <IconBadge src={avatar} alt="" tone={tone} size={size} title={label} />
  ) : (
    <IconBadge alt="" tone={tone} size={size} title={label}>
      <CircleHelpIcon />
    </IconBadge>
  )
}
