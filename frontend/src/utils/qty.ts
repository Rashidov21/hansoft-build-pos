/** Honey shop quantity helpers (kg / dona). */

export type ProductUnit = 'kg' | 'dona'

export const MIN_KG = 0.1

export function parseQty(value: unknown): number {
  const n = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1000) / 1000
}

/** Convert UI entry (kg or grams) to stored kg. */
export function toKg(raw: number, inputUnit: 'kg' | 'g'): number {
  if (inputUnit === 'g') return parseQty(raw / 1000)
  return parseQty(raw)
}

export function formatQty(qty: number, unit: ProductUnit = 'kg'): string {
  const q = parseQty(qty)
  if (unit === 'dona') return String(Math.round(q))
  return q.toFixed(3).replace(/\.?0+$/, (m) => (m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m)) || '0'
}

export function validateSaleQty(qty: number, unit: ProductUnit): string | null {
  const q = parseQty(qty)
  if (q <= 0) return 'invalid'
  if (unit === 'kg' && q < MIN_KG) return 'min_kg'
  if (unit === 'dona' && (!Number.isInteger(q) || q < 1)) return 'min_dona'
  return null
}

/** Sanitize free-typed decimal text (comma → dot, max 3 decimals, optional leading minus). */
export function sanitizeDecimalInput(raw: string, signed = false): string {
  let s = (raw || '').replace(',', '.')
  const neg = signed && s.trim().startsWith('-')
  s = s.replace(/[^\d.]/g, '')
  const firstDot = s.indexOf('.')
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '').slice(0, 3)
  }
  return neg ? `-${s}` : s
}

/** Allow typing decimals in qty numpad buffer. */
export function appendQtyDigit(buf: string, key: string, unit: ProductUnit): string {
  if (key === 'C') return '0'
  if (key === '⌫') {
    const next = buf.slice(0, -1)
    return next === '' || next === '-' ? '0' : next
  }
  if (key === '.' || key === ',') {
    if (unit === 'dona') return buf
    if (buf.includes('.')) return buf
    return `${buf}.`
  }
  if (!/^\d$/.test(key)) return buf
  if (buf === '0') return key
  const parts = buf.split('.')
  if (parts[1] && parts[1].length >= 3) return buf
  return buf + key
}
