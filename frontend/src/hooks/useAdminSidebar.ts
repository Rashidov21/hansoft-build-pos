import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'geeks_pos_sidebar_collapsed'

export type SidebarLayout = 'expanded' | 'collapsed'

function readStored(): SidebarLayout {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1' ? 'collapsed' : 'expanded'
  } catch {
    return 'expanded'
  }
}

function applyDocumentClass(collapsed: boolean) {
  document.documentElement.classList.toggle('sidebar-collapsed', collapsed)
}

function preferCollapsedForViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 1366
}

export function useAdminSidebar(defaultCollapsed = false) {
  const [collapsed, setCollapsedState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) return stored === '1'
    } catch {
      /* ignore */
    }
    return defaultCollapsed || preferCollapsedForViewport()
  })

  useEffect(() => {
    applyDocumentClass(collapsed)
  }, [collapsed])

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('sidebar-collapsed')
    }
  }, [])

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value)
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch {
      /* ignore */
    }
    applyDocumentClass(value)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed(!collapsed)
  }, [collapsed, setCollapsed])

  const layout: SidebarLayout = collapsed ? 'collapsed' : 'expanded'

  return { collapsed, layout, setCollapsed, toggle }
}

export function syncSidebarFromStorage() {
  const collapsed = readStored() === 'collapsed'
  applyDocumentClass(collapsed)
  return collapsed
}
