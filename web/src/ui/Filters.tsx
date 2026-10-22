import type { DateInfo, Index } from '../data/types'
import { useStore } from '../state/store'
import type { Selection } from '../state/url'

const ALL_DATES = ''

function utc(iso: string): string {
  return iso.replace('T', ' ').replace('Z', ' UTC')
}

function partialReason(d: DateInfo): string {
  return `Partial day: data observed from ${utc(d.observed_from_utc)} to ${utc(d.observed_to_utc)}`
}

export default function Filters({ index, selection }: { index: Index; selection: Selection }) {
  const setMap = useStore((s) => s.setMap)
  const setDate = useStore((s) => s.setDate)
  const selectedDate = index.dates.find((d) => d.date === selection.date)

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">Map</span>
        <select
          className="mt-1 w-full rounded bg-slate-800 px-2 py-1.5 text-slate-100"
          value={selection.map}
          onChange={(e) => setMap(e.target.value)}
        >
          {Object.keys(index.maps).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">Match start date (UTC)</span>
        <select
          className="mt-1 w-full rounded bg-slate-800 px-2 py-1.5 text-slate-100"
          value={selection.date ?? ALL_DATES}
          onChange={(e) => setDate(e.target.value === ALL_DATES ? null : e.target.value)}
        >
          <option value={ALL_DATES}>All dates</option>
          {index.dates.map((d) => (
            <option key={d.date} value={d.date} title={d.partial ? partialReason(d) : undefined}>
              {d.date} · {d.matches} {d.matches === 1 ? 'match' : 'matches'}
              {d.partial ? ' · partial' : ''}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-500">Match counts cover all maps.</span>
        {selectedDate?.partial && <span className="mt-1 block text-xs text-amber-400">{partialReason(selectedDate)}</span>}
      </label>
    </div>
  )
}
