// Dark by default with a light option (FRONTEND_GUIDELINES §11 P12). The `dark` class on <html> is the
// source of truth; index.html sets it before first paint so there's no flash of the wrong theme.
import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const KEY = 'lila-theme'
const listeners = new Set<() => void>()

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // storage can be blocked; the choice then lasts until reload
  }
  for (const listener of listeners) listener()
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    current,
  )
}
