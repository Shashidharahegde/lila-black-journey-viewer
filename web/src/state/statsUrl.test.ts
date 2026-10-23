import { describe, expect, it } from 'vitest'
import statsJson from '../../public/data/stats.json'
import type { StatsFile } from '../data/types'
import { DEFAULT_STATS_SCOPE, SECTIONS, exploreLinkFor, overviewLinkFor, parseStatsScope, serializeStatsScope, statsLinkFor } from './statsUrl'

const stats = statsJson as unknown as StatsFile
const parse = (query: string) => parseStatsScope(new URLSearchParams(query), stats)
const date = stats.dates[1].date

describe('parseStatsScope', () => {
  it('an empty URL is all maps, all dates, the Overview section', () => {
    expect(parse('')).toEqual(DEFAULT_STATS_SCOPE)
    expect(DEFAULT_STATS_SCOPE).toEqual({ map: 'all', date: 'all', section: 'overview' })
  })

  it('keeps a valid scope', () => {
    expect(parse(`map=GrandRift&date=${date}&section=loot`)).toEqual({ map: 'GrandRift', date, section: 'loot' })
    expect(parse('map=Lockdown&section=combat').section).toBe('combat')
  })

  it('invalid values fall back to the default, one by one', () => {
    expect(parse('map=Atlantis&date=1999-01-01&section=nope')).toEqual(DEFAULT_STATS_SCOPE)
    expect(parse(`map=grandrift&date=${date}`)).toEqual({ map: 'all', date, section: 'overview' }) // map ids are case-sensitive
    expect(parse('map=all&date=all').map).toBe('all')
  })

  it('the all-maps overview has no section of its own, even if one is named', () => {
    expect(parse('section=loot')).toEqual(DEFAULT_STATS_SCOPE)
    expect(parse('map=all&section=combat').section).toBe('overview')
  })

  it('legacy tab= links still work: combat becomes a section when a real map is named; engagement and maps open the Overview', () => {
    expect(parse('map=Lockdown&tab=engagement').section).toBe('overview')
    // the removed Engagement and Movement sections fall back to the Overview section
    expect(parse('map=Lockdown&section=engagement').section).toBe('overview')
    expect(parse('map=Lockdown&section=movement').section).toBe('overview')
    expect(parse('map=Lockdown&tab=combat').section).toBe('combat')
    expect(parse('tab=maps')).toEqual(DEFAULT_STATS_SCOPE) // map comparison now lives on the all-maps overview itself
    expect(parse('map=Lockdown&tab=maps').section).toBe('overview')
    expect(parse('map=Lockdown&tab=nope').section).toBe('overview')
    // a new section= always wins over a legacy tab=
    expect(parse('map=Lockdown&tab=combat&section=loot').section).toBe('loot')
  })
})

describe('serializeStatsScope', () => {
  it('leaves out "all" and the default section', () => {
    expect(SECTIONS).toEqual(['overview', 'combat', 'loot'])
    expect(serializeStatsScope(DEFAULT_STATS_SCOPE)).toBe('')
    expect(serializeStatsScope({ map: 'Lockdown', date, section: 'overview' })).toBe(`map=Lockdown&date=${date}`)
    expect(serializeStatsScope({ map: 'Lockdown', date, section: 'loot' })).toBe(`map=Lockdown&date=${date}&section=loot`)
  })

  it('round-trips every map, date and section', () => {
    for (const map of ['all', ...stats.maps]) {
      for (const d of ['all', ...stats.dates.map((x) => x.date)]) {
        for (const section of SECTIONS) {
          const scope = { map, date: d, section: map === 'all' ? ('overview' as const) : section }
          expect(parse(serializeStatsScope(scope))).toEqual(scope)
        }
      }
    }
  })

  it('a map card links to that map\'s report, on its Overview section', () => {
    expect(statsLinkFor('GrandRift', null)).toBe('/stats?map=GrandRift')
    expect(statsLinkFor('Lockdown', date)).toBe(`/stats?map=Lockdown&date=${date}`)
  })

  it('the primary nav\'s Overview link keeps the date but never a map', () => {
    expect(overviewLinkFor(null)).toBe('/stats')
    expect(overviewLinkFor(date)).toBe(`/stats?date=${date}`)
  })
})

describe('exploreLinkFor', () => {
  it('defaults to Heatmaps and omits a missing date', () => {
    expect(exploreLinkFor('GrandRift', null)).toBe('/explore?map=GrandRift&tab=heatmaps')
    expect(exploreLinkFor('Lockdown', date)).toBe(`/explore?map=Lockdown&tab=heatmaps&date=${date}`)
  })

  it('can target Journeys & Playback instead', () => {
    expect(exploreLinkFor('AmbroseValley', null, 'journeys')).toBe('/explore?map=AmbroseValley&tab=journeys')
  })
})
