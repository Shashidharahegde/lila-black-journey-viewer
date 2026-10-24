import { describe, expect, it } from 'vitest'
import { shortcutsFor } from './shortcuts'

const keysOf = (page: 'heatmaps' | 'journeys') => shortcutsFor(page).map((s) => s.keys.join(' '))

describe('shortcut list', () => {
  it('lists the playback keys only on Journeys', () => {
    expect(keysOf('journeys')).toEqual(['Space', '← →', 'F', 'Esc', '?'])
    expect(keysOf('heatmaps')).toEqual(['F', 'Esc', '?'])
  })

  it('says what Esc clears on each page', () => {
    const esc = (page: 'heatmaps' | 'journeys') => shortcutsFor(page).find((s) => s.keys[0] === 'Esc')?.action
    expect(esc('journeys')).toBe('Clear the selected journey')
    expect(esc('heatmaps')).toBe('Clear the selected hotspot')
  })
})
