// Keyboard shortcuts (FRONTEND_GUIDELINES §6). The playback keys work while a match is open.
import { SEEK_STEP_S } from '../state/playback'
import type { Tab } from '../state/url'

export interface Shortcut {
  keys: string[]
  action: string
}

/** The shortcuts that do something on this page: playback keys only on Journeys, and Esc says what it clears there. */
export function shortcutsFor(page: Tab): Shortcut[] {
  return [
    ...(page === 'journeys'
      ? [
          { keys: ['Space'], action: 'Play or pause the match' },
          { keys: ['←', '→'], action: `Back or forward ${SEEK_STEP_S} s` },
        ]
      : []),
    { keys: ['F'], action: 'Fit the map to the screen' },
    { keys: ['Esc'], action: page === 'journeys' ? 'Clear the selected journey' : 'Clear the selected hotspot' },
    { keys: ['?'], action: 'Show these shortcuts' },
  ]
}

/** True when a key press belongs to a text field or an open menu, not to the app. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.closest('[role="listbox"], [role="menu"], [role="dialog"]') !== null
  )
}
