/**
 * Node smoke-test for void toast builder (no vitest in repo).
 * Run: node --import tsx  OR compile via esbuild; we use plain JS mirror.
 */
import assert from 'node:assert/strict'

function formatRefundParts(refunds) {
  if (!refunds?.length) return ''
  return refunds.map((r) => `${r.method} ${r.amount}`).join(', ')
}

function buildVoidSuccessMessage(t, result) {
  const refunds = result?.refunds
  const total = result?.return_amount
  const partnerN = result?.reverted_partner_loans?.length ?? 0
  let msg
  if (refunds?.length) {
    msg = t('admin.sales.voidSuccessWithRefund', {
      total: total || '0',
      parts: formatRefundParts(refunds),
    })
  } else {
    msg = t('admin.sales.voidSuccess')
  }
  if (partnerN > 0) {
    msg = `${msg} ${t('admin.sales.voidPartnerReverted', { count: partnerN })}`
  }
  return msg
}

const dict = {
  'admin.sales.voidSuccess': 'VOID_OK',
  'admin.sales.voidSuccessWithRefund': 'VOID {{total}} [{{parts}}]',
  'admin.sales.voidPartnerReverted': 'PARTNER {{count}}',
}

function t(key, opts = {}) {
  let s = dict[key] || key
  for (const [k, v] of Object.entries(opts)) {
    s = s.replace(`{{${k}}}`, String(v))
  }
  return s
}

assert.equal(buildVoidSuccessMessage(t, null), 'VOID_OK')
assert.equal(
  buildVoidSuccessMessage(t, {
    return_amount: '100000',
    refunds: [
      { method: 'DEBT', amount: '60000' },
      { method: 'CASH', amount: '40000' },
    ],
  }),
  'VOID 100000 [DEBT 60000, CASH 40000]',
)
assert.equal(
  buildVoidSuccessMessage(t, {
    return_amount: '200000',
    refunds: [{ method: 'CASH', amount: '200000' }],
    reverted_partner_loans: ['a', 'b'],
  }),
  'VOID 200000 [CASH 200000] PARTNER 2',
)

console.log('voidRefundMessage logic: OK')
