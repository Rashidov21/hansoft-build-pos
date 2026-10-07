import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { fetchSaleDetail, type SaleDetailReceipt } from '../api'

type SaleDetailModalProps = {
  saleId: string
  saleStatus?: string
  onClose: () => void
}

export function SaleDetailModal({ saleId, saleStatus, onClose }: SaleDetailModalProps) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'uz' | 'uz-cyrl' | 'ru'
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<SaleDetailReceipt | null>(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const result = await fetchSaleDetail(saleId)
        console.log('Sale detail data:', result) // Debug log
        setReceipt(result.receipt)
      } catch (err) {
        console.error('Failed to load sale details:', err)
        setError(err instanceof Error ? err.message : 'Failed to load sale details')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [saleId])

  function formatMoney(amount: string | number | undefined): string {
    if (!amount) return '0'
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num)
  }

  function formatDateTime(iso: string | undefined): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getPaymentMethodLabel(method: string): string {
    const map: Record<string, string> = {
      CASH: t('pay.method.cash'),
      CARD: t('pay.method.card'),
      DEBT: t('pay.method.debt'),
    }
    return map[method] || method
  }

  function getStatusBadge() {
    if (!saleStatus) return null
    
    const statusClass =
      saleStatus === 'VOIDED'
        ? 'bg-red-950/60 text-red-200 border-red-800/80'
        : 'bg-emerald-950/50 text-emerald-200 border-emerald-800/70'
    
    return (
      <span className={`inline-block px-3 py-1 rounded-lg text-sm border ${statusClass} font-medium`}>
        {t(`status.${saleStatus}`, { defaultValue: saleStatus })}
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-700">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-100">
                {receipt?.public_sale_no ? t('admin.sales.detailTitle', { saleNo: receipt.public_sale_no }) : t('admin.sales.details')}
              </h2>
              {getStatusBadge()}
            </div>
            {receipt?.completed_at && (
              <p className="text-sm text-slate-400 mt-2">
                {formatDateTime(receipt.completed_at)} • {receipt.cashier}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="touch-btn p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 ml-2"
            aria-label={t('admin.sales.detailClose')}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading && (
            <div className="text-center py-12 text-slate-400">
              {t('admin.sales.detailLoading')}
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && receipt && (
            <>
              {/* Products Table */}
              <div>
                <h3 className="text-lg font-medium text-slate-200 mb-3">
                  {t('admin.sales.detailProduct')}
                </h3>
                {receipt.lines && receipt.lines.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left p-2 text-slate-400 font-medium">{t('admin.sales.detailProduct')}</th>
                          <th className="text-center p-2 text-slate-400 font-medium">{t('admin.sales.detailQty')}</th>
                          <th className="text-right p-2 text-slate-400 font-medium">{t('admin.sales.detailUnitPrice')}</th>
                          <th className="text-right p-2 text-slate-400 font-medium">{t('admin.sales.detailLineTotal')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receipt.lines.map((line, idx) => (
                          <tr key={idx} className="border-b border-slate-800">
                            <td className="p-2 text-slate-100">
                              <div>{line.name}</div>
                              {line.barcode && (
                                <div className="text-xs text-slate-500 mt-0.5">
                                  {t('admin.sales.detailBarcode')}: {line.barcode}
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-center text-slate-100">{line.qty}</td>
                            <td className="p-2 text-right text-slate-100">
                              {formatMoney(line.unit)}
                            </td>
                            <td className="p-2 text-right text-slate-100 font-medium">
                              {formatMoney(line.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    {t('admin.sales.detailNoProducts')}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{t('admin.sales.detailSubtotal')}</span>
                  <span className="text-slate-100 font-medium">{formatMoney(receipt.subtotal)}</span>
                </div>
                {receipt.discount_total && parseFloat(receipt.discount_total) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{t('admin.sales.detailDiscountTotal')}</span>
                    <span className="text-red-400 font-medium">−{formatMoney(receipt.discount_total)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg border-t border-slate-700 pt-2">
                  <span className="text-slate-200 font-semibold">{t('admin.sales.detailGrandTotal')}</span>
                  <span className="text-emerald-400 font-bold">{formatMoney(receipt.grand_total)}</span>
                </div>
              </div>

              {/* Payments */}
              {receipt.payments && receipt.payments.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-slate-200 mb-3">
                    {t('admin.sales.detailPayments')}
                  </h3>
                  <div className="space-y-2">
                    {receipt.payments.map((payment, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-800/30 rounded-lg p-3">
                        <span className="text-slate-300">{getPaymentMethodLabel(payment.method)}</span>
                        <span className="text-slate-100 font-medium">{formatMoney(payment.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 p-4 sm:p-6">
          <button
            onClick={onClose}
            className="touch-btn w-full min-h-12 px-6 rounded-xl bg-slate-800 border border-slate-600 text-slate-100 font-medium hover:bg-slate-700"
          >
            {t('admin.sales.detailClose')}
          </button>
        </div>
      </div>
    </div>
  )
}
