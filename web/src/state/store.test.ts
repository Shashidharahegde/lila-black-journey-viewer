import { beforeEach, describe, expect, it } from 'vitest'
import indexJson from '../../public/data/index.json'
import type { Index } from '../data/types'
import { useStore } from './store'

const index = indexJson as Index
const match = index.matches.find((m) => m.map === 'GrandRift')!
const otherDate = index.dates.find((d) => d.date !== match.date)!.date
const selection = () => useStore.getState().selection

beforeEach(() => {
  useStore.setState({ index, selection: { map: 'GrandRift', date: match.date, match: match.id, hide: [] } })
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
