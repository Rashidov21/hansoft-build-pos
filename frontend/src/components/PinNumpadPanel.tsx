import type { ReactNode } from 'react'
import { TouchNumpad } from './TouchNumpad'

type Props = {
  /** Raw digit string (empty allowed). */
  pin: string
  setPin: (next: string) => void
  pinLength?: number
  label?: ReactNode
  className?: string
}

/** PIN dots + same TouchNumpad as POS quantity / money flows. */
export function PinNumpadPanel({ pin, setPin, pinLength = 4, label, className = '' }: Props) {
  const digits = (pin || '').replace(/\D/g, '').slice(0, pinLength)
  const numpadValue = digits.length ? digits : '0'

  function onNumpadChange(next: string) {
    const raw = next === '0' ? '' : next.replace(/\D/g, '').slice(0, pinLength)
    setPin(raw)
  }

  return (
    <div className={`space-y-2 pos-short:space-y-1.5 pos-lg:space-y-3 ${className}`}>
      <div className="flex justify-center gap-2.5 pos-short:gap-2 py-0.5" aria-hidden>
        {Array.from({ length: pinLength }, (_, i) => (
          <span
            key={i}
            className={`h-4 w-4 pos-short:h-3.5 pos-short:w-3.5 rounded-full border-2 ${
              i < digits.length ? 'bg-emerald-500 border-emerald-400' : 'border-slate-600 bg-slate-900'
            }`}
          />
        ))}
      </div>
      <TouchNumpad
        label={label}
        maxDigits={pinLength}
        className="rounded-xl border border-slate-800 bg-slate-950 p-2 pos-short:p-2 pos-lg:p-3"
        value={numpadValue}
        onChange={onNumpadChange}
      />
    </div>
  )
}
