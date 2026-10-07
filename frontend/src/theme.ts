export type ThemeMode = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'geeks_pos_theme'

const listeners = new Set<() => void>()

function readStoredTheme(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
  } catch {
    // private mode / blocked storage
  }
  return 'dark'
}

export function getTheme(): ThemeMode {
  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('theme-light')) return 'light'
    if (document.documentElement.classList.contains('theme-dark')) return 'dark'
  }
  if (typeof window === 'undefined') return 'dark'
  return readStoredTheme()
}

export function applyThemeToDocument(mode: ThemeMode = getTheme()) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('theme-light', mode === 'light')
  root.classList.toggle('theme-dark', mode === 'dark')
  root.style.colorScheme = mode
  root.dataset.theme = mode
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

export function setTheme(mode: ThemeMode) {
  applyThemeToDocument(mode)
  listeners.forEach((fn) => fn())
}

export function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light')
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Call once at boot (before React) to avoid theme flash. */
export function initTheme() {
  applyThemeToDocument(readStoredTheme())
}
