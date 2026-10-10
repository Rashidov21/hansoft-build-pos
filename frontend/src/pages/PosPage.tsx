import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calculator, LogOut, Printer, LayoutGrid, Lock, Pause, Play, Trash2, Users, Pencil, Search } from 'lucide-react'
import Decimal from 'decimal.js'
import {
  AppError,
  CARD_BANKS,
  checkShiftStatus,
  completeSale,
  fetchHardwareConfig,
  fetchStoreSettings,
  fetchVariantByBarcode,
  fetchPosVariantSearch,
  fetchPosVariantsByProduct,
  fetchStockEvents,
  fetchMe,
  loginWithPin,
  type CardBank,
  type PosVariant,
} from '../api'
import { usePosStore, cartLineKey, type PayMode, type SuspendedCart } from '../store/posStore'
import { formatMoney } from '../utils/money'
import { showSellPriceInCatalog } from '../utils/sellPriceVisibility'
import { cartNameFieldsFromVariant, formatPosCartLineName } from '../utils/posCartName'
import {
  dateLocale,
  pickCustomName,
  pickProductName,
} from '../utils/localizedName'
import { isPrinterError, translatePrinterError } from '../utils/printerErrors'
import { buildCompleteSaleFingerprintInput } from '../utils/saleFingerprint'
import { printNakladnoyWithFallback, printReceiptWithFallback } from '../utils/printingHub'
import { requestAdminDataRefresh } from '../utils/adminDataRefresh'
import {
  defaultSaleQty,
  formatQty,
  isIntegerUnit,
  normalizeUnit,
  parseQty,
  qtyStep,
  toKg,
  validateSaleQty,
  type ProductUnit,
} from '../utils/qty'
import type { PriceTier } from '../store/posStore'
import { calcCashChange } from '../utils/cashChange'

function hasWholesalePrice(v: { wholesale_price?: string | null }): boolean {
  const w = v.wholesale_price
  return w != null && String(w).trim() !== '' && Number(w) > 0
}

function resolveSellPrice(
  v: { list_price?: string | null; wholesale_price?: string | null },
  tier: PriceTier,
): string | null {
  if (tier === 'wholesale' && hasWholesalePrice(v)) {
    return String(v.wholesale_price)
  }
  return v.list_price != null ? String(v.list_price) : null
}
import { TouchNumpad } from '../components/TouchNumpad'
import { PinNumpadPanel } from '../components/PinNumpadPanel'
import { ActionToast } from '../components/ActionToast'
import { AppearanceDropdown } from '../components/AppearanceDropdown'
import { loadLocale } from '../i18n'

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })

/** idle = savat; picking = nakladnoy chop / yig‘ish; ready = to‘lovga tayyor (to‘liq yo‘l). */
type SalePhase = 'idle' | 'picking' | 'ready'

type PaymentRow = {
  id: string
  method: PayMode
  amount: string
  cardBank?: CardBank
}

function roundSom(v: Decimal.Value): Decimal {
  return new Decimal(v).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
}

function parseSom(v: string): Decimal {
  const normalized = (v || '0').replace(',', '.').trim() || '0'
  try {
    return roundSom(new Decimal(normalized))
  } catch {
    return new Decimal(0)
  }
}

function beepError() {
  // POS sound effects are disabled globally by request.
}

function beepOk() {
  // POS sound effects are disabled globally by request.
}

function normalizeScannerToken(token: string): string {
  const v = (token || '').trim()
  if (!v) return ''
  if (v === '\\t' || v.toLowerCase() === 'tab') return '\t'
  if (v === '\\n' || v.toLowerCase() === 'enter') return '\n'
  return token
}

function normalizeScanValue(raw: string, prefix: string, suffix: string): string {
  let value = (raw || '').trim()
  if (!value) return ''
  if (suffix && value.endsWith(suffix)) value = value.slice(0, -suffix.length).trim()
  if (prefix && value.startsWith(prefix)) value = value.slice(prefix.length)
  return value.trim()
}

function moneyFromLine(list: string, qty: number): string {
  return roundSom(new Decimal(list).mul(qty)).toString()
}

/** Paid amount for a cart line — bonus lines are free on the customer total. */
function linePayAmount(l: { listPrice: string; qty: number; isBonus?: boolean }): string {
  if (l.isBonus) return '0'
  return moneyFromLine(l.listPrice, l.qty)
}

function sumGrand(cart: ReturnType<typeof usePosStore.getState>['cart']): string {
  let t = new Decimal(0)
  for (const l of cart) {
    if (l.isBonus) continue
    t = t.plus(new Decimal(l.listPrice).mul(l.qty))
  }
  return roundSom(t).toString()
}

function calcGrand(subtotal: Decimal, discount: Decimal): Decimal {
  const g = subtotal.minus(discount)
  return g.greaterThan(0) ? roundSom(g) : new Decimal(0)
}

const AFTER_SCAN_FOCUS_KEY = 'pos_after_scan_focus'
const LOW_STOCK_THRESHOLD = 3
/** Ignore identical barcode scans within this window (keyboard wedge duplicates). */
const SCAN_DEBOUNCE_MS = 520

function isPosEditableTarget(el: HTMLElement | null): boolean {
  if (!el) return false
  const tag = el.tagName.toUpperCase()
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true
  if (el.isContentEditable) return true
  if (el.closest('[role="dialog"], [data-pos-keep-focus="true"]')) return true
  return false
}

type NumpadCtx =
  | { kind: 'discount' }
  | { kind: 'payment'; rowId: string }
  | { kind: 'qty'; variantId: string; isBonus?: boolean }

type StockMatrixOpen = { productId: string; title: string }

function posVariantPurchasePrice(v: PosVariant): string | undefined {
  const p = v.purchase_price
  if (p == null || p === '') return undefined
  return String(p)
}

export function PosPage({
  onLogout,
  footerLangStrip = false,
  showPurchasePrice = false,
}: {
  onLogout: () => void
  /** Standalone `/pos` (no admin sidebar): show language at bottom */
  footerLangStrip?: boolean
  /** Admin/owner: kelish narxi korzinada */
  showPurchasePrice?: boolean
}) {
  const { t, i18n } = useTranslation()
  const scanRef = useRef<HTMLInputElement>(null)
  const lastQtyCellRef = useRef<HTMLDivElement>(null)
  const pendingQtyFocus = useRef(false)
  /** Synchronous guard: React `completing` state can lag one frame behind rapid double-submit. */
  const completeInFlightRef = useRef(false)
  /** Guard to prevent auto-complete immediately after a scan (debounce). */
  const lastScanTimeRef = useRef(0)
  /** Bumps after each successful sale so identical cart contents still get a new idempotency key. */
  const idempotencyGenRef = useRef(0)
  const lastScanRef = useRef<{ code: string; at: number } | null>(null)
  /** Blocks immediate re-add of same barcode until a different sku is scanned. */

  const [buffer, setBuffer] = useState('')
  const [toast, setToast] = useState<{ kind: 'err' | 'ok'; msg: string; muteSound?: boolean } | null>(null)
  const [promptPriceVariant, setPromptPriceVariant] = useState<null | PosVariant>(null)
  const [promptPriceBuf, setPromptPriceBuf] = useState('0')
  /** When editing kg qty: enter as kg or grams (converted to kg on apply). */
  const [qtyInputUnit, setQtyInputUnit] = useState<'kg' | 'g'>('kg')
  const [banner, setBanner] = useState<string | null>(null)
  const [cartFlash, setCartFlash] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [printBanner, setPrintBanner] = useState<string | null>(null)
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)
  const [clearArmed, setClearArmed] = useState(false)
  const [salePhase, setSalePhase] = useState<SalePhase>('idle')
  const [nakladnoyNo, setNakladnoyNo] = useState<string | null>(null)
  const [nakladnoyBusy, setNakladnoyBusy] = useState(false)
  const [orderDiscount, setOrderDiscount] = useState('0')
  const [debtDueDate, setDebtDueDate] = useState('')
  const [debtInstallmentMonths, setDebtInstallmentMonths] = useState('1')
  const [scannerPrefix, setScannerPrefix] = useState('')
  const [scannerSuffix, setScannerSuffix] = useState('\t')
  const [scannerMode, setScannerMode] = useState<'keyboard' | 'serial'>('keyboard')
  const [autoPrintOnSale, setAutoPrintOnSale] = useState(true)
  const [receiptPrintingEnabled, setReceiptPrintingEnabled] = useState(false)
  const [receiptPrinterName, setReceiptPrinterName] = useState('')
  const [receiptPrinterPort, setReceiptPrinterPort] = useState('')
  const [afterScanFocus, setAfterScanFocus] = useState<'scan' | 'qty'>(() => {
    try {
      const v = localStorage.getItem(AFTER_SCAN_FOCUS_KEY)
      return v === 'qty' ? 'qty' : 'scan'
    } catch {
      return 'scan'
    }
  })
  const [numpadCtx, setNumpadCtx] = useState<NumpadCtx | null>(null)
  const [numpadBuf, setNumpadBuf] = useState('0')
  /** Som string when payment/discount numpad was opened (for before / editing). */
  const [amountNumpadBaseline, setAmountNumpadBaseline] = useState('0')
  const [selectedLine, setSelectedLine] = useState<null | {
    variantId: string
    name: string
    stockQty: number
    listPrice: string
    isBonus?: boolean
  }>(null)
  const [numpadValue, setNumpadValue] = useState('0')
  /** list_price when line price modal was opened. */
  const [priceEditBaseline, setPriceEditBaseline] = useState('0')
  const [priceBusy, setPriceBusy] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PosVariant[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const [stockMatrix, setStockMatrix] = useState<null | StockMatrixOpen>(null)
  const [locked, setLocked] = useState(false)
  const [lockTimeoutMinutes, setLockTimeoutMinutes] = useState(5)
  const [showSellInCatalog, setShowSellInCatalog] = useState(true)
  const [unlockPin, setUnlockPin] = useState('')
  const [unlockErr, setUnlockErr] = useState<string | null>(null)
  const [unlockBusy, setUnlockBusy] = useState(false)
  const [meUser, setMeUser] = useState('')
  const [matrixRows, setMatrixRows] = useState<PosVariant[]>([])
  const [matrixBusy, setMatrixBusy] = useState(false)
  const [lockNow, setLockNow] = useState(() => new Date())

  const cart = usePosStore((s) => s.cart)
  const payMode = usePosStore((s) => s.payMode)
  const customerName = usePosStore((s) => s.customerName)
  const customerPhone = usePosStore((s) => s.customerPhone)
  const addLine = usePosStore((s) => s.addLine)
  const refreshCartNames = usePosStore((s) => s.refreshCartNames)
  const incQty = usePosStore((s) => s.incQty)
  const setQty = usePosStore((s) => s.setQty)
  const clearCart = usePosStore((s) => s.clearCart)
  const setPayMode = usePosStore((s) => s.setPayMode)
  const setCustomer = usePosStore((s) => s.setCustomer)
  const updateLinePrice = usePosStore((s) => s.updateLinePrice)
  const setLinePriceTier = usePosStore((s) => s.setLinePriceTier)
  const updateLineStock = usePosStore((s) => s.updateLineStock)
  const toggleLineBonus = usePosStore((s) => s.toggleLineBonus)
  const [priceMode, setPriceMode] = useState<PriceTier>('retail')
  const suspendedCarts = usePosStore((s) => s.suspendedCarts)
  const holdCart = usePosStore((s) => s.holdCart)
  const resumeCart = usePosStore((s) => s.resumeCart)
  const deleteSuspendedCart = usePosStore((s) => s.deleteSuspendedCart)
  const setCart = usePosStore((s) => s.setCart)

  const subtotal = sumGrand(cart)
  const subtotalDec = useMemo(() => parseSom(subtotal), [subtotal])
  const discountDec = useMemo(() => parseSom(orderDiscount), [orderDiscount])
  const grandDec = useMemo(() => calcGrand(subtotalDec, discountDec), [subtotalDec, discountDec])
  const grand = grandDec.toString()

  const lowStockModels = useMemo(() => {
    const byProduct = new Map<
      string,
      {
        id: string
        name: string
        totalStock: number
        soldQty: number
      }
    >()
    const seenVariant = new Set<string>()
    for (const l of cart) {
      const key = l.productId || l.variantId
      const current = byProduct.get(key) || { id: key, name: l.name, totalStock: 0, soldQty: 0 }
      current.soldQty += l.qty
      if (!seenVariant.has(l.variantId)) {
        current.totalStock += Math.max(0, Number(l.stockQty ?? 0))
        seenVariant.add(l.variantId)
      }
      byProduct.set(key, current)
    }
    return Array.from(byProduct.values()).filter((row) => {
      const remaining = row.totalStock - row.soldQty
      return remaining >= 0 && remaining < LOW_STOCK_THRESHOLD
    })
  }, [cart])

  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    { id: crypto.randomUUID(), method: 'CASH', amount: '0' },
  ])
  const [activePayId, setActivePayId] = useState<string | null>(null)

  const hasDebtMethod = paymentRows.some((p) => p.method === 'DEBT')
  const debtAmountDec = useMemo(
    () =>
      paymentRows
        .filter((p) => p.method === 'DEBT')
        .reduce((acc, r) => acc.plus(parseSom(r.amount)), new Decimal(0)),
    [paymentRows],
  )
  const installmentMonths = Math.min(36, Math.max(1, Math.floor(Number(debtInstallmentMonths) || 1)))
  const monthlyDebtHint = useMemo(() => {
    if (!hasDebtMethod || installmentMonths < 1) return null
    return roundSom(debtAmountDec.div(installmentMonths)).toString()
  }, [debtAmountDec, hasDebtMethod, installmentMonths])

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetchMe()
        setMeUser(me.username)
      } catch {
        setMeUser('')
      }
    })()
  }, [])

  const shouldKeepCurrentFocus = useCallback(() => isPosEditableTarget(document.activeElement as HTMLElement | null), [])

  const safeRefocus = useCallback(() => {
    if (locked || numpadCtx || selectedLine || stockMatrix) return
    if (shouldKeepCurrentFocus()) return
    requestAnimationFrame(() => {
      if (document.activeElement !== scanRef.current) {
        scanRef.current?.focus()
      }
    })
    window.setTimeout(() => {
      if (document.activeElement !== scanRef.current) {
        scanRef.current?.focus()
      }
    }, 50)
  }, [locked, numpadCtx, selectedLine, shouldKeepCurrentFocus, stockMatrix])

  function scanFieldPending(): boolean {
    const dom = (scanRef.current?.value || '').trim()
    return Boolean(buffer.trim() || dom)
  }

  useEffect(() => {
    if (!completing) safeRefocus()
  }, [completing, safeRefocus])

  useEffect(() => {
    if (!pendingQtyFocus.current || cart.length === 0) return
    pendingQtyFocus.current = false
    const id = requestAnimationFrame(() => lastQtyCellRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [cart])

  useEffect(() => {
    const q = productSearch.trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }
    const tmr = window.setTimeout(() => {
      setSearchBusy(true)
      void fetchPosVariantSearch(q)
        .then(setSearchResults)
        .catch(() => {
          setSearchResults([])
          showToast('err', t('err.API_ERROR'))
        })
        .finally(() => setSearchBusy(false))
    }, 320)
    return () => window.clearTimeout(tmr)
  }, [productSearch, t])

  useEffect(() => {
    if (!stockMatrix) {
      setMatrixRows([])
      return
    }
    setMatrixBusy(true)
    void fetchPosVariantsByProduct(stockMatrix.productId)
      .then(setMatrixRows)
      .catch(() => {
        setMatrixRows([])
        showToast('err', t('err.API_ERROR'))
      })
      .finally(() => setMatrixBusy(false))
  }, [stockMatrix, t])

  useEffect(() => {
    const inProgress = cart.length > 0 || completing
    window.dispatchEvent(new CustomEvent('geekspos-sale-progress', { detail: { inProgress } }))
  }, [cart.length, completing])

  useEffect(() => {
    ;(async () => {
      let store: Awaited<ReturnType<typeof fetchStoreSettings>> | null = null
      try {
        store = await fetchStoreSettings()
        setShowSellInCatalog(showSellPriceInCatalog(store))
      } catch {
        store = null
        setShowSellInCatalog(true)
      }
      try {
        const cfg = await fetchHardwareConfig()
        setScannerMode(cfg.scanner_mode === 'serial' ? 'serial' : 'keyboard')
        setScannerPrefix(normalizeScannerToken(cfg.scanner_prefix || ''))
        setScannerSuffix(normalizeScannerToken(cfg.scanner_suffix || '\t') || '\t')
        setAutoPrintOnSale(cfg.auto_print_on_sale !== false)
        setReceiptPrintingEnabled(cfg.receipt_printing_enabled === true || store?.receipt_printing_enabled === true)
        const fromStore = (store?.receipt_printer_name || '').trim()
        const fromHw = (cfg.receipt_printer_name || '').trim()
        setReceiptPrinterName(fromStore || fromHw)
        setReceiptPrinterPort((store?.receipt_printer_port || cfg.receipt_printer_port || '').trim())
        setLockTimeoutMinutes(Math.max(1, Number(cfg.lock_timeout_minutes || 5)))
      } catch {
        setScannerPrefix('')
        setScannerSuffix('\t')
        setScannerMode('keyboard')
        setAutoPrintOnSale(false)
        setReceiptPrintingEnabled(store?.receipt_printing_enabled === true)
        setReceiptPrinterName((store?.receipt_printer_name || '').trim())
        setReceiptPrinterPort((store?.receipt_printer_port || '').trim())
        setLockTimeoutMinutes(5)
      }
    })()
  }, [])

  useEffect(() => {
    refreshCartNames(i18n.language)
  }, [i18n.language, refreshCartNames])

  useEffect(() => {
    if (locked) return
    const timeoutMs = Math.max(1, lockTimeoutMinutes) * 60 * 1000
    let timer = window.setTimeout(() => setLocked(true), timeoutMs)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setLocked(true), timeoutMs)
    }
    const events: Array<keyof WindowEventMap> = ['mousedown', 'keydown', 'touchstart', 'pointerdown']
    for (const e of events) window.addEventListener(e, reset, { passive: true })
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, reset as EventListener)
    }
  }, [locked, lockTimeoutMinutes])

  useEffect(() => {
    if (!locked) return
    const id = window.setInterval(() => setLockNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [locked])

  const lockDateLabel = useMemo(
    () =>
      lockNow.toLocaleDateString(dateLocale(i18n.language), {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    [i18n.language, lockNow],
  )
  const lockTimeLabel = useMemo(
    () =>
      lockNow.toLocaleTimeString(dateLocale(i18n.language), {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [i18n.language, lockNow],
  )

  useEffect(() => {
    let since: string | undefined
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const events = await fetchStockEvents(since)
          if (events.length === 0) return
          since = events[events.length - 1].created_at
          for (const e of events) {
            updateLineStock(e.variant_id, e.stock_qty)
          }
        } catch {
          // ignore stock sync polling errors
        }
      })()
    }, 5000)
    return () => window.clearInterval(id)
  }, [updateLineStock])

  // Bonus / chegirma o'zgaganda to'lov summasini jami bilan ushlab turish
  useEffect(() => {
    setPaymentRows((prev) => {
      if (prev.length === 0) return prev
      if (prev.length === 1) {
        const row = prev[0]
        if (!row || row.amount === grand) return prev
        return [{ ...row, amount: grand }]
      }
      const total = prev.reduce((acc, r) => acc.plus(parseSom(r.amount)), new Decimal(0))
      const target = parseSom(grand)
      if (total.eq(target)) return prev
      // Ko'p qator: farqni birinchi qatorga qo'shamiz (manfiy bo'lsa bitta qatorga yig'amiz)
      const first = prev[0]
      const nextFirst = roundSom(parseSom(first.amount).plus(target.minus(total)))
      if (nextFirst.lessThan(0)) {
        return [{ ...first, amount: grand }]
      }
      return prev.map((r, i) => (i === 0 ? { ...r, amount: nextFirst.toString() } : r))
    })
  }, [grand])

  // Bonus qatorlar jami kamaytirganda chegirma subtotaldan oshib ketmasin
  useEffect(() => {
    const sub = parseSom(subtotal)
    const disc = parseSom(orderDiscount)
    if (disc.greaterThan(sub)) {
      setOrderDiscount(sub.toString())
    }
  }, [subtotal, orderDiscount])

  useEffect(() => {
    if (paymentRows.length > 0 && !activePayId) {
      setActivePayId(paymentRows[0].id)
    }
  }, [paymentRows.length, activePayId, paymentRows])

  function paymentTotal(): Decimal {
    return paymentRows.reduce((acc, r) => acc.plus(parseSom(r.amount)), new Decimal(0))
  }

  const cashRowsTotal = useMemo(
    () =>
      paymentRows
        .filter((r) => r.method === 'CASH')
        .reduce((acc, r) => acc.plus(parseSom(r.amount)), new Decimal(0)),
    [paymentRows],
  )
  const nonCashRowsTotal = useMemo(
    () =>
      paymentRows
        .filter((r) => r.method !== 'CASH')
        .reduce((acc, r) => acc.plus(parseSom(r.amount)), new Decimal(0)),
    [paymentRows],
  )
  const cashChange = useMemo(() => {
    const r = calcCashChange({
      grand: Number(grandDec.toString()),
      cashTendered: Number(cashRowsTotal.toString()),
      nonCashPaid: Number(nonCashRowsTotal.toString()),
    })
    return {
      cashOwed: new Decimal(r.cashOwed),
      change: new Decimal(r.change),
      shortfall: new Decimal(r.shortfall),
    }
  }, [grandDec, cashRowsTotal, nonCashRowsTotal])
  const cashChangeDue = cashChange.change
  const showCashTenderPanel = cashRowsTotal.gt(0) || cashChange.cashOwed.gt(0)

  function setActiveMethod(method: PayMode) {
    setPayMode(method)
    setPaymentRows((prev) => {
      if (prev.length === 0) {
        const id = crypto.randomUUID()
        setActivePayId(id)
        return [{ id, method, amount: grand }]
      }
      if (!activePayId) {
        return prev.map((p, idx) => (idx === 0 ? { ...p, method } : p))
      }
      return prev.map((p) => (p.id === activePayId ? { ...p, method } : p))
    })
  }

  function addPaymentRow() {
    const id = crypto.randomUUID()
    setPaymentRows((prev) => [...prev, { id, method: payMode, amount: '0' }])
    setActivePayId(id)
  }

  function removePaymentRow(id: string) {
    setPaymentRows((prev) => {
      const next = prev.filter((r) => r.id !== id)
      if (next.length === 0) {
        const single = [{ id: crypto.randomUUID(), method: 'CASH' as PayMode, amount: grand }]
        setActivePayId(single[0].id)
        return single
      }
      if (!next.some((r) => r.id === activePayId)) {
        setActivePayId(next[0].id)
      }
      return next
    })
  }

  function updatePaymentRow(id: string, patch: Partial<PaymentRow>) {
    setPaymentRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function showToast(kind: 'err' | 'ok', msg: string, opts?: { muteSound?: boolean }) {
    setToast({ kind, msg, muteSound: opts?.muteSound })
  }

  function resetCheckoutState() {
    setPaymentRows([{ id: crypto.randomUUID(), method: 'CASH', amount: '0' }])
    setActivePayId(null)
    setOrderDiscount('0')
    setDebtDueDate('')
    setDebtInstallmentMonths('1')
    setCustomer('', '')
  }

  function resetSalePhase() {
    setSalePhase('idle')
    setNakladnoyNo(null)
    setNakladnoyBusy(false)
  }

  function openNewCart(toastMsg?: string) {
    clearCart()
    resetCheckoutState()
    resetSalePhase()
    if (toastMsg) showToast('ok', toastMsg)
    safeRefocus()
  }

  function cancelSaleFlow(opts?: { force?: boolean }) {
    if (cart.length === 0 && salePhase === 'idle') return
    // Idle: double-confirm (same as Escape). Picking/ready (S4): immediate.
    const immediate = opts?.force || salePhase === 'picking' || salePhase === 'ready'
    if (!immediate && !clearArmed) {
      setClearArmed(true)
      setBanner(t('msg.clearCartConfirm'))
      return
    }
    clearCart()
    resetCheckoutState()
    resetSalePhase()
    setClearArmed(false)
    setBanner(null)
    showToast('ok', t('pos.saleCancelled', { defaultValue: 'Savdo bekor qilindi (ombor o‘zgarmadi)' }))
    safeRefocus()
  }

  function cartLinesForNakladnoy() {
    return cart.map((l) => {
      const unit = normalizeUnit(l.unit)
      const qty = l.qty
      const unitPrice = l.isBonus ? '0' : parseSom(l.listPrice).toString()
      const lineTotal = l.isBonus ? '0' : moneyFromLine(l.listPrice, qty)
      return {
        name: l.name,
        qty: formatQty(qty, unit),
        unit,
        unit_price: unitPrice,
        line_total: lineTotal,
      }
    })
  }

  async function printNakladnoy() {
    if (nakladnoyBusy || cart.length === 0) return
    setNakladnoyBusy(true)
    setPrintBanner(null)
    try {
      const result = await printNakladnoyWithFallback(cartLinesForNakladnoy(), {
        receipt_printer_name: receiptPrinterName || '',
        receipt_printer_port: receiptPrinterPort || '',
      }, { public_no: nakladnoyNo || undefined })
      // Enter picking even if physical print failed (payload already issued, stock untouched).
      setNakladnoyNo(result.public_no || null)
      setSalePhase('picking')
      if (result.kind === 'escpos') {
        showToast(
          'ok',
          t('pos.nakladnoyPrinted', {
            defaultValue: 'Nakladnoy chop etildi: {{printer}}',
            printer: result.printer,
          }),
          { muteSound: true },
        )
      } else if (result.kind === 'plain') {
        showToast(
          'ok',
          t('pos.nakladnoyPrintedPlain', { defaultValue: 'Nakladnoy matn sifatida ochildi' }),
          { muteSound: true },
        )
      } else {
        const rawMessage = result.error || t('msg.printFailed')
        const warn =
          (isPrinterError(rawMessage) ? translatePrinterError(rawMessage) : rawMessage) +
          ' — ' +
          t('pos.nakladnoyContinueWithoutPrint', {
            defaultValue: 'Yig‘ishni davom ettirish mumkin',
          })
        setPrintBanner(warn)
        showToast('err', warn, { muteSound: true })
      }
    } catch (e: unknown) {
      const rawMessage = e instanceof Error ? e.message : String(e || '')
      if (isPrinterError(rawMessage)) {
        setPrintBanner(translatePrinterError(rawMessage))
      } else {
        setPrintBanner(t('msg.printFailed'))
      }
      showToast('err', rawMessage || t('msg.printFailed'), { muteSound: true })
    } finally {
      setNakladnoyBusy(false)
      safeRefocus()
    }
  }

  function confirmPicked() {
    if (salePhase !== 'picking') return
    setSalePhase('ready')
    showToast('ok', t('pos.pickChecked', { defaultValue: 'Tekshirildi — to‘lovga o‘ting' }))
    safeRefocus()
  }

  function holdCurrentCart(opts?: { silent?: boolean }) {
    if (cart.length === 0) return null
    const total = Number(grandDec.toString())
    const suspended = holdCart({ items: cart, total })
    openNewCart(opts?.silent ? undefined : t('pos.newCartOpened'))
    return suspended
  }

  function restoreSuspendedCart(session: SuspendedCart) {
    setCart(session.items)
    refreshCartNames(i18n.language)
    resetCheckoutState()
    resetSalePhase()
    setPaymentRows([{ id: crypto.randomUUID(), method: 'CASH', amount: String(session.total || 0) }])
    setActivePayId(null)
    showToast('ok', t('pos.cartResumed'))
    safeRefocus()
  }

  async function tryPrint(saleId: string) {
    if (!receiptPrintingEnabled) return
    setPrintBanner(null)
    try {
      const result = await printReceiptWithFallback(saleId, {
        receipt_printer_name: receiptPrinterName || '',
        receipt_printer_port: receiptPrinterPort || '',
      })
      if (result.kind === 'escpos') {
        showToast(
          'ok',
          t('msg.printQueuedTo', { printer: result.printer }),
          { muteSound: true },
        )
      } else {
        showToast(
          'ok',
          t('msg.printQueuedPlain'),
          { muteSound: true },
        )
      }
    } catch (e: unknown) {
      const rawMessage = e instanceof Error ? e.message : String(e || '')
      if (isPrinterError(rawMessage)) {
        setPrintBanner(translatePrinterError(rawMessage))
      } else {
        setPrintBanner(t('msg.printFailed'))
      }
      showToast('err', rawMessage || t('msg.printFailed'), { muteSound: true })
    }
    safeRefocus()
  }

  function commitVariantToCart(
    v: PosVariant,
    opts?: {
      clearSearch?: boolean
      unitPrice?: string
    },
  ) {
    const nameFields = cartNameFieldsFromVariant(v)
    const displayName = formatPosCartLineName(nameFields, i18n.language)
    const unit: ProductUnit = normalizeUnit(v.unit)
    const retail = v.list_price != null ? String(v.list_price) : '0'
    const wholesale = hasWholesalePrice(v) ? String(v.wholesale_price) : null
    const tier: PriceTier =
      opts?.unitPrice != null
        ? 'retail'
        : priceMode === 'wholesale' && wholesale
          ? 'wholesale'
          : 'retail'
    const listPrice =
      opts?.unitPrice != null
        ? opts.unitPrice
        : resolveSellPrice(v, tier) ?? retail
    addLine({
      variantId: v.id,
      productId: v.product,
      barcode: v.barcode ?? '',
      name: displayName,
      nameFields,
      listPrice,
      retailPrice: retail,
      wholesalePrice: wholesale,
      priceTier: tier,
      ...(showPurchasePrice && posVariantPurchasePrice(v)
        ? { purchasePrice: posVariantPurchasePrice(v) }
        : {}),
      stockQty: Number(v.stock_qty || 0),
      qty: defaultSaleQty(unit),
      unit,
    })
    beepOk()
    setCartFlash(true)
    setTimeout(() => setCartFlash(false), 240)
    if (opts?.clearSearch) {
      setProductSearch('')
      setSearchResults([])
    }
    if (afterScanFocus === 'qty') {
      pendingQtyFocus.current = true
    } else {
      safeRefocus()
    }
  }

  function addVariantToCart(v: PosVariant, opts?: { clearSearch?: boolean }) {
    if (v.list_price == null) {
      setPromptPriceVariant(v as PosVariant)
      setPromptPriceBuf('0')
      return
    }
    commitVariantToCart(v, opts)
  }

  async function handleScanSubmit(code: string) {
    const c = code.trim()
    if (!c) return
    const now = Date.now()
    const prev = lastScanRef.current
    if (prev && prev.code === c && now - prev.at < SCAN_DEBOUNCE_MS) {
      setBuffer('')
      safeRefocus()
      return
    }
    lastScanRef.current = { code: c, at: now }
    lastScanTimeRef.current = now
    try {
      const v = await fetchVariantByBarcode(c)
      setBuffer('')
      addVariantToCart(v)
      return
    } catch (e: unknown) {
      const barcodeCode = (e as Error & { code?: string }).code
      beepError()
      if (barcodeCode && barcodeCode !== 'BARCODE_NOT_FOUND') {
        showToast('err', t(`err.${barcodeCode}`, { defaultValue: t('msg.scanApi') }))
      } else {
        showToast('err', `${t('msg.scanNotFound')}: ${c}`)
      }
      setBuffer('')
      safeRefocus()
    }
  }

  async function doComplete(opts?: { asQuick?: boolean }) {
    if (completing || completeInFlightRef.current || cart.length === 0) return
    // Full path: pay only after pick confirmation; asQuick skips that guard (nakladnoy abandoned on success).
    if (salePhase === 'picking' && !opts?.asQuick) {
      setBanner(t('pos.pickBeforePay', { defaultValue: 'Avval yig‘ishni tekshiring yoki tezkor yo‘lni tanlang' }))
      showToast('err', t('pos.pickBeforePay', { defaultValue: 'Avval yig‘ishni tekshiring' }))
      return
    }
    if (scanFieldPending()) {
      safeRefocus()
      return
    }

    // Bonus/chegirma endigina o'zgagan bo'lsa — to'lovni jami bilan sinxronlab olamiz
    let rows = paymentRows
    if (rows.length === 1) {
      const row = rows[0]
      if (row && row.method !== 'CASH' && row.amount !== grand) {
        rows = [{ ...row, amount: grand }]
        setPaymentRows(rows)
      }
    }

    const pays = rows
      .map((r) => ({
        method: r.method,
        amount: parseSom(r.amount),
        cardBank: r.cardBank,
      }))
      .filter((p) => (grandDec.eq(0) ? false : p.amount.gt(0)))
    const payTotal = pays.reduce((acc, p) => acc.plus(p.amount), new Decimal(0))

    if (payTotal.lt(grandDec)) {
      beepError()
      setBanner(`${t('msg.paymentMismatch')} (${formatMoney(payTotal.toString())} / ${formatMoney(grandDec.toString())})`)
      safeRefocus()
      return
    }

    const missingBank = pays.some((p) => p.method === 'CARD' && p.amount.gt(0) && !p.cardBank)
    if (missingBank) {
      beepError()
      setBanner(t('pay.bankRequiredAlert', { defaultValue: 'Karta to‘lovi uchun bank tanlang!' }))
      safeRefocus()
      return
    }

    const cashTenderedNow = pays
      .filter((p) => p.method === 'CASH')
      .reduce((acc, p) => acc.plus(p.amount), new Decimal(0))
    const nonCashNow = pays
      .filter((p) => p.method !== 'CASH')
      .reduce((acc, p) => acc.plus(p.amount), new Decimal(0))
    const changeInfo = calcCashChange({
      grand: Number(grandDec.toString()),
      cashTendered: Number(cashTenderedNow.toString()),
      nonCashPaid: Number(nonCashNow.toString()),
    })
    if (changeInfo.shortfall > 0 && cashTenderedNow.gt(0)) {
      beepError()
      setBanner(
        t('pay.tenderedShort', {
          defaultValue: 'Berilgan naqd yetarli emas. Qaytim uchun to‘liq summani kiriting.',
        }),
      )
      safeRefocus()
      return
    }

    const hasDebt = pays.some((p) => p.method === 'DEBT' && p.amount.gt(0))
    if (hasDebt && (!customerPhone.trim() || !customerName.trim())) {
      beepError()
      setBanner(t('msg.debtRequired'))
      safeRefocus()
      return
    }

    for (const l of cart) {
      const unit: ProductUnit = normalizeUnit(l.unit)
      const bad = validateSaleQty(l.qty, unit)
      if (bad === 'min_dona') {
        beepError()
        setBanner(t('qty.minInteger', { defaultValue: 'Miqdor butun son bo‘lishi kerak (≥ 1)' }))
        safeRefocus()
        return
      }
      if (bad === 'min_frac' || bad === 'min_kg') {
        beepError()
        setBanner(t('qty.minFrac', { defaultValue: 'Minimal miqdor: 0,001' }))
        safeRefocus()
        return
      }
      if (bad) {
        beepError()
        setBanner(t('qty.invalid', { defaultValue: 'Miqdor noto‘g‘ri' }))
        safeRefocus()
        return
      }
    }

    // Trim excess cash so the backend receives exact grand total
    let excessCash = payTotal.gt(grandDec) ? payTotal.minus(grandDec) : new Decimal(0)
    const normalizedPays = pays
      .map((p) => {
        if (p.method === 'CASH' && excessCash.gt(0)) {
          const canTrim = Decimal.min(excessCash, p.amount)
          excessCash = excessCash.minus(canTrim)
          return { ...p, amount: p.amount.minus(canTrim) }
        }
        return p
      })
      .filter((p) => p.amount.gt(0))

    if (excessCash.gt(0) || (grandDec.gt(0) && !normalizedPays.reduce((acc, p) => acc.plus(p.amount), new Decimal(0)).eq(grandDec))) {
      beepError()
      setBanner(`${t('msg.paymentMismatch')} (${formatMoney(payTotal.toString())} / ${formatMoney(grandDec.toString())})`)
      safeRefocus()
      return
    }

    completeInFlightRef.current = true
    setBanner(null)
    setCompleting(true)

    try {
      try {
        const shift = await checkShiftStatus()
        if (!shift.has_open_shift) {
          beepError()
          setBanner(
            t('err.NO_OPEN_SHIFT', {
              defaultValue: 'Smena ochilmagan. Avval smenani oching.',
            }),
          )
          showToast(
            'err',
            t('err.NO_OPEN_SHIFT', {
              defaultValue: 'Smena ochilmagan. Avval smenani oching.',
            }),
          )
          return
        }
      } catch {
        // Offline / API: backend still enforces NO_OPEN_SHIFT on complete.
      }

      const lines = cart.map((l) => ({
        variant_id: l.variantId,
        qty: l.qty,
        line_discount: '0',
        unit_price: parseSom(l.listPrice).toString(),
        price_tier: l.priceTier === 'wholesale' ? 'wholesale' : 'retail',
        is_bonus: Boolean(l.isBonus),
      }))
      const payments = normalizedPays.map((p) => ({
        method: p.method,
        amount: p.amount.toString(),
        ...(p.method === 'CARD' && p.cardBank ? { card_bank: p.cardBank } : {}),
      }))
      const customer = hasDebt
        ? {
            name: customerName.trim(),
            phone_normalized: customerPhone.trim(),
          }
        : undefined
      const debtMonths = hasDebt ? installmentMonths : null

      const canonical = buildCompleteSaleFingerprintInput({
        generation: idempotencyGenRef.current,
        lines,
        payments,
        order_discount: discountDec.toString(),
        expected_grand_total: grandDec.toString(),
        debt_due_date: hasDebt && debtDueDate ? debtDueDate : null,
        debt_installment_months: debtMonths,
        customer,
      })

      // IMPORTANT: avoid idempotency replay across app restarts (generation resets to 0).
      // Use a short random key per sale attempt, but reuse it if the same request is retried
      // after a transient network failure.
      const PENDING_IDEM_KEY = 'geeks_pos_pending_sale_idem'
      const PENDING_CANONICAL_KEY = 'geeks_pos_pending_sale_idem_canonical'
      let idem = ''
      try {
        const existingKey = sessionStorage.getItem(PENDING_IDEM_KEY) || ''
        const existingCanonical = sessionStorage.getItem(PENDING_CANONICAL_KEY) || ''
        if (existingKey && existingCanonical && existingCanonical === canonical) {
          idem = existingKey
        } else {
          idem = crypto.randomUUID()
          sessionStorage.setItem(PENDING_IDEM_KEY, idem)
          sessionStorage.setItem(PENDING_CANONICAL_KEY, canonical)
        }
      } catch {
        idem = crypto.randomUUID()
      }

      const saleBody = {
        lines,
        payments,
        order_discount: discountDec.toString(),
        customer,
        debt_due_date: hasDebt && debtDueDate ? debtDueDate : null,
        debt_installment_months: debtMonths,
        expected_grand_total: grandDec.toString(),
      }
      let res
      try {
        res = await completeSale(saleBody, idem)
      } catch (firstErr: unknown) {
        const firstCode =
          firstErr instanceof AppError
            ? firstErr.code
            : (firstErr as Error & { code?: string }).code
        if (firstCode === 'BELOW_COST' && showPurchasePrice) {
          const ok = window.confirm(
            t('pos.confirmBelowCost', {
              defaultValue:
                "Ba'zi qatorlar tannarxdan past. Davom etasizmi?",
            }),
          )
          if (!ok) throw firstErr
          res = await completeSale({ ...saleBody, confirm_below_cost: true }, idem)
        } else {
          throw firstErr
        }
      }
      idempotencyGenRef.current += 1
      try {
        sessionStorage.removeItem('geeks_pos_pending_sale_idem')
        sessionStorage.removeItem('geeks_pos_pending_sale_idem_canonical')
      } catch {
        // ignore
      }
      setLastSaleId(res.sale_id)
      openNewCart()
      showToast('ok', `${t('msg.sale')}: ${res.public_sale_no || res.sale_id}`)
      if (receiptPrintingEnabled && autoPrintOnSale) void tryPrint(res.sale_id as string)
      requestAdminDataRefresh('sale-complete')
    } catch (e: unknown) {
      beepError()
      const appErr = e instanceof AppError ? e : null
      const code = appErr?.code || (e as Error & { code?: string }).code
      const detail = appErr?.detail || (e as Error & { detail?: string }).detail || ''
      const fallback = detail || (e instanceof Error ? e.message : '') || t('msg.errorGeneric')
      const baseMsg = t(`err.${code || 'API_ERROR'}`, { defaultValue: fallback })
      const msg =
        (code === 'API_ERROR' || code === 'INVALID_PAYMENT_SPLIT') && detail && detail !== code
          ? `${baseMsg}: ${detail}`
          : baseMsg
      if (code === 'INSUFFICIENT_STOCK') {
        setBanner(`${t('msg.stock')} ${msg}`)
      } else {
        setBanner(msg)
      }
      showToast('err', msg)
    } finally {
      completeInFlightRef.current = false
      setCompleting(false)
    }
    safeRefocus()
  }

  function onScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault()
      return
    }
    if (e.altKey && e.key === 'F4') {
      e.preventDefault()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (buffer.trim()) {
        const normalized = normalizeScanValue(buffer, scannerPrefix, scannerSuffix || '\t')
        setBuffer('')
        if (normalized) void handleScanSubmit(normalized)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      if (cart.length > 0 || salePhase !== 'idle') {
        cancelSaleFlow({ force: e.shiftKey })
      }
      setBuffer('')
      safeRefocus()
      return
    }
    if (e.key === 'F1') {
      e.preventDefault()
      setActiveMethod('CASH')
      return
    }
    if (e.key === 'F2') {
      e.preventDefault()
      setActiveMethod('CARD')
      return
    }
    if (e.key === 'F3') {
      e.preventDefault()
      setActiveMethod('DEBT')
      return
    }
  }

  useEffect(() => {
    function onGlobalKeyDown(e: KeyboardEvent) {
      if (locked || numpadCtx || selectedLine || stockMatrix) return
      if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        return
      }
      if (e.altKey && e.key === 'F4') {
        e.preventDefault()
        return
      }
      if (!['Enter', 'Escape', 'F1', 'F2', 'F3'].includes(e.key)) return
      const target = e.target as HTMLElement | null
      if (isPosEditableTarget(target) && target?.id !== 'posScanInput') return
      e.preventDefault()
      if (e.key === 'Enter') {
        if (buffer.trim()) {
          const normalized = normalizeScanValue(buffer, scannerPrefix, scannerSuffix || '\t')
          setBuffer('')
          if (normalized) void handleScanSubmit(normalized)
        }
        return
      }
      if (e.key === 'Escape') {
        if (cart.length > 0 || salePhase !== 'idle') {
          cancelSaleFlow({ force: e.shiftKey })
        }
        setBuffer('')
        safeRefocus()
        return
      }
      if (e.key === 'F1') setActiveMethod('CASH')
      if (e.key === 'F2') setActiveMethod('CARD')
      if (e.key === 'F3') setActiveMethod('DEBT')
    }
    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [
    buffer,
    cart.length,
    clearArmed,
    clearCart,
    locked,
    numpadCtx,
    safeRefocus,
    salePhase,
    scannerPrefix,
    scannerSuffix,
    selectedLine,
    stockMatrix,
    t,
  ])

  useEffect(() => {
    if (locked || numpadCtx || selectedLine || stockMatrix) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (isPosEditableTarget(target)) return
      if (target?.closest('button')) return
      safeRefocus()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') safeRefocus()
    }
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [locked, numpadCtx, safeRefocus, selectedLine, stockMatrix])

  function onScanChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    if (scannerMode !== 'keyboard') {
      setBuffer(v)
      return
    }
    const suffix = scannerSuffix || '\t'
    if (suffix && v.endsWith(suffix)) {
      const code = normalizeScanValue(v, scannerPrefix, suffix)
      setBuffer('')
      void handleScanSubmit(code)
      return
    }
    setBuffer(v)
  }

  const payTotalView = paymentTotal().toString()

  function openAmountNumpad(ctx: NumpadCtx) {
    setNumpadCtx(ctx)
    if (ctx.kind === 'discount') {
      const buf = roundSom(parseSom(orderDiscount)).toString()
      setNumpadBuf(buf)
      setAmountNumpadBaseline(buf)
    } else if (ctx.kind === 'qty') {
      const line = cart.find(
        (c) => c.variantId === ctx.variantId && Boolean(c.isBonus) === Boolean(ctx.isBonus),
      )
      const unit: ProductUnit = normalizeUnit(line?.unit)
      setQtyInputUnit('kg')
      const buf = formatQty(Math.max(0, line?.qty ?? 0), unit)
      setNumpadBuf(buf)
      setAmountNumpadBaseline(buf)
    } else {
      const row = paymentRows.find((r) => r.id === ctx.rowId)
      const buf = row ? roundSom(parseSom(row.amount)).toString() : '0'
      setNumpadBuf(buf)
      setAmountNumpadBaseline(buf)
    }
  }

  function applyAmountNumpad() {
    if (!numpadCtx) return
    if (numpadCtx.kind === 'qty') {
      const line = cart.find(
        (c) =>
          c.variantId === numpadCtx.variantId &&
          Boolean(c.isBonus) === Boolean(numpadCtx.isBonus),
      )
      const unit: ProductUnit = normalizeUnit(line?.unit)
      let n = parseQty(numpadBuf || '0')
      if (unit === 'kg' && qtyInputUnit === 'g') {
        n = toKg(n, 'g')
      }
      if (isIntegerUnit(unit)) {
        n = Math.max(0, Math.round(n))
      }
      const bad = validateSaleQty(n, unit)
      if (bad === 'min_dona') {
        showToast('err', t('qty.minInteger', { defaultValue: 'Miqdor butun son bo‘lishi kerak (≥ 1)' }))
        return
      }
      if (bad === 'min_frac' || bad === 'min_kg') {
        showToast('err', t('qty.minFrac', { defaultValue: 'Minimal miqdor: 0,001' }))
        return
      }
      if (n <= 0) {
        showToast('err', t('qty.invalid', { defaultValue: 'Miqdor noto‘g‘ri' }))
        return
      }
      setQty(numpadCtx.variantId, n, { isBonus: numpadCtx.isBonus })
      setNumpadCtx(null)
      safeRefocus()
      return
    }
    const v = roundSom(parseSom(numpadBuf)).toString()
    if (numpadCtx.kind === 'discount') {
      setOrderDiscount(v)
    } else {
      updatePaymentRow(numpadCtx.rowId, { amount: v })
    }
    setNumpadCtx(null)
    safeRefocus()
  }

  function setAfterScanMode(mode: 'scan' | 'qty') {
    setAfterScanFocus(mode)
    try {
      localStorage.setItem(AFTER_SCAN_FOCUS_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="pos-page-compact h-full min-h-0 bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-1.5 pos-sm:gap-2 px-2 pos-sm:px-3 pos-lg:px-4 py-1.5 pos-lg:py-3 border-b border-slate-800 bg-slate-900 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">{t('app.title')}</span>
        </div>
        <div className="flex gap-2 items-center">
          <AppearanceDropdown variant="navbar" />
          {lastSaleId && receiptPrintingEnabled && (
            <button
              type="button"
              className="touch-btn inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-slate-800 border border-slate-600"
              onClick={() => lastSaleId && void tryPrint(lastSaleId)}
            >
              <Printer className="h-4 w-4" aria-hidden />
              <span className="hidden pos-lg:inline">{t('header.reprint')}</span>
            </button>
          )}
          <button
            type="button"
            className="touch-btn inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-slate-200"
            onClick={() => {
              setLocked(true)
              setUnlockPin('')
              setUnlockErr(null)
            }}
          >
            <Lock className="h-4 w-4" aria-hidden />
            <span className="hidden pos-lg:inline">{t('header.lock', { defaultValue: 'Lock' })}</span>
          </button>
          <button
            type="button"
            className="touch-btn inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-slate-200"
            onClick={() => void onLogout()}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden pos-lg:inline">{t('header.logout')}</span>
          </button>
        </div>
      </header>

      <section
        className={`pos-queue-strip mx-2 pos-sm:mx-3 pos-lg:mx-4 mt-1 pos-lg:mt-3 rounded-lg pos-lg:rounded-xl border border-slate-800 bg-slate-900/70 px-2 py-1 pos-lg:px-3 pos-lg:py-1.5 min-h-0 flex flex-col shrink-0 ${
          suspendedCarts.length > 0
            ? 'max-h-[min(5.5rem,14dvh)] pos-lg:max-h-[min(9rem,22dvh)]'
            : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="inline-flex items-center gap-1.5 text-xs pos-lg:text-sm text-slate-300 truncate min-w-0">
            <Users className="h-3.5 w-3.5 pos-lg:h-4 pos-lg:w-4 shrink-0" />
            <span className="truncate">
              {t('pos.activeSessions', { defaultValue: 'Faol navbatlar' })}: {suspendedCarts.length}
            </span>
          </div>
          <div
            className="inline-flex rounded-xl border border-slate-600 overflow-hidden shrink-0"
            title={t('pos.priceModeDefault', { defaultValue: 'Yangi qator uchun narx turi' })}
            aria-label={t('pos.priceModeDefault', { defaultValue: 'Yangi qator uchun narx turi' })}
          >
            <button
              type="button"
              className={`touch-btn min-h-9 px-3 text-xs font-semibold ${
                priceMode === 'retail'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-800 text-slate-300'
              }`}
              onClick={() => setPriceMode('retail')}
            >
              {t('pos.priceRetail', { defaultValue: 'Chakana' })}
            </button>
            <button
              type="button"
              className={`touch-btn min-h-9 px-3 text-xs font-semibold ${
                priceMode === 'wholesale'
                  ? 'bg-amber-700 text-white'
                  : 'bg-slate-800 text-slate-300'
              }`}
              onClick={() => setPriceMode('wholesale')}
              title={t('pos.priceWholesaleHint', {
                defaultValue: 'Faqat ulgurji narxi bor tovarlarga qo‘llanadi',
              })}
            >
              {t('pos.priceWholesale', { defaultValue: 'Ulgurji' })}
            </button>
          </div>
          <button
            type="button"
            className="touch-btn min-h-9 pos-lg:min-h-11 px-2 pos-lg:px-4 rounded-lg pos-lg:rounded-xl bg-slate-800 border border-slate-600 inline-flex items-center gap-1.5 text-xs pos-lg:text-sm shrink-0"
            onClick={() => {
              const held = holdCurrentCart()
              if (!held) {
                showToast('err', t('cart.empty', { defaultValue: 'Savat bosh' }))
              }
            }}
          >
            <Pause className="h-4 w-4" />
            {t('pos.holdCart', { defaultValue: "Navbatga olish" })}
          </button>
        </div>
        {suspendedCarts.length > 0 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto overflow-y-auto pb-1 min-h-0 max-h-[min(9rem,22dvh)] kiosk-scrollbar">
            {suspendedCarts.map((session) => (
              <div
                key={session.id}
                className="min-w-[210px] rounded-xl border border-slate-700 bg-slate-900 p-3"
              >
                <div className="text-sm font-medium text-slate-100 truncate">{session.label}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {t('summary.total')}: {formatMoney(String(session.total))}
                </div>
                <div className="text-xs text-slate-500">{session.timestamp}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="touch-btn min-h-12 px-3 rounded-lg bg-emerald-700 border border-emerald-500 text-xs inline-flex items-center gap-1"
                    onClick={() => {
                      if (cart.length > 0) {
                        holdCurrentCart({ silent: true })
                      }
                      const picked = resumeCart(session.id)
                      if (picked) restoreSuspendedCart(picked)
                    }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {t('pos.resumeCart', { defaultValue: 'Tiklash' })}
                  </button>
                  <button
                    type="button"
                    className="touch-btn min-h-12 px-3 rounded-lg bg-red-900 border border-red-700 text-xs inline-flex items-center gap-1"
                    onClick={() => {
                      deleteSuspendedCart(session.id)
                      showToast('ok', t('pos.cartDeleted', { defaultValue: "Navbatdagi savat o'chirildi" }))
                      safeRefocus()
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('admin.catalog.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {toast && (
        <ActionToast
          kind={toast.kind}
          message={toast.msg}
          muteSound={toast.muteSound}
          onClose={() => setToast(null)}
        />
      )}
      {banner && (
        <div className="mx-4 mt-2 px-3 py-2 rounded text-sm bg-red-950 border border-red-800 text-red-100">
          {banner}
          <button
            type="button"
            className="ml-2 underline text-white"
            onClick={() => {
              setBanner(null)
              setClearArmed(false)
              safeRefocus()
            }}
          >
            {t('msg.close')}
          </button>
        </div>
      )}
      {printBanner && (
        <div className="mx-4 mt-2 px-3 py-2 rounded text-sm bg-amber-950 border border-amber-800">
          {printBanner}
        </div>
      )}
      {lowStockModels.length > 0 && (
        <div className="mx-4 mt-2 px-3 py-2 rounded text-sm bg-amber-950/90 border border-amber-700 text-amber-50 max-h-[min(10rem,22vh)] min-h-0 flex flex-col">
          <div className="font-medium shrink-0">{t('pos.lowStockModelWarning', { n: LOW_STOCK_THRESHOLD })}</div>
          <ul className="mt-1 list-disc list-inside text-xs opacity-95 overflow-y-auto min-h-0 kiosk-scrollbar pr-1">
            {lowStockModels.map((row) => (
              <li key={row.id}>
                {row.name}: {formatQty(Math.max(0, row.totalStock - row.soldQty), 'kg')} {t('unit.kg')}
                  {' '}({t('pos.afterSaleStockHint', { defaultValue: 'sotuvdan keyin' })})
              </li>
            ))}
          </ul>
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-hidden grid grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] pos-lg:grid-cols-[minmax(0,1fr)_26rem] grid-rows-1 gap-2 pos-lg:gap-3 p-1.5 pos-lg:p-3 max-sm:grid-cols-1 max-sm:grid-rows-[minmax(0,1fr)_minmax(0,auto)] isolate">
        <section className="flex flex-col gap-1.5 pos-lg:gap-3 min-h-0 min-w-0 overflow-y-auto kiosk-scrollbar">
          <label className="kiosk-label text-slate-400" htmlFor="posProductSearch">
            {t('pos.searchLabel')}
          </label>
          <input
            id="posProductSearch"
            data-pos-keep-focus="true"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="pos-scan-field touch-btn w-full min-h-kiosk-touch text-kiosk pos-lg:text-base px-3 pos-lg:px-3 py-2 pos-lg:py-3 rounded-lg pos-lg:rounded-xl border bg-slate-900 border-slate-600 outline-none"
            placeholder={t('pos.searchPlaceholder')}
            autoComplete="off"
            autoFocus
          />
          {searchBusy && <p className="text-xs text-slate-500">{t('admin.common.loading')}</p>}
          {productSearch.trim().length >= 2 && !searchBusy && searchResults.length === 0 && (
            <p className="text-xs text-amber-600/90">{t('pos.searchEmpty')}</p>
          )}
          {searchResults.length > 0 && (
            <ul
              className="max-h-52 overflow-y-auto kiosk-scrollbar rounded-xl border border-slate-700 bg-slate-900/90 divide-y divide-slate-800"
              role="listbox"
            >
              {searchResults.map((v) => {
                const customName = pickCustomName(v, i18n.language)
                const unit = normalizeUnit(v.unit)
                return (
                <li key={v.id}>
                  <button
                    type="button"
                    className="touch-btn w-full min-h-12 text-left px-3 py-3 text-sm hover:bg-slate-800"
                    onClick={() => addVariantToCart(v, { clearSearch: true })}
                  >
                    <div className="font-medium">
                      {pickProductName(v, i18n.language)}
                    </div>
                    {customName && <div className="text-xs text-slate-300 italic">{customName}</div>}
                    <div className="text-xs text-slate-400">
                      {showSellInCatalog && !v.hide_selling_price && v.list_price != null
                        ? `${formatMoney(String(v.list_price))}/${t(`unit.${unit}`)} · `
                        : ''}
                      {t('admin.catalog.stock')}: {formatQty(Number(v.stock_qty || 0), unit)} {t(`unit.${unit}`)}
                    </div>
                  </button>
                </li>
              )
              })}
            </ul>
          )}

          {/* Hidden scan buffer — hardware wedge still works if configured */}
          <input
            ref={scanRef}
            id="posScanInput"
            value={buffer}
            onChange={onScanChange}
            onKeyDown={onScanKeyDown}
            inputMode="none"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            autoComplete="off"
          />

          <div className="flex flex-wrap items-center gap-kiosk text-kiosk-sm text-slate-400">
            <button
              type="button"
              className={`touch-btn min-h-kiosk-touch px-3 pos-lg:px-3 rounded-md pos-lg:rounded-lg border text-kiosk-sm pos-lg:text-sm ${
                afterScanFocus === 'qty' ? 'border-emerald-500 bg-emerald-950/50 text-emerald-100' : 'border-slate-600'
              }`}
              onClick={() => setAfterScanMode(afterScanFocus === 'qty' ? 'scan' : 'qty')}
            >
              {afterScanFocus === 'qty' ? t('pos.focusQtyField') : t('pos.focusQtyField')}
            </button>
          </div>

          {cart.length === 0 && (
            <div className="rounded-xl pos-lg:rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 py-4 pos-lg:py-12 px-3 pos-lg:px-6 text-center flex-1 min-h-[6rem] pos-lg:min-h-0 flex flex-col justify-center">
              <Search className="mx-auto h-10 w-10 pos-lg:h-20 pos-lg:w-20 text-slate-600 mb-2 pos-lg:mb-4" strokeWidth={1.25} aria-hidden />
              <div className="text-sm pos-lg:text-lg font-semibold text-slate-200">{t('pos.emptyCartTitle')}</div>
              <p className="text-xs pos-lg:text-sm text-slate-400 mt-1 pos-lg:mt-2 max-w-sm mx-auto">{t('pos.emptyCartBody')}</p>
            </div>
          )}

          <div
            className={`rounded-xl border transition-colors ${
              cart.length === 0 ? 'hidden' : ''
            } ${cartFlash ? 'border-emerald-500' : 'border-slate-800'}`}
          >
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-auto" />
                {showPurchasePrice ? <col className="w-[7rem]" /> : null}
                <col className="w-[9.75rem]" />
                <col className="w-[7.5rem]" />
              </colgroup>
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left p-2 pos-lg:p-3">{t('cart.title')}</th>
                  {showPurchasePrice && (
                    <th className="text-right p-2 pos-lg:p-3 whitespace-nowrap text-xs">
                      {t('admin.catalog.purchasePrice')}
                    </th>
                  )}
                  <th className="p-2 pos-lg:p-3 w-[9.75rem]">{t('cart.qty')}</th>
                  <th className="text-right p-2 pos-lg:p-3 w-[7.5rem]">{t('cart.sum')}</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l, idx) => {
                  const unit = normalizeUnit(l.unit)
                  const colSpan = showPurchasePrice ? 4 : 3
                  return (
                    <Fragment key={cartLineKey(l)}>
                      <tr
                        className={`border-t border-slate-800 ${l.isBonus ? 'bg-amber-950/20' : ''}`}
                      >
                        <td className="p-2 pos-lg:p-3 align-middle min-w-0">
                          <div className="font-medium flex items-center gap-2 min-w-0">
                            <span className="truncate">{l.name}</span>
                            {l.isBonus ? (
                              <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-700/80 border border-amber-500 text-amber-50">
                                {t('pos.bonus', { defaultValue: 'Bonus' })}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {`${t(`unit.${unit}`, { defaultValue: unit })} · ${formatMoney(l.listPrice)}/${t(`unit.${unit}`, { defaultValue: unit })}`}
                            {l.priceTier === 'wholesale' ? (
                              <span className="ml-2 text-amber-400">
                                ({t('pos.priceWholesale', { defaultValue: 'Ulgurji' })})
                              </span>
                            ) : null}
                          </div>
                        </td>
                        {showPurchasePrice && (
                          <td className="p-2 pos-lg:p-3 text-right text-xs tabular-nums text-amber-300/90 whitespace-nowrap align-middle">
                            {l.purchasePrice ? formatMoney(l.purchasePrice) : '—'}
                          </td>
                        )}
                        <td className="p-2 pos-lg:p-3 text-center align-middle w-[9.75rem]">
                          <div
                            ref={idx === cart.length - 1 ? lastQtyCellRef : undefined}
                            tabIndex={idx === cart.length - 1 ? 0 : -1}
                            className="inline-flex flex-nowrap items-center justify-center gap-1 outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-emerald-500"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="touch-btn min-h-10 min-w-10 shrink-0 rounded-lg bg-slate-800 border border-slate-600 text-lg font-semibold"
                              onClick={() =>
                                incQty(l.variantId, -qtyStep(unit), { isBonus: l.isBonus })
                              }
                            >
                              -
                            </button>
                            <button
                              type="button"
                              className="touch-btn min-h-10 min-w-[3.5rem] shrink-0 px-1.5 rounded-lg bg-slate-950 border border-slate-600 text-center text-sm font-medium tabular-nums inline-flex items-center justify-center gap-0.5"
                              aria-label={t('pos.openNumpad')}
                              onClick={() =>
                                openAmountNumpad({
                                  kind: 'qty',
                                  variantId: l.variantId,
                                  isBonus: l.isBonus,
                                })
                              }
                            >
                              <span>{formatQty(l.qty, unit)}</span>
                              <span className="text-[10px] text-slate-500 font-normal">
                                {t(`unit.${unit}`, { defaultValue: unit })}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="touch-btn min-h-10 min-w-10 shrink-0 rounded-lg bg-slate-800 border border-slate-600 text-lg font-semibold"
                              onClick={() =>
                                incQty(l.variantId, qtyStep(unit), { isBonus: l.isBonus })
                              }
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="p-2 pos-lg:p-3 text-right text-base align-middle">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {l.isBonus ? (
                              <span className="tabular-nums text-emerald-300 font-medium">
                                {formatMoney('0')}
                                <span className="block text-[10px] text-slate-500 line-through font-normal">
                                  {formatMoney(moneyFromLine(l.listPrice, l.qty))}
                                </span>
                              </span>
                            ) : (
                              <span className="tabular-nums">{formatMoney(linePayAmount(l))}</span>
                            )}
                            <button
                              type="button"
                              className="touch-btn min-h-10 min-w-10 shrink-0 inline-flex items-center justify-center rounded-lg bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700"
                              aria-label={t('admin.catalog.salePrice')}
                              title={t('admin.catalog.salePrice')}
                              onClick={(e) => {
                                e.stopPropagation()
                                setPriceEditBaseline(l.listPrice)
                                setNumpadValue(String(parseSom(l.listPrice)))
                                setSelectedLine({
                                  variantId: l.variantId,
                                  name: l.name,
                                  stockQty: Number(l.stockQty || 0),
                                  listPrice: l.listPrice,
                                  isBonus: l.isBonus,
                                })
                              }}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className={l.isBonus ? 'bg-amber-950/20' : ''}>
                        <td colSpan={colSpan} className="px-2 pb-2 pos-lg:px-3 pt-0">
                          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto kiosk-scrollbar pb-0.5">
                            {hasWholesalePrice({ wholesale_price: l.wholesalePrice }) ? (
                              <div className="inline-flex shrink-0 rounded-lg border border-slate-600 overflow-hidden">
                                <button
                                  type="button"
                                  className={`touch-btn min-h-8 px-2 text-[11px] ${
                                    (l.priceTier || 'retail') === 'retail'
                                      ? 'bg-emerald-800 text-emerald-50'
                                      : 'bg-slate-800 text-slate-300'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setLinePriceTier(l.variantId, 'retail', { isBonus: l.isBonus })
                                  }}
                                >
                                  {t('pos.priceRetail', { defaultValue: 'Chakana' })}
                                </button>
                                <button
                                  type="button"
                                  className={`touch-btn min-h-8 px-2 text-[11px] ${
                                    l.priceTier === 'wholesale'
                                      ? 'bg-amber-800 text-amber-50'
                                      : 'bg-slate-800 text-slate-300'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setLinePriceTier(l.variantId, 'wholesale', {
                                      isBonus: l.isBonus,
                                    })
                                  }}
                                >
                                  {t('pos.priceWholesale', { defaultValue: 'Ulgurji' })}
                                </button>
                              </div>
                            ) : null}
                            <button
                              type="button"
                              className={`touch-btn shrink-0 inline-flex items-center gap-1 text-[11px] px-2.5 min-h-8 rounded-lg border ${
                                l.isBonus
                                  ? 'bg-emerald-800/80 border-emerald-500 text-emerald-50'
                                  : 'bg-slate-800 border-slate-600 text-slate-200'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleLineBonus({
                                  variantId: l.variantId,
                                  isBonus: l.isBonus,
                                })
                              }}
                            >
                              {t('pos.bonus', { defaultValue: 'Bonus' })}
                            </button>
                            {l.productId ? (
                              <button
                                type="button"
                                className="touch-btn shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2.5 min-h-8 rounded-lg bg-slate-800 border border-slate-600 text-slate-200"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setStockMatrix({
                                    productId: l.productId,
                                    title: l.name,
                                  })
                                }}
                              >
                                <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                {t('pos.stockMatrix')}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="pos-checkout-panel flex flex-col min-h-0 min-w-0 h-full border-l border-slate-800 pl-2 pos-lg:pl-3 bg-slate-950/40 max-sm:max-h-[min(42dvh,20rem)] max-sm:h-auto max-sm:border-l-0 max-sm:border-t max-sm:pl-0">
          {/* Scroll: faqat to'lov qatorlari va nasiya mijoz */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden kiosk-scrollbar space-y-2 pr-1">
            <div className="rounded-lg pos-lg:rounded-xl border border-slate-800 p-2.5 pos-lg:p-3 bg-slate-900 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
                <div className="kiosk-label pos-lg:text-sm text-slate-400 truncate min-w-0">
                  {t('pay.split')}
                </div>
                <button
                  type="button"
                  className="touch-btn h-12 min-h-12 w-12 min-w-12 pos-lg:w-auto pos-lg:min-w-0 pos-lg:px-3 text-kiosk-sm pos-lg:text-sm rounded-lg bg-slate-800 border border-slate-600 shrink-0 flex items-center justify-center"
                  onClick={addPaymentRow}
                  title={t('pay.addRow')}
                  aria-label={t('pay.addRow')}
                >
                  <span className="pos-lg:hidden text-lg leading-none">+</span>
                  <span className="hidden pos-lg:inline">+ {t('pay.addRow')}</span>
                </button>
              </div>

              <div className="space-y-2 min-w-0">
                {paymentRows.map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-lg border p-2 min-w-0 ${
                      activePayId === r.id ? 'border-emerald-500 bg-slate-950' : 'border-slate-700'
                    }`}
                    onClick={() => setActivePayId(r.id)}
                  >
                    {/* 1024: 2 qator; 1366+: bitta qator */}
                    <div className="flex flex-col gap-2 min-w-0 pos-lg:grid pos-lg:grid-cols-[minmax(5.5rem,8rem)_minmax(0,1fr)_3rem_3rem] pos-lg:gap-2 pos-lg:items-center">
                      <select
                        className="pos-pay-input touch-btn w-full min-w-0 px-2.5 rounded-lg bg-slate-900 border border-slate-600 text-kiosk-sm pos-lg:text-sm"
                        value={r.method}
                        onChange={(e) => {
                          const method = e.target.value as PayMode
                          updatePaymentRow(r.id, {
                            method,
                            ...(method !== 'CARD' ? { cardBank: undefined } : {}),
                          })
                        }}
                      >
                        <option value="CASH">{t('pay.method.cash')}</option>
                        <option value="CARD">{t('pay.method.card')}</option>
                        <option value="DEBT">{t('pay.method.debt')}</option>
                      </select>
                      <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem] gap-2 items-center min-w-0 pos-lg:contents">
                        <input
                          className="pos-pay-input touch-btn w-full min-w-0 px-2.5 rounded-lg bg-slate-900 border border-slate-600 text-kiosk-sm pos-lg:text-sm tabular-nums text-right"
                          value={r.amount}
                          readOnly
                          inputMode="none"
                          onFocus={() => openAmountNumpad({ kind: 'payment', rowId: r.id })}
                        />
                        <button
                          type="button"
                          className="pos-pay-action touch-btn shrink-0 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center"
                          onClick={() => openAmountNumpad({ kind: 'payment', rowId: r.id })}
                          aria-label={t('pos.openNumpad')}
                        >
                          <Calculator className="h-5 w-5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="pos-pay-action touch-btn shrink-0 rounded-lg bg-red-900/70 border border-red-700 text-lg font-bold leading-none flex items-center justify-center disabled:opacity-40"
                          onClick={() => removePaymentRow(r.id)}
                          disabled={paymentRows.length === 1}
                          aria-label={t('pay.removeRow', { defaultValue: 'Remove payment row' })}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {r.method === 'CARD' ? (
                      <div className="mt-2 pt-2 border-t border-slate-800 space-y-1.5">
                        <div className="text-xs font-semibold text-amber-300 flex items-center justify-between">
                          <span>{t('pay.bank.select', { defaultValue: 'Bankni tanlang (majburiy)' })}:</span>
                          {!r.cardBank && (
                            <span className="text-[11px] text-red-400 font-bold animate-pulse">
                              {t('pay.bankRequiredAlert', { defaultValue: 'Tanlanmagan!' })}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {CARD_BANKS.map((b) => {
                            const isSelected = r.cardBank === b.code
                            return (
                              <button
                                key={b.code}
                                type="button"
                                className={`touch-btn min-h-12 px-2.5 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center text-center transition-all ${
                                  isSelected
                                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg ring-2 ring-emerald-400/40'
                                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-500'
                                }`}
                                onClick={() =>
                                  updatePaymentRow(r.id, {
                                    cardBank: b.code as CardBank,
                                  })
                                }
                              >
                                {t(b.labelKey, { defaultValue: b.label })}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    {r.method === 'CASH' && activePayId === r.id ? (
                      <div className="mt-2 pt-2 border-t border-slate-800 space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400/90">
                          {t('pay.tendered', { defaultValue: 'Berilgan (naqd)' })}
                        </div>
                        <div className="flex flex-nowrap gap-1.5 items-center overflow-x-auto kiosk-scrollbar pb-0.5">
                          <button
                            type="button"
                            className="touch-btn shrink-0 min-h-9 px-2.5 rounded-lg bg-emerald-950/60 border border-emerald-600/70 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/80"
                            onClick={() =>
                              updatePaymentRow(r.id, {
                                amount: cashChange.cashOwed.gt(0)
                                  ? cashChange.cashOwed.toString()
                                  : grand,
                              })
                            }
                          >
                            {t('pay.quickCashExact', { defaultValue: 'Aniq' })} (
                            {formatMoney(
                              cashChange.cashOwed.gt(0) ? cashChange.cashOwed.toString() : grand,
                            )}
                            )
                          </button>
                          {[50000, 100000, 200000, 500000, 1000000].map((val) => (
                            <button
                              key={val}
                              type="button"
                              className="touch-btn shrink-0 min-h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                              onClick={() => updatePaymentRow(r.id, { amount: String(val) })}
                            >
                              {formatMoney(String(val))}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {hasDebtMethod && (
              <div
                className="rounded-lg pos-lg:rounded-xl border border-slate-800 p-2.5 pos-lg:p-3 bg-slate-900 space-y-2"
                data-pos-keep-focus="true"
              >
                <div className="kiosk-label pos-lg:text-sm text-slate-400">{t('pay.customer')}</div>
                <input
                  className="touch-btn min-h-kiosk-touch w-full px-3 rounded-lg bg-slate-950 border border-slate-700 text-kiosk-sm pos-lg:text-sm"
                  placeholder={t('pay.customerName')}
                  value={customerName}
                  onChange={(e) => setCustomer(e.target.value, customerPhone)}
                />
                <input
                  className="touch-btn min-h-kiosk-touch w-full px-3 rounded-lg bg-slate-950 border border-slate-700 text-kiosk-sm pos-lg:text-sm"
                  placeholder={t('pay.customerPhone')}
                  value={customerPhone}
                  onChange={(e) => setCustomer(customerName, e.target.value)}
                />
                <input
                  type="date"
                  className="touch-btn min-h-kiosk-touch w-full px-3 rounded-lg bg-slate-950 border border-slate-700 text-kiosk-sm pos-lg:text-sm text-slate-100"
                  value={debtDueDate}
                  onChange={(e) => setDebtDueDate(e.target.value)}
                />
                <label className="block text-xs text-slate-400">
                  {t('pay.installmentMonths', { defaultValue: 'Muddat (oy)' })}
                  <input
                    type="number"
                    min={1}
                    max={36}
                    className="touch-btn mt-1 min-h-kiosk-touch w-full px-3 rounded-lg bg-slate-950 border border-slate-700 text-kiosk-sm pos-lg:text-sm tabular-nums"
                    value={debtInstallmentMonths}
                    onChange={(e) => setDebtInstallmentMonths(e.target.value)}
                  />
                </label>
                {monthlyDebtHint != null ? (
                  <p className="text-xs text-slate-400">
                    {t('pay.monthlyHint', {
                      defaultValue: 'Oyiga taxminan: {{amount}}',
                      amount: formatMoney(monthlyDebtHint),
                    })}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {/* Sticky checkout dock */}
          <div className="shrink-0 border-t border-slate-700 bg-slate-900 p-2.5 pos-lg:p-3 space-y-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="min-w-0">
              <div className="kiosk-label text-slate-500 mb-1">{t('summary.discount')}</div>
              <div className="flex gap-2 items-center min-w-0">
                <input
                  className="pos-pay-input touch-btn flex-1 min-w-0 px-2.5 rounded-lg bg-slate-950 border border-slate-600 text-kiosk-sm tabular-nums"
                  value={orderDiscount}
                  readOnly
                  inputMode="none"
                  onFocus={() => openAmountNumpad({ kind: 'discount' })}
                  placeholder="0"
                />
                <button
                  type="button"
                  className="pos-pay-action touch-btn shrink-0 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center"
                  onClick={() => openAmountNumpad({ kind: 'discount' })}
                  aria-label={t('pos.openNumpad')}
                >
                  <Calculator className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>

            <div className="text-kiosk-sm leading-snug text-slate-500 space-y-1 border-t border-slate-800 pt-2">
              <div className="flex justify-between gap-2">
                <span>{t('summary.subtotal')}</span>
                <span className="tabular-nums shrink-0">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>{t('summary.discount')}</span>
                <span className="tabular-nums shrink-0">{formatMoney(orderDiscount)}</span>
              </div>
              <div className="hidden pos-lg:flex justify-between gap-2">
                <span>{t('pay.total')}</span>
                <span className="tabular-nums shrink-0">
                  {formatMoney(payTotalView)} / {formatMoney(grand)}
                </span>
              </div>
            </div>

            <div className="flex items-baseline justify-between gap-2 border-t border-slate-800 pt-2">
              <span className="kiosk-label pos-lg:text-sm text-slate-400 shrink-0">{t('summary.total')}</span>
              <span className="text-kiosk-lg pos-lg:text-3xl font-bold tabular-nums truncate">{formatMoney(grand)}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['CASH', 'CARD', 'DEBT'] as PayMode[]).map((m) => (
                <button
                  key={`dock-${m}`}
                  type="button"
                  onClick={() => setActiveMethod(m)}
                  className={`touch-btn min-h-kiosk-touch px-1.5 rounded-lg text-kiosk-sm font-medium border ${
                    payMode === m
                      ? m === 'CASH'
                        ? 'bg-emerald-700 border-emerald-500'
                        : m === 'CARD'
                          ? 'bg-sky-700 border-sky-500'
                          : 'bg-amber-700 border-amber-500'
                      : 'bg-slate-800 border-slate-600'
                  }`}
                >
                  {m === 'CASH' && `F1 ${t('pay.mode.cash')}`}
                  {m === 'CARD' && `F2 ${t('pay.mode.card')}`}
                  {m === 'DEBT' && `F3 ${t('pay.mode.debt')}`}
                </button>
              ))}
            </div>

            {showCashTenderPanel && (
              <div className="rounded-xl border border-slate-600 bg-slate-950/90 p-2.5 space-y-2">
                <div className="flex justify-between gap-2 text-xs text-slate-400">
                  <span>{t('pay.tendered', { defaultValue: 'Berilgan' })}</span>
                  <span className="tabular-nums text-slate-100 font-semibold">
                    {formatMoney(cashRowsTotal.toString())}
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-xs text-slate-400">
                  <span>{t('pay.cashOwed', { defaultValue: 'Naqd kerak' })}</span>
                  <span className="tabular-nums text-slate-200">
                    {formatMoney(cashChange.cashOwed.toString())}
                  </span>
                </div>
                {cashChange.shortfall.gt(0) ? (
                  <div className="rounded-lg border border-amber-600/70 bg-amber-950/50 px-2 py-1.5 text-center">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-amber-400">
                      {t('pay.tenderedShortLabel', { defaultValue: 'Yetishmayapti' })}
                    </div>
                    <div className="text-xl font-black text-amber-100 tabular-nums">
                      {formatMoney(cashChange.shortfall.toString())}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`rounded-lg border px-2 py-1.5 text-center ${
                      cashChangeDue.gt(0)
                        ? 'border-emerald-500 bg-emerald-950/80'
                        : 'border-slate-700 bg-slate-900'
                    }`}
                  >
                    <div
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        cashChangeDue.gt(0) ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {t('pay.change', { defaultValue: 'Qaytim' })}
                    </div>
                    <div
                      className={`font-black tabular-nums ${
                        cashChangeDue.gt(0)
                          ? 'text-2xl pos-lg:text-3xl text-emerald-100'
                          : 'text-lg text-slate-400'
                      }`}
                    >
                      {formatMoney(cashChangeDue.toString())}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(salePhase === 'picking' || salePhase === 'ready') && (
              <div
                className={`rounded-lg border px-2.5 py-2 text-xs ${
                  salePhase === 'picking'
                    ? 'border-amber-600/70 bg-amber-950/40 text-amber-100'
                    : 'border-sky-600/70 bg-sky-950/40 text-sky-100'
                }`}
              >
                {salePhase === 'picking'
                  ? t('pos.phasePicking', {
                      defaultValue: 'Yig‘ish: nakladnoy {{no}} — tekshirib «Tekshirildi» bosing',
                      no: nakladnoyNo || '—',
                    })
                  : t('pos.phaseReady', {
                      defaultValue: 'Tayyor: to‘lovni yakunlash mumkin ({{no}})',
                      no: nakladnoyNo || '—',
                    })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {salePhase === 'idle' ? (
                <button
                  type="button"
                  disabled={nakladnoyBusy || cart.length === 0}
                  className="touch-btn min-h-kiosk-touch rounded-xl border border-amber-500/80 bg-amber-900/70 hover:bg-amber-800 disabled:opacity-40 font-semibold text-kiosk-sm px-2"
                  onClick={() => void printNakladnoy()}
                >
                  {nakladnoyBusy
                    ? t('summary.saving')
                    : t('pos.printNakladnoy', { defaultValue: 'Nakladnoy chop' })}
                </button>
              ) : salePhase === 'picking' ? (
                <button
                  type="button"
                  className="touch-btn min-h-kiosk-touch rounded-xl border border-sky-500/80 bg-sky-800 hover:bg-sky-700 font-semibold text-kiosk-sm px-2"
                  onClick={confirmPicked}
                >
                  {t('pos.confirmPicked', { defaultValue: 'Tekshirildi' })}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={nakladnoyBusy || cart.length === 0}
                  className="touch-btn min-h-kiosk-touch rounded-xl border border-slate-500 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 font-semibold text-kiosk-sm px-2"
                  onClick={() => void printNakladnoy()}
                >
                  {t('pos.reprintNakladnoy', { defaultValue: 'Qayta chop' })}
                </button>
              )}
              <button
                type="button"
                disabled={cart.length === 0 && salePhase === 'idle'}
                className="touch-btn min-h-kiosk-touch rounded-xl border border-rose-600/70 bg-rose-950/60 hover:bg-rose-900/80 disabled:opacity-40 font-semibold text-kiosk-sm px-2"
                onClick={() => cancelSaleFlow()}
              >
                {t('pos.cancelSale', { defaultValue: 'Bekor' })}
              </button>
            </div>

            <button
              type="button"
              disabled={completing || cart.length === 0}
              className={`touch-btn w-full min-h-kiosk-touch pos-lg:min-h-14 py-2.5 pos-lg:py-4 rounded-xl disabled:opacity-40 font-semibold text-kiosk pos-lg:text-lg ${
                salePhase === 'picking'
                  ? 'bg-slate-700 hover:bg-slate-600 border border-slate-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
              onClick={() =>
                void doComplete(salePhase === 'picking' ? { asQuick: true } : undefined)
              }
            >
              {completing
                ? t('summary.saving')
                : salePhase === 'picking'
                  ? t('pos.switchToQuickPay', { defaultValue: 'Tezkor to‘lovga (nakladnoysiz)' })
                  : salePhase === 'idle'
                    ? t('pos.quickPay', { defaultValue: 'Tezkor to‘lov' })
                    : t('summary.completeTouch')}
            </button>
          </div>
        </aside>
      </main>
      {numpadCtx && (
        <div className="fixed inset-0 z-50 flex items-end pos-sm:items-center justify-center overflow-y-auto overscroll-contain bg-black/70 p-3 pos-sm:p-4">
          <div className="my-auto w-full max-w-sm max-h-[min(92dvh,92svh)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-3 pos-sm:p-5 shadow-xl kiosk-scrollbar">
            <h3 className="text-lg font-semibold mb-2 pos-sm:mb-3">
              {numpadCtx.kind === 'discount'
                ? t('pos.numpadDiscountTitle')
                : numpadCtx.kind === 'qty'
                  ? t('cart.qty')
                  : t('pos.numpadTitle')}
            </h3>
            <div className="space-y-1.5 mb-3">
              <div className="pos-short:hidden space-y-1">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('common.valueBefore')}</div>
                <div className="w-full min-h-11 px-3 py-2 rounded-xl bg-slate-950 border border-slate-600 text-right text-xl font-bold tabular-nums text-slate-100">
                  {numpadCtx.kind === 'qty' ? amountNumpadBaseline : formatMoney(amountNumpadBaseline)}
                </div>
              </div>
              {numpadCtx.kind === 'qty' &&
                (() => {
                  const line = cart.find(
                    (c) =>
                      c.variantId === numpadCtx.variantId &&
                      Boolean(c.isBonus) === Boolean(numpadCtx.isBonus),
                  )
                  // Optional g↔kg helper only for kg lines (not m/qop/dona).
                  if (normalizeUnit(line?.unit) !== 'kg') return null
                  return (
                    <div className="flex gap-2 mb-1">
                      {(['kg', 'g'] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          className={`touch-btn flex-1 min-h-10 rounded-xl border text-sm font-semibold ${
                            qtyInputUnit === u
                              ? 'border-emerald-500 bg-emerald-950/50 text-emerald-100'
                              : 'border-slate-600 bg-slate-800 text-slate-300'
                          }`}
                          onClick={() => setQtyInputUnit(u)}
                        >
                          {u === 'kg' ? t('unit.kg', { defaultValue: 'kg' }) : t('unit.g', { defaultValue: 'g' })}
                        </button>
                      ))}
                    </div>
                  )
                })()}
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('common.valueEditing')}</div>
              <div className="w-full min-h-11 px-3 py-2 rounded-xl bg-slate-950 border border-emerald-700/50 ring-1 ring-emerald-500/30 text-right text-xl font-bold tabular-nums text-emerald-100">
                {numpadCtx.kind === 'qty' ? numpadBuf : formatMoney(numpadBuf)}
              </div>
            </div>
            <TouchNumpad
              compact
              decimal={numpadCtx.kind === 'qty'}
              value={
                numpadCtx.kind === 'qty'
                  ? numpadBuf || '0'
                  : (numpadBuf || '0').replace(/\D/g, '') || '0'
              }
              onChange={setNumpadBuf}
            />
            <div className="flex gap-3 mt-4 justify-end sticky bottom-0 bg-slate-900/95 pt-1">
              <button
                type="button"
                className="touch-btn min-h-11 px-5 rounded-xl bg-slate-800 border border-slate-600"
                onClick={() => {
                  setNumpadCtx(null)
                  safeRefocus()
                }}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className="touch-btn min-h-11 px-6 rounded-xl bg-emerald-700 border border-emerald-500 font-semibold"
                onClick={() => applyAmountNumpad()}
              >
                {t('pos.numpadApply')}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLine && (
        <div className="fixed inset-0 z-30 flex items-end pos-sm:items-center justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 pos-sm:p-4">
          <div className="my-auto w-full max-w-sm max-h-[min(92dvh,92svh)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-3 pos-sm:p-4 space-y-2.5 kiosk-scrollbar">
            <h3 className="text-lg font-semibold">{selectedLine.name}</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded bg-slate-950 border border-slate-700 p-2">
                <div className="text-slate-400">{t('admin.catalog.stock')}</div>
                <div className="text-xl">{selectedLine.stockQty}</div>
              </div>
              <div className="rounded bg-slate-950 border border-slate-700 p-2">
                <div className="text-slate-400">{t('admin.catalog.salePrice')}</div>
                <div className="text-xl">{formatMoney(selectedLine.listPrice)}</div>
              </div>
            </div>
            <div className="rounded-xl bg-slate-950 border border-slate-700 p-3 space-y-2">
              <div className="text-sm text-slate-400">{t('admin.catalog.salePrice')}</div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('common.valueBefore')}</div>
              <div className="w-full min-h-12 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-600 text-right text-xl font-semibold tabular-nums">
                {formatMoney(priceEditBaseline)}
              </div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('common.valueEditing')}</div>
              <div className="w-full min-h-12 px-3 py-2.5 rounded-xl bg-slate-900 border border-emerald-700/50 ring-1 ring-emerald-500/25 text-right text-xl font-semibold tabular-nums text-emerald-100">
                {formatMoney(numpadValue)}
              </div>
              <TouchNumpad
                className="mt-2"
                value={(numpadValue || '0').replace(/\D/g, '') || '0'}
                onChange={(v) => setNumpadValue(v)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-600"
                onClick={() => {
                  setSelectedLine(null)
                  safeRefocus()
                }}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                disabled={priceBusy}
                className="touch-btn min-h-12 px-5 rounded-xl bg-emerald-700 border border-emerald-500 disabled:opacity-50"
                onClick={async () => {
                  setPriceBusy(true)
                  try {
                    const nextPrice = String(parseSom(numpadValue))
                    updateLinePrice(selectedLine.variantId, nextPrice, {
                      isBonus: selectedLine.isBonus,
                    })
                    showToast('ok', t('admin.settings.actionCompleted', { label: t('admin.catalog.salePrice') }))
                    setSelectedLine(null)
                    setNumpadValue('0')
                  } catch (e: unknown) {
                    const code = (e as Error & { code?: string }).code
                    showToast('err', t(`err.${code || 'POS_PRICE_UPDATE_FAILED'}`))
                  } finally {
                    setPriceBusy(false)
                  }
                }}
              >
                {priceBusy ? t('admin.common.saving') : t('admin.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
      {promptPriceVariant && (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/60 p-4">
          <div className="my-auto w-full max-w-md max-h-[min(90dvh,90svh)] overflow-y-auto rounded border border-slate-700 bg-slate-900 p-4 space-y-3 kiosk-scrollbar">
            <h3 className="text-lg font-semibold">{pickProductName(promptPriceVariant, i18n.language)}</h3>
            <div className="text-sm text-slate-400">{t('pos.enterSalePrice')}</div>
            <div className="rounded-xl bg-slate-950 border border-slate-700 p-3 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('common.valueEditing')}</div>
              <div className="w-full min-h-12 px-3 py-2.5 rounded-xl bg-slate-900 border border-emerald-700/50 ring-1 ring-emerald-500/25 text-right text-xl font-semibold tabular-nums text-emerald-100">
                {formatMoney(promptPriceBuf)}
              </div>
              <TouchNumpad value={(promptPriceBuf || '0').replace(/\D/g, '') || '0'} onChange={setPromptPriceBuf} />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-600" onClick={() => { setPromptPriceVariant(null); setPromptPriceBuf('0'); safeRefocus(); }}>
                {t('admin.common.cancel')}
              </button>
              <button type="button" className="touch-btn min-h-12 px-5 rounded-xl bg-emerald-700 border border-emerald-500" onClick={() => {
                try {
                  const price = String(parseSom(promptPriceBuf))
                  const v = promptPriceVariant
                  setPromptPriceVariant(null)
                  setPromptPriceBuf('0')
                  commitVariantToCart(v, { unitPrice: price })
                } catch {
                  // ignore
                }
              }}>
                {t('admin.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
      {stockMatrix && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/60 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="stock-matrix-title"
        >
          <div className="my-auto flex min-h-0 w-full max-w-lg max-h-[min(90dvh,90svh)] flex-col rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
            <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
              <div>
                <h2 id="stock-matrix-title" className="text-lg font-semibold text-slate-100">
                  {t('pos.stockMatrixTitle')}
                </h2>
                <p className="text-sm text-slate-400 mt-1">{stockMatrix.title}</p>
              </div>
              <button
                type="button"
                className="touch-btn px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-sm"
                onClick={() => {
                  setStockMatrix(null)
                  safeRefocus()
                }}
              >
                {t('pos.matrixClose')}
              </button>
            </div>
            {matrixBusy ? (
              <p className="shrink-0 py-6 text-sm text-slate-400">{t('admin.common.loading')}</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-800 kiosk-scrollbar">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950 text-slate-400 sticky top-0">
                    <tr>
                      <th className="text-left p-3">{t('pos.matrixSize')}</th>
                      <th className="text-right p-3">{t('pos.matrixStock')}</th>
                      {showSellInCatalog && (
                        <th className="text-right p-3">{t('cart.sum')}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixRows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-800">
                        <td className="p-3">
                          <div className="font-medium">
                            {pickProductName(r, i18n.language)}
                          </div>
                          {r.barcode ? <div className="text-xs text-slate-500 font-mono">{r.barcode}</div> : null}
                        </td>
                        <td className="p-3 text-right tabular-nums">{r.stock_qty}</td>
                        {showSellInCatalog && (
                          <td className="p-3 text-right tabular-nums">
                            {!r.hide_selling_price && r.list_price != null
                              ? formatMoney(String(r.list_price))
                              : ''}
                          </td>
                        )}
                      </tr>
                    ))}
                    {matrixRows.length === 0 && (
                      <tr>
                        <td colSpan={showSellInCatalog ? 3 : 2} className="p-6 text-center text-slate-500">
                          {t('pos.searchEmpty')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {footerLangStrip && (
        <footer className="border-t border-slate-800 bg-slate-900 px-4 py-2 flex flex-wrap items-center gap-2 justify-center shrink-0">
          <span className="text-xs text-slate-500 uppercase tracking-wide">{t('admin.sidebar.language')}</span>
          <button
            type="button"
            className={`touch-btn text-sm px-4 py-2 rounded-xl border ${
              i18n.language === 'uz'
                ? 'bg-emerald-700 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-200'
            }`}
            onClick={() => void loadLocale('uz')}
          >
            {t('lang.uz')}
          </button>
          <button
            type="button"
            className={`touch-btn text-sm px-4 py-2 rounded-xl border ${
              i18n.language === 'uz-cyrl'
                ? 'bg-emerald-700 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-200'
            }`}
            onClick={() => void loadLocale('uz-cyrl')}
          >
            {t('lang.uz-cyrl')}
          </button>
          <button
            type="button"
            className={`touch-btn text-sm px-4 py-2 rounded-xl border ${
              i18n.language.startsWith('ru')
                ? 'bg-emerald-700 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-200'
            }`}
            onClick={() => void loadLocale('ru')}
          >
            {t('lang.ru')}
          </button>
        </footer>
      )}
      {locked && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/90 p-4">
          <div className="my-auto w-full max-w-sm max-h-[min(90dvh,90svh)] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-5 space-y-4 shadow-2xl kiosk-scrollbar">
            <div className="flex flex-col items-center text-center gap-2">
              <img src="/resized-logo.png" alt="logo" className="h-16 w-16 rounded-xl object-contain" />
              <h3 className="text-xl font-semibold">{t('header.lock', { defaultValue: 'Locked' })}</h3>
              <p className="text-slate-300 text-sm capitalize">{lockDateLabel}</p>
              <p className="text-2xl pos-lg:text-3xl font-bold text-emerald-300 tracking-wide">{lockTimeLabel}</p>
            </div>
            <PinNumpadPanel
              pin={unlockPin}
              setPin={setUnlockPin}
              label={t('auth.pin', { defaultValue: 'PIN' })}
            />
            {unlockErr && <p className="text-sm text-red-400">{unlockErr}</p>}
            <button
              type="button"
              className="touch-btn w-full px-3 py-2 rounded-xl bg-emerald-700 border border-emerald-500 font-medium"
              disabled={unlockBusy}
              onClick={async () => {
                if (unlockBusy) return
                setUnlockBusy(true)
                try {
                  if (!meUser) throw new Error('INVALID_PIN')
                  await loginWithPin(meUser, unlockPin)
                  setLocked(false)
                } catch {
                  setUnlockErr(t('err.INVALID_PIN'))
                } finally {
                  setUnlockBusy(false)
                }
              }}
            >
              {t('admin.common.unlock', { defaultValue: 'Unlock' })}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
