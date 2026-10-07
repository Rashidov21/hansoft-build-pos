/**
 * Deterministic idempotency input for POST /api/sales/complete/.
 * Backend Sale.idempotency_key max_length=64 — SHA-256 hex fits exactly.
 *
 * `generation` bumps only after a successful complete on the client so two
 * different sales with identical lines/payments still get distinct keys.
 */
export type SaleCompleteLine = {
  variant_id: string
  qty: number
  line_discount: string
  is_bonus?: boolean
}
export type SaleCompletePayment = { method: string; amount: string; card_bank?: string }

export function buildCompleteSaleFingerprintInput(opts: {
  generation: number
  lines: SaleCompleteLine[]
  payments: SaleCompletePayment[]
  order_discount: string
  expected_grand_total: string
  debt_due_date: string | null
  debt_installment_months?: number | null
  customer?: { name: string; phone_normalized: string }
}): string {
  const sortedLines = [...opts.lines]
    .map((l) => ({
      variant_id: l.variant_id,
      qty: l.qty,
      line_discount: l.line_discount,
      ...(l.is_bonus ? { is_bonus: true } : {}),
    }))
    .sort((a, b) => {
      const v = a.variant_id.localeCompare(b.variant_id)
      if (v !== 0) return v
      return Number(Boolean(a.is_bonus)) - Number(Boolean(b.is_bonus))
    })

  const sortedPays = [...opts.payments]
    .map((p) => ({
      method: p.method,
      amount: p.amount,
      ...(p.card_bank ? { card_bank: p.card_bank } : {}),
    }))
    .sort((a, b) => {
      const m = a.method.localeCompare(b.method)
      if (m !== 0) return m
      const bank = String(a.card_bank || '').localeCompare(String(b.card_bank || ''))
      if (bank !== 0) return bank
      return a.amount.localeCompare(b.amount)
    })

  const doc = {
    g: opts.generation,
    lines: sortedLines,
    payments: sortedPays,
    od: opts.order_discount,
    egt: opts.expected_grand_total,
    dd: opts.debt_due_date,
    ...(opts.debt_installment_months != null
      ? { dim: opts.debt_installment_months }
      : {}),
    c: opts.customer
      ? { n: opts.customer.name.trim(), p: opts.customer.phone_normalized.trim() }
      : null,
  }

  return JSON.stringify(doc)
}

export async function hashSaleIdempotencyKey64(canonical: string): Promise<string> {
  const data = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex.slice(0, 64)
}
