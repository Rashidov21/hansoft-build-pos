import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  adjustInventory,
  applyStocktake,
  createCategory,
  createProduct,
  createProductCategory,
  updateProduct,
  updateCategory,
  updateProductCategory,
  deleteProductCategory,
  createStocktakeSession,
  createVariantBulkGrid,
  deleteCategory,
  deleteProduct,
  deleteVariant,
  archiveSale,
  restoreCategory,
  restoreProduct,
  restoreProductCategory,
  restoreProductVariant,
  exportSalesXlsx,
  fetchCategories,
  fetchProductCategories,
  fetchMe,
  fetchLicenseStatus,
  fetchOpenDebts,
  fetchProducts,
  fetchDashboardSummary,
  fetchIntegrationSettings,
  fetchSalesHistory,
  fetchStockEvents,
  fetchStocktakeSession,
  listStocktakeSessions,
  fetchStoreSettings,
  fetchVariants,
  logout,
  repayDebt,
  updateDebtCustomer,
  sendZReport,
  sendWhatsAppReminder,
  sendWhatsAppText,
  backupNow,
  runAutoBackup,
  receiveInventory,
  setStocktakeCount,
  updateIntegrationSettings,
  updateStoreSettings,
  updateVariant,
  voidSale,
  checkShiftStatus,
  openShift,
  type Category,
  type ProductCategory,
  type DashboardSummary,
  type DebtRow,
  type IntegrationSettings,
  type Paginated,
  type Product,
  type SaleHistoryRow,
  type StocktakeSession,
  type StoreSettings,
  type LicenseStatus,
  type UserRole,
  type Variant,
  type BulkGridCell,
  type ShiftStatus,
} from './api'
import { AdminSidebar } from './components/AdminSidebar'
import { AdminTopNavbar } from './components/AdminTopNavbar'
import { AppearanceDropdown } from './components/AppearanceDropdown'
import { useAdminSidebar } from './hooks/useAdminSidebar'
import { BootScreen } from './components/BootScreen'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ShiftExitWarning } from './components/ShiftExitWarning'
import { ActivationPage } from './pages/ActivationPage'
import { LoginPage } from './pages/LoginPage'
import { PosPage } from './pages/PosPage'
import { printReceiptWithFallback } from './utils/printingHub'
import {
  GEEKS_REFRESH_ADMIN_EVENT,
  GEEKS_STORE_SETTINGS_EVENT,
  requestAdminDataRefresh,
  type AdminRefreshDetail,
} from './utils/adminDataRefresh'

const DEFAULT_LICENSE_OK: LicenseStatus = {
  enforcement: false,
  valid: true,
  license_key_masked: '',
  expires_at: null,
  last_check_ok: true,
  last_check_message: '',
}

const DashboardPage = lazy(async () => {
  const mod = await import('./pages/DashboardPage')
  return { default: mod.DashboardPage }
})
const CatalogPage = lazy(async () => {
  const mod = await import('./pages/CatalogPage')
  return { default: mod.CatalogPage }
})
const WarehousePage = lazy(async () => {
  const mod = await import('./pages/WarehousePage')
  return { default: mod.WarehousePage }
})
const DebtsPage = lazy(async () => {
  const mod = await import('./pages/DebtsPage')
  return { default: mod.DebtsPage }
})
const SalesHistoryPage = lazy(async () => {
  const mod = await import('./pages/SalesHistoryPage')
  return { default: mod.SalesHistoryPage }
})
const SuppliersPage = lazy(async () => {
  const mod = await import('./pages/SuppliersPage')
  return { default: mod.SuppliersPage }
})
const SettingsPage = lazy(async () => {
  const mod = await import('./pages/SettingsPage')
  return { default: mod.SettingsPage }
})
const CashStockPage = lazy(async () => {
  const mod = await import('./pages/CashStockPage')
  return { default: mod.CashStockPage }
})
const ShiftXReportPage = lazy(async () => {
  const mod = await import('./pages/ShiftXReportPage')
  return { default: mod.ShiftXReportPage }
})
const ExpensesPage = lazy(async () => {
  const mod = await import('./pages/ExpensesPage')
  return { default: mod.ExpensesPage }
})
const ReturnsPage = lazy(async () => {
  const mod = await import('./pages/ReturnsPage')
  return { default: mod.ReturnsPage }
})
export default function App() {
  const { t } = useTranslation()
  const [booting, setBooting] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [role, setRole] = useState<UserRole | null>(null)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [salesFilter, setSalesFilter] = useState<{ from?: string; to?: string; q?: string; page: number }>({
    page: 1,
  })
  const [catalogFilter, setCatalogFilter] = useState<{
    q?: string
    page: number
    ordering?: 'name' | 'recent'
    category_id?: string
    product_id?: string
  }>({ page: 1, ordering: 'name' })

  const [categories, setCategories] = useState<Category[]>([])
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [variants, setVariants] = useState<Paginated<Variant>>({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  const [debts, setDebts] = useState<DebtRow[]>([])
  const [sales, setSales] = useState<Paginated<SaleHistoryRow>>({
    count: 0,
    next: null,
    previous: null,
    results: [],
  })
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [stocktake, setStocktake] = useState<StocktakeSession | null>(null)
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null)
  const [dashboardFilter, setDashboardFilter] = useState<{ from?: string; to?: string; year?: string }>({})
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings | null>(null)
  const [lastStockSyncAt, setLastStockSyncAt] = useState<string | null>(null)
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null)
  const [hasSaleInProgress, setHasSaleInProgress] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [shiftStatus, setShiftStatus] = useState<ShiftStatus | null>(null)
  const [showShiftExitWarning, setShowShiftExitWarning] = useState(false)
  const [isOnlineForShift, setIsOnlineForShift] = useState(true)
  const isManager = role === 'ADMIN' || role === 'OWNER'
  const dashboardFilterRef = useRef(dashboardFilter)
  dashboardFilterRef.current = dashboardFilter

  const onFilterSales = useCallback((from: string, to: string, q: string) => {
    setSalesFilter((prev) =>
      prev.from === from && prev.to === to && prev.q === q ? prev : { from, to, q, page: 1 },
    )
  }, [])

  const onSalesPageStable = useCallback((page: number) => {
    setSalesFilter((p) => (p.page === page ? p : { ...p, page }))
  }, [])

  /** Debounced catalog search ΓåÆ stable ref so pagination is not reset on parent re-render. */
  const onCatalogQueryChange = useCallback((q: string) => {
    const norm = q.trim() ? q.trim() : undefined
    setCatalogFilter((prev) => {
      const prevNorm = prev.q?.trim()
      const nextNorm = norm
      if (prevNorm === nextNorm || (!prevNorm && !nextNorm)) return prev
      return { ...prev, q: norm, page: 1 }
    })
  }, [])

  const onCatalogFacetsChange = useCallback(
    (facets: { ordering?: 'name' | 'recent'; category_id?: string; product_id?: string }) => {
      setCatalogFilter((prev) => ({
        ...prev,
        ...(facets.ordering !== undefined ? { ordering: facets.ordering } : {}),
        ...(facets.category_id !== undefined
          ? { category_id: facets.category_id || undefined, product_id: undefined }
          : {}),
        ...(facets.product_id !== undefined ? { product_id: facets.product_id || undefined } : {}),
        page: 1,
      }))
    },
    [],
  )

  const onCatalogPageStable = useCallback((page: number) => {
    setCatalogFilter((p) => (p.page === page ? p : { ...p, page }))
  }, [])

  useEffect(() => {
    function onSaleProgress(event: Event) {
      const detail = (event as CustomEvent<{ inProgress?: boolean }>).detail
      setHasSaleInProgress(Boolean(detail?.inProgress))
    }
    window.addEventListener('geekspos-sale-progress', onSaleProgress as EventListener)
    return () => window.removeEventListener('geekspos-sale-progress', onSaleProgress as EventListener)
  }, [])

  useEffect(() => {
    let unlisten: undefined | (() => void)
    ;(async () => {
      const tauriRuntime =
        typeof window !== 'undefined' &&
        typeof (window as unknown as { __TAURI__?: unknown }).__TAURI__ !== 'undefined'
      if (!tauriRuntime) return
      try {
        const { appWindow } = await import('@tauri-apps/api/window')
        unlisten = await appWindow.onCloseRequested(async (event) => {
          // Block close if a sale is in progress
          if (hasSaleInProgress) {
            event.preventDefault()
            setShowExitConfirm(true)
            return
          }
          // Block close if a shift is still open ΓÇö prompt to close it first
          try {
            const status = await checkShiftStatus()
            if (status.has_open_shift) {
              event.preventDefault()
              setShiftStatus(status)
              const { checkInternetConnection } = await import('./utils/network')
              const online = await checkInternetConnection()
              setIsOnlineForShift(online)
              setShowShiftExitWarning(true)
            }
          } catch {
            // If shift check fails, allow exit
          }
        })
      } catch {
        // ignore in web/dev mode
      }
    })()
    return () => {
      if (unlisten) unlisten()
    }
  }, [hasSaleInProgress])

  useEffect(() => {
    function preventAccidentalClose(e: KeyboardEvent) {
      if ((e.ctrlKey && (e.key === 'w' || e.key === 'W')) || (e.altKey && e.key === 'F4')) {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', preventAccidentalClose)
    return () => window.removeEventListener('keydown', preventAccidentalClose)
  }, [])

  function resetLocalSession() {
    setAuthed(false)
    setRole(null)
    setLicenseStatus(null)
  }

  useEffect(() => {
    function onAuthExpired() {
      setAuthed(false)
      setRole(null)
      setLicenseStatus(null)
    }
    window.addEventListener('geekspos-auth-expired', onAuthExpired)
    return () => window.removeEventListener('geekspos-auth-expired', onAuthExpired)
  }, [])

  // Keep shift status fresh (used by the exit warning on window close)
  useEffect(() => {
    if (!authed) return
    const checkShift = async () => {
      try {
        setShiftStatus(await checkShiftStatus())
      } catch {
        // ignore
      }
    }
    void checkShift()
    const id = window.setInterval(() => void checkShift(), 30_000)
    return () => window.clearInterval(id)
  }, [authed])

  async function logoutAndReset() {
    try {
      await logout()
    } catch {
      // ignore
    }
    resetLocalSession()
  }

  /** Faqat boshqaruv paneli uchun ΓÇö katalog/roΓÇÿyxatlarni majburiy qayta tortmasdan KPI yangilash */
  const refreshDashboardSummaryOnly = useCallback(async () => {
    if (!authed || !isManager) return
    try {
      const next = await fetchDashboardSummary(dashboardFilterRef.current)
      setDashboardSummary(next)
    } catch {
      /* ignore */
    }
  }, [authed, isManager])

  async function refreshAdminData() {
    if (role === 'CASHIER') {
      try {
        const [d, s] = await Promise.all([fetchOpenDebts(), fetchSalesHistory(salesFilter)])
        setDebts(d)
        setSales(s)
      } catch {
        /* ignore */
      }
      return
    }
    if (!isManager) return
    const results = await Promise.allSettled([
      fetchCategories(),
      fetchProductCategories(),
      fetchProducts({ includeDeleted, page: 1, pageSize: 200 }),
      fetchVariants({
        includeDeleted,
        q: catalogFilter.q,
        page: catalogFilter.page,
        ordering: catalogFilter.ordering,
        category_id: catalogFilter.category_id,
        product_id: catalogFilter.product_id,
      }),
      fetchOpenDebts(),
      fetchSalesHistory(salesFilter),
      fetchStoreSettings(),
      fetchDashboardSummary(dashboardFilter),
      fetchIntegrationSettings(),
    ])
    if (results[0].status === 'fulfilled') setCategories(results[0].value)
    if (results[1].status === 'fulfilled') setProductCategories(results[1].value)
    if (results[2].status === 'fulfilled') setProducts(results[2].value.results)
    if (results[3].status === 'fulfilled') setVariants(results[3].value)
    if (results[4].status === 'fulfilled') setDebts(results[4].value)
    if (results[5].status === 'fulfilled') setSales(results[5].value)
    if (results[6].status === 'fulfilled') setSettings(results[6].value)
    if (results[7].status === 'fulfilled') setDashboardSummary(results[7].value)
    if (results[8].status === 'fulfilled') setIntegrationSettings(results[8].value)
  }

  const refreshAdminDataRef = useRef(refreshAdminData)
  refreshAdminDataRef.current = refreshAdminData

  useEffect(() => {
    if (!authed) return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AdminRefreshDetail>).detail
      const onPos =
        typeof window !== 'undefined' && window.location.pathname.includes('/admin/pos')
      if (onPos && detail?.reason === 'stock-events') {
        detail?.resolve?.()
        return
      }
      void (async () => {
        try {
          await refreshAdminDataRef.current()
        } finally {
          detail?.resolve?.()
        }
      })()
    }
    window.addEventListener(GEEKS_REFRESH_ADMIN_EVENT, handler)
    return () => window.removeEventListener(GEEKS_REFRESH_ADMIN_EVENT, handler)
  }, [authed])

  useEffect(() => {
    if (!authed) return
    const handler = () => {
      void fetchStoreSettings().then(setSettings).catch(() => {})
    }
    window.addEventListener(GEEKS_STORE_SETTINGS_EVENT, handler)
    return () => window.removeEventListener(GEEKS_STORE_SETTINGS_EVENT, handler)
  }, [authed])

  /** Boshqa tab/terminalda moliya oΓÇÿzgarsa ham dashboard taxminan yangilanadi */
  useEffect(() => {
    if (!authed || !isManager) return
    const id = window.setInterval(() => void refreshDashboardSummaryOnly(), 45_000)
    return () => clearInterval(id)
  }, [authed, isManager, refreshDashboardSummaryOnly])

  useEffect(() => {
    if (!authed || !isManager) return
    function onVisibility() {
      if (document.visibilityState === 'visible') void refreshDashboardSummaryOnly()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [authed, isManager, refreshDashboardSummaryOnly])

  useEffect(() => {
    ;(async () => {
      try {
        const me = await fetchMe()
        setRole(me.role)
        setAuthed(true)
        try {
          setLicenseStatus(await fetchLicenseStatus())
        } catch {
          setLicenseStatus(DEFAULT_LICENSE_OK)
        }
      } catch {
        setAuthed(false)
        setRole(null)
        setLicenseStatus(null)
      } finally {
        setBooting(false)
      }
    })()
  }, [])

  useEffect(() => {
    void refreshAdminData()
  }, [
    authed,
    role,
    includeDeleted,
    salesFilter.page,
    salesFilter.from,
    salesFilter.to,
    salesFilter.q,
    catalogFilter.page,
    catalogFilter.q,
    catalogFilter.ordering,
    catalogFilter.category_id,
    catalogFilter.product_id,
    dashboardFilter.from,
    dashboardFilter.to,
    dashboardFilter.year,
  ])

  useEffect(() => {
    if (!authed) return
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const events = await fetchStockEvents(lastStockSyncAt || undefined)
          if (events.length === 0) return
          setLastStockSyncAt(events[events.length - 1].created_at)
          const byVariant = new Map<string, number>()
          for (const e of events) byVariant.set(e.variant_id, e.stock_qty)
          setVariants((prev) => ({
            ...prev,
            results: prev.results.map((v) =>
              byVariant.has(v.id) ? { ...v, stock_qty: byVariant.get(v.id) ?? v.stock_qty } : v,
            ),
          }))
          const onPos =
            typeof window !== 'undefined' && window.location.pathname.includes('/admin/pos')
          if (
            !onPos &&
            (isManager || role === 'CASHIER') &&
            events.some((e) => e.type === 'SALE' || e.type === 'RETURN' || e.type === 'ADJUST' || e.type === 'IN')
          ) {
            requestAdminDataRefresh('stock-events')
          }
        } catch {
          // ignore stock sync errors
        }
      })()
    }, 5000)
    return () => window.clearInterval(id)
  }, [authed, isManager, role, lastStockSyncAt])

  useEffect(() => {
    if (!authed) return
    const tauriRuntime =
      typeof window !== 'undefined' &&
      typeof (window as unknown as { __TAURI__?: unknown }).__TAURI__ !== 'undefined'
    if (!tauriRuntime) return

    const run = async () => {
      try {
        await runAutoBackup()
      } catch {
        // silent: backup status is persisted server-side and visible in settings panel
      }
    }
    void run()
    const id = window.setInterval(() => {
      void run()
    }, 30 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [authed])

  if (booting) return <BootScreen stage="app_loading" />
  if (authed && !role) return <BootScreen stage="app_loading" />

  if (!authed) {
    return (
      <LoginPage
        onDone={async () => {
          const me = await fetchMe()
          setRole(me.role)
          setAuthed(true)
          try {
            setLicenseStatus(await fetchLicenseStatus())
          } catch {
            setLicenseStatus(DEFAULT_LICENSE_OK)
          }
          // Auto-open a shift on login (idempotent — reuses existing open shift).
          // Fire-and-forget: errors are swallowed so login never fails.
          void openShift().catch(() => {})
        }}
      />
    )
  }

  const licenseBlocked =
    licenseStatus !== null && licenseStatus.enforcement === true && licenseStatus.valid === false

  if (licenseBlocked && role && licenseStatus) {
    return (
      <ActivationPage
        role={role}
        initial={licenseStatus}
        onActivated={async () => {
          try {
            setLicenseStatus(await fetchLicenseStatus())
          } catch {
            setLicenseStatus(DEFAULT_LICENSE_OK)
          }
        }}
        onLogout={() => void logoutAndReset()}
      />
    )
  }

  return (
    <>
    <BrowserRouter>
      <Routes>
        <Route
          path="/pos"
          element={<Navigate to="/admin/pos" replace />}
        />
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute role={role} allow={['CASHIER', 'ADMIN', 'OWNER']}>
              <AdminPanel
                role={role}
                onLogout={resetLocalSession}
                debts={debts}
                sales={sales}
                categories={categories}
                productCategories={productCategories}
                products={products}
                variants={variants.results}
                variantCount={variants.count}
                includeDeleted={includeDeleted}
                setIncludeDeleted={setIncludeDeleted}
                catalogPage={catalogFilter.page}
                settings={settings}
                dashboardSummary={dashboardSummary}
                licenseStatus={licenseStatus}
                dashboardFilter={dashboardFilter}
                integrationSettings={integrationSettings}
                stocktake={stocktake}
                onDashboardSectionVisible={refreshDashboardSummaryOnly}
                onCreateVariantBulk={async (payload) => {
                  const out = await createVariantBulkGrid(payload)
                  await refreshAdminData()
                  return out
                }}
                onCreateCategory={async (payload) => {
                  const res = await createCategory(payload)
                  await refreshAdminData()
                  return res
                }}
                onCreateProduct={async (payload) => {
                  const res = await createProduct(payload)
                  await refreshAdminData()
                  setProducts((prev) => {
                    const without = prev.filter((p) => p.id !== res.id)
                    return [res, ...without]
                  })
                  return res
                }}
                onUpdateProduct={async (productId: string, payload: any) => {
                  await updateProduct(productId, payload)
                  await refreshAdminData()
                }}
                onSendWhatsAppText={async (text: string) => {
                  await sendWhatsAppText(text)
                }}
                onUpdateCategory={async (categoryId: string, payload: { name_uz: string; name_ru: string }) => {
                  await updateCategory(categoryId, payload)
                  await refreshAdminData()
                }}
                onCreateProductCategory={async (payload) => {
                  const cat = await createProductCategory(payload)
                  await refreshAdminData()
                  return cat
                }}
                onUpdateProductCategory={async (productCategoryId: string, payload: { name_uz: string; name_ru: string }) => {
                  await updateProductCategory(productCategoryId, payload)
                  await refreshAdminData()
                }}
                onDeleteProductCategory={async (productCategoryId) => {
                  await deleteProductCategory(productCategoryId)
                  await refreshAdminData()
                }}
                onDeleteCategory={async (categoryId) => {
                  await deleteCategory(categoryId)
                  await refreshAdminData()
                }}
                onDeleteProduct={async (productId) => {
                  await deleteProduct(productId)
                  await refreshAdminData()
                }}
                onRestoreCategory={async (categoryId) => {
                  await restoreCategory(categoryId)
                  await refreshAdminData()
                }}
                onRestoreProductCategory={async (productCategoryId) => {
                  await restoreProductCategory(productCategoryId)
                  await refreshAdminData()
                }}
                onRestoreProduct={async (productId) => {
                  await restoreProduct(productId)
                  await refreshAdminData()
                }}
                onRestoreVariant={async (variantId) => {
                  await restoreProductVariant(variantId)
                  await refreshAdminData()
                }}
                onAdjustStockQuick={async (variantId, qtyDelta, note) => {
                  await adjustInventory(variantId, qtyDelta, note)
                  await refreshAdminData()
                }}
                onToggleVariant={async (v) => {
                  await updateVariant(v.id, { is_active: !v.is_active })
                  await refreshAdminData()
                }}
                onUpdateVariant={async (v, patch) => {
                  await updateVariant(v.id, patch)
                  await refreshAdminData()
                }}
                onDeleteVariant={async (variantId) => {
                  await deleteVariant(variantId)
                  await refreshAdminData()
                }}
                onRepay={async (customerId, amount, opts) => {
                  await repayDebt(customerId, amount, opts)
                  await refreshAdminData()
                }}
                onUpdateDebtCustomer={async (customerId, name, phone) => {
                  await updateDebtCustomer(customerId, { name, phone_normalized: phone })
                  await refreshAdminData()
                }}
                onSendDebtReminder={async (customerId, amount) => {
                  await sendWhatsAppReminder(customerId, amount)
                }}
                onSaveSettings={async (data) => {
                  await updateStoreSettings(data)
                  await refreshAdminData()
                }}
                onFilterSales={onFilterSales}
                onSalesPage={onSalesPageStable}
                onCatalogFilter={onCatalogQueryChange}
                onCatalogFacetsChange={onCatalogFacetsChange}
                catalogOrdering={catalogFilter.ordering ?? 'name'}
                catalogCategoryId={catalogFilter.category_id ?? ''}
                catalogProductId={catalogFilter.product_id ?? ''}
                onCatalogPage={onCatalogPageStable}
                salesPage={salesFilter.page}
                onExportSales={async () => {
                  await exportSalesXlsx({ from: salesFilter.from, to: salesFilter.to })
                }}
                onVoidSale={async (saleId, reason) => {
                  const result = await voidSale(saleId, reason)
                  await refreshAdminData()
                  return result
                }}
                onArchiveSale={async (saleId, reason) => {
                  await archiveSale(saleId, reason)
                  await refreshAdminData()
                }}
                onReprintSale={async (saleId) => {
                  if (settings?.receipt_printing_enabled !== true) return
                  await printReceiptWithFallback(saleId, settings)
                }}
                onCreateStocktake={async (note) => {
                  const s = await createStocktakeSession(note)
                  setStocktake(s)
                }}
                onReloadOpenStocktake={async () => {
                  const items = await listStocktakeSessions('OPEN')
                  if (items[0]) setStocktake(await fetchStocktakeSession(items[0].id))
                }}
                onSetStocktakeCount={async (variantId, countedQty) => {
                  if (!stocktake) return
                  await setStocktakeCount(stocktake.id, variantId, countedQty)
                  setStocktake(await fetchStocktakeSession(stocktake.id))
                }}
                onApplyStocktake={async () => {
                  if (!stocktake) return
                  await applyStocktake(stocktake.id)
                  setStocktake(await fetchStocktakeSession(stocktake.id))
                  await refreshAdminData()
                }}
                onBackupNow={backupNow}
                onInventoryReceive={async (variantId, qty, note) => {
                  await receiveInventory(variantId, qty, note)
                  await refreshAdminData()
                }}
                onInventoryAdjust={async (variantId, qtyDelta, note) => {
                  await adjustInventory(variantId, qtyDelta, note)
                  await refreshAdminData()
                }}
                onSaveIntegrations={async (data) => {
                  const next = await updateIntegrationSettings(data)
                  setIntegrationSettings(next)
                }}
                onSendZReport={sendZReport}
                onFilterDashboard={(from, to, year) => setDashboardFilter({ from: from || undefined, to: to || undefined, year: year || undefined })}
              />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to={isManager ? '/admin/dashboard' : '/pos'} replace />} />
        <Route path="*" element={<Navigate to={isManager ? '/admin/dashboard' : '/pos'} replace />} />
      </Routes>
    </BrowserRouter>
    {showExitConfirm && (
      <div className="fixed inset-0 z-[120] bg-black/70 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3 text-slate-100">
          <h3 className="text-lg font-semibold">{t('pos.exitConfirmTitle')}</h3>
          <p className="text-sm text-slate-300">{t('pos.exitConfirmBody')}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-600"
              onClick={() => setShowExitConfirm(false)}
            >
              {t('admin.common.cancel')}
            </button>
            <button
              type="button"
              className="touch-btn min-h-12 px-4 rounded-xl bg-red-700 border border-red-500"
              onClick={async () => {
                try {
                  const { invoke } = await import('@tauri-apps/api/tauri')
                  await invoke('request_app_exit')
                } catch {
                  window.close()
                }
              }}
            >
              {t('pos.exitConfirmAction')}
            </button>
          </div>
        </div>
      </div>
    )}
    <ShiftExitWarning
      isOpen={showShiftExitWarning}
      shiftStartTime={
        shiftStatus?.opened_at
          ? new Date(shiftStatus.opened_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
          : ''
      }
      isOnline={isOnlineForShift}
      onCancel={() => setShowShiftExitWarning(false)}
      onCloseShift={() => {
        setShowShiftExitWarning(false)
        // Send the user to the shift page to close the shift and send the report
        window.location.href = '/admin/shift'
      }}
    />
    </>
  )
}

function AdminPanel(props: {
  role: UserRole | null
  /** Dashboard boΓÇÿlimi koΓÇÿrinishi ΓÇö moliyaviy KPI ni qisman yangilash */
  onDashboardSectionVisible?: () => void
  onLogout: () => void
  debts: DebtRow[]
  sales: Paginated<SaleHistoryRow>
  categories: Category[]
  productCategories: ProductCategory[]
  products: Product[]
  variants: Variant[]
  variantCount: number
  includeDeleted: boolean
  setIncludeDeleted: (v: boolean) => void
  catalogPage: number
  settings: StoreSettings | null
  dashboardSummary: DashboardSummary | null
  licenseStatus: LicenseStatus | null
  dashboardFilter: { from?: string; to?: string; year?: string }
  integrationSettings: IntegrationSettings | null
  stocktake: StocktakeSession | null
  onCreateVariantBulk: (payload: { product_id: string; matrix: BulkGridCell[] }) => Promise<Variant[]>
  onCreateCategory: (payload: { name_uz: string; name_ru: string }) => Promise<Category>
  onCreateProduct: (payload: { category: string; product_category?: string; name_uz: string; name_ru: string }) => Promise<Product>
  onUpdateProduct: (productId: string, payload: { custom_name_uz?: string; custom_name_ru?: string; custom_name_uz_cyrillic?: string; color?: string; name_uz?: string; name_ru?: string; product_category?: string | null }) => Promise<void>
  onSendWhatsAppText: (text: string) => Promise<void>
  onUpdateCategory: (categoryId: string, payload: { name_uz: string; name_ru: string }) => Promise<void>
  onCreateProductCategory: (payload: { name_uz: string; name_ru: string }) => Promise<ProductCategory>
  onUpdateProductCategory: (productCategoryId: string, payload: { name_uz: string; name_ru: string }) => Promise<void>
  onDeleteProductCategory: (productCategoryId: string) => Promise<void>
  onDeleteCategory: (categoryId: string) => Promise<void>
  onDeleteProduct: (productId: string) => Promise<void>
  onRestoreCategory: (categoryId: string) => Promise<void>
  onRestoreProductCategory: (productCategoryId: string) => Promise<void>
  onRestoreProduct: (productId: string) => Promise<void>
  onRestoreVariant: (variantId: string) => Promise<void>
  onToggleVariant: (v: Variant) => Promise<void>
  onUpdateVariant: (
    v: Variant,
    patch: {
      purchase_price: string
      list_price: string
      wholesale_price?: string | null
      hide_selling_price?: boolean
      show_price_on_label?: boolean
      color?: string
      unit?: 'dona' | 'kg' | 'm' | 'qop'
    },
  ) => Promise<void>
  onDeleteVariant: (variantId: string) => Promise<void>
  onRepay: (
    customerId: string,
    amount: string,
    opts?: { method?: 'CASH' | 'CARD'; card_bank?: string; note?: string },
  ) => Promise<void>
  onUpdateDebtCustomer: (customerId: string, name: string, phone: string) => Promise<void>
  onSendDebtReminder: (customerId: string, amount: string) => Promise<void>
  onSaveSettings: (data: {
    brand_name: string
    phone: string
    address: string
    footer_note: string
    transliterate_uz: boolean
    receipt_printer_name: string
    receipt_printer_type: 'ESC_POS' | 'TSPL'
    receipt_printer_port?: string
    label_printer_name: string
    label_printer_type: 'ESC_POS' | 'TSPL'
    label_printer_port?: string
    receipt_lang?: string
    receipt_width: '58mm' | '80mm'
    receipt_font_size?: number
    receipt_printing_enabled?: boolean
    auto_print_on_sale: boolean
    scanner_mode: 'keyboard' | 'serial'
    scanner_prefix: string
    scanner_suffix: string
    lock_timeout_minutes?: number
    logo?: File | null
  }) => Promise<void>
  onFilterSales: (from: string, to: string, q: string) => void
  onSalesPage: (page: number) => void
  onCatalogFilter: (q: string) => void
  onCatalogFacetsChange: (facets: {
    ordering?: 'name' | 'recent'
    category_id?: string
    product_id?: string
  }) => void
  onCatalogPage: (page: number) => void
  catalogOrdering: 'name' | 'recent'
  catalogCategoryId: string
  catalogProductId: string
  onExportSales: () => Promise<void>
  salesPage: number
  onVoidSale: (saleId: string, reason: string) => Promise<{
    sale_id?: string
    status?: string
    return_amount?: string
    refunds?: Array<{ method: string; amount: string }>
    restocked_lines?: Array<{ variant_id: string; qty: number }>
    reverted_partner_loans?: string[]
  }>
  onArchiveSale: (saleId: string, reason: string) => Promise<void>
  onReprintSale: (saleId: string) => Promise<void>
  onCreateStocktake: (note: string) => Promise<void>
  onReloadOpenStocktake: () => Promise<void>
  onSetStocktakeCount: (variantId: string, countedQty: number) => Promise<void>
  onApplyStocktake: () => Promise<void>
  onBackupNow: () => Promise<{ ok: boolean; backup_path: string }>
  onInventoryReceive: (variantId: string, qty: number, note: string) => Promise<void>
  onInventoryAdjust: (variantId: string, qtyDelta: number, note: string) => Promise<void>
  onSaveIntegrations: (data: IntegrationSettings) => Promise<void>
  onSendZReport: () => Promise<{ ok: boolean; details?: string; channel_results?: unknown }>
  onFilterDashboard: (from?: string, to?: string, year?: string) => void
  onAdjustStockQuick: (variantId: string, qtyDelta: number, note: string) => Promise<void>
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname.replace('/admin/', '').split('/')[0] || 'dashboard'
  const active = (
    [
      'dashboard',
      'pos',
      'catalog',
      'inventory',
      'debts',
      'sales',
      'returns',
      'settings',
      'stock',
      'shift',
      'expenses',
      'suppliers',
    ] as const
  ).includes(path as never)
    ? (path as
        | 'dashboard'
        | 'pos'
        | 'catalog'
        | 'inventory'
        | 'debts'
        | 'sales'
        | 'returns'
        | 'settings'
        | 'stock'
        | 'shift'
        | 'expenses'
        | 'suppliers')
    : 'dashboard'
  const isCashier = props.role === 'CASHIER'
  const { layout, toggle: toggleSidebar } = useAdminSidebar(true)
  const [showLogoutWarning, setShowLogoutWarning] = useState(false)
  const [logoutShiftStatus, setLogoutShiftStatus] = useState<{ opened_at: string; isOnline: boolean } | null>(null)

  useEffect(() => {
    if (active !== 'dashboard' || isCashier) return
    props.onDashboardSectionVisible?.()
  }, [active, isCashier, props.onDashboardSectionVisible])

  async function handleAdminLogout() {
    // If a shift is still open, warn before logging out
    try {
      const status = await checkShiftStatus()
      if (status.has_open_shift) {
        const { checkInternetConnection } = await import('./utils/network')
        const online = await checkInternetConnection()
        setLogoutShiftStatus({ opened_at: status.opened_at || '', isOnline: online })
        setShowLogoutWarning(true)
        return // Don't log out yet
      }
    } catch {
      // If the shift check fails, proceed with logout
    }
    await performLogout()
  }

  async function performLogout() {
    try {
      await logout()
    } catch {
      /* ignore */
    }
    props.onLogout()
  }

  const routeFallback = (
    <div className="p-4 text-sm text-slate-400">{'Loading section...'}</div>
  )

  return (
    <div className="h-dvh max-h-dvh bg-slate-950 text-slate-100 flex overflow-hidden">
      <AdminSidebar
        active={active}
        role={props.role ?? 'CASHIER'}
        onSelect={(s) => navigate(`/admin/${s}`)}
        onLogout={handleAdminLogout}
        layout={layout}
        onToggleLayout={toggleSidebar}
      />
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col transition-[margin] duration-200" style={{ marginLeft: 'var(--sidebar-width)' }}>
        {(active === 'dashboard' || active === 'settings') && (
          <AdminTopNavbar
            section={active}
            onLogout={handleAdminLogout}
            dashboardFilter={active === 'dashboard' ? props.dashboardFilter : undefined}
            onDashboardFilter={active === 'dashboard' ? props.onFilterDashboard : undefined}
          />
        )}
        {active !== 'dashboard' && active !== 'settings' && active !== 'pos' && (
          <div className="flex items-center justify-end gap-2 px-3 pos-lg:px-4 py-2 border-b border-slate-800 bg-slate-900/80 shrink-0">
            <AppearanceDropdown variant="navbar" />
          </div>
        )}
        <div
          className={
            active === 'pos'
              ? 'flex-1 min-h-0 overflow-hidden flex flex-col'
              : 'flex-1 min-h-0 overflow-y-auto overflow-x-hidden kiosk-scrollbar'
          }
        >
        <Suspense fallback={routeFallback}>
        <Routes>
          <Route path="dashboard" element={isCashier ? <Navigate to="/admin/sales" replace /> : <DashboardPage summary={props.dashboardSummary} licenseStatus={props.licenseStatus} filter={props.dashboardFilter} primaryChannel={props.integrationSettings?.primary_report_channel || 'both'} onFilter={props.onFilterDashboard} onSendZReport={props.onSendZReport} />} />
          <Route
            path="pos"
            element={
              <PosPage
                onLogout={handleAdminLogout}
                showPurchasePrice={props.role === 'ADMIN' || props.role === 'OWNER'}
              />
            }
          />
          <Route
            path="catalog"
            element={
              isCashier ? <Navigate to="/admin/sales" replace /> : <CatalogPage
                categories={props.categories}
                productCategories={props.productCategories}
                products={props.products}
                variants={props.variants}
                count={props.variantCount}
                includeDeleted={props.includeDeleted}
                setIncludeDeleted={props.setIncludeDeleted}
                page={props.catalogPage}
                onCreateVariantBulk={props.onCreateVariantBulk}
                onCreateCategory={props.onCreateCategory}
                onCreateProduct={props.onCreateProduct}
                onUpdateProduct={props.onUpdateProduct}
                onCreateProductCategory={props.onCreateProductCategory}
                onUpdateProductCategory={props.onUpdateProductCategory}
                onDeleteProductCategory={props.onDeleteProductCategory}
                onDeleteProduct={props.onDeleteProduct}
                onRestoreProductCategory={props.onRestoreProductCategory}
                onRestoreProduct={props.onRestoreProduct}
                onRestoreVariant={props.onRestoreVariant}
                onAdjustStockQuick={props.onAdjustStockQuick}
                onToggleVariant={props.onToggleVariant}
                onUpdateVariant={props.onUpdateVariant}
                onFilter={props.onCatalogFilter}
                onFacetsChange={props.onCatalogFacetsChange}
                ordering={props.catalogOrdering}
                onPage={props.onCatalogPage}
                settings={props.settings}
              />
            }
          />
          <Route
            path="inventory"
            element={
              isCashier ? (
                <Navigate to="/admin/sales" replace />
              ) : (
                <WarehousePage
                  role={props.role}
                  variants={props.variants}
                  stocktake={props.stocktake}
                  onReceive={props.onInventoryReceive}
                  onAdjust={props.onInventoryAdjust}
                  onCreateStocktake={props.onCreateStocktake}
                  onReloadOpen={props.onReloadOpenStocktake}
                  onSetCount={props.onSetStocktakeCount}
                  onApplyStocktake={props.onApplyStocktake}
                />
              )
            }
          />
          <Route path="suppliers" element={isCashier ? <Navigate to="/admin/sales" replace /> : <SuppliersPage />} />
          <Route
            path="debts"
            element={
              <DebtsPage
                debts={props.debts}
                onRepay={props.onRepay}
                onUpdateCustomer={props.onUpdateDebtCustomer}
                onSendReminder={props.onSendDebtReminder}
              />
            }
          />
          <Route
            path="stock"
            element={
              isCashier ? (
                <CashStockPage role={props.role} />
              ) : (
                <Navigate to="/admin/inventory" replace />
              )
            }
          />
          <Route path="printer" element={isCashier ? <Navigate to="/admin/sales" replace /> : <Navigate to="/admin/settings" replace />} />
          <Route path="shift" element={<ShiftXReportPage onLogout={performLogout} />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="returns/*" element={isCashier ? <Navigate to="/admin/sales" replace /> : <ReturnsPage />} />
          <Route
            path="sales"
            element={
              <SalesHistoryPage
                sales={props.sales.results}
                count={props.sales.count}
                page={props.salesPage}
                onPage={props.onSalesPage}
                onFilter={props.onFilterSales}
                onExport={props.onExportSales}
                onVoid={props.onVoidSale}
                onArchive={props.onArchiveSale}
                onReprint={props.onReprintSale}
                canVoid
                canArchive={!isCashier}
                canExport={!isCashier}
                canReprint={props.settings?.receipt_printing_enabled === true}
                isCashier={isCashier}
              />
            }
          />
          <Route
            path="settings"
            element={
              isCashier ? <Navigate to="/admin/sales" replace /> : <SettingsPage
                settings={props.settings}
                integrations={props.integrationSettings}
                onSave={props.onSaveSettings}
                onSaveIntegrations={props.onSaveIntegrations}
                onSendZReport={props.onSendZReport}
                stocktake={props.stocktake}
                onCreateStocktake={props.onCreateStocktake}
                onReloadOpen={props.onReloadOpenStocktake}
                onSetCount={props.onSetStocktakeCount}
                onApplyStocktake={props.onApplyStocktake}
                onBackupNow={props.onBackupNow}
                canManageInventory={!isCashier}
              />
            }
          />
          <Route path="*" element={<Navigate to={isCashier ? '/admin/sales' : '/admin/dashboard'} replace />} />
        </Routes>
        </Suspense>
        </div>
      </main>

      {/* Logout warning shown when a shift is still open */}
      {showLogoutWarning && logoutShiftStatus && (
        <ShiftExitWarning
          isOpen={showLogoutWarning}
          shiftStartTime={
            logoutShiftStatus.opened_at
              ? new Date(logoutShiftStatus.opened_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
              : ''
          }
          isOnline={logoutShiftStatus.isOnline}
          mode="logout"
          onCancel={() => setShowLogoutWarning(false)}
          onCloseShift={() => {
            setShowLogoutWarning(false)
            void performLogout()
          }}
        />
      )}
    </div>
  )
}