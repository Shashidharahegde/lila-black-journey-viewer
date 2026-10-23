import type { HeatmapFile, Index, MatchFile, ZonesFile } from './types'

export function dataUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(dataUrl(path), { signal })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return (await response.json()) as T
}

export function loadIndex(): Promise<Index> {
  return getJson<Index>('data/index.json')
}

export function loadMatch(id: string, signal?: AbortSignal): Promise<MatchFile> {
  return getJson<MatchFile>(`data/matches/${encodeURIComponent(id)}.json`, signal)
}

export function loadHeatmap(map: string, signal?: AbortSignal): Promise<HeatmapFile> {
  return getJson<HeatmapFile>(`data/heatmaps/${encodeURIComponent(map)}.json`, signal)
}

export function loadZones(map: string, signal?: AbortSignal): Promise<ZonesFile> {
  return getJson<ZonesFile>(`data/zones/${encodeURIComponent(map)}.json`, signal)
}
