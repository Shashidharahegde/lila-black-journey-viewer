import { describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Index } from '../data/types'
import { DEFAULT_MAP, LAYER_KEYS, parseSelection, parseTime, serializeSelection, urlTime } from './url'

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
      'map=Lockdown&hide=bots,loot',
    )
    expect(serializeSelection({ map: 'Lockdown', date: null, match: null, hide: [] })).toBe('map=Lockdown')
  })

  it('round-trips through parseSelection', () => {
    const s = parse('map=Lockdown&hide=death,bots')
    expect(parse(serializeSelection(s))).toEqual(s)
  })
})

describe('serializeSelection', () => {
  it('always names the map and leaves out empty filters', () => {
    expect(serializeSelection({ map: 'AmbroseValley', date: null, match: null, hide: [] })).toBe('map=AmbroseValley')
    expect(serializeSelection({ map: 'GrandRift', date: '2026-02-10', match: 'abc', hide: [] })).toBe(
      'map=GrandRift&date=2026-02-10&match=abc',
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
    expect(serializeSelection(selection, 40)).toBe(`map=GrandRift&match=${grandRift.id}&t=40`)
  })

  it('keeps the time within the match', () => {
    expect(time(`match=${grandRift.id}&t=99999`)).toBe(Math.floor(grandRift.duration_s))
  })

  it('drops a time without a match, or one that is not whole seconds', () => {
    expect(time('map=GrandRift&t=40')).toBeNull()
    for (const t of ['abc', '-5', '4.5', '0', '']) expect(time(`match=${grandRift.id}&t=${t}`)).toBeNull()
    expect(serializeSelection({ ...selection, match: null }, 40)).toBe('map=GrandRift')
  })

  it('writes whole seconds, and nothing at 00:00', () => {
    expect(urlTime(selection, 80.9)).toBe(80)
    expect(urlTime(selection, 0.4)).toBeNull()
    expect(urlTime({ ...selection, match: null }, 80)).toBeNull()
  })
})
