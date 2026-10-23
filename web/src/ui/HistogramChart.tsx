import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import type { MetricInfo as Metric } from '@/data/types'
import { histogramSummary, type HistogramRow, type Series } from '@/stats/histogram'
import MetricInfo from './MetricInfo'

interface Props {
  title: string
  metric: Metric
  description?: ReactNode
  rows: HistogramRow[]
  /** in stacking and legend order */
  series: readonly Series[]
  /** what the bars count, e.g. "journeys" */
  unit: string
  xLabel: string
  /** the axis titles drawn on the chart, with units, e.g. "Match time (minutes)" and "Deaths" */
  xTitle: string
  yTitle: string
  /** a shorter chart for the report's overview grid */
  compact?: boolean
}

const AXIS_TITLE = { className: 'fill-muted-foreground text-xs' }

/** A stored histogram as bars, bins exactly as stored, with a hidden table of the same numbers. No smoothing. */
export default function HistogramChart({ title, metric, description, rows, series, unit, xLabel, xTitle, yTitle, compact = false }: Props) {
  const config: ChartConfig = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]))
  const stacked = series.length > 1
  // legend and tooltip list series in the stacking order, not alphabetically (Recharts' default)
  const order = (item: { dataKey?: unknown }) => series.findIndex((s) => s.key === item.dataKey)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          {title}
          <MetricInfo metric={metric} />
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className={`aspect-auto w-full ${compact ? 'h-52' : 'h-72'}`} role="img" aria-label={histogramSummary(title, rows, series)}>
          <BarChart data={rows} margin={{ top: 8, left: 8, right: 8, bottom: 16 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="bin"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={8}
              label={{ value: xTitle, position: 'insideBottom', offset: -12, ...AXIS_TITLE }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={44}
              label={{ value: yTitle, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, ...AXIS_TITLE }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} itemSorter={order} />
            {stacked && <ChartLegend verticalAlign="top" content={<ChartLegendContent className="pb-2" />} itemSorter={order} />}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId={stacked ? 'stack' : undefined}
                fill={`var(--color-${s.key})`}
                radius={!stacked || i === series.length - 1 ? [3, 3, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartContainer>
        <table className="sr-only">
          <caption>
            {title}: {unit} per {xLabel}
          </caption>
          <thead>
            <tr>
              <th scope="col">{xLabel}</th>
              {series.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bin}>
                <th scope="row">{row.bin}</th>
                {series.map((s) => (
                  <td key={s.key}>{row[s.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
