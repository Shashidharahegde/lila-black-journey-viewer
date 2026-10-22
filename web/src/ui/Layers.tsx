// Legend and layer toggles in one list. Plain styling for now (functionality first).
import type { ReactNode } from 'react'
import { EVENT_ORDER, ID_MISMATCH_NOTE, type EventType } from '../map/journeys'
import { EVENT_STYLE, iconUrl } from '../map/journeyLayers'
import { useStore } from '../state/store'
import type { LayerKey, Selection } from '../state/url'

function rgb([r, g, b]: number[]): string {
  return `rgb(${r} ${g} ${b})`
}

function Toggle({ layer, hide, children }: { layer: LayerKey; hide: LayerKey[]; children: ReactNode }) {
  const toggleLayer = useStore((s) => s.toggleLayer)
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={!hide.includes(layer)} onChange={() => toggleLayer(layer)} />
      {children}
    </label>
  )
}

function EventIcon({ type }: { type: EventType }) {
  // the icon is a white mask; tint it with the event colour like the map does
  return (
    <span
      className="inline-block h-4 w-4"
      style={{
        backgroundColor: rgb(EVENT_STYLE[type].color),
        mask: `url("${iconUrl(type)}") center / contain no-repeat`,
        WebkitMask: `url("${iconUrl(type)}") center / contain no-repeat`,
      }}
    />
  )
}

export default function Layers({ selection }: { selection: Selection }) {
  const { hide } = selection
  // top of the draw order first, so the list reads most important → least
  const events = [...EVENT_ORDER].reverse()
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">Layers</span>
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-block h-[3px] w-4 bg-amber-500" /> Humans (one colour each)
      </div>
      <div className="flex items-center gap-2 text-sm" title={ID_MISMATCH_NOTE}>
        <span className="inline-block h-[2px] w-4 bg-white/80" /> Unknown (numeric ID, player-client events)
      </div>
      <Toggle layer="bots" hide={hide}>
        <span className="inline-block h-px w-4 bg-slate-400" /> Bots (paths and their events)
      </Toggle>
      {events.map((type) => (
        <Toggle key={type} layer={type} hide={hide}>
          <EventIcon type={type} /> {EVENT_STYLE[type].label}
        </Toggle>
      ))}
      <p className="pt-1 text-xs text-slate-500">
        Kill markers show where the killer stood; death markers show where the victim fell. A Kill and a Killed logged in
        the same second are both shown, at the same spot; their cause is unknown. Positions are sampled about
        every 5 s, so lines are straight between samples and may cross walls. No line is drawn across a gap over 30 s.
      </p>
    </div>
  )
}
