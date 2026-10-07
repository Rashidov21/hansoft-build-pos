import { formatMoney } from './money'

/** Void/return API refund rows → toast qismi. */
export function formatRefundParts(
  refunds?: Array<{ method: string; amount: string }> | null,
): string {
  if (!refunds?.length) return ''
  return refunds.map((r) => `${r.method} ${formatMoney(r.amount)}`).join(', ')
}

export type VoidSaleResult = {
  sale_id?: string
  status?: string
  return_amount?: string
  refunds?: Array<{ method: string; amount: string }>
  restocked_lines?: Array<{ variant_id: string; qty: number }>
}

export function buildVoidSuccessMessage(
  t: (key: string, opts?: Record<string, string | number>) => string,
  result: VoidSaleResult | null | undefined,
): string {
  const refunds = result?.refunds
  const total = result?.return_amount
  if (refunds?.length) {
    return t('admin.sales.voidSuccessWithRefund', {
      total: formatMoney(total || '0'),
      parts: formatRefundParts(refunds),
    })
  }
  return t('admin.sales.voidSuccess')
}
