import { describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Index } from '../data/types'
import { DEFAULT_HEATMAP_VIEW, DEFAULT_MAP, HEATMAP_LAYERS, LAYER_KEYS, parseHeatmapView, parseSelection, parseTab, parseTime, serializeSelection, urlTime } from './url'

const index = indexJson as Index
const parse = (query: string) => parseSelection(new URLSearchParams(query), index)

// Real matches from the index, so the tests follow the data.
const grandRift = index.matches.find((m) => m.map === 'GrandRift')!
const otherDate = index.dates.find((d) => d.date !== grandRift.date)!.date

describe('parseSelection', () => {
  it('an empty URL opens the default map with all dates and no match', () => {
    expect(DEFAULT_MAP).toBe('AmbroseValley')
    expect(parse('')).toEqual({ map: 'AmbroseValley', date: null, match: null, hide: [] })
  })

  it('keeps a valid shared selection', () => {
    const query = `map=GrandRift&date=${grandRift.date}&match=${grandRift.id}`
    expect(parse(query)).toEqual({ map: 'GrandRift', date: grandRift.date, match: grandRift.id, hide: [] })
  })

  it('a valid map overrides the default', () => {
    expect(parse('map=Lockdown').map).toBe('Lockdown')
  })

  it('a link with only ?match= opens that match on its own map', () => {
    expect(parse(`match=${grandRift.id}`)).toEqual({ map: 'GrandRift', date: null, match: grandRift.id, hide: [] })
  })

  it('unknown values fall back to defaults', () => {
    expect(parse('map=Atlantis&date=1999-01-01&match=nope')).toEqual({ map: 'AmbroseValley', date: null, match: null, hide: [] })
    expect(parse('map=&date=&match=')).toEqual({ map: 'AmbroseValley', date: null, match: null, hide: [] })
    expect(parse('map=grandrift').map).toBe('AmbroseValley') // map ids are case-sensitive
  })

  it('keeps the valid parts when only some values are unknown', () => {
    expect(parse(`map=GrandRift&date=garbage&match=${grandRift.id}`)).toEqual({
      map: 'GrandRift',
      date: null,
      match: grandRift.id,
      hide: [],
    })
  })

  it('drops a match that is not on the chosen map or date', () => {
    expect(parse(`map=Lockdown&match=${grandRift.id}`)).toEqual({ map: 'Lockdown', date: null, match: null, hide: [] })
    expect(parse(`map=GrandRift&date=${otherDate}&match=${grandRift.id}`).match).toBeNull()
  })

  it('accepts every date published in index.json, including the partial 2026-02-09', () => {
    for (const { date } of index.dates) expect(parse(`date=${date}`).date).toBe(date)
    expect(parse('date=2026-02-09').date).toBe('2026-02-09')
  })
})

describe('?hide=', () => {
  it('keeps known layers in a fixed order and drops unknown or repeated ones', () => {
    expect(parse('hide=loot,bots,loot,nonsense,').hide).toEqual(['bots', 'loot'])
    expect(parse('hide=').hide).toEqual([])
    expect(parse('hide=LOOT').hide).toEqual([])
  })

  it('accepts every layer key', () => {
    expect(parse(`hide=${LAYER_KEYS.join(',')}`).hide).toEqual([...LAYER_KEYS])
  })

  it('is written with plain commas and left out when nothing is hidden', () => {
    expect(serializeSelection({ map: 'Lockdown', date: null, match: null, hide: ['bots', 'loot'] })).toBe(
      'map=Lockdown&tab=journeys&hide=bots,loot',
    )
    expect(serializeSelection({ map: 'Lockdown', date: null, match: null, hide: [] })).toBe('map=Lockdown&tab=journeys')
  })

  it('round-trips through parseSelection', () => {
    const s = parse('map=Lockdown&hide=death,bots')
    expect(parse(serializeSelection(s))).toEqual(s)
  })
})

describe('serializeSelection', () => {
  it('always names the map and leaves out empty filters', () => {
    expect(serializeSelection({ map: 'AmbroseValley', date: null, match: null, hide: [] })).toBe('map=AmbroseValley&tab=journeys')
    expect(serializeSelection({ map: 'GrandRift', date: '2026-02-10', match: 'abc', hide: [] })).toBe(
      'map=GrandRift&date=2026-02-10&tab=journeys&match=abc',
    )
  })

  it('round-trips through parseSelection', () => {
    const selection = { map: 'GrandRift', date: grandRift.date, match: grandRift.id, hide: [] }
    expect(parse(serializeSelection(selection))).toEqual(selection)
  })
})

describe('playback time in the URL (t=)', () => {
  const time = (query: string) => parseTime(new URLSearchParams(query), index, parse(query).match)
  const selection = { map: 'GrandRift', date: null, match: grandRift.id, hide: [] }

  it('opens a shared link at its time', () => {
    expect(time(`match=${grandRift.id}&t=40`)).toBe(40)
    expect(serializeSelection(selection, 40)).toBe(`map=GrandRift&tab=journeys&match=${grandRift.id}&t=40`)
  })

  it('keeps the time within the match', () => {
    expect(time(`match=${grandRift.id}&t=99999`)).toBe(Math.floor(grandRift.duration_s))
  })

  it('drops a time without a match, or one that is not whole seconds', () => {
    expect(time('map=GrandRift&t=40')).toBeNull()
    for (const t of ['abc', '-5', '4.5', '0', '']) expect(time(`match=${grandRift.id}&t=${t}`)).toBeNull()
    expect(serializeSelection({ ...selection, match: null }, 40)).toBe('map=GrandRift&tab=journeys')
  })

  it('writes whole seconds, and nothing at 00:00', () => {
    expect(urlTime(selection, 80.9)).toBe(80)
    expect(urlTime(selection, 0.4)).toBeNull()
    expect(urlTime({ ...selection, match: null }, 80)).toBeNull()
  })
})

describe('tabs and the heatmap view in the URL', () => {
  const viewOf = (query: string) => parseHeatmapView(new URLSearchParams(query))
  const tabOf = (query: string) => parseTab(new URLSearchParams(query))

  it('a link names its tab; without one, a match means Journeys and anything else means Heatmaps (as before the tabs)', () => {
    expect(tabOf('tab=journeys')).toBe('journeys')
    expect(tabOf('tab=heatmaps&match=abc')).toBe('heatmaps')
    expect(tabOf(`match=${grandRift.id}`)).toBe('journeys')
    expect(tabOf(`map=GrandRift&match=${grandRift.id}&hide=bots&t=40`)).toBe('journeys')
    expect(tabOf('')).toBe('heatmaps')
    expect(tabOf('map=Lockdown&layer=kills&heatmap=off')).toBe('heatmaps')
    expect(tabOf('tab=playback')).toBe('heatmaps') // unknown value, no match
  })

  it('the three layers are traffic (the default), kills and deaths; the defaults show density and outlines', () => {
    expect(HEATMAP_LAYERS).toEqual(['traffic', 'kills', 'deaths'])
    expect(DEFAULT_HEATMAP_VIEW).toEqual({ layer: 'traffic', density: true, outlines: true, mode: 'focused' })
  })

  it('reads a valid view', () => {
    expect(viewOf('layer=kills')).toEqual({ layer: 'kills', density: true, outlines: true, mode: 'focused' })
    expect(viewOf('map=Lockdown&layer=deaths&intensity=all')).toEqual({ layer: 'deaths', density: true, outlines: true, mode: 'all' })
    expect(viewOf('density=off')).toEqual({ layer: 'traffic', density: false, outlines: true, mode: 'focused' })
    expect(viewOf('outlines=off')).toEqual({ layer: 'traffic', density: true, outlines: false, mode: 'focused' })
    expect(viewOf('density=off&outlines=off')).toEqual({ layer: 'traffic', density: false, outlines: false, mode: 'focused' })
  })

  it('old links still work: heatmap=off means the density overlay is off', () => {
    expect(viewOf('heatmap=off')).toEqual({ layer: 'traffic', density: false, outlines: true, mode: 'focused' })
    expect(viewOf('map=GrandRift&layer=deaths&heatmap=off&intensity=all')).toEqual({ layer: 'deaths', density: false, outlines: true, mode: 'all' })
  })

  it('a missing, unknown or wrongly cased value is the default', () => {
    expect(viewOf('')).toEqual(DEFAULT_HEATMAP_VIEW)
    expect(viewOf('layer=loot&intensity=max&density=on&outlines=on')).toEqual(DEFAULT_HEATMAP_VIEW)
    expect(viewOf('layer=Kills&intensity=ALL&density=OFF&outlines=OFF')).toEqual(DEFAULT_HEATMAP_VIEW)
    expect(viewOf('intensity=hotspots')).toEqual(DEFAULT_HEATMAP_VIEW) // the earlier name for the default view
  })

  const selection = { map: 'GrandRift', date: grandRift.date, match: grandRift.id, hide: ['bots' as const] }
  const base = `map=GrandRift&date=${grandRift.date}`

  it('each tab writes only its own parameters, so playback and heatmap parameters never conflict', () => {
    expect(serializeSelection(selection, 40, DEFAULT_HEATMAP_VIEW, 'journeys')).toBe(`${base}&tab=journeys&match=${grandRift.id}&hide=bots&t=40`)
    expect(serializeSelection(selection, 40, { layer: 'deaths', density: false, outlines: true, mode: 'all' }, 'journeys')).toBe(`${base}&tab=journeys&match=${grandRift.id}&hide=bots&t=40`)
    expect(serializeSelection(selection, 40, DEFAULT_HEATMAP_VIEW, 'heatmaps')).toBe(`${base}&tab=heatmaps`)
    expect(serializeSelection(selection, 40, { layer: 'deaths', density: false, outlines: true, mode: 'all' }, 'heatmaps')).toBe(`${base}&tab=heatmaps&layer=deaths&density=off&intensity=all`)
    expect(serializeSelection(selection, 40, { layer: 'kills', density: true, outlines: false, mode: 'focused' }, 'heatmaps')).toBe(`${base}&tab=heatmaps&layer=kills&outlines=off`)
  })

  it('round-trips: what a tab writes reads back as the same tab, selection and view', () => {
    for (const layer of HEATMAP_LAYERS) {
      for (const density of [true, false]) {
        for (const outlines of [true, false]) {
          for (const mode of ['focused', 'all'] as const) {
            const sel = { map: 'Lockdown', date: otherDate, match: null, hide: [] }
            const params = new URLSearchParams(serializeSelection(sel, null, { layer, density, outlines, mode }, 'heatmaps'))
            expect(parseTab(params)).toBe('heatmaps')
            expect(parseSelection(params, index)).toEqual(sel)
            expect(parseHeatmapView(params)).toEqual({ layer, density, outlines, mode })
          }
        }
      }
    }
    const params = new URLSearchParams(serializeSelection(selection, 40, DEFAULT_HEATMAP_VIEW, 'journeys'))
    expect(parseTab(params)).toBe('journeys')
    expect(parseSelection(params, index)).toEqual(selection)
    expect(parseTime(params, index, selection.match)).toBe(40)
  })

  it('a Heatmaps link carries no match, hidden layers or time, and a Journeys link no heatmap view', () => {
    const heat = new URLSearchParams(serializeSelection(selection, 40, DEFAULT_HEATMAP_VIEW, 'heatmaps'))
    for (const key of ['match', 'hide', 't']) expect(heat.has(key)).toBe(false)
    const journeys = new URLSearchParams(serializeSelection(selection, 40, { layer: 'deaths', density: false, outlines: false, mode: 'all' }, 'journeys'))
    for (const key of ['layer', 'density', 'outlines', 'intensity']) expect(journeys.has(key)).toBe(false)
  })

  it('a link written before the tabs still opens the same view', () => {
    // an old Journeys link
    const oldJourney = new URLSearchParams(`map=GrandRift&date=${grandRift.date}&match=${grandRift.id}&hide=bots&t=40`)
    expect(parseTab(oldJourney)).toBe('journeys')
    expect(parseSelection(oldJourney, index)).toEqual(selection)
    expect(parseTime(oldJourney, index, selection.match)).toBe(40)
    // an old overview heatmap link
    const oldHeat = new URLSearchParams('map=AmbroseValley&layer=kills')
    expect(parseTab(oldHeat)).toBe('heatmaps')
    expect(parseHeatmapView(oldHeat).layer).toBe('kills')
  })
})
