import type { ReactNode } from 'react'

const KEYS_UNSIGNED = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', 'Del'] as const
const KEYS_SIGNED = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '±', '0', 'Del'] as const
const KEYS_DECIMAL = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'Del'] as const

type Props = {
  /** Raw digit string (e.g. money integer as string). May include leading `-` when signed. */
  value: string
  onChange: (next: string) => void
  /** Optional label above keys */
  label?: ReactNode
  className?: string
  /** When set, digit keys do not grow the absolute value beyond this many characters (PIN entry). */
  maxDigits?: number
  /** Allow negative values via ± key (inventory delta). */
  signed?: boolean
  /** Allow decimal point (qty in kg). Mutually preferred over signed for qty entry. */
  decimal?: boolean
  /** Slightly shorter keys for 1024×768 / pos-short layouts. */
  compact?: boolean
}

function absDigits(v: string): string {
  return (v || '').replace(/\D/g, '') || '0'
}

function isNeg(v: string): boolean {
  return (v || '').trim().startsWith('-')
}

function compose(neg: boolean, digits: string): string {
  const d = digits.replace(/\D/g, '') || '0'
  if (neg) return d === '0' ? '-0' : `-${d}`
  return d
}

function sanitizeDecimalBuf(raw: string): string {
  let s = (raw || '').replace(',', '.')
  s = s.replace(/[^\d.]/g, '')
  const firstDot = s.indexOf('.')
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '').slice(0, 3)
  }
  if (!s || s === '.') return '0'
  if (s.startsWith('.')) s = `0${s}`
  // strip leading zeros before decimal, keep "0.xxx"
  if (s.includes('.')) {
    const [a, b] = s.split('.')
    const intPart = a.replace(/^0+(?=\d)/, '') || '0'
    return `${intPart}.${b}`
  }
  return s.replace(/^0+(?=\d)/, '') || '0'
}

/** Large on-screen keypad for touch POS (digits + clear + backspace). */
export function TouchNumpad({
  value,
  onChange,
  label,
  className = '',
  maxDigits,
  signed = false,
  decimal = false,
  compact = false,
}: Props) {
  const keys = decimal ? KEYS_DECIMAL : signed ? KEYS_SIGNED : KEYS_UNSIGNED

  function press(k: string) {
    if (decimal) {
      if (k === 'C') {
        onChange('0')
        return
      }
      if (k === 'Del') {
        const cur = value || '0'
        const next = cur.slice(0, -1)
        onChange(next === '' || next === '-' ? '0' : next)
        return
      }
      if (k === '.') {
        const cur = value || '0'
        if (cur.includes('.')) return
        onChange(`${cur}.`)
        return
      }
      const cur = value || '0'
      const next = cur === '0' ? k : `${cur}${k}`
      onChange(sanitizeDecimalBuf(next))
      return
    }

    if (k === 'C') {
      onChange('0')
      return
    }
    if (k === '±') {
      onChange(compose(!isNeg(value), absDigits(value)))
      return
    }
    if (k === 'Del') {
      const dig = absDigits(value)
      const nextDig = dig.slice(0, -1)
      onChange(compose(isNeg(value), nextDig.length ? nextDig : '0'))
      return
    }
    const dig = absDigits(value)
    const nextDig = dig === '0' ? k : `${dig}${k}`
    if (maxDigits != null && nextDig.length > maxDigits) return
    onChange(compose(isNeg(value), nextDig))
  }

  const keyCls = compact
    ? 'touch-btn min-h-11 pos-short:min-h-10 py-2 rounded-xl bg-slate-800 border border-slate-600 text-base font-medium text-slate-100 active:brightness-95'
    : 'touch-btn min-h-12 pos-lg:min-h-14 py-2.5 pos-lg:py-4 rounded-xl bg-slate-800 border border-slate-600 text-lg pos-lg:text-xl font-medium text-slate-100 active:brightness-95'

  return (
    <div className={className}>
      {label != null && <div className="text-sm text-slate-400 mb-2">{label}</div>}
      <div className={`grid grid-cols-3 ${compact ? 'gap-1.5' : 'gap-2'}`}>
        {keys.map((k) => (
          <button key={k} type="button" className={keyCls} onClick={() => press(k)}>
            {k === 'Del' ? '⌫' : k}
          </button>
        ))}
      </div>
    </div>
  )
}
