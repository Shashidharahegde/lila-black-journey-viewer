// Stored histograms → chart rows. Bins are exactly as stored: [edges[k], edges[k+1]), plus the overflow bin when it's open-ended.
import type { HistogramValue } from '../data/types'
import { formatCount } from './format'

/** How bin edges read: whole minutes, seconds, plain values, or whole counts (where a bin [4, 6) means 4–5). */
export type BinStyle = 'minutes' | 'seconds' | 'values' | 'counts'

/** The death-time series, in a fixed stacking and legend order (spec 10, Accessibility). */
export const DEATH_SERIES = [
  { key: 'by_bot', label: 'Killed by a bot', color: 'var(--chart-3)' },
  { key: 'storm', label: 'Storm', color: 'var(--chart-4)' },
  // the cause is unknown (EC-12): the `unknown` grey, never the kill colour; it stays apart from the death colour in both themes
  { key: 'paired_killed', label: 'Kill/Killed pair (cause unknown)', color: 'var(--unknown)' },
] as const

export interface Series {
  key: string
  label: string
  color: string
}

export type HistogramRow = { bin: string } & Record<string, number | string>

export function binLabel(lo: number, hi: number, style: BinStyle): string {
  if (style === 'minutes') return `${lo / 60}–${hi / 60} min`
  if (style === 'seconds') return `${lo}–${hi} s`
  if (style === 'values') return `${formatCount(lo)}–${formatCount(hi)}`
  return hi - lo === 1 ? formatCount(lo) : `${formatCount(lo)}–${formatCount(hi - 1)}`
}

export function overflowLabel(last: number, style: BinStyle): string {
  if (style === 'minutes') return `${last / 60} min +`
  if (style === 'seconds') return `${last} s +`
  return `${formatCount(last)}+`
}

/**
 * One row per stored bin, then the overflow bin if `openEnded` (or if anything overflowed, so no value is ever dropped).
 * A plain histogram gives each row a `value`; a split one gives each row one number per series in `seriesKeys`.
 */
export function histogramRows(h: HistogramValue, style: BinStyle, openEnded: boolean, seriesKeys: readonly string[] = ['value']): HistogramRow[] {
  const columns = h.series ? seriesKeys.map((key) => h.series![key]) : [h.counts!]
  const rows: HistogramRow[] = h.edges.slice(0, -1).map((lo, k) => {
    const row: HistogramRow = { bin: binLabel(lo, h.edges[k + 1], style) }
    seriesKeys.forEach((key, s) => (row[key] = columns[s][k]))
    return row
  })
  if (openEnded || h.overflow > 0) {
    const label = overflowLabel(h.edges[h.edges.length - 1], style)
    if (h.series) {
      // the file doesn't split the overflow by series, so it is named in the label instead of drawn under one series
      const row: HistogramRow = { bin: `${label} (${formatCount(h.overflow)}, cause not split)` }
      seriesKeys.forEach((key) => (row[key] = 0))
      rows.push(row)
    } else {
      rows.push({ bin: label, value: h.overflow })
    }
  }
  return rows
}

/** The chart's aria-label: every bar in words, series in their fixed order. */
export function histogramSummary(title: string, rows: readonly HistogramRow[], series: readonly Series[]): string {
  const bins = rows.map((row) =>
    series.length === 1 ? `${row.bin}: ${formatCount(Number(row[series[0].key]))}` : `${row.bin}: ${series.map((s) => `${s.label} ${formatCount(Number(row[s.key]))}`).join(', ')}`,
  )
  return `${title}. ${bins.join('; ')}.`
}
