import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TouchNumpad } from './TouchNumpad'

type Props = {
  value: string | number
  onChange: (next: string) => void
  label?: ReactNode
  className?: string
  min?: number
  max?: number
  maxDigits?: number
  disabled?: boolean
  /**
   * `modal` — overlay keypad (tables / tight cells).
   * `inline` — expands under the field in-flow (forms); fewer taps, live apply.
   */
  mode?: 'modal' | 'inline'
  /** Allow negative values (inventory adjust delta). */
  signed?: boolean
  /** Format committed digits for the trigger button (e.g. money). */
  formatDisplay?: (digits: string) => string
  placeholder?: string
  align?: 'left' | 'center' | 'right'
  /** aria-label for the trigger */
  'aria-label'?: string
}

function normalizeRaw(v: string, signed: boolean): string {
  const t = (v || '').trim()
  const neg = signed && t.startsWith('-')
  const d = t.replace(/\D/g, '') || '0'
  if (neg) return d === '0' ? '-0' : `-${d}`
  return d
}

const inputPreviewCls =
  'w-full min-h-11 pos-short:min-h-10 px-3 py-2 rounded-xl bg-slate-950 border border-slate-600 text-right text-lg font-semibold tabular-nums text-slate-100'

export function NumericNumpadField({
  value,
  onChange,
  label,
  className = '',
  min,
  max,
  maxDigits,
  disabled = false,
  mode = 'modal',
  signed = false,
  formatDisplay,
  placeholder,
  align = 'right',
  'aria-label': ariaLabel,
}: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [localValue, setLocalValue] = useState('0')
  /** Value committed in parent when panel was opened (for before/after + cancel). */
  const [baseline, setBaseline] = useState('0')
  const rootRef = useRef<HTMLDivElement>(null)

  const displayValue = useMemo(() => normalizeRaw(String(value ?? '0'), signed), [value, signed])

  useEffect(() => {
    if (!open) setLocalValue(displayValue)
  }, [displayValue, open])

  useEffect(() => {
    if (!open || mode !== 'inline') return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, mode])

  function clamp(raw: string): string {
    let n = Math.floor(Number(normalizeRaw(raw, signed) || '0'))
    if (!Number.isFinite(n)) n = 0
    if (!signed) n = Math.max(0, n)
    if (Number.isFinite(min)) n = Math.max(Number(min), n)
    if (Number.isFinite(max)) n = Math.min(Number(max), n)
    return String(n)
  }

  function applyAndClose() {
    onChange(clamp(localValue))
    setOpen(false)
  }

  function cancelAndClose() {
    onChange(baseline)
    setOpen(false)
  }

  function openPad() {
    if (disabled) return
    setBaseline(displayValue)
    setLocalValue(displayValue)
    setOpen(true)
  }

  function onPadChange(next: string) {
    const normalized = normalizeRaw(next, signed)
    setLocalValue(normalized)
    if (mode === 'inline') {
      onChange(clamp(normalized))
    }
  }

  const previewRaw = normalizeRaw(localValue, signed)
  const previewApplied = clamp(localValue)
  let triggerText = displayValue
  if (formatDisplay) {
    const formatted = formatDisplay(displayValue)
    triggerText = formatted !== '' ? formatted : placeholder || displayValue
  } else if (displayValue === '0' && placeholder) {
    triggerText = placeholder
  }
  const showPlaceholderStyle =
    Boolean(placeholder) &&
    (displayValue === '0' || (formatDisplay != null && formatDisplay(displayValue) === ''))

  const alignCls = align === 'center' ? 'text-center' : align === 'left' ? 'text-left' : 'text-right'

  const padBody = (
    <>
      <div className="space-y-1.5 pos-short:space-y-1">
        {/* Hide “before” on short POS screens to keep keypad fully visible */}
        <div className="pos-short:hidden space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('common.valueBefore')}</div>
          <div className={inputPreviewCls} aria-readonly>
            {formatDisplay?.(baseline) ?? baseline}
          </div>
        </div>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('common.valueEditing')}</div>
        <div className={`${inputPreviewCls} border-emerald-700/50 ring-1 ring-emerald-500/30`} aria-live="polite">
          {formatDisplay?.(previewRaw) ?? previewRaw}
        </div>
        {previewRaw !== previewApplied && (
          <p className="text-center text-xs text-amber-200/90">{t('common.numpadWillSaveAs', { value: previewApplied })}</p>
        )}
      </div>
      <TouchNumpad
        className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 pos-short:p-2"
        value={previewRaw}
        onChange={onPadChange}
        maxDigits={maxDigits}
        signed={signed}
        compact
        label={label}
      />
      <div className="flex justify-end gap-2 sticky bottom-0 bg-slate-900/95 pt-1">
        {mode === 'modal' && (
          <button
            type="button"
            className="touch-btn min-h-11 pos-short:min-h-10 px-4 rounded-xl bg-slate-800 border border-slate-600"
            onClick={cancelAndClose}
          >
            {t('admin.common.cancel')}
          </button>
        )}
        <button
          type="button"
          className="touch-btn min-h-11 pos-short:min-h-10 px-5 rounded-xl bg-emerald-700 border border-emerald-500 font-medium"
          onClick={applyAndClose}
        >
          {mode === 'inline' ? t('pos.numpadApply') : t('admin.common.save')}
        </button>
      </div>
    </>
  )

  return (
    <div ref={rootRef} className={`relative min-w-0 ${mode === 'inline' ? 'w-full' : ''}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        className={`touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-900 border border-slate-700 tabular-nums disabled:opacity-40 ${alignCls} ${
          open ? 'border-emerald-600 ring-1 ring-emerald-500/40' : ''
        } ${className}`}
        onClick={() => (open ? applyAndClose() : openPad())}
      >
        <span className={showPlaceholderStyle ? 'text-slate-500' : ''}>
          {triggerText}
        </span>
      </button>

      {open && mode === 'inline' && (
        <div className="mt-2 w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-3 space-y-2 shadow-lg kiosk-scrollbar max-h-[min(70dvh,28rem)] overflow-y-auto overscroll-contain">
          {padBody}
        </div>
      )}

      {open && mode === 'modal' && (
        <div
          className="fixed inset-0 z-[80] flex items-end pos-sm:items-center justify-center overflow-y-auto overscroll-contain bg-black/70 p-3 pos-sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={cancelAndClose}
        >
          <div
            className="my-auto w-full max-w-sm max-h-[min(92dvh,92svh)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-3 pos-sm:p-4 space-y-2.5 shadow-xl kiosk-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {padBody}
          </div>
        </div>
      )}
    </div>
  )
}
