import { beforeEach, describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Index } from '../data/types'
import { HEATMAP_OPACITY, currentHeatmap, currentZones, highlightedActor, useStore } from './store'

const index = indexJson as Index
const match = index.matches.find((m) => m.map === 'GrandRift')!
const otherDate = index.dates.find((d) => d.date !== match.date)!.date
const selection = () => useStore.getState().selection

beforeEach(() => {
  useStore.setState({
    index,
    selection: { map: 'GrandRift', date: match.date, match: match.id, hide: [] },
    hoveredActor: null,
    pinnedActor: null,
  })
})

describe('filter changes', () => {
  it('changing the map clears the match and keeps the date', () => {
    useStore.getState().setMap('Lockdown')
    expect(selection()).toEqual({ map: 'Lockdown', date: match.date, match: null, hide: [] })
  })

  it('choosing the same map changes nothing', () => {
    const before = selection()
    useStore.getState().setMap('GrandRift')
    expect(selection()).toBe(before)
  })

  it('"All dates" keeps the selected match', () => {
    useStore.getState().setDate(null)
    expect(selection()).toEqual({ map: 'GrandRift', date: null, match: match.id, hide: [] })
  })

  it('toggling a layer adds or removes it from hide, in a fixed order', () => {
    const { toggleLayer } = useStore.getState()
    toggleLayer('loot')
    toggleLayer('bots')
    expect(selection()?.hide).toEqual(['bots', 'loot'])
    toggleLayer('loot')
    expect(selection()?.hide).toEqual(['bots'])
  })

  it('changing map, date or match keeps the hidden layers', () => {
    useStore.getState().toggleLayer('bots')
    useStore.getState().setMap('Lockdown')
    useStore.getState().setDate(otherDate)
    expect(selection()?.hide).toEqual(['bots'])
  })

  it('a date that hides the selected match clears it', () => {
    useStore.getState().setDate(otherDate)
    expect(selection()).toEqual({ map: 'GrandRift', date: otherDate, match: null, hide: [] })
  })
})

describe('actor highlight', () => {
  it('hover wins over the pinned actor', () => {
    useStore.getState().pinActor('a')
    expect(highlightedActor(useStore.getState())).toBe('a')
    useStore.getState().hoverActor('b')
    expect(highlightedActor(useStore.getState())).toBe('b')
    useStore.getState().hoverActor(null)
    expect(highlightedActor(useStore.getState())).toBe('a')
  })

  it('is cleared when another match opens, kept when only layers change', () => {
    useStore.getState().pinActor('a')
    useStore.getState().toggleLayer('loot')
    expect(useStore.getState().pinnedActor).toBe('a')
    useStore.getState().selectMatch(null)
    expect(useStore.getState()).toMatchObject({ pinnedActor: null, hoveredActor: null })
  })
})

describe('heatmap state', () => {
  beforeEach(() => {
    useStore.setState({ heatmapLayer: 'traffic', densityOn: true, outlinesOn: true, heatmapMode: 'focused', heatmapOpacity: HEATMAP_OPACITY.initial, heatmap: { status: 'idle' }, heatmapAttempt: 0 })
  })

  it('starts on traffic, and changing the layer changes nothing else', () => {
    const before = selection()
    expect(useStore.getState().heatmapLayer).toBe('traffic')
    useStore.getState().setHeatmapLayer('deaths')
    expect(useStore.getState().heatmapLayer).toBe('deaths')
    expect(selection()).toBe(before)
  })

  it('ignores a layer that does not exist', () => {
    useStore.getState().setHeatmapLayer('loot' as never)
    expect(useStore.getState().heatmapLayer).toBe('traffic')
  })

  it('switching the map or the date keeps the layer', () => {
    useStore.getState().setHeatmapLayer('kills')
    useStore.getState().setMap('Lockdown')
    useStore.getState().setDate(null)
    expect(useStore.getState().heatmapLayer).toBe('kills')
  })

  it('starts with the density overlay and the outlines both on, in the Focused view, at full strength', () => {
    const s = useStore.getState()
    expect([s.densityOn, s.outlinesOn, s.heatmapMode, s.heatmapOpacity]).toEqual([true, true, 'focused', HEATMAP_OPACITY.initial])
  })

  it('the density overlay and the outlines switch independently, in all four combinations', () => {
    const { setDensityOn, setOutlinesOn } = useStore.getState()
    for (const [density, outlines] of [[true, true], [true, false], [false, true], [false, false]] as const) {
      setDensityOn(density)
      setOutlinesOn(outlines)
      expect([useStore.getState().densityOn, useStore.getState().outlinesOn]).toEqual([density, outlines])
    }
  })

  it('the switches, metric, view and opacity are kept when the metric or the map changes', () => {
    const { setDensityOn, setOutlinesOn, setHeatmapMode, setHeatmapOpacity, setHeatmapLayer } = useStore.getState()
    setDensityOn(false)
    setOutlinesOn(true)
    setHeatmapMode('all')
    setHeatmapOpacity(0.5)
    setHeatmapLayer('kills')
    useStore.getState().setMap('Lockdown')
    useStore.getState().setDate(null)
    const s = useStore.getState()
    expect([s.densityOn, s.outlinesOn, s.heatmapMode, s.heatmapOpacity, s.heatmapLayer]).toEqual([false, true, 'all', 0.5, 'kills'])
  })

  it('switching layers or mode leaves the selection and the playback alone', () => {
    const before = { selection: selection(), playback: useStore.getState().playback }
    useStore.getState().setHeatmapLayer('kills')
    useStore.getState().setHeatmapMode('all')
    expect(selection()).toBe(before.selection)
    expect(useStore.getState().playback).toBe(before.playback)
  })

  it('ignores a mode that does not exist, and takes a whole view from a link', () => {
    useStore.getState().setHeatmapMode('everything' as never)
    expect(useStore.getState().heatmapMode).toBe('focused')
    useStore.getState().setHeatmapView({ layer: 'kills', density: false, outlines: true, mode: 'all' })
    const s = useStore.getState()
    expect([s.heatmapLayer, s.densityOn, s.outlinesOn, s.heatmapMode]).toEqual(['kills', false, true, 'all'])
  })

  it('opacity stays within its limits', () => {
    const { setHeatmapOpacity } = useStore.getState()
    setHeatmapOpacity(0.5)
    expect(useStore.getState().heatmapOpacity).toBe(0.5)
    setHeatmapOpacity(5)
    expect(useStore.getState().heatmapOpacity).toBe(HEATMAP_OPACITY.max)
    setHeatmapOpacity(-1)
    expect(useStore.getState().heatmapOpacity).toBe(HEATMAP_OPACITY.min)
  })

  it('never presents another map heatmap as the selected map one', () => {
    const { setHeatmap } = useStore.getState()
    setHeatmap({ status: 'loading', map: 'Lockdown' }) // GrandRift is selected: a late answer for another map is dropped
    expect(useStore.getState().heatmap).toEqual({ status: 'idle' })
    setHeatmap({ status: 'error', map: 'GrandRift', message: 'HTTP 404' })
    expect(currentHeatmap(useStore.getState())).toEqual({ status: 'error', map: 'GrandRift', message: 'HTTP 404' })
    useStore.getState().setMap('Lockdown')
    expect(currentHeatmap(useStore.getState())).toEqual({ status: 'loading', map: 'Lockdown' })
  })

  it('retry bumps the attempt so the file is asked for again', () => {
    useStore.getState().retryHeatmap()
    useStore.getState().retryHeatmap()
    expect(useStore.getState().heatmapAttempt).toBe(2)
  })
})

describe('selected region (interpretation layer)', () => {
  beforeEach(() => {
    useStore.setState({ heatmapLayer: 'traffic', densityOn: true, outlinesOn: true, selectedZone: null, tab: 'heatmaps', zones: { status: 'idle' } })
  })

  it('clicking a region selects it; clicking it again clears it', () => {
    useStore.getState().toggleZone('5,7')
    expect(useStore.getState().selectedZone).toBe('5,7')
    useStore.getState().toggleZone('6,7')
    expect(useStore.getState().selectedZone).toBe('6,7')
    useStore.getState().toggleZone('6,7')
    expect(useStore.getState().selectedZone).toBeNull()
  })

  it('changing the layer, the date or the map clears it; the switches and opening a match do not', () => {
    const { toggleZone } = useStore.getState()
    toggleZone('5,7')
    useStore.getState().setHeatmapLayer('kills')
    expect(useStore.getState().selectedZone).toBeNull()
    toggleZone('5,7')
    useStore.getState().setDate(otherDate)
    expect(useStore.getState().selectedZone).toBeNull()
    toggleZone('5,7')
    useStore.getState().setMap('Lockdown')
    expect(useStore.getState().selectedZone).toBeNull()
    useStore.getState().setMap('GrandRift')
    toggleZone('5,7')
    useStore.getState().setDensityOn(false)
    useStore.getState().setOutlinesOn(false)
    expect(useStore.getState().selectedZone).toBe('5,7') // the switches show or hide layers; the selection stays
    useStore.getState().selectMatch(match.id) // the same map and date: the region stays selected
    expect(useStore.getState().selectedZone).toBe('5,7')
  })

  it('region statistics for another map are never presented as the selected map one', () => {
    const { setZones } = useStore.getState()
    setZones({ status: 'loading', map: 'Lockdown' }) // GrandRift is selected: dropped
    expect(useStore.getState().zones).toEqual({ status: 'idle' })
    setZones({ status: 'error', map: 'GrandRift', message: 'HTTP 404' })
    expect(currentZones(useStore.getState())).toEqual({ status: 'error', map: 'GrandRift', message: 'HTTP 404' })
    useStore.getState().setMap('Lockdown')
    expect(currentZones(useStore.getState())).toEqual({ status: 'loading', map: 'Lockdown' })
  })
})

describe('tabs (Journeys & Playback, Heatmaps)', () => {
  const journeyTime = 95

  beforeEach(() => {
    useStore.setState({ tab: 'journeys', selectedZone: null })
  })

  it('leaving the Journeys tab pauses playback and keeps the match and the time; returning stays paused at the same moment', () => {
    useStore.getState().setSelection({ map: 'GrandRift', date: match.date, match: match.id, hide: ['bots'] }, 0)
    useStore.setState({ matchFile: { status: 'ready', id: match.id, data: {} as never }, playback: { ...useStore.getState().playback, time: journeyTime, playing: true, scrubbing: true } })
    useStore.getState().setTab('heatmaps')
    const away = useStore.getState()
    expect(away.tab).toBe('heatmaps')
    expect(away.playback).toMatchObject({ playing: false, scrubbing: false, time: journeyTime })
    expect(away.selection).toMatchObject({ match: match.id, hide: ['bots'] })
    useStore.getState().setTab('journeys')
    const back = useStore.getState()
    expect(back.playback).toMatchObject({ playing: false, time: journeyTime }) // paused where it was left
    expect(back.selection).toMatchObject({ match: match.id, hide: ['bots'] })
  })

  it('the heatmap settings are kept across tab switches, and the map and date are shared', () => {
    const { setDensityOn, setOutlinesOn, setHeatmapLayer, setHeatmapMode, setHeatmapOpacity, setTab } = useStore.getState()
    setTab('heatmaps')
    setDensityOn(false)
    setOutlinesOn(true)
    setHeatmapLayer('deaths')
    setHeatmapMode('all')
    setHeatmapOpacity(0.6)
    setTab('journeys')
    useStore.getState().setDate(otherDate)
    setTab('heatmaps')
    const s = useStore.getState()
    expect([s.densityOn, s.outlinesOn, s.heatmapLayer, s.heatmapMode, s.heatmapOpacity]).toEqual([false, true, 'deaths', 'all', 0.6])
    expect(s.selection?.date).toBe(otherDate)
  })

  it('an unknown tab is ignored, and choosing the current tab changes nothing', () => {
    const before = useStore.getState()
    useStore.getState().setTab('journeys')
    useStore.getState().setTab('elsewhere' as never)
    expect(useStore.getState().tab).toBe('journeys')
    expect(useStore.getState().playback).toBe(before.playback)
  })

  it('the selected hotspot is cleared by a new metric, not by a tab switch', () => {
    const { setTab, toggleZone } = useStore.getState()
    setTab('heatmaps')
    toggleZone('5,7')
    setTab('journeys')
    setTab('heatmaps')
    expect(useStore.getState().selectedZone).toBe('5,7')
    useStore.getState().setHeatmapLayer('kills')
    expect(useStore.getState().selectedZone).toBe(null)
  })
})

describe('selectors give React a stable snapshot', () => {
  it('the file of another map reads as the same "loading" object every time, for the heatmap and the regions', () => {
    const state = { selection: { map: 'Lockdown', date: null, match: null, hide: [] }, heatmap: { status: 'ready', map: 'GrandRift' }, zones: { status: 'ready', map: 'GrandRift' } } as never
    expect(currentHeatmap(state)).toBe(currentHeatmap(state))
    expect(currentZones(state)).toBe(currentZones(state))
    expect(currentHeatmap(state)).toEqual({ status: 'loading', map: 'Lockdown' })
  })
})

describe('side panel', () => {
  it('full paths are on when the app opens (S, 2026-10-23)', () => {
    expect(useStore.getInitialState().fullPaths).toBe(true)
  })

  it('folding it away keeps the heatmap view, the selected region and the selection', () => {
    const { setHeatmapLayer, setHeatmapMode, toggleZone, setPanelCollapsed } = useStore.getState()
    setHeatmapLayer('kills')
    setHeatmapMode('all')
    toggleZone('5,7')
    const before = useStore.getState()
    setPanelCollapsed(true)
    expect(useStore.getState().panelCollapsed).toBe(true)
    setPanelCollapsed(false)
    const after = useStore.getState()
    expect([after.panelCollapsed, after.heatmapLayer, after.heatmapMode, after.selectedZone, after.selection]).toEqual([false, 'kills', 'all', '5,7', before.selection])
  })
})
