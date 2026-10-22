import { IconBadge } from '@/components/icon-badge'
import { MapTooltipMeta, MapTooltipNote, MapTooltipTitle } from '@/components/map-tooltip'
import { EVENT } from '@/map/encoding'
import { actorText, endpointText, headText, markerText, type EndpointDatum, type MarkerDatum, type PathDatum, type PointDatum } from '@/map/journeys'
import type { HeadDatum } from '@/map/playback'
import ActorAvatar from './ActorAvatar'

// Hover card for anything picked on the journey layers (FRONTEND_GUIDELINES §6 Tooltips):
// what happened, who and when, then what the position means and any data notes.
export default function JourneyTooltip({ object }: { object: unknown }) {
  const d = object as PathDatum | PointDatum | MarkerDatum | EndpointDatum | HeadDatum | { actor?: undefined }
  if (!d.actor) return null
  const marker = 'type' in d ? d : null
  const endpoint = 'which' in d ? d : null
  const head = 'recorded' in d ? d : null
  const text = marker ? markerText(marker) : endpoint ? endpointText(endpoint) : head ? headText(head) : actorText(d.actor)
  return (
    <>
      <MapTooltipTitle>
        {marker ? (
          <IconBadge src={EVENT[marker.type].icon} alt="" tone={EVENT[marker.type].tone} />
        ) : (
          <ActorAvatar kind={d.actor.kind} />
        )}
        <span>{text.title}</span>
      </MapTooltipTitle>
      <MapTooltipMeta>
        {text.when ? `${text.who} · ${text.when}` : text.who}
      </MapTooltipMeta>
      {text.notes.map((note) => (
        <MapTooltipNote key={note}>{note}</MapTooltipNote>
      ))}
    </>
  )
}
