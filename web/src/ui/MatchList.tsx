import { useMemo } from 'react'
import type { Index } from '../data/types'
import { durationLabel, pickerMatches, playersLabel } from '../state/matches'
import { useStore } from '../state/store'
import type { Selection } from '../state/url'

function FileStatus() {
  const matchFile = useStore((s) => s.matchFile)
  if (matchFile.status === 'loading') return <span className="text-slate-400">Loading…</span>
  if (matchFile.status === 'error') return <span className="text-red-400">Could not load ({matchFile.message})</span>
  if (matchFile.status === 'ready') return <span className="text-emerald-400">Loaded · {matchFile.data.actors.length} journeys</span>
  return null
}

export default function MatchList({ index, selection }: { index: Index; selection: Selection }) {
  const selectMatch = useStore((s) => s.selectMatch)
  const matches = useMemo(
    () => pickerMatches(index.matches, selection.map, selection.date),
    [index, selection.map, selection.date],
  )

  return (
    <div className="flex min-h-48 flex-1 flex-col">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
          Matches ({matches.length})
        </span>
        {selection.match && (
          <button type="button" className="text-xs text-slate-400 hover:text-slate-100" onClick={() => selectMatch(null)}>
            Clear
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">Most recorded players first, then longest.</p>
      {matches.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No matches on this map for this date.</p>
      ) : (
        <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {matches.map((m) => {
            const selected = m.id === selection.match
            return (
              <li key={m.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectMatch(selected ? null : m.id)}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                    selected ? 'bg-sky-700 text-white' : 'bg-slate-800/60 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{playersLabel(m)}</span>
                    <span className="font-mono">{durationLabel(m.duration_s)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-xs opacity-75">
                    <span className="font-mono">{m.id}</span>
                    <span>
                      {m.map} · {m.date}
                    </span>
                  </div>
                  {selected && (
                    <div className="mt-1 text-xs">
                      <FileStatus />
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
