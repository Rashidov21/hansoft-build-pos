/** Build-materials quantity helpers (dona / kg / m / qop). */

export type ProductUnit = 'dona' | 'kg' | 'm' | 'qop'

export const PRODUCT_UNITS: ProductUnit[] = ['dona', 'kg', 'm', 'qop']

const INTEGER_UNITS = new Set<ProductUnit>(['dona', 'qop'])

/** @deprecated Honey-era constant; fractional min is 0.001 — prefer validateSaleQty. */
export const MIN_KG = 0.001

export function normalizeUnit(unit: unknown): ProductUnit {
  const u = String(unit ?? '')
    .trim()
    .toLowerCase()
  if (u === 'dona' || u === 'kg' || u === 'm' || u === 'qop') return u
  return 'dona'
}

export function isIntegerUnit(unit: ProductUnit): boolean {
  return INTEGER_UNITS.has(unit)
}

export function qtyStep(unit: ProductUnit): number {
  return isIntegerUnit(unit) ? 1 : 0.1
}

export function defaultSaleQty(unit: ProductUnit): number {
  return isIntegerUnit(unit) ? 1 : 0.1
}

export function parseQty(value: unknown): number {
  const n = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1000) / 1000
}

/** Convert UI entry (kg or grams) to stored kg — only meaningful for unit=kg. */
export function toKg(raw: number, inputUnit: 'kg' | 'g'): number {
  if (inputUnit === 'g') return parseQty(raw / 1000)
  return parseQty(raw)
}

export function formatQty(qty: number, unit: ProductUnit = 'dona'): string {
  const q = parseQty(qty)
  if (isIntegerUnit(unit)) return String(Math.round(q))
  return (
    q.toFixed(3).replace(/\.?0+$/, (m) => (m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m)) || '0'
  )
}

export function validateSaleQty(qty: number, unit: ProductUnit): string | null {
  const q = parseQty(qty)
  if (q <= 0) return 'invalid'
  if (isIntegerUnit(unit)) {
    if (!Number.isInteger(q) || q < 1) return 'min_dona'
  } else if (q < 0.001) {
    return 'min_frac'
  }
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
    if (isIntegerUnit(unit)) return buf
    if (buf.includes('.')) return buf
    return `${buf}.`
  }
  if (!/^\d$/.test(key)) return buf
  if (buf === '0') return key
  const parts = buf.split('.')
  if (parts[1] && parts[1].length >= 3) return buf
  return buf + key
}
