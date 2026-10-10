import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tags } from 'lucide-react'
import {
  fetchCashierStockVariants,
  fetchLabelEscpos,
  fetchVariants,
  type CashierStockVariant,
  type LabelStickerSize,
  type Paginated,
  type StoreSettings,
  type UserRole,
  type Variant,
} from '../api'
import { formatMoney } from '../utils/money'
import { ActionToast } from '../components/ActionToast'
import { dateLocale as resolveDateLocale } from '../utils/localizedName'
import { formatQty, normalizeUnit } from '../utils/qty'
import { dispatchLabel } from '../utils/printingHub'
import { isPrinterError, translatePrinterError } from '../utils/printerErrors'

const LABEL_SIZE_OPTIONS: LabelStickerSize[] = ['30x20', '40x30', '40x50', '50x40', '58mm']

export function CashStockPage({
  role,
  embedded = false,
  settings = null,
}: {
  role: UserRole | null
  /** Hide page title when shown inside Warehouse hub */
  embedded?: boolean
  settings?: StoreSettings | null
}) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Paginated<CashierStockVariant | Variant> | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
  const showPurchase = role === 'OWNER' || role === 'ADMIN'
  const labelPrintingEnabled = settings?.label_printing_enabled !== false

  const [labelPrint, setLabelPrint] = useState<CashierStockVariant | Variant | null>(null)
  const [labelSize, setLabelSize] = useState<LabelStickerSize>('40x30')
  const [labelCopies, setLabelCopies] = useState('1')
  const [labelBusy, setLabelBusy] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 300)
    return () => window.clearTimeout(id)
  }, [query])

  useEffect(() => {
    setPage(1)
  }, [debounced])

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    const load = showPurchase
      ? fetchVariants({ q: debounced || undefined, page, pageSize: 20, ordering: 'name' })
      : fetchCashierStockVariants({ q: debounced || undefined, page, pageSize: 20 })
    void load
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setToast({ kind: 'err', message: t('err.API_ERROR') })
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, page, showPurchase, t])

  const maxPage = data ? Math.max(1, Math.ceil(data.count / 20)) : 1
  const rows = data?.results ?? []
  const colSpan = showPurchase ? (labelPrintingEnabled ? 8 : 7) : labelPrintingEnabled ? 7 : 6
  const langRu = i18n.language.startsWith('ru')
  const dateLocaleStr = resolveDateLocale(i18n.language)

  function rowCategory(v: CashierStockVariant | Variant): string {
    const uz = v.product_category_name_uz
    if (!uz) return '—'
    return langRu ? v.product_category_name_ru || uz : uz
  }

  function stockRowClass(v: CashierStockVariant | Variant) {
    if (!v.is_active) {
      return 'bg-violet-950/30 border-l-[3px] border-violet-500/55 text-slate-400'
    }
    if (Number(v.stock_qty ?? 0) <= 0) {
      return 'bg-amber-950/40 border-l-[3px] border-amber-600/90 text-slate-100'
    }
    return ''
  }

  function openLabelPrint(v: CashierStockVariant | Variant) {
    const raw = settings?.default_label_size
    const size = LABEL_SIZE_OPTIONS.includes(raw as LabelStickerSize)
      ? (raw as LabelStickerSize)
      : '40x30'
    setLabelPrint(v)
    setLabelSize(size)
    setLabelCopies('1')
  }

  async function submitLabelPrint() {
    if (!labelPrint) return
    const barcode = (labelPrint.barcode || '').trim()
    if (!barcode) {
      setToast({ kind: 'err', message: t('admin.catalog.noBarcode') })
      return
    }
    const copies = Math.max(1, Math.min(200, Math.floor(Number(labelCopies) || 0)))
    if (!Number.isFinite(copies) || copies < 1) {
      setToast({ kind: 'err', message: t('admin.catalog.copiesInvalid') })
      return
    }
    setLabelBusy(true)
    try {
      const out = await fetchLabelEscpos(labelPrint.id, labelSize, copies, true)
      const b64 = (out.raw_base64 || out.escpos_base64 || '').trim()
      if (!b64) throw new Error(t('err.LABEL_PRINT_FAILED'))
      await dispatchLabel(b64, settings)
      setToast({ kind: 'ok', message: t('admin.catalog.printLabelOk', { count: copies }) })
      setLabelPrint(null)
    } catch (e: unknown) {
      const rawMessage = e instanceof Error ? e.message : String(e || '')
      if (isPrinterError(rawMessage)) {
        setToast({ kind: 'err', message: translatePrinterError(rawMessage) })
      } else {
        const code = (e as Error & { code?: string }).code
        setToast({
          kind: 'err',
          message: code ? t(`err.${code}`, { defaultValue: rawMessage }) : rawMessage || t('err.LABEL_PRINT_FAILED'),
        })
      }
    } finally {
      setLabelBusy(false)
    }
  }

  return (
    <div className={`p-4 space-y-4 ${embedded ? 'pt-0' : ''}`}>
      {!embedded && (
        <>
          <h2 className="text-xl font-semibold">{t('admin.cashier.stockTitle')}</h2>
          <p className="text-sm text-slate-400">
            {showPurchase ? t('admin.cashier.stockHintAdmin') : t('admin.cashier.stockHint')}
          </p>
        </>
      )}
      {embedded && (
        <p className="text-sm text-slate-400">
          {showPurchase ? t('admin.cashier.stockHintAdmin') : t('admin.cashier.stockHint')}
        </p>
      )}
      {toast && (
        <ActionToast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />
      )}
      <input
        className="touch-btn w-full max-w-xl min-h-12 px-3 rounded-xl bg-slate-900 border border-slate-700"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('admin.catalog.searchPlaceholder')}
      />
      <div className="rounded border border-slate-700 overflow-x-auto kiosk-scrollbar">
        <table className="w-full text-sm min-w-[44rem]">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="text-left p-2">{t('admin.catalog.product')}</th>
              <th className="text-left p-2">{t('admin.catalog.productCategory')}</th>
              <th className="text-right p-2">{t('admin.catalog.stock')}</th>
              <th className="text-left p-2">{t('admin.cashier.lastReceived')}</th>
              {showPurchase && (
                <th className="text-right p-2">{t('admin.catalog.purchasePrice')}</th>
              )}
              <th className="text-right p-2">{t('admin.catalog.price')}</th>
              {labelPrintingEnabled && (
                <th className="text-center p-2">{t('admin.catalog.action')}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {busy && rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="p-4 text-slate-500">
                  {t('admin.common.loading')}
                </td>
              </tr>
            ) : (
              rows.map((v) => (
                <tr key={v.id} className={`border-t border-slate-800 ${stockRowClass(v)}`}>
                  <td className="p-2">
                    {langRu ? v.product_name_ru || v.product_name_uz : v.product_name_uz}
                  </td>
                  <td className="p-2 text-slate-300">{rowCategory(v)}</td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQty(Number(v.stock_qty ?? 0), normalizeUnit(v.unit))}{' '}
                    {t(`unit.${normalizeUnit(v.unit)}`)}
                  </td>
                  <td className="p-2 text-xs text-slate-400 whitespace-nowrap">
                    {v.last_received_at ? new Date(v.last_received_at).toLocaleString(dateLocaleStr) : '—'}
                  </td>
                  {showPurchase && (
                    <td className="p-2 text-right tabular-nums">{formatMoney(v.purchase_price)}</td>
                  )}
                  <td className="p-2 text-right tabular-nums">{formatMoney(v.list_price)}</td>
                  {labelPrintingEnabled && (
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        className="touch-btn min-h-11 min-w-11 px-2 rounded-xl bg-slate-800 border border-slate-600 inline-flex items-center justify-center disabled:opacity-40"
                        disabled={!(v.barcode || '').trim()}
                        title={t('admin.catalog.printLabel')}
                        onClick={() => openLabelPrint(v)}
                      >
                        <Tags className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          disabled={page <= 1 || busy}
          className="touch-btn min-h-11 px-3 rounded-xl bg-slate-800 border border-slate-600 disabled:opacity-40"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          {t('admin.common.prev')}
        </button>
        <span className="text-slate-400">
          {t('admin.common.pageOf', { page, maxPage })}
        </span>
        <button
          type="button"
          disabled={page >= maxPage || busy}
          className="touch-btn min-h-11 px-3 rounded-xl bg-slate-800 border border-slate-600 disabled:opacity-40"
          onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
        >
          {t('admin.common.next')}
        </button>
      </div>

      {labelPrint && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">{t('admin.catalog.printLabelTitle')}</h3>
            <p className="text-sm text-slate-300">
              {langRu
                ? labelPrint.product_name_ru || labelPrint.product_name_uz
                : labelPrint.product_name_uz}
            </p>
            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">{t('admin.catalog.labelSize')}</span>
              <select
                className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
                value={labelSize}
                onChange={(e) => setLabelSize(e.target.value as LabelStickerSize)}
              >
                {LABEL_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {t(`admin.settings.labelSize.${size}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">{t('admin.catalog.copies')}</span>
              <input
                className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
                type="number"
                min={1}
                max={200}
                value={labelCopies}
                onChange={(e) => setLabelCopies(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-600"
                disabled={labelBusy}
                onClick={() => setLabelPrint(null)}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className="touch-btn min-h-12 px-4 rounded-xl bg-emerald-700 border border-emerald-500 font-semibold disabled:opacity-50"
                disabled={labelBusy || !(labelPrint.barcode || '').trim()}
                onClick={() => void submitLabelPrint()}
              >
                {labelBusy ? t('admin.common.loading') : t('admin.catalog.printLabel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
