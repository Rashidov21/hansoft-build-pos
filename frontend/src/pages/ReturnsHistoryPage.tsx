import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  exportReturnsHistoryXlsx,
  fetchReturnsHistory,
  reverseReturn,
  type ReturnsHistoryRow,
  type ReturnsHistorySummary,
} from '../api'
import { ActionToast } from '../components/ActionToast'
import { DashboardPeriodFilter } from '../components/DashboardPeriodFilter'
import { SaleDetailModal } from '../components/SaleDetailModal'
import { formatMoney } from '../utils/money'
import {
  saleHistoryLineBrand,
  saleHistoryLineModel,
  saleHistoryLineProductTitle,
} from '../utils/saleHistoryLines'
import { dateLocale as resolveDateLocale } from '../utils/localizedName'

function localMonthRange() {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` }
}

export function ReturnsHistoryPage() {
  const { t, i18n } = useTranslation()
  const dateLocaleStr = resolveDateLocale(i18n.language)
  const defaultRange = useMemo(() => localMonthRange(), [])
  const [filter, setFilter] = useState<{ from?: string; to?: string; year?: string }>(defaultRange)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<ReturnsHistoryRow[]>([])
  const [summary, setSummary] = useState<ReturnsHistorySummary | null>(null)
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
  const [reversingId, setReversingId] = useState<string | null>(null)
  const [reverseBusy, setReverseBusy] = useState(false)

  const maxPage = Math.max(1, Math.ceil(count / 20))
  const periodLabel = useMemo(() => {
    if (filter.year) return t('admin.dashboard.periodRangeYear', { year: filter.year })
    if (filter.from && filter.to) return t('admin.dashboard.periodRange', { from: filter.from, to: filter.to })
    return t('admin.dashboard.periodMonth')
  }, [filter.from, filter.to, filter.year, t])

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetchReturnsHistory({
        from: filter.from,
        to: filter.to,
        q: q.trim() || undefined,
        page,
      })
      setRows(res.results)
      setSummary(res.summary)
      setCount(res.count)
    } catch (e: unknown) {
      const code = (e as Error & { code?: string }).code
      setToast({ kind: 'err', message: t(`err.${code || 'API_ERROR'}`) })
    } finally {
      setBusy(false)
    }
  }, [filter.from, filter.to, page, q, t])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 280)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [filter.from, filter.to, filter.year, q])

  function lineTitle(row: ReturnsHistoryRow) {
    return saleHistoryLineProductTitle(row, i18n.language) || saleHistoryLineModel(row, i18n.language)
  }

  return (
    <div className="p-4 space-y-4">
      {toast && <ActionToast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('admin.return.historyTitle')}</h2>
          <p className="text-sm text-slate-400 mt-1">{t('admin.return.historyHint')}</p>
        </div>
        <DashboardPeriodFilter
          filter={filter}
          onFilter={(from, to, year) => setFilter({ from, to, year })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.return.historyMoveCount')}</div>
          <div className="text-2xl mt-1 tabular-nums">{summary?.return_move_count ?? 0}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.return.historyQty')}</div>
          <div className="text-2xl mt-1 tabular-nums">{summary?.return_qty ?? 0}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.return.historyAmount')}</div>
          <div className="text-2xl mt-1 tabular-nums">{formatMoney(summary?.return_amount_total)}</div>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4">
          <div className="text-sm text-slate-400">{t('admin.return.historySales')}</div>
          <div className="text-2xl mt-1 tabular-nums">{summary?.distinct_sales ?? 0}</div>
        </div>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap gap-2 items-center rounded-xl border border-slate-800 bg-slate-950/95 p-2 backdrop-blur">
        <input
          className="touch-btn min-h-12 flex-1 min-w-[12rem] px-3 rounded-xl bg-slate-900 border border-slate-700"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.return.searchPh')}
        />
        <button
          type="button"
          disabled={exportBusy}
          className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-700 font-medium disabled:opacity-50"
          onClick={async () => {
            setExportBusy(true)
            try {
              await exportReturnsHistoryXlsx({ from: filter.from, to: filter.to, q: q.trim() || undefined })
              setToast({ kind: 'ok', message: t('admin.return.exportSuccess') })
            } catch (e: unknown) {
              const code = (e as Error & { code?: string }).code
              setToast({ kind: 'err', message: t(`err.${code || 'EXPORT_RETURNS_FAILED'}`) })
            } finally {
              setExportBusy(false)
            }
          }}
        >
          {exportBusy ? t('admin.common.loading') : t('admin.sales.exportExcel')}
        </button>
      </div>

      <p className="text-xs text-slate-500">{periodLabel}</p>

      <div className="rounded border border-slate-700 overflow-x-auto">
        <table className="w-full text-sm min-w-[56rem]">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="text-left p-2">{t('admin.return.historyReturnedAt')}</th>
              <th className="text-left p-2">{t('admin.sales.saleId')}</th>
              <th className="text-left p-2">{t('admin.catalog.brand')}</th>
              <th className="text-left p-2">{t('admin.catalog.product')}</th>
              <th className="text-left p-2">{t('admin.catalog.model')}</th>
              <th className="text-left p-2">{t('admin.sales.colCode')}</th>
              <th className="text-right p-2">{t('cart.qty')}</th>
              <th className="text-right p-2">{t('admin.return.historyAmount')}</th>
              <th className="text-left p-2">{t('admin.sales.cashier')}</th>
              <th className="text-right p-2">{t('admin.common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-800">
                <td className="p-2 whitespace-nowrap">
                  {new Date(row.returned_at).toLocaleString(dateLocaleStr)}
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    className="text-sky-400 hover:underline"
                    onClick={() => setSelectedSaleId(row.sale_id)}
                  >
                    {row.public_sale_no || row.sale_id.slice(0, 8)}
                  </button>
                </td>
                <td className="p-2">{saleHistoryLineBrand(row, i18n.language) || '—'}</td>
                <td className="p-2">{lineTitle(row) || '—'}</td>
                <td className="p-2">{saleHistoryLineModel(row, i18n.language) || '—'}</td>
                <td className="p-2 font-mono text-xs">{row.barcode || '—'}</td>
                <td className="p-2 text-right tabular-nums">{row.qty}</td>
                <td className="p-2 text-right tabular-nums font-medium">{formatMoney(row.return_amount)}</td>
                <td className="p-2">{row.cashier_username || '—'}</td>
                <td className="p-2 text-right">
                  {row.can_reverse !== false && (
                    <button
                      type="button"
                      className="touch-btn min-h-kiosk-touch px-3 rounded-lg bg-red-900/50 border border-red-700 text-xs text-red-200"
                      onClick={() => setReversingId(row.movement_id || row.id)}
                    >
                      {t('admin.return.reverse')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!busy && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-500">
                  {t('admin.return.historyEmpty')}
                </td>
              </tr>
            )}
            {busy && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-400">
                  {t('admin.common.loading')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-700 font-medium"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          {t('admin.common.prev')}
        </button>
        <div className="px-3 py-2 text-sm text-slate-400">
          {t('admin.common.pageOf', { page, maxPage })}
        </div>
        <button
          type="button"
          className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-700 font-medium"
          disabled={page >= maxPage}
          onClick={() => setPage((p) => p + 1)}
        >
          {t('admin.common.next')}
        </button>
      </div>

      {selectedSaleId && (
        <SaleDetailModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
      )}

      {reversingId && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">{t('admin.return.reverseTitle')}</h3>
            <p className="text-sm text-slate-400">{t('admin.return.reverseHint')}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-600" onClick={() => setReversingId(null)}>
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                disabled={reverseBusy}
                className="touch-btn min-h-12 px-4 rounded-xl bg-red-700 border border-red-500 disabled:opacity-40"
                onClick={async () => {
                  setReverseBusy(true)
                  try {
                    await reverseReturn(reversingId)
                    setReversingId(null)
                    setToast({ kind: 'ok', message: t('admin.return.reverseSuccess') })
                    await load()
                  } catch (e: unknown) {
                    const code = (e as Error & { code?: string }).code
                    setToast({ kind: 'err', message: t(`err.${code || 'REVERSE_RETURN_FAILED'}`) })
                  } finally {
                    setReverseBusy(false)
                  }
                }}
              >
                {t('admin.return.reverse')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
