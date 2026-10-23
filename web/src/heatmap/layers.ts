// deck.gl layers for the heatmap: the painted picture over the minimap, and an outline for the hovered cell.
import { BitmapLayer, PolygonLayer, ScatterplotLayer, TextLayer, type Layer } from 'deck.gl'
import type { HeatmapCell, HeatmapLayerKey, MapInfo } from '../data/types'
import { imageBounds } from '../map/space'
import { cellPolygon } from './grid'

export interface OutlinedRegion {
  key: string
  rank: number
  cx: number
  cy: number
  radius: number
}
import { renderRaster } from './raster'
import type { HeatmapMode } from './scale'

/** Painted pictures kept for quick switching between layers, modes and dates (each is 512 × 512 × 4 bytes). */
const KEEP = 24
const pictures = new Map<string, ImageData>()

export interface PictureInput {
  mapId: string
  layer: HeatmapLayerKey
  mode: HeatmapMode
  dateKey: string
  cells: readonly HeatmapCell[]
  domain: number
  grid: number
}

/**
 * The picture for one map, layer, mode and date, painted once and kept. An ImageData goes to the GPU as it is
 * (not premultiplied), so faint pixels keep their colour.
 */
export function heatmapPicture({ mapId, layer, mode, dateKey, cells, domain, grid }: PictureInput): ImageData {
  const key = `${mapId}|${layer}|${mode}|${dateKey}`
  const hit = pictures.get(key)
  if (hit) {
    pictures.delete(key) // most recently used last
    pictures.set(key, hit)
    return hit
  }
  const raster = renderRaster(cells, layer, mode, domain, grid)
  const picture = new ImageData(raster.data, raster.width, raster.height)
  pictures.set(key, picture)
  for (const old of [...pictures.keys()].slice(0, Math.max(0, pictures.size - KEEP))) pictures.delete(old)
  return picture
}

export interface HeatmapLayerOptions extends PictureInput {
  map: MapInfo
  opacity: number
  /** the hovered cell, outlined so the number in the hover card has a place on the map */
  hovered: HeatmapCell | null
}

export function heatmapLayers(options: HeatmapLayerOptions): Layer[] {
  const { map, mapId, layer, mode, dateKey, opacity, hovered, grid } = options
  const layers: Layer[] = [
    new BitmapLayer({
      id: `heatmap-${mapId}-${layer}-${mode}-${dateKey}`,
      image: heatmapPicture(options),
      bounds: imageBounds(map),
      opacity,
      pickable: false,
    }),
  ]
  // Always present, empty when nothing is hovered: the layer's shaders are compiled when the map first draws,
  // not on the first hover, which is where a hitch used to show.
  layers.push(
    new PolygonLayer<HeatmapCell>({
      id: 'heatmap-hovered-cell',
      data: hovered ? [hovered] : [],
      getPolygon: (cell) => cellPolygon(cell[0], cell[1], map, grid),
      filled: false,
      stroked: true,
      getLineColor: [255, 255, 255, 220],
      getLineWidth: 1.5,
      lineWidthUnits: 'pixels',
      pickable: false,
    }),
  )
  return layers
}

const DARK: [number, number, number, number] = [10, 14, 22, 235]
const LIGHT: [number, number, number, number] = [255, 255, 255, 255]
const BRAND: [number, number, number, number] = [37, 137, 245, 255]

/**
 * Hotspot outlines for the consistent regions: a circle in the drawing space (so it follows zoom and pan with the map) drawn as a
 * double stroke, a dark casing under a white line, which reads on dark and bright ground alike; and a numbered badge on its upper right
 * that matches the ranking list. The selected region gets a thicker brand-coloured line. Nothing here is filled, so the density
 * overlay underneath stays visible.
 */
export function outlineLayers(regions: OutlinedRegion[], selectedKey: string | null): Layer[] {
  if (regions.length === 0) return []
  const selected = (r: OutlinedRegion) => r.key === selectedKey
  const badge = (r: OutlinedRegion): [number, number] => [r.cx + r.radius * Math.SQRT1_2, r.cy - r.radius * Math.SQRT1_2]
  return [
    new ScatterplotLayer<OutlinedRegion>({
      id: 'hotspot-outline-casing',
      data: regions,
      getPosition: (r) => [r.cx, r.cy],
      getRadius: (r) => r.radius,
      radiusUnits: 'common',
      filled: false,
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: (r) => (selected(r) ? 8 : 6),
      getLineColor: DARK,
      pickable: false,
      updateTriggers: { getLineWidth: selectedKey },
    }),
    new ScatterplotLayer<OutlinedRegion>({
      id: 'hotspot-outline-line',
      data: regions,
      getPosition: (r) => [r.cx, r.cy],
      getRadius: (r) => r.radius,
      radiusUnits: 'common',
      filled: false,
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: (r) => (selected(r) ? 4 : 2.5),
      getLineColor: (r) => (selected(r) ? BRAND : LIGHT),
      pickable: false,
      updateTriggers: { getLineWidth: selectedKey, getLineColor: selectedKey },
    }),
    new ScatterplotLayer<OutlinedRegion>({
      id: 'hotspot-outline-badge',
      data: regions,
      getPosition: badge,
      getRadius: 11,
      radiusUnits: 'pixels',
      filled: true,
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: 2,
      getFillColor: (r) => (selected(r) ? BRAND : LIGHT),
      getLineColor: DARK,
      pickable: false,
      updateTriggers: { getFillColor: selectedKey },
    }),
    new TextLayer<OutlinedRegion>({
      id: 'hotspot-outline-number',
      data: regions,
      getPosition: badge,
      getText: (r) => String(r.rank),
      getSize: 13,
      sizeUnits: 'pixels',
      getColor: (r) => (selected(r) ? LIGHT : DARK),
      fontFamily: 'Inter, sans-serif',
      fontWeight: 700,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      pickable: false,
      updateTriggers: { getColor: selectedKey },
    }),
  ]
}
