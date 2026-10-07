import { sanitizeDecimalInput } from '../utils/qty'

/** Touch-friendly decimal quantity input (kg may be fractional, e.g. 0.5, 12.25). */
export function DecimalQtyField({
  value,
  onChange,
  disabled = false,
  signed = false,
  placeholder,
  className = '',
  suffix,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  signed?: boolean
  placeholder?: string
  className?: string
  /** Unit label shown next to the field (kg / dona). */
  suffix?: string
  'aria-label'?: string
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className="touch-btn min-h-12 w-full px-3 rounded-xl bg-slate-950 border border-slate-600 text-lg font-medium text-center tabular-nums text-slate-100 disabled:opacity-40"
        value={value}
        onChange={(e) => onChange(sanitizeDecimalInput(e.target.value, signed))}
      />
      {suffix ? <span className="text-sm text-slate-400 shrink-0">{suffix}</span> : null}
    </div>
  )
}
