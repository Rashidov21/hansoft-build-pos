import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type ModelSelectOption = {
  id: string
  label: string
  sublabel?: string
}

type ModelSelectProps = {
  value: string
  onChange: (id: string) => void
  options: ModelSelectOption[]
  disabled?: boolean
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  allowClear?: boolean
  clearLabel?: string
  compact?: boolean
}

export function ModelSelect({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = '—',
  searchPlaceholder = '…',
  emptyMessage = '—',
  className = '',
  allowClear = false,
  clearLabel = '—',
  compact = false,
}: ModelSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel?.toLowerCase().includes(q) ?? false),
    )
  }, [options, query])

  const selected = options.find((o) => o.id === value)
  const showSearch = options.length > 5

  function pick(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 flex-1 ${className}`}>
      <button
        type="button"
        disabled={disabled}
        className={`touch-btn w-full flex items-center justify-between gap-2 disabled:opacity-40 text-left bg-slate-950 border border-slate-700 ${
          compact ? 'min-h-kiosk-touch px-2 rounded text-sm' : 'min-h-14 px-4 rounded-xl text-base'
        }`}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={`truncate ${selected ? 'text-slate-100' : 'text-slate-500'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-[60] top-full left-0 right-0 mt-1 rounded-xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden">
          {showSearch && (
            <div className="p-2 border-b border-slate-800">
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="touch-btn w-full min-h-11 px-3 rounded-lg bg-slate-900 border border-slate-700 text-sm"
              />
            </div>
          )}
          <ul
            className="max-h-52 overflow-y-auto kiosk-scrollbar divide-y divide-slate-800"
            role="listbox"
          >
            {allowClear && (
              <li>
                <button
                  type="button"
                  className="touch-btn w-full min-h-12 text-left px-4 py-2 text-sm text-slate-400 hover:bg-slate-900"
                  onClick={() => pick('')}
                >
                  {clearLabel}
                </button>
              </li>
            )}
            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  className={`touch-btn w-full min-h-12 text-left px-4 py-2 hover:bg-slate-900 active:bg-slate-800 ${
                    o.id === value ? 'bg-slate-900/80 text-emerald-200' : 'text-slate-100'
                  }`}
                  onClick={() => pick(o.id)}
                >
                  <div className="text-sm font-medium truncate">{o.label}</div>
                  {o.sublabel ? (
                    <div className="text-xs text-slate-500 truncate">{o.sublabel}</div>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">{emptyMessage}</p>
          )}
        </div>
      )}
    </div>
  )
}
