import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { MetricInfo as Metric } from '@/data/types'
import { formatCount } from '@/stats/format'
import MetricInfo from './MetricInfo'

export interface SharePart {
  key: string
  label: string
  value: number
  color: string
}

interface Props {
  title: string
  metric?: Metric
  description?: ReactNode
  /** stored counts of one slice, in display order; they add up to that slice's own total */
  parts: readonly SharePart[]
  unit: string
}

const share = (value: number, total: number) => `${((value / total) * 100).toFixed(1)}%`

/** How one slice's total splits into parts: a 100 % bar, then each part's count and share in words (the legend is the
 * accessible version; the bar is decoration). */
export default function ShareBar({ title, metric, description, parts, unit }: Props) {
  const total = parts.reduce((sum, p) => sum + p.value, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          {title}
          {metric && <MetricInfo metric={metric} />}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {total > 0 ? (
          <>
            <div aria-hidden="true" className="flex h-8 gap-0.5 overflow-hidden rounded-md">
              {parts
                .filter((p) => p.value > 0)
                .map((p) => (
                  <div key={p.key} className="h-full min-w-1" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
                ))}
            </div>
            <ul className="flex flex-col gap-1.5">
              {parts.map((p) => (
                <li key={p.key} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-muted-foreground">{p.label}</span>
                  <span className="font-medium tabular-nums">{formatCount(p.value)}</span>
                  <span className="w-14 text-right text-muted-foreground tabular-nums">{share(p.value, total)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatCount(total)} {unit} in total
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No {unit} in this selection.</p>
        )}
      </CardContent>
    </Card>
  )
}
