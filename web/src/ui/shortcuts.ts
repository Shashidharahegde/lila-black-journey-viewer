// Keyboard shortcuts (FRONTEND_GUIDELINES §6). The playback keys work while a match is open.
import { SEEK_STEP_S } from '../state/playback'

export const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ['Space'], action: 'Play or pause the match' },
  { keys: ['←', '→'], action: `Back or forward ${SEEK_STEP_S} s` },
  { keys: ['F'], action: 'Fit the map to the screen' },
  { keys: ['Esc'], action: 'Clear the selected actor' },
  { keys: ['?'], action: 'Show these shortcuts' },
  { keys: ['Tab'], action: 'Move between controls' },
]

/** True when a key press belongs to a text field or an open menu, not to the app. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.closest('[role="listbox"], [role="menu"], [role="dialog"]') !== null
  )
}
