import { useSyncExternalStore } from 'react'
import { getTheme, setTheme, subscribeTheme, toggleTheme, type ThemeMode } from '../theme'

export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'dark' as ThemeMode)
  return {
    theme,
    isLight: theme === 'light',
    isDark: theme === 'dark',
    setTheme,
    toggleTheme,
  }
}
