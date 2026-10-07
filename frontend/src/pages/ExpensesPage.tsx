import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, FileSpreadsheet, FileText, Plus, ReceiptText, RefreshCw, Trash2, X } from 'lucide-react'
import type { ExpenseCategory, ShopExpenseRow } from '../api'
import {
  createShopExpense,
  deleteShopExpense,
  exportShopExpensesPdf,
  exportShopExpensesXlsx,
  fetchShopExpenses,
  updateShopExpense,
} from '../api'
import { formatMoney } from '../utils/money'
import { ActionToast } from '../components/ActionToast'
import { NumericNumpadField } from '../components/NumericNumpadField'
import { requestAdminDataRefresh } from '../utils/adminDataRefresh'

const CATEGORY_OPTIONS: ExpenseCategory[] = ['RENT', 'UTILITIES', 'SUPPLIES', 'SALARY', 'OTHER']

export function ExpensesPage() {
  const { t, i18n } = useTranslation()
  const [rows, setRows] = useState<ShopExpenseRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [exportingXlsx, setExportingXlsx] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('OTHER')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<ShopExpenseRow | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('OTHER')
  const [editNote, setEditNote] = useState('')
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [deleting, setDeleting] = useState<ShopExpenseRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)

  const maxPage = Math.max(1, Math.ceil(count / 25))

  const totalPageAmount = useMemo(() => {
    return rows.reduce((acc, r) => acc + Number(r.amount || 0), 0)
  }, [rows])

  async function load() {
    setLoading(true)
    try {
      const data = await fetchShopExpenses({
        from: from || undefined,
        to: to || undefined,
        category: filterCategory || undefined,
        page,
        page_size: 25,
      })
      setRows(data.results)
      setCount(data.count)
    } catch {
      setToast({ kind: 'err', msg: t('admin.expenses.loadFail') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [from, to, filterCategory, page])

  function setDatePreset(preset: 'today' | 'yesterday' | 'month' | 'all') {
    const today = new Date().toISOString().slice(0, 10)
    if (preset === 'today') {
      setFrom(today)
      setTo(today)
    } else if (preset === 'yesterday') {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      const y = d.toISOString().slice(0, 10)
      setFrom(y)
      setTo(y)
    } else if (preset === 'month') {
      const d = new Date()
      const first = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      setFrom(first)
      setTo(today)
    } else if (preset === 'all') {
      setFrom('')
      setTo('')
    }
    setPage(1)
  }

  async function handleExportXlsx() {
    setExportingXlsx(true)
    try {
      await exportShopExpensesXlsx({
        from: from || undefined,
        to: to || undefined,
        category: filterCategory || undefined,
        lang: i18n.language,
      })
    } catch {
      setToast({ kind: 'err', msg: t('admin.common.error') })
    } finally {
      setExportingXlsx(false)
    }
  }

  async function handleExportPdf() {
    setExportingPdf(true)
    try {
      await exportShopExpensesPdf({
        from: from || undefined,
        to: to || undefined,
        category: filterCategory || undefined,
        lang: i18n.language,
      })
    } catch {
      setToast({ kind: 'err', msg: t('admin.common.error') })
    } finally {
      setExportingPdf(false)
    }
  }

  function openEdit(row: ShopExpenseRow) {
    setEditing(row)
    setEditAmount(String(row.amount).replace(/\.00$/, ''))
    setEditCategory(row.category)
    setEditNote(row.note || '')
  }

  return (
    <div className="p-4 space-y-5 max-w-5xl mx-auto">
      {toast && <ActionToast kind={toast.kind === 'ok' ? 'ok' : 'err'} message={toast.msg} onClose={() => setToast(null)} />}

      {/* Header & Total KPI */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ReceiptText className="h-6 w-6 text-red-400" />
            {t('admin.expenses.title')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('admin.expenses.hint', { defaultValue: "Do'kon xarajatlarini ro'yxatga olish" })}</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5">
          <div>
            <div className="text-xs text-slate-400">{t('admin.sales.grossTotal')}:</div>
            <div className="text-lg font-black text-amber-300 tabular-nums">{formatMoney(String(totalPageAmount))}</div>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div>
            <div className="text-xs text-slate-400">{t('admin.common.count', { defaultValue: 'Soni' })}:</div>
            <div className="text-lg font-bold text-slate-200 tabular-nums">{count} ta</div>
          </div>
        </div>
      </div>

      {/* Add Expense Box with Large Chips */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3.5 shadow-xl">
        <div className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Plus className="h-4 w-4 text-emerald-400" />
          {t('admin.expenses.add')}
        </div>

        {/* Category Selection Chips */}
        <div className="space-y-1.5">
          <div className="text-xs text-slate-400 font-semibold">{t('admin.expenses.category')}:</div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.map((c) => {
              const isSelected = category === c
              return (
                <button
                  key={c}
                  type="button"
                  className={`touch-btn min-h-10 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    isSelected
                      ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-950/50 ring-2 ring-emerald-400/30'
                      : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                  onClick={() => setCategory(c)}
                >
                  {t(`admin.expenses.cat.${c}`)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Amount, Note & Submit */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_minmax(7rem,auto)] gap-2.5 items-end">
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            <span className="font-semibold">{t('admin.expenses.amount')} (so'm):</span>
            <NumericNumpadField
              value={amount || '0'}
              onChange={setAmount}
              min={0}
              formatDisplay={(d) => (d === '0' ? '' : formatMoney(d))}
              className="bg-slate-950 border-slate-700 font-bold text-emerald-300"
            />
          </label>
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            <span className="font-semibold">{t('admin.expenses.note')}:</span>
            <input
              className="touch-btn min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 w-full text-sm placeholder:text-slate-600 focus:border-emerald-500 outline-none"
              placeholder={t('admin.expenses.notePlaceholder', { defaultValue: 'Izoh (ixtiyoriy)...' })}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={saveBusy || !amount.trim() || Number(amount) <= 0}
            className="touch-btn min-h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white font-bold text-sm shadow-lg shadow-emerald-950/60 disabled:opacity-40"
            onClick={async () => {
              setSaveBusy(true)
              try {
                await createShopExpense({
                  amount: Number(amount).toFixed(0),
                  category,
                  note: note.trim(),
                })
                setAmount('')
                setNote('')
                setToast({ kind: 'ok', msg: t('admin.expenses.saved') })
                setPage(1)
                void load()
                requestAdminDataRefresh('shop-expense')
              } catch {
                setToast({ kind: 'err', msg: t('admin.expenses.saveFail') })
              } finally {
                setSaveBusy(false)
              }
            }}
          >
            {saveBusy ? t('admin.common.loading') : t('admin.expenses.save')}
          </button>
        </div>
      </div>

      {/* Filter and Date Controls */}
      <div className="space-y-3">
        {/* Category Filter Chips */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-slate-400 font-semibold mr-1">{t('admin.sales.filterCategory', { defaultValue: 'Toifa' })}:</span>
          <button
            type="button"
            className={`touch-btn min-h-9 px-3 rounded-xl text-xs font-medium border transition-all ${
              !filterCategory
                ? 'bg-indigo-600 border-indigo-400 text-white font-bold shadow'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
            }`}
            onClick={() => {
              setFilterCategory('')
              setPage(1)
            }}
          >
            {t('admin.expenses.allCategories', { defaultValue: 'Barchasi' })}
          </button>
          {CATEGORY_OPTIONS.map((c) => {
            const isSelected = filterCategory === c
            return (
              <button
                key={c}
                type="button"
                className={`touch-btn min-h-9 px-3 rounded-xl text-xs font-medium border transition-all ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-400 text-white font-bold shadow'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
                onClick={() => {
                  setFilterCategory(c)
                  setPage(1)
                }}
              >
                {t(`admin.expenses.cat.${c}`)}
              </button>
            )
          })}
        </div>

        {/* Date presets & Action bar */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-slate-400 font-semibold mr-1 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {t('admin.sales.period', { defaultValue: 'Sana' })}:
            </span>
            <button
              type="button"
              className="touch-btn min-h-9 px-2.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700"
              onClick={() => setDatePreset('today')}
            >
              {t('admin.common.today', { defaultValue: 'Bugun' })}
            </button>
            <button
              type="button"
              className="touch-btn min-h-9 px-2.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700"
              onClick={() => setDatePreset('yesterday')}
            >
              {t('admin.common.yesterday', { defaultValue: 'Kecha' })}
            </button>
            <button
              type="button"
              className="touch-btn min-h-9 px-2.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700"
              onClick={() => setDatePreset('month')}
            >
              {t('admin.common.thisMonth', { defaultValue: 'Shu oy' })}
            </button>
            <button
              type="button"
              className="touch-btn min-h-9 px-2.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700"
              onClick={() => setDatePreset('all')}
            >
              {t('admin.common.allTime', { defaultValue: 'Barchasi' })}
            </button>

            <div className="flex items-center gap-1 ml-2">
              <input
                type="date"
                className="touch-btn min-h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setPage(1)
                }}
              />
              <span className="text-slate-500 text-xs">—</span>
              <input
                type="date"
                className="touch-btn min-h-9 px-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  setPage(1)
                }}
              />
            </div>

            <button
              type="button"
              className="touch-btn min-h-9 px-3 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700 inline-flex items-center gap-1"
              onClick={() => void load()}
              title={t('admin.expenses.reload')}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              disabled={exportingXlsx}
              className="touch-btn min-h-10 px-3.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600 text-emerald-200 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              onClick={handleExportXlsx}
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              {exportingXlsx ? t('admin.common.loading') : 'Excel'}
            </button>
            <button
              type="button"
              disabled={exportingPdf}
              className="touch-btn min-h-10 px-3.5 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-600 text-red-200 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              onClick={handleExportPdf}
            >
              <FileText className="h-4 w-4 text-red-400" />
              {exportingPdf ? t('admin.common.loading') : 'PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-medium">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-slate-600 mb-2" />
          {t('admin.common.loading')}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-12 text-center text-slate-500 rounded-2xl border border-slate-800 bg-slate-900/40">
          <ReceiptText className="mx-auto h-12 w-12 text-slate-600 mb-2" />
          <p className="text-base font-medium">{t('admin.expenses.empty')}</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
            <div className="overflow-x-auto kiosk-scrollbar">
              <table className="w-full text-sm min-w-[48rem]">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-xs font-semibold uppercase">
                  <tr>
                    <th className="text-left p-3.5">{t('admin.expenses.when')}</th>
                    <th className="text-right p-3.5">{t('admin.expenses.amount')}</th>
                    <th className="text-left p-3.5">{t('admin.expenses.category')}</th>
                    <th className="text-left p-3.5">{t('admin.expenses.note')}</th>
                    <th className="text-left p-3.5">{t('admin.expenses.cashier')}</th>
                    <th className="text-right p-3.5">{t('admin.common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3.5 whitespace-nowrap text-xs text-slate-400">
                        {new Date(r.recorded_at).toLocaleString()}
                      </td>
                      <td className="p-3.5 text-right tabular-nums font-bold text-amber-300 text-base">
                        {formatMoney(r.amount)}
                      </td>
                      <td className="p-3.5">
                        <span
                          className="inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700"
                        >
                          {t(`admin.expenses.cat.${r.category}`)}
                        </span>
                      </td>
                      <td className="p-3.5 max-w-[16rem] truncate text-slate-200">{r.note || '—'}</td>
                      <td className="p-3.5 text-slate-400 text-xs font-mono">{r.cashier_username ?? '—'}</td>
                      <td className="p-3.5 text-right space-x-1.5">
                        <button
                          type="button"
                          className="touch-btn min-h-10 px-3 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700"
                          onClick={() => openEdit(r)}
                        >
                          {t('admin.common.edit')}
                        </button>
                        <button
                          type="button"
                          className="touch-btn min-h-10 px-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-300 hover:bg-red-900"
                          onClick={() => setDeleting(r)}
                        >
                          {t('admin.common.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm pt-2">
            <div className="text-xs text-slate-400">
              {t('admin.common.pageOf', { page, maxPage })} ({count} ta xarajat)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                className="touch-btn min-h-11 px-4 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('admin.common.prev')}
              </button>
              <button
                type="button"
                disabled={page >= maxPage}
                className="touch-btn min-h-11 px-4 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold disabled:opacity-40"
                onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
              >
                {t('admin.common.next')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleting && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setDeleting(null)}>
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-950 border border-red-700 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">{t('admin.expenses.deleteTitle')}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{formatMoney(deleting.amount)} · {t(`admin.expenses.cat.${deleting.category}`)}</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">{t('admin.expenses.deleteHint')}</p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button type="button" className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300" onClick={() => setDeleting(null)}>
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                className="touch-btn min-h-12 px-5 rounded-xl bg-red-600 hover:bg-red-500 border border-red-400 text-white font-bold disabled:opacity-40"
                onClick={async () => {
                  setDeleteBusy(true)
                  try {
                    await deleteShopExpense(deleting.id)
                    setDeleting(null)
                    setToast({ kind: 'ok', msg: t('admin.expenses.deleted') })
                    void load()
                    requestAdminDataRefresh('shop-expense')
                  } catch {
                    setToast({ kind: 'err', msg: t('admin.expenses.deleteFail') })
                  } finally {
                    setDeleteBusy(false)
                  }
                }}
              >
                {deleteBusy ? t('admin.common.loading') : t('admin.common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-100">{t('admin.expenses.editTitle')}</h3>
              <button
                type="button"
                className="touch-btn h-9 w-9 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
                onClick={() => setEditing(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-slate-400 font-semibold">{t('admin.expenses.category')}:</div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`touch-btn min-h-10 px-3.5 rounded-xl text-xs font-semibold border transition-all ${
                      editCategory === c
                        ? 'bg-emerald-600 border-emerald-400 text-white shadow'
                        : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                    onClick={() => setEditCategory(c)}
                  >
                    {t(`admin.expenses.cat.${c}`)}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-xs text-slate-400 space-y-1">
              <span className="font-semibold">{t('admin.expenses.amount')} (so'm):</span>
              <NumericNumpadField
                value={editAmount}
                onChange={setEditAmount}
                min={0}
                formatDisplay={(d) => formatMoney(d)}
                className="bg-slate-950 border-slate-700 font-bold text-amber-300"
              />
            </label>

            <label className="block text-xs text-slate-400 space-y-1">
              <span className="font-semibold">{t('admin.expenses.note')}:</span>
              <input
                className="touch-btn min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 w-full text-sm text-slate-100 focus:border-emerald-500 outline-none"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
              />
            </label>

            <div className="flex justify-end gap-2.5 pt-2">
              <button type="button" className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300" onClick={() => setEditing(null)}>
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className="touch-btn min-h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white font-bold"
                onClick={async () => {
                  if (!editing) return
                  try {
                    await updateShopExpense(editing.id, {
                      amount: Number(editAmount).toFixed(0),
                      category: editCategory,
                      note: editNote.trim(),
                    })
                    setEditing(null)
                    setToast({ kind: 'ok', msg: t('admin.expenses.updated') })
                    void load()
                    requestAdminDataRefresh('shop-expense')
                  } catch {
                    setToast({ kind: 'err', msg: t('admin.expenses.updateFail') })
                  }
                }}
              >
                {t('admin.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
