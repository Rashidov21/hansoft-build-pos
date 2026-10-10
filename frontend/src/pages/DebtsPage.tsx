import { useEffect, useMemo, useState } from 'react'
import Decimal from 'decimal.js'
import { Check, Edit2, HandCoins, History, Phone, Search, User, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DebtPaymentHistoryRow, DebtRow } from '../api'
import { CARD_BANKS, fetchDebtPayments, fetchDebts } from '../api'
import { ActionToast } from '../components/ActionToast'
import { NumericNumpadField } from '../components/NumericNumpadField'
import { formatMoney } from '../utils/money'

type StatusFilter = 'open' | 'overdue' | 'paid' | 'all'
type PayMethod = 'CASH' | 'CARD'

function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function DebtsPage({
  debts,
  onRepay,
  onSendReminder,
  onUpdateCustomer,
}: {
  debts: DebtRow[]
  onRepay: (
    customerId: string,
    amount: string,
    opts?: { method?: PayMethod; card_bank?: string; note?: string },
  ) => Promise<void>
  onSendReminder: (customerId: string, amount: string) => Promise<void>
  onUpdateCustomer: (customerId: string, name: string, phone: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [remoteDebts, setRemoteDebts] = useState<DebtRow[] | null>(null)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [busyCustomerId, setBusyCustomerId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  // Touch repayment modal state
  const [repayModalTarget, setRepayModalTarget] = useState<{
    customerId: string
    customerName: string
    customerPhone: string
    totalRemaining: Decimal
    dueDate?: string | null
  } | null>(null)
  const [modalRepayAmount, setModalRepayAmount] = useState<string>('0')
  const [repayMethod, setRepayMethod] = useState<PayMethod>('CASH')
  const [repayCardBank, setRepayCardBank] = useState<string>(CARD_BANKS[0]?.code || 'MBANK')
  const [repaySubmitting, setRepaySubmitting] = useState(false)

  // Payment history modal
  const [historyTarget, setHistoryTarget] = useState<{
    customerId: string
    customerName: string
    customerPhone: string
  } | null>(null)
  const [historyRows, setHistoryRows] = useState<DebtPaymentHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const isPaidView = statusFilter === 'paid'

  // "open" and "overdue" use the live open-debts list from the app; "paid"/"all" load from the API.
  useEffect(() => {
    if (statusFilter === 'open' || statusFilter === 'overdue') {
      setRemoteDebts(null)
      return
    }
    let cancelled = false
    setRemoteLoading(true)
    void fetchDebts({ status: statusFilter === 'paid' ? 'PAID' : 'ALL' })
      .then((rows) => {
        if (!cancelled) setRemoteDebts(rows)
      })
      .catch(() => {
        if (!cancelled) {
          setRemoteDebts([])
          setToast({ kind: 'err', message: t('err.API_ERROR') })
        }
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false)
      })
    return () => {
      cancelled = true
    }
    // `debts` changes after repayment ? reload paid/all views too.
  }, [statusFilter, debts, t])

  const filteredDebts = useMemo(() => {
    const source = remoteDebts ?? debts
    const today = todayIso()
    return source.filter((d) => {
      if (statusFilter === 'open' && d.status !== 'OPEN') return false
      if (statusFilter === 'paid' && d.status !== 'PAID') return false
      if (statusFilter === 'overdue') {
        if (d.status !== 'OPEN' || !d.due_date || d.due_date.slice(0, 10) >= today) return false
      }
      if (dueFrom || dueTo) {
        if (!d.due_date) return false
        const due = d.due_date.slice(0, 10)
        if (dueFrom && due < dueFrom) return false
        if (dueTo && due > dueTo) return false
      }
      return true
    })
  }, [remoteDebts, debts, statusFilter, dueFrom, dueTo])

  const groupedRows = useMemo(() => {
    const grouped = new Map<string, { row: DebtRow; total: Decimal; count: number }>()
    for (const d of filteredDebts) {
      const existing = grouped.get(d.customer)
      // Paid view shows the original debt amount; otherwise the remaining balance.
      const amount = new Decimal((isPaidView ? d.total_amount : d.remaining_amount) || '0')
      if (!existing) {
        grouped.set(d.customer, { row: d, total: amount, count: 1 })
      } else {
        existing.total = existing.total.plus(amount)
        existing.count += 1
      }
    }
    return Array.from(grouped.entries()).map(([customerId, item]) => ({
      customerId,
      row: item.row,
      total: item.total,
      count: item.count,
    }))
  }, [filteredDebts, isPaidView])

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return groupedRows
    const qDigits = q.replace(/\D/g, '')
    return groupedRows.filter(
      (r) =>
        r.row.customer_name.toLowerCase().includes(q) ||
        (qDigits !== '' && r.row.customer_phone.replace(/\D/g, '').includes(qDigits)),
    )
  }, [groupedRows, searchTerm])

  const grandTotalDebt = useMemo(() => {
    return filteredRows.reduce((acc, r) => acc.plus(r.total), new Decimal(0))
  }, [filteredRows])

  function openRepayModal(target: {
    customerId: string
    customerName: string
    customerPhone: string
    totalRemaining: Decimal
    dueDate?: string | null
  }) {
    setRepayModalTarget(target)
    setModalRepayAmount(target.totalRemaining.toFixed(0))
    setRepayMethod('CASH')
    setRepayCardBank(CARD_BANKS[0]?.code || 'MBANK')
  }

  function closeRepayModal() {
    if (repaySubmitting) return
    setRepayModalTarget(null)
    setModalRepayAmount('0')
  }

  async function openHistory(customerId: string, customerName: string, customerPhone: string) {
    setHistoryTarget({ customerId, customerName, customerPhone })
    setHistoryLoading(true)
    setHistoryRows([])
    try {
      const rows = await fetchDebtPayments(customerId)
      setHistoryRows(rows)
    } catch {
      setHistoryRows([])
      setToast({ kind: 'err', message: t('err.FETCH_DEBT_PAYMENTS_FAILED', { defaultValue: t('err.API_ERROR') }) })
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleConfirmRepay() {
    if (!repayModalTarget) return
    const amtDec = new Decimal(modalRepayAmount || '0')
    if (amtDec.lte(0)) {
      setToast({ kind: 'err', message: t('admin.debts.amountPlaceholder', { defaultValue: 'Summa kiriting' }) })
      return
    }
    if (repayMethod === 'CARD' && !String(repayCardBank || '').trim()) {
      setToast({
        kind: 'err',
        message: t('pay.bankRequired', { defaultValue: 'Karta uchun bankni tanlang' }),
      })
      return
    }
    setRepaySubmitting(true)
    try {
      await onRepay(repayModalTarget.customerId, amtDec.toFixed(0), {
        method: repayMethod,
        card_bank: repayMethod === 'CARD' ? repayCardBank : '',
      })
      setToast({ kind: 'ok', message: t('admin.debts.repaySuccess') })
      closeRepayModal()
    } catch (e: unknown) {
      const code = (e as Error & { code?: string }).code
      setToast({ kind: 'err', message: t(`err.${code || 'DEBT_PAYMENT_FAILED'}`) })
    } finally {
      setRepaySubmitting(false)
    }
  }

  const remainingAfterRepay = useMemo(() => {
    if (!repayModalTarget) return new Decimal(0)
    const paying = new Decimal(modalRepayAmount || '0')
    const rem = repayModalTarget.totalRemaining.minus(paying)
    return rem.gt(0) ? rem : new Decimal(0)
  }, [repayModalTarget, modalRepayAmount])

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      {toast && <ActionToast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header & KPI Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <HandCoins className="h-6 w-6 text-amber-400" />
            {t('admin.debts.title')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('admin.debts.hint')}</p>
        </div>
        <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5">
          <div>
            <div className="text-xs text-slate-400">{t('admin.debts.openCount')}:</div>
            <div className="text-lg font-bold text-slate-100 tabular-nums">{t('admin.debts.customersCount', { count: filteredRows.length })}</div>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div>
            <div className="text-xs text-slate-400">
              {isPaidView ? t('admin.debts.paidTotal') : t('admin.debts.totalRemaining')}:
            </div>
            <div className="text-lg font-black text-amber-300 tabular-nums">{formatMoney(grandTotalDebt.toFixed(0))}</div>
          </div>
        </div>
      </div>

      {/* Filters: status, due-date range, customer search */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('admin.debts.filterStatus')}>
          {(['open', 'overdue', 'paid', 'all'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={statusFilter === key}
              className={`touch-btn min-h-11 px-4 rounded-xl border text-sm font-medium ${
                statusFilter === key
                  ? key === 'overdue'
                    ? 'bg-red-700 border-red-400 text-white'
                    : 'bg-emerald-700 border-emerald-400 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
              }`}
              onClick={() => setStatusFilter(key)}
            >
              {t(`admin.debts.filter.${key}`)}
            </button>
          ))}
        </div>
        <label className="text-xs text-slate-400">
          <span className="block mb-1">{t('admin.debts.dueFrom')}</span>
          <input
            type="date"
            className="touch-btn min-h-11 px-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100"
            value={dueFrom}
            max={dueTo || undefined}
            onChange={(e) => setDueFrom(e.target.value)}
          />
        </label>
        <label className="text-xs text-slate-400">
          <span className="block mb-1">{t('admin.debts.dueTo')}</span>
          <input
            type="date"
            className="touch-btn min-h-11 px-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100"
            value={dueTo}
            min={dueFrom || undefined}
            onChange={(e) => setDueTo(e.target.value)}
          />
        </label>
        {(dueFrom || dueTo || statusFilter !== 'open' || searchTerm) && (
          <button
            type="button"
            className="touch-btn min-h-11 px-4 rounded-xl bg-slate-800 border border-slate-600 text-sm text-slate-200"
            onClick={() => {
              setStatusFilter('open')
              setDueFrom('')
              setDueTo('')
              setSearchTerm('')
            }}
          >
            {t('admin.debts.clearFilters')}
          </button>
        )}
      </div>

      {/* Search filter bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <input
          className="touch-btn w-full min-h-12 pl-11 pr-4 rounded-xl bg-slate-900 border border-slate-700 text-sm placeholder:text-slate-500 focus:border-emerald-500 outline-none"
          placeholder={t('admin.debts.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            onClick={() => setSearchTerm('')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Debts Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="overflow-x-auto kiosk-scrollbar">
          <table className="w-full text-sm min-w-[54rem]">
            <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-xs font-semibold uppercase">
              <tr>
                <th className="text-left p-3.5">{t('admin.debts.customer')}</th>
                <th className="text-left p-3.5">{t('admin.debts.phone')}</th>
                <th className="text-left p-3.5">{t('admin.debts.createdAt')}</th>
                <th className="text-left p-3.5">{t('admin.debts.dueDate')}</th>
                <th className="text-center p-3.5">{t('admin.debts.openCount')}</th>
                <th className="text-right p-3.5">
                  {isPaidView ? t('admin.debts.paidTotal') : t('admin.debts.totalRemaining')}
                </th>
                <th className="text-right p-3.5 min-w-[12rem]">{t('admin.debts.repay')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredRows.map(({ customerId, total, row, count }) => {
                const isEditing = editingCustomerId === customerId
                const isOverdue = row.status === 'OPEN' && row.due_date ? row.due_date.slice(0, 10) < todayIso() : false

                return (
                  <tr key={customerId} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5">
                      {isEditing ? (
                        <input
                          className="touch-btn min-h-11 w-full px-3 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:border-emerald-500 outline-none"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder={t('admin.debts.customer')}
                        />
                      ) : (
                        <div className="font-semibold text-slate-100 flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-500 shrink-0" />
                          <span>{row.customer_name}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3.5">
                      {isEditing ? (
                        <input
                          className="touch-btn min-h-11 w-full px-3 rounded-lg bg-slate-950 border border-slate-700 text-sm focus:border-emerald-500 outline-none"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ''))}
                          placeholder="998901112233"
                        />
                      ) : (
                        <div className="text-slate-300 font-mono text-xs flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span>{row.customer_phone || '—'}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-400 text-xs">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3.5 text-xs">
                      {row.due_date ? (
                        <span className={`inline-block px-2 py-0.5 rounded ${isOverdue ? 'bg-red-950/80 text-red-300 border border-red-800 font-medium' : 'text-slate-300'}`}>
                          {new Date(row.due_date).toLocaleDateString()}
                          {isOverdue ? ` (${t('admin.debts.overdue')})` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-500">{t('admin.debts.noDueDate')}</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center font-medium text-slate-300">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-slate-800 text-xs">
                        {count}
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-bold text-amber-300 text-base tabular-nums">
                      {formatMoney(total.toFixed(0))}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="inline-flex gap-2 items-center justify-end">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={busyCustomerId === customerId || !editName.trim() || !editPhone.trim()}
                              className="touch-btn min-h-11 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1"
                              onClick={async () => {
                                if (!/^\d{9,15}$/.test(editPhone.trim())) {
                                  setToast({
                                    kind: 'err',
                                    message: t('admin.debts.phoneFormat'),
                                  })
                                  return
                                }
                                setBusyCustomerId(customerId)
                                try {
                                  await onUpdateCustomer(customerId, editName.trim(), editPhone.trim())
                                  setToast({ kind: 'ok', message: t('admin.common.save') })
                                  setEditingCustomerId(null)
                                } catch (e: unknown) {
                                  const code = (e as Error & { code?: string }).code
                                  setToast({ kind: 'err', message: t(`err.${code || 'VALIDATION_ERROR'}`) })
                                } finally {
                                  setBusyCustomerId(null)
                                }
                              }}
                            >
                              <Check className="h-3.5 w-3.5" />
                              {t('admin.common.save')}
                            </button>
                            <button
                              type="button"
                              disabled={busyCustomerId === customerId}
                              className="touch-btn min-h-11 px-3 rounded-xl bg-slate-800 border border-slate-600 text-xs text-slate-300 hover:bg-slate-700"
                              onClick={() => setEditingCustomerId(null)}
                            >
                              {t('admin.common.cancel')}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busyCustomerId === customerId}
                              className="touch-btn min-h-11 px-3 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700 inline-flex items-center gap-1"
                              title={t('admin.debts.sendReminder')}
                              onClick={async () => {
                                setBusyCustomerId(customerId)
                                try {
                                  await onSendReminder(customerId, total.toFixed(0))
                                  setToast({ kind: 'ok', message: t('admin.debts.reminderSuccess') })
                                } catch (e: unknown) {
                                  const code = (e as Error & { code?: string }).code
                                  setToast({ kind: 'err', message: t(`err.${code || 'WHATSAPP_SEND_FAILED'}`) })
                                } finally {
                                  setBusyCustomerId(null)
                                }
                              }}
                            >
                              <Phone className="h-3.5 w-3.5 text-emerald-400" />
                              <span className="hidden sm:inline">{t('admin.debts.sendReminder')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyCustomerId === customerId}
                              className="touch-btn min-h-11 px-3 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700 inline-flex items-center gap-1"
                              title={t('admin.debts.paymentHistory', { defaultValue: "To'lovlar tarixi" })}
                              onClick={() => void openHistory(customerId, row.customer_name, row.customer_phone)}
                            >
                              <History className="h-3.5 w-3.5 text-sky-400" />
                              <span className="hidden sm:inline">{t('admin.debts.history', { defaultValue: 'Tarix' })}</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyCustomerId === customerId}
                              className="touch-btn min-h-11 px-3 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700 inline-flex items-center gap-1"
                              title={t('admin.catalog.edit')}
                              onClick={() => {
                                setEditingCustomerId(customerId)
                                setEditName(row.customer_name)
                                setEditPhone(row.customer_phone)
                              }}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              <span>{t('admin.catalog.edit')}</span>
                            </button>
                            {!isPaidView && total.gt(0) && (
                            <button
                              type="button"
                              disabled={busyCustomerId === customerId}
                              className="touch-btn min-h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 inline-flex items-center gap-1.5"
                              onClick={() =>
                                openRepayModal({
                                  customerId,
                                  customerName: row.customer_name,
                                  customerPhone: row.customer_phone,
                                  totalRemaining: total,
                                  dueDate: row.due_date,
                                })
                              }
                            >
                              <HandCoins className="h-4 w-4" />
                              <span>{t('admin.debts.payBtn', { defaultValue: "Qarz to'lash" })}</span>
                            </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    <HandCoins className="mx-auto h-12 w-12 text-slate-600 mb-2" />
                    <p className="text-base font-medium">
                      {remoteLoading ? t('admin.common.loading') : t('admin.debts.empty')}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dedicated Touch Repayment Modal */}
      {repayModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="my-auto w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <HandCoins className="h-6 w-6 text-emerald-400" />
                <h3 className="text-lg font-bold text-slate-100">
                  {t('admin.debts.modalTitle', { defaultValue: "Qarz so'ndirish (To'lov)" })}
                </h3>
              </div>
              <button
                type="button"
                className="touch-btn h-10 w-10 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
                onClick={closeRepayModal}
                disabled={repaySubmitting}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Customer Info Card */}
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">{t('admin.debts.customer')}:</div>
                  <div className="text-base font-bold text-slate-100">{repayModalTarget.customerName}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">{t('admin.debts.phone')}:</div>
                  <div className="text-sm font-mono text-slate-300">{repayModalTarget.customerPhone || '—'}</div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-xs text-slate-400">{t('admin.debts.totalRemaining')}:</span>
                <span className="text-xl font-black text-amber-300 tabular-nums">
                  {formatMoney(repayModalTarget.totalRemaining.toFixed(0))}
                </span>
              </div>
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-300">
                {t('admin.debts.payMethod', { defaultValue: "To'lov usuli" })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['CASH', t('admin.debts.methodCash', { defaultValue: 'Naqd' })],
                  ['CARD', t('admin.debts.methodCard', { defaultValue: 'Karta' })],
                ] as const).map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    className={`touch-btn min-h-11 rounded-xl border text-sm font-semibold ${
                      repayMethod === code
                        ? 'bg-emerald-700 border-emerald-400 text-white'
                        : 'bg-slate-800 border-slate-600 text-slate-200'
                    }`}
                    onClick={() => setRepayMethod(code)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {repayMethod === 'CARD' && (
                <select
                  className="touch-btn w-full min-h-11 mt-1 px-3 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100"
                  value={repayCardBank}
                  onChange={(e) => setRepayCardBank(e.target.value)}
                >
                  {CARD_BANKS.map((b) => (
                    <option key={b.code} value={b.code}>
                      {t(b.labelKey, { defaultValue: b.label })}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Quick preset amount buttons */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                {t('admin.debts.amountPlaceholder', { defaultValue: "To'lanadigan summa" })}:
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="touch-btn min-h-10 px-3 rounded-xl bg-emerald-950/80 border border-emerald-500 text-xs font-bold text-emerald-300 hover:bg-emerald-900 flex-1"
                  onClick={() => setModalRepayAmount(repayModalTarget.totalRemaining.toFixed(0))}
                >
                  {t('admin.debts.quickPayFull', { defaultValue: "To'liq so'ndirish" })} ({formatMoney(repayModalTarget.totalRemaining.toFixed(0))})
                </button>
                {[50000, 100000, 200000, 500000, 1000000].map((val) => {
                  if (repayModalTarget.totalRemaining.lt(val)) return null
                  return (
                    <button
                      key={val}
                      type="button"
                      className="touch-btn min-h-10 px-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-700"
                      onClick={() => setModalRepayAmount(String(val))}
                    >
                      {formatMoney(String(val))}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Custom Amount with Numeric Numpad Field */}
            <div className="w-full">
              <NumericNumpadField
                value={modalRepayAmount}
                onChange={(v) => setModalRepayAmount(v)}
                min={0}
                placeholder={t('admin.debts.amountPlaceholder')}
                formatDisplay={(d) => (d === '0' ? '' : formatMoney(d))}
                className="w-full bg-slate-950 text-lg font-bold border-slate-700 py-3 text-right text-emerald-300"
              />
            </div>

            {/* Remaining balance preview */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {t('admin.debts.remainingAfterPay', { defaultValue: "To'lovdan keyin qoladigan qarz" })}:
              </span>
              <span className={`font-bold tabular-nums text-sm ${remainingAfterRepay.eq(0) ? 'text-emerald-400' : 'text-amber-300'}`}>
                {remainingAfterRepay.eq(0) ? "0 so'm (To'liq yopiladi)" : formatMoney(remainingAfterRepay.toFixed(0))}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="touch-btn flex-1 min-h-12 rounded-xl bg-slate-800 border border-slate-700 text-sm font-semibold text-slate-300 hover:bg-slate-700"
                onClick={closeRepayModal}
                disabled={repaySubmitting}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className="touch-btn flex-[2] min-h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-white font-bold text-base shadow-lg shadow-emerald-950/60 disabled:opacity-50"
                onClick={() => void handleConfirmRepay()}
                disabled={repaySubmitting || new Decimal(modalRepayAmount || '0').lte(0)}
              >
                {repaySubmitting ? t('admin.common.loading') : t('admin.debts.repay')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment history modal */}
      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="my-auto w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4 max-h-[min(92dvh,40rem)] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <History className="h-5 w-5 text-sky-400 shrink-0" />
                  {t('admin.debts.paymentHistory', { defaultValue: "To'lovlar tarixi" })}
                </h3>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {historyTarget.customerName}
                  {historyTarget.customerPhone ? ` · ${historyTarget.customerPhone}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="touch-btn h-10 w-10 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center shrink-0"
                onClick={() => setHistoryTarget(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto kiosk-scrollbar space-y-2">
              {historyLoading && (
                <p className="text-sm text-slate-400 p-4 text-center">{t('admin.common.loading')}</p>
              )}
              {!historyLoading && historyRows.length === 0 && (
                <p className="text-sm text-slate-500 p-6 text-center">
                  {t('admin.debts.paymentHistoryEmpty', { defaultValue: "Hali to'lovlar yo'q" })}
                </p>
              )}
              {!historyLoading &&
                historyRows.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-bold text-emerald-300 tabular-nums">
                          {formatMoney(p.amount)}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {formatDateTime(p.created_at)}
                        </div>
                      </div>
                      <div className="text-right text-xs space-y-0.5">
                        <div className="inline-block px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 font-medium">
                          {p.method === 'CARD'
                            ? `${t('admin.debts.methodCard', { defaultValue: 'Karta' })}${p.card_bank ? ` · ${p.card_bank}` : ''}`
                            : t('admin.debts.methodCash', { defaultValue: 'Naqd' })}
                        </div>
                        <div className="text-slate-500">
                          {t('admin.debts.cashier', { defaultValue: 'Kassir' })}: {p.recorded_by_username || '—'}
                        </div>
                      </div>
                    </div>
                    {p.note ? (
                      <div className="text-xs text-slate-400">
                        {t('admin.debts.note', { defaultValue: 'Izoh' })}: {p.note}
                      </div>
                    ) : null}
                    {p.allocations.length > 1 && (
                      <div className="text-[0.7rem] text-slate-500 pt-1 border-t border-slate-800">
                        {t('admin.debts.allocatedDebts', {
                          defaultValue: '{{count}} ta qarzga taqsimlandi',
                          count: p.allocations.length,
                        })}
                      </div>
                    )}
                  </div>
                ))}
            </div>

            <button
              type="button"
              className="touch-btn w-full min-h-12 rounded-xl bg-slate-800 border border-slate-700 text-sm font-semibold text-slate-200 shrink-0"
              onClick={() => setHistoryTarget(null)}
            >
              {t('admin.common.close', { defaultValue: 'Yopish' })}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
