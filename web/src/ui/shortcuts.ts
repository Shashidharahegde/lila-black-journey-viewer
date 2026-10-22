// Keyboard shortcuts (FRONTEND_GUIDELINES §6). Playback keys (Space, ← / →) arrive with feature 5.

export const SHORTCUTS: { keys: string[]; action: string }[] = [
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
