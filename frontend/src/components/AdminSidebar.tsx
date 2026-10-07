import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Tags,
  Wallet,
  History,
  Settings,
  LogOut,
  PackageSearch,
  LineChart,
  Landmark,
  RotateCcw,
  Truck,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SidebarLayout } from '../hooks/useAdminSidebar'

export type Section =
  | 'dashboard'
  | 'pos'
  | 'catalog'
  | 'inventory'
  | 'debts'
  | 'sales'
  | 'settings'
  | 'stock'
  | 'shift'
  | 'expenses'
  | 'returns'
  | 'suppliers'

const ITEMS: Array<{ id: Section; labelKey: string; icon: LucideIcon }> = [
  { id: 'dashboard', labelKey: 'admin.sidebar.dashboard', icon: LayoutDashboard },
  { id: 'pos', labelKey: 'admin.sidebar.pos', icon: ShoppingCart },
  { id: 'shift', labelKey: 'admin.sidebar.shift', icon: LineChart },
  { id: 'expenses', labelKey: 'admin.sidebar.expenses', icon: Landmark },
  { id: 'stock', labelKey: 'admin.sidebar.stock', icon: PackageSearch },
  { id: 'inventory', labelKey: 'admin.sidebar.inventory', icon: Package },
  { id: 'catalog', labelKey: 'admin.sidebar.catalog', icon: Tags },
  { id: 'suppliers', labelKey: 'admin.sidebar.suppliers', icon: Truck },
  { id: 'debts', labelKey: 'admin.sidebar.debts', icon: Wallet },
  { id: 'returns', labelKey: 'admin.sidebar.returns', icon: RotateCcw },
  { id: 'sales', labelKey: 'admin.sidebar.sales', icon: History },
  { id: 'settings', labelKey: 'admin.sidebar.settings', icon: Settings },
]
const CASHIER_MENU: Section[] = ['pos', 'sales', 'debts', 'expenses', 'shift', 'stock']

export function AdminSidebar({
  active,
  onSelect,
  role,
  onLogout,
  layout,
  onToggleLayout,
}: {
  active: Section
  onSelect: (s: Section) => void
  role: 'CASHIER' | 'ADMIN' | 'OWNER'
  onLogout: () => void | Promise<void>
  layout: SidebarLayout
  onToggleLayout: () => void
}) {
  const { t } = useTranslation()
  const collapsed = layout === 'collapsed'
  const visibleItems =
    role === 'CASHIER'
      ? ITEMS.filter((item) => CASHIER_MENU.includes(item.id))
      : ITEMS

  const toggleLabel = collapsed
    ? t('admin.sidebar.expand', { defaultValue: 'Menyuni ochish' })
    : t('admin.sidebar.collapse', { defaultValue: 'Menyuni yigʻish' })

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 shrink-0 border-r border-slate-800 bg-slate-950 flex flex-col h-dvh overflow-hidden transition-[width] duration-200 ${
        collapsed ? 'p-2.5' : 'p-3'
      }`}
      style={{ width: 'var(--sidebar-width)' }}
    >
      <div className={`flex items-center shrink-0 ${collapsed ? 'justify-center pb-2' : 'justify-between gap-2 px-2 pb-2'}`}>
        {!collapsed && (
          <div className="text-xs uppercase tracking-wide text-slate-500 truncate">{t('admin.sidebar.title')}</div>
        )}
        <button
          type="button"
          className={`touch-btn shrink-0 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 flex items-center justify-center ${
            collapsed ? 'min-h-kiosk-touch min-w-kiosk-touch p-0' : 'min-h-kiosk-touch p-2'
          }`}
          onClick={onToggleLayout}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-6 w-6" aria-hidden />
          ) : (
            <PanelLeftClose className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>
      <nav
        className={`space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y kiosk-scrollbar py-1 -my-1 ${
          collapsed ? 'pr-0' : 'pr-1'
        }`}
      >
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = active === item.id
          const label = t(item.labelKey)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              title={collapsed ? label : undefined}
              aria-label={label}
              className={`touch-btn w-full flex items-center rounded-xl text-left text-kiosk-sm pos-lg:text-sm border ${
                collapsed ? 'justify-center min-h-kiosk-touch min-w-kiosk-touch px-0 py-0' : 'gap-3 px-3 py-3 min-h-kiosk-touch'
              } ${
                isActive
                  ? 'bg-emerald-700 border-emerald-400 ring-2 ring-emerald-500/50 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-100 hover:bg-slate-800'
              }`}
            >
              <Icon className={`shrink-0 opacity-90 ${collapsed ? 'h-6 w-6' : 'h-5 w-5'}`} aria-hidden />
              {!collapsed && <span className="font-medium leading-tight">{label}</span>}
            </button>
          )
        })}
      </nav>
      <div className="mt-auto pt-3 border-t border-slate-800 space-y-2 shrink-0">
        <button
          type="button"
          className={`touch-btn w-full flex items-center rounded-xl text-kiosk-sm pos-lg:text-sm border bg-slate-900 border-slate-700 text-slate-100 hover:bg-slate-800 min-h-kiosk-touch ${
            collapsed ? 'justify-center px-0 py-0' : 'justify-center gap-2 px-3 py-3'
          }`}
          onClick={() => void onLogout()}
          title={collapsed ? t('header.logout') : undefined}
          aria-label={t('header.logout')}
        >
          <LogOut className={`shrink-0 opacity-90 ${collapsed ? 'h-6 w-6' : 'h-5 w-5'}`} aria-hidden />
          {!collapsed && <span className="font-medium">{t('header.logout')}</span>}
        </button>
      </div>
    </aside>
  )
}
