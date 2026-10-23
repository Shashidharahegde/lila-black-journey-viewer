import type { ReactNode } from 'react'
import { Cell, Pie, PieChart } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import type { StatsFile } from '@/data/types'
import { ALL } from '@/state/statsUrl'
import { KPIS, kpiByMap, type KpiId } from '@/stats/comparison'
import { formatCount } from '@/stats/format'
import { countOf, sliceFor } from '@/stats/slices'
import { STAT_ICON, tintOf } from './statIcons'

// three steps of brand blue for the maps in the donut: one hue (no new map colours), told apart by lightness
const MAP_SHADE = ['var(--brand)', 'color-mix(in oklch, var(--brand) 62%, var(--card))', 'color-mix(in oklch, var(--brand) 34%, var(--card))']

// each bar chart's colour is the gameplay colour of what it counts
const BAR_COLOUR: Partial<Record<KpiId, string>> = { kills: 'var(--kill)', loot: 'var(--loot)', storm: 'var(--storm)' }

function StripCard({ id, title, basis, children }: { id: string; title: string; basis: string; children: ReactNode }) {
  const Icon = STAT_ICON[id]
  return (
    <Card size="sm" className="gap-2">
      <CardHeader className="gap-0">
        <CardTitle className="flex items-center gap-1.5">
          {Icon && <Icon className={`size-4 ${tintOf(id)}`} aria-hidden="true" />}
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{basis}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Where matches are played: each map's matches played as a share of all of them. Valid as parts of a whole because
 * every match played belongs to exactly one map, so the map counts add up to the all-maps count (tested). */
function ActivityDonut({ stats, date, selected }: { stats: StatsFile; date: string; selected: string }) {
  const total = countOf(sliceFor(stats, ALL, date), 'human_journeys') ?? 0
  const rows = stats.maps.map((map, i) => ({ map, value: countOf(sliceFor(stats, map, date), 'human_journeys') ?? 0, fill: MAP_SHADE[i % MAP_SHADE.length] }))
  const config: ChartConfig = Object.fromEntries(rows.map((r) => [r.map, { label: r.map, color: r.fill }]))
  const share = (n: number) => `${total ? Math.round((n / total) * 100) : 0}%`
  return (
    <StripCard id="human_journeys" title="Where matches are played" basis="Share of all matches played">
      <div className="flex items-center gap-3">
        <ChartContainer config={config} className="aspect-square h-24 shrink-0" role="img" aria-label={`Matches played: ${rows.map((r) => `${r.map} ${share(r.value)}`).join(', ')}`}>
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="map" innerRadius="62%" outerRadius="100%" strokeWidth={2} stroke="var(--card)" isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.map} fill={r.fill} fillOpacity={r.map === selected ? 1 : 0.85} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
          {rows.map((r) => (
            <li key={r.map} className={`flex items-center gap-1.5 ${r.map === selected ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
              <span className="size-2 shrink-0 rounded-full" style={{ background: r.fill }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{r.map}</span>
              <span className="tabular-nums">{share(r.value)}</span>
            </li>
          ))}
          <li className="pt-0.5 text-muted-foreground tabular-nums">{formatCount(total)} in total</li>
        </ul>
      </div>
    </StripCard>
  )
}

/** One KPI across the maps as horizontal bars, in the maps' fixed order so the strip reads across; values labelled. */
function KpiBars({ stats, date, selected, id, basis }: { stats: StatsFile; date: string; selected: string; id: KpiId; basis: string }) {
  const kpi = KPIS[id]
  const rows = kpiByMap(stats, date, id)
  const max = Math.max(0, ...rows.map((r) => r.value ?? 0))
  return (
    <StripCard id={kpi.metric} title={kpi.label} basis={basis}>
      <ul className="flex flex-col gap-1.5" aria-label={`${kpi.label}, ${basis}`}>
        {rows.map((r) => (
          <li key={r.map} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-xs">
            <span className={`truncate ${r.map === selected ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{r.map}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-full"
                style={{ width: `${max && r.value ? (r.value / max) * 100 : 0}%`, background: BAR_COLOUR[id] ?? 'var(--brand)', opacity: r.map === selected ? 1 : 0.6 }}
              />
            </span>
            <span className="w-12 text-right font-medium tabular-nums">{r.value === null ? '—' : kpi.format(r.value)}</span>
          </li>
        ))}
      </ul>
    </StripCard>
  )
}

/** A compact row of small charts: how activity, combat, loot and the storm differ between the maps. It reads the same
 * KPI definitions as the map cards' "Compare on" menu, and highlights the selected map. */
export default function AnalyticsStrip({ stats, date, selected }: { stats: StatsFile; date: string; selected: string }) {
  return (
    <section aria-label="Map comparison charts" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <ActivityDonut stats={stats} date={date} selected={selected} />
      <KpiBars stats={stats} date={date} selected={selected} id="kills" basis="Average per player, per match" />
      <KpiBars stats={stats} date={date} selected={selected} id="loot" basis="Average per player, per match" />
      <KpiBars stats={stats} date={date} selected={selected} id="storm" basis="% of matches played" />
    </section>
  )
}
