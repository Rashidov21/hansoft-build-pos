import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Edit, Trash2, Building2, DollarSign, ChevronLeft, Search, PackagePlus, FileDown } from 'lucide-react'
import { formatMoney } from '../utils/money'
import { pickBilingualName, pickProductName } from '../utils/localizedName'
import { ConfirmModal } from '../components/ConfirmModal'
import { ActionToast } from '../components/ActionToast'
import { NumericNumpadField } from '../components/NumericNumpadField'
import { formatQty, parseQty, sanitizeDecimalInput } from '../utils/qty'
import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  fetchSupplierBalance,
  fetchSupplierTransactions,
  recordSupplierPayment,
  voidSupplierTransaction,
  fetchSupplierReceipts,
  createSupplierReceipt,
  downloadSupplierReceiptPdf,
  fetchPosVariantSearch,
  type Supplier,
  type SupplierBalance,
  type SupplierTransaction,
  type SupplierReceipt,
  type SupplierReceiptProfit,
  type PosVariant,
} from '../api'

export type SupplierWithDebt = Supplier & {
  opening_balance?: string | number
}

export function SuppliersPage() {
  const { t, i18n } = useTranslation()
  type TxFilter = 'all' | 'payment' | 'debt'
  type DetailTab = 'transactions' | 'receipts'
  const [txFilter, setTxFilter] = useState<TxFilter>('all')
  const [detailTab, setDetailTab] = useState<DetailTab>('transactions')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [balances, setBalances] = useState<Record<string, SupplierBalance>>({})
  const [transactions, setTransactions] = useState<Record<string, SupplierTransaction[]>>({})
  const [receipts, setReceipts] = useState<SupplierReceipt[]>([])
  const [receiptProfit, setReceiptProfit] = useState<SupplierReceiptProfit | null>(null)
  const [receiptSearch, setReceiptSearch] = useState('')
  const [receiptHits, setReceiptHits] = useState<PosVariant[]>([])
  const [receiptLines, setReceiptLines] = useState<
    Array<{ variant: PosVariant; qty: string; unit_cost: string }>
  >([])
  const [receiptNote, setReceiptNote] = useState('')
  const [receiptBusy, setReceiptBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [paymentModal, setPaymentModal] = useState<{ supplier_id: string; supplier_name: string } | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [paymentType, setPaymentType] = useState<'payment' | 'debt' | 'credit_memo'>('payment')
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err' | 'info'; message: string } | null>(null)
  const [voidingTxId, setVoidingTxId] = useState<string | null>(null)
  const [voidTxBusy, setVoidTxBusy] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [txPage, setTxPage] = useState(1)
  const [form, setForm] = useState({
    name: '',
    contact_person: '',
    phone: '',
    address: '',
    opening_balance: '',
  })

  const TX_PER_PAGE = 10

  function supplierDisplayName(s: Supplier): string {
    return pickBilingualName(s, i18n.language)
  }

  function txTypeLabel(type: SupplierTransaction['type']): string {
    if (type === 'PAYMENT') return t('admin.suppliers.payment')
    if (type === 'RETURN') return t('admin.suppliers.return')
    if (type === 'CREDIT_MEMO') return t('admin.suppliers.creditMemo')
    return t('admin.suppliers.purchase')
  }

  function filterTransactions(list: SupplierTransaction[]): SupplierTransaction[] {
    if (txFilter === 'payment') return list.filter((tx) => tx.type === 'PAYMENT')
    if (txFilter === 'debt') return list.filter((tx) => tx.type === 'PURCHASE')
    return list
  }

  useEffect(() => {
    loadSuppliers()
  }, [])

  const loadSuppliers = async () => {
    try {
      setLoading(true)
      const supplierList = await fetchSuppliers()
      setSuppliers(supplierList)
      
      // Load balances and transactions for each supplier
      for (const supplier of supplierList) {
        try {
          await loadSupplierBalance(supplier.id)
          await loadSupplierTransactions(supplier.id)
        } catch (error) {
          console.error(`Failed to load data for supplier ${supplier.id}:`, error)
        }
      }
    } catch (error) {
      console.error('Failed to load suppliers:', error)
      setToast({ kind: 'err', message: t('err.SUPPLIER_LOAD_FAILED') })
    } finally {
      setLoading(false)
    }
  }

  const loadSupplierBalance = async (supplierId: string) => {
    try {
      const data = await fetchSupplierBalance(supplierId)
      setBalances(prev => ({ ...prev, [supplierId]: data }))
    } catch (error) {
      console.error(`Failed to load balance for supplier ${supplierId}:`, error)
    }
  }

  const loadSupplierTransactions = async (supplierId: string) => {
    try {
      const txList = await fetchSupplierTransactions(supplierId)
      setTransactions(prev => ({ ...prev, [supplierId]: txList }))
    } catch (error) {
      console.error(`Failed to load transactions for supplier ${supplierId}:`, error)
    }
  }

  const loadSupplierReceipts = async (supplierId: string) => {
    try {
      const data = await fetchSupplierReceipts(supplierId)
      setReceipts(data.results)
      setReceiptProfit(data.profit)
    } catch (error) {
      console.error(`Failed to load receipts for supplier ${supplierId}:`, error)
      setReceipts([])
      setReceiptProfit(null)
    }
  }

  useEffect(() => {
    const q = receiptSearch.trim()
    if (q.length < 2) {
      setReceiptHits([])
      return
    }
    const tmr = window.setTimeout(() => {
      void fetchPosVariantSearch(q)
        .then(setReceiptHits)
        .catch(() => setReceiptHits([]))
    }, 280)
    return () => window.clearTimeout(tmr)
  }, [receiptSearch])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      const trimmedName = form.name.trim()
      const supplierData = {
        name_uz: trimmedName,
        name_ru: trimmedName,
        contact_person: form.contact_person,
        phone: form.phone,
        email: '',
        address: form.address,
      }
      
      let supplierId: string
      if (editingId) {
        await updateSupplier(editingId, supplierData)
        supplierId = editingId
      } else {
        const newSupplier = await createSupplier(supplierData)
        supplierId = newSupplier.id
      }

      // Record opening balance if provided (only for new suppliers)
      // Positive amount = PURCHASE (debt owed TO the supplier)
      const openingBalance = parseFloat(form.opening_balance || '0')
      if (!editingId && openingBalance > 0) {
        // Record as PURCHASE with a clear note
        await recordSupplierPayment(supplierId, openingBalance, t('admin.suppliers.openingDebtNote', `Opening debt: ${openingBalance}`))
      }

      await loadSuppliers()
      setShowForm(false)
      setEditingId(null)
      setForm({ name: '', contact_person: '', phone: '', address: '', opening_balance: '' })
      setToast({ kind: 'ok', message: t('admin.common.saved') })
    } catch (error) {
      console.error('Failed to save supplier:', error)
      setToast({ kind: 'err', message: t('err.SUPPLIER_SAVE_FAILED') })
    }
  }

  const handleEdit = (supplier: Supplier) => {
    setForm({
      name: supplierDisplayName(supplier),
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      opening_balance: '',
    })
    setEditingId(supplier.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    setDeleteConfirm(id)
  }

  const confirmDelete = async (id: string) => {
    setDeleteBusy(true)
    try {
      await deleteSupplier(id)
      await loadSuppliers()
      setDeleteConfirm(null)
      setToast({ kind: 'ok', message: t('admin.suppliers.deleted') })
    } catch (error) {
      console.error('Failed to delete supplier:', error)
      setToast({ kind: 'err', message: t('admin.common.error') })
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!paymentModal) return
    const amount = parseFloat(paymentAmount || '0')
    if (amount <= 0) {
      setToast({ kind: 'err', message: t('admin.suppliers.invalidAmount') })
      return
    }

    setPaymentBusy(true)
    try {
      const txType =
        paymentType === 'payment'
          ? 'PAYMENT'
          : paymentType === 'credit_memo'
            ? 'CREDIT_MEMO'
            : 'PURCHASE'
      const defaultNote =
        paymentType === 'payment'
          ? t('admin.suppliers.payment')
          : paymentType === 'credit_memo'
            ? t('admin.suppliers.creditMemo')
            : t('admin.suppliers.purchase')
      await recordSupplierPayment(
        paymentModal.supplier_id,
        amount,
        paymentNote || defaultNote,
        txType,
      )
      setPaymentAmount('')
      setPaymentNote('')
      setPaymentType('payment')
      setPaymentModal(null)
      // Reload the balance and transactions after successful operation
      await loadSupplierBalance(paymentModal.supplier_id)
      await loadSupplierTransactions(paymentModal.supplier_id)
      setToast({ kind: 'ok', message: t('admin.suppliers.transactionRecorded') })
    } catch (error) {
      console.error('Failed to record transaction:', error)
      setToast({ kind: 'err', message: t('err.SUPPLIER_TRANSACTION_FAILED') })
    } finally {
      setPaymentBusy(false)
    }
  }

  const filteredSuppliers = suppliers.filter((s) => {
    const name = supplierDisplayName(s)
    return name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="text-center py-12">
          <div className="text-slate-400">{t('admin.common.loading')}</div>
        </div>
      </div>
    )
  }

  if (selectedSupplier) {
    const balance = balances[selectedSupplier.id]
    const txList = transactions[selectedSupplier.id] || []
    const supplierName = supplierDisplayName(selectedSupplier)
    const filteredTx = filterTransactions(txList)
    
    // Pagination
    const totalPages = Math.ceil(filteredTx.length / TX_PER_PAGE)
    const startIdx = (txPage - 1) * TX_PER_PAGE
    const endIdx = startIdx + TX_PER_PAGE
    const paginatedTx = filteredTx.slice(startIdx, endIdx)

    return (
      <div className="p-4 sm:p-6 space-y-4">
        <button
          onClick={() => {
            setSelectedSupplier(null)
            setTxPage(1)
            setDetailTab('transactions')
            setReceiptLines([])
            setReceiptSearch('')
            setReceiptNote('')
          }}
          className="touch-btn inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('admin.common.back')}
        </button>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100 mb-4">{supplierName}</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">{t('admin.suppliers.contactPerson')}</div>
              <div className="text-slate-100 font-medium">{selectedSupplier.contact_person || ''}</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">{t('admin.suppliers.phone')}</div>
              <div className="text-slate-100 font-medium">{selectedSupplier.phone || ''}</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 sm:col-span-2">
              <div className="text-xs text-slate-400 mb-1">{t('admin.suppliers.address')}</div>
              <div className="text-slate-100 font-medium text-sm">{selectedSupplier.address || ''}</div>
            </div>
          </div>

          {balance && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-amber-950/30 border border-amber-700/50 rounded-lg p-4">
                <div className="text-xs text-amber-400 mb-1">{t('admin.suppliers.totalDebt')}</div>
                <div className="text-lg sm:text-xl font-bold text-amber-200">{formatMoney(String(balance.total_debt))}</div>
              </div>
              <div className="bg-emerald-950/30 border border-emerald-700/50 rounded-lg p-4">
                <div className="text-xs text-emerald-400 mb-1">{t('admin.suppliers.totalPaid')}</div>
                <div className="text-lg sm:text-xl font-bold text-emerald-200">{formatMoney(String(balance.total_paid))}</div>
              </div>
              <div className={`${Number(balance.balance) > 0 ? 'bg-red-950/30 border-red-700/50' : 'bg-slate-800 border-slate-700'} border rounded-lg p-4`}>
                <div className={`text-xs mb-1 ${Number(balance.balance) > 0 ? 'text-red-400' : 'text-slate-400'}`}>{t('admin.suppliers.balance')}</div>
                <div className={`text-lg sm:text-xl font-bold ${Number(balance.balance) > 0 ? 'text-red-200' : 'text-slate-200'}`}>
                  {Number(balance.balance) > 0 ? '+' : ''}{formatMoney(String(balance.balance))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`touch-btn min-h-11 px-4 rounded-xl border text-sm ${
              detailTab === 'transactions'
                ? 'bg-emerald-700 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-300'
            }`}
            onClick={() => setDetailTab('transactions')}
          >
            {t('admin.suppliers.transactions')}
          </button>
          <button
            type="button"
            className={`touch-btn min-h-11 px-4 rounded-xl border text-sm inline-flex items-center gap-2 ${
              detailTab === 'receipts'
                ? 'bg-emerald-700 border-emerald-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-300'
            }`}
            onClick={() => {
              setDetailTab('receipts')
              void loadSupplierReceipts(selectedSupplier.id)
            }}
          >
            <PackagePlus className="h-4 w-4" />
            {t('admin.suppliers.receiptTab', { defaultValue: 'Tovar qabul' })}
          </button>
        </div>

        {detailTab === 'receipts' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-100">
              {t('admin.suppliers.receiptTab', { defaultValue: 'Tovar qabul' })}
            </h3>
            {receiptProfit && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg bg-slate-800 p-3">
                  <div className="text-xs text-slate-400">{t('admin.suppliers.receivedCost', { defaultValue: 'Qabul tannarxi' })}</div>
                  <div className="tabular-nums font-medium">{formatMoney(receiptProfit.received_cost)}</div>
                </div>
                <div className="rounded-lg bg-slate-800 p-3">
                  <div className="text-xs text-slate-400">{t('admin.suppliers.soldCount', { defaultValue: 'Sotilgan' })}</div>
                  <div className="tabular-nums font-medium">{receiptProfit.sold_count}</div>
                </div>
                <div className="rounded-lg bg-slate-800 p-3">
                  <div className="text-xs text-slate-400">{t('admin.suppliers.soldRevenue', { defaultValue: 'Sotuv' })}</div>
                  <div className="tabular-nums font-medium">{formatMoney(receiptProfit.sold_revenue)}</div>
                </div>
                <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/50 p-3">
                  <div className="text-xs text-emerald-400">{t('admin.suppliers.receiptProfit', { defaultValue: 'Foyda' })}</div>
                  <div className="tabular-nums font-medium text-emerald-200">{formatMoney(receiptProfit.profit)}</div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 space-y-3">
              <label className="text-xs text-slate-400 block">
                {t('pos.searchLabel')}
                <input
                  className="touch-btn mt-1 w-full min-h-11 px-3 rounded-xl bg-slate-900 border border-slate-600"
                  value={receiptSearch}
                  onChange={(e) => setReceiptSearch(e.target.value)}
                  placeholder={t('pos.searchPlaceholder')}
                />
              </label>
              {receiptHits.length > 0 && (
                <ul className="max-h-36 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-800">
                  {receiptHits.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        className="touch-btn w-full text-left px-3 py-2 text-sm hover:bg-slate-800"
                        onClick={() => {
                          setReceiptLines((prev) => [
                            ...prev,
                            {
                              variant: v,
                              qty: '1',
                              unit_cost: v.purchase_price != null ? String(v.purchase_price) : '0',
                            },
                          ])
                          setReceiptSearch('')
                          setReceiptHits([])
                        }}
                      >
                        {pickProductName(v, i18n.language)}
                        <span className="block text-xs text-slate-500">
                          {formatQty(Number(v.stock_qty ?? 0), v.unit === 'dona' ? 'dona' : 'kg')}{' '}
                          {v.unit === 'dona' ? 'dona' : 'kg'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {receiptLines.map((line, idx) => (
                <div key={`${line.variant.id}-${idx}`} className="rounded-lg border border-slate-700 p-3 space-y-2">
                  <div className="flex justify-between gap-2">
                    <div className="text-sm font-medium">{pickProductName(line.variant, i18n.language)}</div>
                    <button
                      type="button"
                      className="text-xs text-red-400"
                      onClick={() => setReceiptLines((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      ×
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-slate-400">
                      {t('cart.qty')} ({line.variant.unit === 'dona' ? 'dona' : 'kg'})
                      <input
                        type="text"
                        inputMode="decimal"
                        className="touch-btn mt-1 w-full min-h-10 px-2 rounded-lg bg-slate-900 border border-slate-600 tabular-nums"
                        value={line.qty}
                        onChange={(e) =>
                          setReceiptLines((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, qty: sanitizeDecimalInput(e.target.value) } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      {t('admin.catalog.purchasePrice')}
                      <input
                        className="touch-btn mt-1 w-full min-h-10 px-2 rounded-lg bg-slate-900 border border-slate-600 tabular-nums"
                        value={line.unit_cost}
                        onChange={(e) =>
                          setReceiptLines((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, unit_cost: e.target.value } : row)),
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
              <label className="text-xs text-slate-400 block">
                {t('admin.expenses.note')}
                <input
                  className="touch-btn mt-1 w-full min-h-11 px-3 rounded-xl bg-slate-900 border border-slate-600"
                  value={receiptNote}
                  onChange={(e) => setReceiptNote(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={receiptBusy || receiptLines.length === 0}
                className="touch-btn min-h-12 px-4 rounded-xl bg-emerald-700 border border-emerald-500 disabled:opacity-50"
                onClick={async () => {
                  setReceiptBusy(true)
                  try {
                    await createSupplierReceipt(selectedSupplier.id, {
                      note: receiptNote,
                      lines: receiptLines.map((row) => ({
                        variant_id: row.variant.id,
                        qty: row.variant.unit === 'dona' ? Math.max(1, Math.round(parseQty(row.qty) || 1)) : Math.max(0.001, parseQty(row.qty) || 0.001),
                        unit_cost: row.unit_cost || '0',
                      })),
                    })
                    setReceiptLines([])
                    setReceiptNote('')
                    await loadSupplierReceipts(selectedSupplier.id)
                    await loadSupplierBalance(selectedSupplier.id)
                    await loadSupplierTransactions(selectedSupplier.id)
                    setToast({ kind: 'ok', message: t('admin.suppliers.receiptCreated', { defaultValue: 'Qabul saqlandi' }) })
                  } catch {
                    setToast({ kind: 'err', message: t('admin.common.error') })
                  } finally {
                    setReceiptBusy(false)
                  }
                }}
              >
                {receiptBusy ? t('admin.common.saving') : t('admin.suppliers.createReceipt', { defaultValue: 'Qabul yaratish' })}
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-300">
                {t('admin.suppliers.receiptHistory', { defaultValue: 'Qabullar tarixi' })}
              </h4>
              {receipts.length === 0 ? (
                <p className="text-sm text-slate-500">{t('admin.suppliers.noReceipts', { defaultValue: 'Qabullar yo‘q' })}</p>
              ) : (
                receipts.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-sm font-medium tabular-nums">{formatMoney(r.total_cost)}</div>
                      <div className="text-xs text-slate-400">
                        {r.received_at ? new Date(r.received_at).toLocaleString() : '—'} · {r.lines.length}{' '}
                        {t('admin.suppliers.receiptLines')}
                      </div>
                      {r.note ? <div className="text-xs text-slate-500 mt-1">{r.note}</div> : null}
                    </div>
                    <button
                      type="button"
                      className="touch-btn min-h-10 px-3 rounded-lg bg-slate-900 border border-slate-600 text-xs inline-flex items-center gap-1.5"
                      onClick={async () => {
                        try {
                          const blob = await downloadSupplierReceiptPdf(r.id)
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `receipt-${r.id.slice(0, 8)}.pdf`
                          a.click()
                          URL.revokeObjectURL(url)
                        } catch {
                          setToast({ kind: 'err', message: t('admin.common.error') })
                        }
                      }}
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      {t('admin.suppliers.pdfExport')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {detailTab === 'transactions' && txList.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-slate-100">{t('admin.suppliers.transactions')}</h3>
              <div className="flex flex-wrap gap-2">
                {(['all', 'payment', 'debt'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`touch-btn text-xs px-3 py-2 rounded-lg border ${
                      txFilter === f
                        ? 'bg-emerald-700 border-emerald-500 text-white'
                        : 'bg-slate-800 border-slate-600 text-slate-300'
                    }`}
                    onClick={() => {
                      setTxFilter(f)
                      setTxPage(1) // Reset to first page when filter changes
                    }}
                  >
                    {f === 'all'
                      ? t('admin.suppliers.filterAll')
                      : f === 'payment'
                        ? t('admin.suppliers.filterPayments')
                        : t('admin.suppliers.filterDebt')}
                  </button>
                ))}
              </div>
            </div>
            
            {filteredTx.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                {t('admin.suppliers.noTransactions')}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {paginatedTx.map((tx) => (
                    <div key={tx.id} className="bg-slate-800 rounded-lg p-3 flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-100">{txTypeLabel(tx.type)}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString()}
                        </div>
                        {tx.note && <div className="text-xs text-slate-500 mt-1">{tx.note}</div>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className={`text-sm font-bold ${tx.type === 'PAYMENT' || tx.type === 'CREDIT_MEMO' || tx.type === 'RETURN' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {tx.type === 'PAYMENT' || tx.type === 'CREDIT_MEMO' || tx.type === 'RETURN' ? '-' : '+'}{formatMoney(String(tx.amount))}
                        </div>
                        <button
                          type="button"
                          className="text-xs text-red-400 hover:text-red-300"
                          onClick={() => setVoidingTxId(tx.id)}
                        >
                          {t('admin.suppliers.voidTx')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
                    <div className="text-xs text-slate-400">
                      {t('admin.common.showing')} {startIdx + 1}-{Math.min(endIdx, filteredTx.length)} {t('admin.common.of')} {filteredTx.length}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setTxPage(p => Math.max(1, p - 1))}
                        disabled={txPage === 1}
                        className="touch-btn min-h-kiosk-touch px-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('admin.common.previous')}
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                          // Show first page, last page, current page, and pages around current
                          const showPage = page === 1 || page === totalPages || Math.abs(page - txPage) <= 1
                          const showEllipsis = (page === 2 && txPage > 3) || (page === totalPages - 1 && txPage < totalPages - 2)
                          
                          if (showEllipsis) {
                            return <span key={page} className="text-slate-500 px-2">...</span>
                          }
                          
                          if (!showPage) return null
                          
                          return (
                            <button
                              key={page}
                              type="button"
                              onClick={() => setTxPage(page)}
                              className={`touch-btn min-h-kiosk-touch min-w-10 px-2 rounded-lg text-sm ${
                                txPage === page
                                  ? 'bg-emerald-700 border border-emerald-500 text-white'
                                  : 'bg-slate-800 border border-slate-700 text-slate-300'
                              }`}
                            >
                              {page}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => setTxPage(p => Math.min(totalPages, p + 1))}
                        disabled={txPage === totalPages}
                        className="touch-btn min-h-kiosk-touch px-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('admin.common.next')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {voidingTxId && (
          <ConfirmModal
            title={t('admin.suppliers.voidTxTitle')}
            message={t('admin.suppliers.voidTxHint')}
            cancelText={t('admin.common.cancel')}
            confirmText={t('admin.suppliers.voidTx')}
            isDangerous
            isLoading={voidTxBusy}
            onCancel={() => setVoidingTxId(null)}
            onConfirm={async () => {
              setVoidTxBusy(true)
              try {
                await voidSupplierTransaction(voidingTxId)
                setVoidingTxId(null)
                await loadSupplierBalance(selectedSupplier.id)
                await loadSupplierTransactions(selectedSupplier.id)
                setToast({ kind: 'ok', message: t('admin.suppliers.voidTxSuccess') })
              } catch {
                setToast({ kind: 'err', message: t('err.VOID_SUPPLIER_TX_FAILED') })
              } finally {
                setVoidTxBusy(false)
              }
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('admin.sidebar.suppliers')}</h1>
          <p className="text-sm text-slate-400 mt-1">{t('admin.suppliers.hint')}</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true)
            setEditingId(null)
            setForm({ name: '', contact_person: '', phone: '', address: '', opening_balance: '' })
          }}
          className="touch-btn min-h-12 px-4 rounded-xl bg-emerald-700 border border-emerald-500 text-white font-medium flex items-center justify-center gap-2"
        >
          <Plus className="h-5 w-5" />
          {t('admin.suppliers.add')}
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">
            {editingId ? t('admin.suppliers.edit') : t('admin.suppliers.add')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">{t('admin.suppliers.nameSingle')}</label>
                <input
                  type="text"
                  placeholder={t('admin.suppliers.namePlaceholder')}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-base"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">{t('admin.suppliers.contactPerson')}</label>
                <input
                  type="text"
                  placeholder={t('admin.suppliers.contactPersonPlaceholder')}
                  value={form.contact_person}
                  onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                  className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">{t('admin.suppliers.phone')}</label>
                <input
                  type="tel"
                  placeholder={t('admin.suppliers.phonePlaceholder')}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-100"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">{t('admin.suppliers.address')}</label>
              <textarea
                placeholder={t('admin.suppliers.addressPlaceholder')}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="touch-btn w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100"
                rows={3}
              />
            </div>
            {!editingId && (
              <div>
                <label className="text-xs text-slate-400 block mb-1">{t('admin.suppliers.openingDebt')}</label>
                <NumericNumpadField
                  mode="inline"
                  value={form.opening_balance || '0'}
                  onChange={(v) => setForm({ ...form, opening_balance: v === '0' ? '' : v })}
                  min={0}
                  formatDisplay={(d) => formatMoney(d)}
                  className="bg-slate-800 border-slate-700"
                />
                <div className="text-xs text-slate-500 mt-1">{t('admin.suppliers.openingDebtHint')}</div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="touch-btn flex-1 min-h-12 px-4 rounded-xl bg-emerald-700 border border-emerald-500 text-white font-medium"
              >
                {t('admin.common.save')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                  setForm({ name: '', contact_person: '', phone: '', address: '', opening_balance: '' })
                }}
                className="touch-btn flex-1 min-h-12 px-4 rounded-xl bg-slate-700 border border-slate-600 text-slate-300 font-medium"
              >
                {t('admin.common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('admin.common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="touch-btn flex-1 min-h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm"
          />
        </div>
      </div>

      {filteredSuppliers.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <Building2 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">{t('admin.suppliers.empty')}</p>
          <p className="text-sm text-slate-500 mt-1">{t('admin.suppliers.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => {
            const balance = balances[supplier.id]
            const supplierName = supplierDisplayName(supplier)
            return (
              <button
                key={supplier.id}
                onClick={() => {
                  setSelectedSupplier(supplier)
                  setTxPage(1)
                  setDetailTab('transactions')
                  setReceiptLines([])
                  setReceiptSearch('')
                  setReceiptNote('')
                  void loadSupplierReceipts(supplier.id)
                }}
                className="touch-btn text-left bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-100 text-sm sm:text-base">{supplierName}</h3>
                    <p className="text-xs text-slate-400 mt-1">{supplier.contact_person || ''}</p>
                  </div>
                  <Building2 className="h-5 w-5 text-slate-600 shrink-0 ml-2" />
                </div>
                
                {balance && (
                  <div className="space-y-2 pt-3 border-t border-slate-800">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">{t('admin.suppliers.balance')}</span>
                      <span className={Number(balance.balance) > 0 ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                        {Number(balance.balance) > 0 ? '+' : ''}{formatMoney(String(balance.balance))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">{t('admin.suppliers.totalPaid')}</span>
                      <span className="text-slate-300">{formatMoney(String(balance.total_paid))}</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(supplier)
                    }}
                    className="touch-btn w-full min-h-11 px-3 py-2 rounded-lg bg-blue-900/30 border border-blue-700/50 text-blue-200 text-xs font-medium hover:bg-blue-900/50 text-left leading-snug"
                  >
                    <Edit className="h-4 w-4 inline-block mr-2 shrink-0 align-middle" aria-hidden />
                    {t('admin.suppliers.btnEdit')}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPaymentModal({ supplier_id: supplier.id, supplier_name: supplierName })
                    }}
                    className="touch-btn w-full min-h-11 px-3 py-2 rounded-lg bg-emerald-900/30 border border-emerald-700/50 text-emerald-200 text-xs font-medium hover:bg-emerald-900/50 text-left leading-snug"
                  >
                    <DollarSign className="h-4 w-4 inline-block mr-2 shrink-0 align-middle" aria-hidden />
                    {t('admin.suppliers.btnPay')}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(supplier.id)
                    }}
                    className="touch-btn w-full min-h-11 px-3 py-2 rounded-lg bg-red-900/30 border border-red-700/50 text-red-200 text-xs font-medium hover:bg-red-900/50 text-left leading-snug"
                  >
                    <Trash2 className="h-4 w-4 inline-block mr-2 shrink-0 align-middle" aria-hidden />
                    {t('admin.suppliers.btnDelete')}
                  </button>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Payment Modal */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-400" />
              {t('admin.suppliers.recordPayment')}
            </h2>
            
            <div className="mb-6 p-4 bg-slate-800 rounded-lg border border-slate-700">
              <div className="text-xs text-slate-400 mb-1">{t('admin.suppliers.supplier')}</div>
              <div className="text-slate-100 font-medium">{paymentModal.supplier_name}</div>
              {balances[paymentModal.supplier_id] && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <div className="text-xs text-slate-400 mb-1">{t('admin.suppliers.currentDebt')}</div>
                  <div className={`text-sm font-semibold ${Number(balances[paymentModal.supplier_id].balance) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {Number(balances[paymentModal.supplier_id].balance) > 0 ? '+' : ''}{formatMoney(String(balances[paymentModal.supplier_id].balance || 0))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">{t('admin.suppliers.paymentType')}</label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as 'payment' | 'debt' | 'credit_memo')}
                  className="touch-btn w-full min-h-10 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-100"
                >
                  <option value="payment">{t('admin.suppliers.payment')}</option>
                  <option value="debt">{t('admin.suppliers.addDebt')}</option>
                  <option value="credit_memo">{t('admin.suppliers.creditMemo')}</option>
                </select>
                {paymentType === 'credit_memo' && (
                  <p className="text-xs text-slate-500 mt-1">{t('admin.suppliers.creditMemoHint')}</p>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">{t('admin.suppliers.amount')}</label>
                <NumericNumpadField
                  mode="inline"
                  value={paymentAmount || '0'}
                  onChange={setPaymentAmount}
                  min={0}
                  formatDisplay={(d) => formatMoney(d)}
                  className="bg-slate-800 border-slate-700 text-lg"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">{t('admin.common.note')}</label>
                <textarea
                  placeholder={t('admin.inventory.noteOptional')}
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="touch-btn w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100"
                  rows={3}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleRecordPayment}
                  disabled={!paymentAmount || Number(paymentAmount) <= 0 || paymentBusy}
                  className="touch-btn flex-1 min-h-12 px-4 rounded-xl bg-emerald-700 border border-emerald-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {paymentBusy ? t('admin.common.loading') : t('admin.common.save')}
                </button>
                <button
                  onClick={() => {
                    setPaymentModal(null)
                    setPaymentAmount('')
                    setPaymentNote('')
                    setPaymentType('payment')
                  }}
                  className="touch-btn flex-1 min-h-12 px-4 rounded-xl bg-slate-700 border border-slate-600 text-slate-300 font-medium"
                >
                  {t('admin.common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <ConfirmModal
          title={t('admin.suppliers.deleteSupplier')}
          message={t('admin.suppliers.deleteSupplierConfirm')}
          cancelText={t('admin.common.cancel')}
          confirmText={t('admin.common.delete')}
          isDangerous
          isLoading={deleteBusy}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => confirmDelete(deleteConfirm)}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <ActionToast
          kind={toast.kind}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
