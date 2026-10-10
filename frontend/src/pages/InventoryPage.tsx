import { useEffect, useMemo, useState, useCallback, useRef, type RefObject } from 'react'
import {
  fetchLabelEscpos,
  fetchVariants,
  type LabelStickerSize,
  type StocktakeSession,
  type StoreSettings,
  type Variant,
} from '../api'
import { useTranslation } from 'react-i18next'
import { ActionToast } from '../components/ActionToast'
import { DecimalQtyField } from '../components/DecimalQtyField'
import { formatQty, normalizeUnit, parseQty, type ProductUnit } from '../utils/qty'
import { filterVariantsForPicker, stocktakeLineMatchesSearch } from '../utils/variantSearch'
import { dispatchLabel } from '../utils/printingHub'
import { isPrinterError, translatePrinterError } from '../utils/printerErrors'

const LABEL_SIZE_OPTIONS: LabelStickerSize[] = ['30x20', '40x30', '40x50', '50x40', '58mm']

type InventoryMode = 'receive' | 'adjust' | 'stocktake'

function isVariantPickable(v: Variant): boolean {
  return v.is_active && v.deleted_at == null
}

function VariantSearchPicker(props: {
  variants: Variant[]
  variantId: string
  onSelect: (id: string) => void
  langRu: boolean
  /** Increment after save to clear query and refocus for next SKU. */
  resetToken?: number
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  const { t } = useTranslation()
  const { variants, variantId, onSelect, langRu, resetToken = 0, inputRef } = props
  const [q, setQ] = useState('')
  const [apiHits, setApiHits] = useState<Variant[] | null>(null)
  const [searching, setSearching] = useState(false)
  const localInputRef = useRef<HTMLInputElement>(null)
  const searchRef = inputRef ?? localInputRef

  const pool = apiHits ?? variants

  const filtered = useMemo(() => filterVariantsForPicker(pool, q, 24), [pool, q])

  useEffect(() => {
    if (resetToken === 0) return
    setQ('')
    setApiHits(null)
    const id = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [resetToken, searchRef])

  useEffect(() => {
    searchRef.current?.focus()
  }, [searchRef])

  useEffect(() => {
    const tq = q.trim()
    if (tq.length < 2) {
      setApiHits(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      void fetchVariants({ q: tq, page: 1, pageSize: 50, ordering: 'name' })
        .then((res) => {
          if (!cancelled) setApiHits(res.results.filter(isVariantPickable))
        })
        .catch(() => {
          if (!cancelled) setApiHits(null)
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [q])

  useEffect(() => {
    const tq = q.trim()
    if (tq.length < 3) return
    const exact = pool.find((v) => isVariantPickable(v) && v.barcode && v.barcode.toLowerCase() === tq.toLowerCase())
    if (exact && exact.id !== variantId) onSelect(exact.id)
  }, [q, pool, variantId, onSelect])

  const picked =
    variants.find((v) => v.id === variantId) ?? pool.find((v) => v.id === variantId) ?? null

  return (
    <div className="space-y-3">
      <label className="block text-xs text-slate-400">
        <span className="block mb-1 font-medium text-slate-300">{t('admin.inventory.barcodeSearch')}</span>
        <input
          ref={searchRef}
          type="text"
          inputMode="search"
          autoComplete="off"
          autoFocus
          className="touch-btn w-full min-h-[3rem] px-4 text-lg rounded-xl bg-slate-950 border border-slate-700"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.inventory.searchPlaceholder')}
        />
      </label>
      {!picked ? (
        <p className="text-xs text-amber-200/90">{t('admin.inventory.pickFromListHint')}</p>
      ) : (
        <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-3">
          <div className="flex justify-between gap-2 items-start">
            <div>
              <div className="text-base font-semibold text-slate-100">{picked ? pickProductName(picked, langRu) : ''}</div>
              <div className="text-sm text-slate-400 mt-1">
                {t('admin.catalog.barcode')}: <span className="text-slate-200 font-mono">{picked.barcode ?? '—'}</span>
              </div>
              <div className="text-sm text-slate-400">
                {t('admin.inventory.currentStock')}:{' '}
                <span className="font-semibold text-slate-100 tabular-nums">{stockLabel(picked)}</span>
              </div>
            </div>
            <button
              type="button"
              className="touch-btn shrink-0 text-sm px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
              onClick={() => {
                setQ('')
                onSelect('')
                window.setTimeout(() => searchRef.current?.focus(), 0)
              }}
            >
              {t('admin.inventory.changePick')}
            </button>
          </div>
        </div>
      )}
      {searching && q.trim().length >= 2 && (
        <p className="text-xs text-slate-500">{t('admin.common.loading')}</p>
      )}
      {!picked && filtered.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">{t('admin.inventory.tapPick')}</div>
          <ul className="max-h-52 overflow-y-auto kiosk-scrollbar rounded-xl border border-slate-800 divide-y divide-slate-800">
            {filtered.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="w-full text-left p-3 min-h-[3rem] hover:bg-slate-800/80 active:bg-slate-800 transition-colors"
                  onClick={() => onSelect(v.id)}
                >
                  <div className="font-medium">{pickProductName(v, langRu)}</div>
                  {pickCategoryName(v, langRu) && !/^category$/i.test(pickCategoryName(v, langRu)) ? (
                    <div className="text-xs text-slate-500">{pickCategoryName(v, langRu)}</div>
                  ) : null}
                  <div className="text-xs text-slate-400">
                    <span className="font-mono">{v.barcode ?? '—'}</span>
                    {' · '}
                    <span className="tabular-nums">{stockLabel(v)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!picked && !searching && q.trim().length >= 2 && filtered.length === 0 && (
        <div className="space-y-1">
          <p className="text-sm text-slate-500">{t('admin.inventory.noneFound')}</p>
          <p className="text-sm text-amber-200/90">{t('admin.inventory.newProductHint')}</p>
        </div>
      )}
    </div>
  )
}

function pickProductName(v: Variant, langRu: boolean): string {
  if (langRu && (v.product_name_ru ?? '').trim()) return v.product_name_ru!.trim()
  return (v.product_name_uz ?? '').trim() || (v.product_name_ru ?? '').trim() || '—'
}

function pickCategoryName(v: Variant, langRu: boolean): string {
  if (langRu && (v.category_name_ru ?? '').trim()) return v.category_name_ru!.trim()
  return (v.category_name_uz ?? '').trim() || (v.category_name_ru ?? '').trim() || ''
}

function unitOf(v: Pick<Variant, 'unit'> | null | undefined): ProductUnit {
  return normalizeUnit(v?.unit)
}

function stockLabel(v: Variant): string {
  return `${formatQty(Number(v.stock_qty ?? 0), unitOf(v))} ${unitOf(v)}`
}

function QtyStepper(props: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  unit?: ProductUnit
}) {
  const { t } = useTranslation()
  const { value, onChange, disabled, unit = 'kg' } = props
  const safe = parseQty(value || '0')
  const set = (x: number) => onChange(String(parseQty(x)))
  const steps = unit === 'kg' ? [0.5, 1, 5, 10] : [1, 5, 10]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {steps.map((d) => (
          <button
            key={`p${d}`}
            type="button"
            disabled={disabled}
            className="touch-btn flex-1 min-h-12 min-w-[4.5rem] px-4 rounded-xl bg-slate-800 border border-slate-600 font-semibold disabled:opacity-40"
            onClick={() => set(Math.max(0, safe + d))}
          >
            +{d}
          </button>
        ))}
      </div>
      <DecimalQtyField
        value={value}
        onChange={onChange}
        disabled={disabled}
        suffix={unit}
        className="max-w-sm"
        aria-label={t('admin.inventory.qty')}
      />
    </div>
  )
}

function DeltaStepper(props: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  unit?: ProductUnit
}) {
  const { value, onChange, disabled, unit = 'kg' } = props
  const safe = parseQty(value || '0')
  const set = (x: number) => onChange(String(parseQty(x)))
  const steps = unit === 'kg' ? [-1, -0.5, 0.5, 1] : [-5, -1, 1, 5]

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {steps.map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled}
            className="touch-btn min-h-12 px-3 rounded-xl bg-slate-800 border border-slate-600 font-semibold disabled:opacity-40"
            onClick={() => set(safe + d)}
          >
            {d > 0 ? `+${d}` : `${d}`}
          </button>
        ))}
      </div>
      <DecimalQtyField
        value={value}
        onChange={onChange}
        disabled={disabled}
        signed
        suffix={unit}
        className="max-w-sm"
      />
    </div>
  )
}

export function InventoryPage({
  variants,
  stocktake,
  onReceive,
  onAdjust,
  onCreateStocktake,
  onReloadOpen,
  onSetCount,
  onApplyStocktake,
  embedded = false,
  settings = null,
}: {
  variants: Variant[]
  stocktake: StocktakeSession | null
  onReceive: (variantId: string, qty: number, note: string) => Promise<void>
  onAdjust: (variantId: string, qtyDelta: number, note: string) => Promise<void>
  onCreateStocktake: (note: string) => Promise<void>
  onReloadOpen: () => Promise<void>
  onSetCount: (variantId: string, countedQty: number) => Promise<void>
  onApplyStocktake: () => Promise<void>
  /** Hide outer title when shown inside Warehouse hub */
  embedded?: boolean
  settings?: StoreSettings | null
}) {
  const { t, i18n } = useTranslation()
  const langRu = i18n.language.startsWith('ru')
  const [mode, setMode] = useState<InventoryMode>('receive')
  const [variantId, setVariantId] = useState('')
  const [qty, setQty] = useState('1')
  const [qtyDelta, setQtyDelta] = useState('0')
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [searchResetToken, setSearchResetToken] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [stocktakeNote, setStocktakeNote] = useState('')
  const [stocktakeBarcodeFilter, setStocktakeBarcodeFilter] = useState('')
  const [countByVariant, setCountByVariant] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err' | 'info'; message: string } | null>(null)
  const [labelPrompt, setLabelPrompt] = useState<{
    variant: Variant
    copies: string
    size: LabelStickerSize
  } | null>(null)
  const [labelBusy, setLabelBusy] = useState(false)

  const selectedVariant = useMemo(() => variants.find((v) => v.id === variantId) || null, [variants, variantId])
  const receiveQty = parseQty(qty || '0')
  const adjustQty = parseQty(qtyDelta || '0')
  const receiveAfterQty = selectedVariant
    ? parseQty(Number(selectedVariant.stock_qty ?? 0) + (Number.isFinite(receiveQty) ? Math.max(0, receiveQty) : 0))
    : null
  const adjustAfterQty = selectedVariant
    ? parseQty(Number(selectedVariant.stock_qty ?? 0) + (Number.isFinite(adjustQty) ? adjustQty : 0))
    : null
  const receiveAfter =
    receiveAfterQty != null && selectedVariant
      ? `${formatQty(receiveAfterQty, unitOf(selectedVariant))} ${unitOf(selectedVariant)}`
      : null
  const adjustAfter =
    adjustAfterQty != null && selectedVariant
      ? `${formatQty(adjustAfterQty, unitOf(selectedVariant))} ${unitOf(selectedVariant)}`
      : null

  const stocktakeLinesFiltered = useMemo(() => {
    if (!stocktake) return []
    const n = stocktakeBarcodeFilter.trim()
    if (!n) return stocktake.lines
    return stocktake.lines.filter((ln) => stocktakeLineMatchesSearch(ln, n))
  }, [stocktake, stocktakeBarcodeFilter])

  const onSelectVariant = useCallback((id: string) => {
    setVariantId(id)
  }, [])

  function resetReceiveForm() {
    setVariantId('')
    setQty('1')
    setQtyDelta('0')
    setNote('')
    setNoteOpen(false)
    setSearchResetToken((n) => n + 1)
  }

  function defaultLabelSize(): LabelStickerSize {
    const raw = settings?.default_label_size
    return LABEL_SIZE_OPTIONS.includes(raw as LabelStickerSize)
      ? (raw as LabelStickerSize)
      : '40x30'
  }

  function suggestedLabelCopies(variant: Variant, receivedQty: number): number {
    const unit = unitOf(variant)
    if (unit === 'dona' || unit === 'qop') {
      return Math.min(200, Math.max(1, Math.floor(receivedQty)))
    }
    return 1
  }

  function closeLabelPrompt() {
    setLabelPrompt(null)
    resetReceiveForm()
  }

  async function printReceiveLabels() {
    if (!labelPrompt) return
    const barcode = (labelPrompt.variant.barcode || '').trim()
    if (!barcode) {
      setToast({ kind: 'err', message: t('admin.catalog.noBarcode') })
      return
    }
    const copies = Math.max(1, Math.min(200, Math.floor(Number(labelPrompt.copies) || 0)))
    if (!Number.isFinite(copies) || copies < 1) {
      setToast({ kind: 'err', message: t('admin.catalog.copiesInvalid') })
      return
    }
    setLabelBusy(true)
    try {
      const out = await fetchLabelEscpos(labelPrompt.variant.id, labelPrompt.size, copies, true)
      const b64 = (out.raw_base64 || out.escpos_base64 || '').trim()
      if (!b64) throw new Error(t('err.LABEL_PRINT_FAILED'))
      await dispatchLabel(b64, settings)
      setToast({ kind: 'ok', message: t('admin.catalog.printLabelOk', { count: copies }) })
      closeLabelPrompt()
    } catch (e: unknown) {
      const rawMessage = e instanceof Error ? e.message : String(e || '')
      if (isPrinterError(rawMessage)) {
        setToast({ kind: 'err', message: translatePrinterError(rawMessage) })
      } else {
        const code = (e as Error & { code?: string }).code
        setToast({
          kind: 'err',
          message: code ? t(`err.${code}`, { defaultValue: rawMessage }) : rawMessage || t('err.LABEL_PRINT_FAILED'),
        })
      }
    } finally {
      setLabelBusy(false)
    }
  }

  async function runAction(fn: () => Promise<void>, okMessage: string, opts?: { resetForm?: boolean }) {
    setBusy(true)
    setToast(null)
    try {
      await fn()
      setToast({ kind: 'ok', message: okMessage })
      if (opts?.resetForm) resetReceiveForm()
    } catch (e: unknown) {
      const code = (e as Error & { code?: string }).code
      setToast({ kind: 'err', message: t(`err.${code || 'API_ERROR'}`) })
    } finally {
      setBusy(false)
    }
  }

  async function submitReceive() {
    const v = selectedVariant
    const qtyToReceive = Math.max(0, receiveQty)
    if (!v || qtyToReceive <= 0) return
    setBusy(true)
    setToast(null)
    try {
      await onReceive(v.id, qtyToReceive, note)
      setToast({ kind: 'ok', message: t('admin.inventory.receiveSuccess') })
      const canOfferLabel =
        settings?.label_printing_enabled !== false && Boolean((v.barcode || '').trim())
      if (canOfferLabel) {
        setLabelPrompt({
          variant: v,
          copies: String(suggestedLabelCopies(v, qtyToReceive)),
          size: defaultLabelSize(),
        })
      } else {
        resetReceiveForm()
      }
    } catch (e: unknown) {
      const code = (e as Error & { code?: string }).code
      setToast({ kind: 'err', message: t(`err.${code || 'API_ERROR'}`) })
    } finally {
      setBusy(false)
    }
  }

  const modeTabs: { id: InventoryMode; label: string; desc: string }[] = [
    { id: 'receive', label: t('admin.inventory.modeReceiveShort'), desc: t('admin.inventory.receiveHint') },
    { id: 'adjust', label: t('admin.inventory.modeAdjustShort'), desc: t('admin.inventory.adjustHint') },
    { id: 'stocktake', label: t('admin.inventory.modeStocktakeShort'), desc: t('admin.inventory.stocktakeHint') },
  ]

  return (
    <div className={`p-4 space-y-4 max-w-4xl mx-auto ${embedded ? 'pt-0' : ''}`}>
      {!embedded && (
        <>
          <h2 className="text-xl font-semibold">{t('admin.inventory.title')}</h2>
          <p className="text-sm text-slate-300">{t('admin.inventory.intro')}</p>
        </>
      )}
      {embedded && <p className="text-sm text-slate-300">{t('admin.inventory.intro')}</p>}
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-300 space-y-1">
        {mode === 'receive' && (
          <>
            <div>
              <span className="font-medium text-emerald-400">1)</span> {t('admin.inventory.stepsReceive')}
            </div>
            <p className="text-xs text-slate-500">{t('admin.inventory.existingVsNewHint')}</p>
          </>
        )}
        {mode === 'adjust' && (
          <>
            <span className="font-medium text-amber-400">1)</span> {t('admin.inventory.stepsAdjust')}
          </>
        )}
        {mode === 'stocktake' && (
          <>
            <span className="font-medium text-sky-400">1)</span> {t('admin.inventory.stepsStocktake')}
          </>
        )}
      </div>
      {toast && <ActionToast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {modeTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`touch-btn min-h-[3.5rem] px-4 py-3 rounded-xl border text-left transition-colors ${
              mode === tab.id
                ? 'bg-emerald-900/70 border-emerald-500 ring-2 ring-emerald-500/50'
                : 'bg-slate-900/80 border-slate-700 hover:bg-slate-800/80'
            }`}
            onClick={() => {
              setMode(tab.id)
              setNoteOpen(false)
            }}
          >
            <div className="font-semibold">{tab.label}</div>
            <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{tab.desc}</div>
          </button>
        ))}
      </div>

      {(mode === 'receive' || mode === 'adjust') && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-4">
          <VariantSearchPicker
            variants={variants}
            variantId={variantId}
            onSelect={onSelectVariant}
            langRu={langRu}
            resetToken={searchResetToken}
            inputRef={searchInputRef}
          />

          {mode === 'receive' && (
            <>
              <div>
                <label className="block text-xs text-slate-400 mb-2 font-medium">{t('admin.inventory.howMuchArrived')}</label>
                <QtyStepper value={qty} onChange={setQty} disabled={busy || !variantId} unit={unitOf(selectedVariant)} />
              </div>
              {selectedVariant && (
                <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-3 text-base text-slate-200 space-y-1">
                  <div>
                    {t('admin.inventory.currentStock')}:{' '}
                    <span className="font-semibold tabular-nums">{stockLabel(selectedVariant)}</span>
                  </div>
                  <div>
                    {t('admin.inventory.nextStock')}:{' '}
                    <span className="font-semibold text-emerald-300 tabular-nums">{receiveAfter}</span>
                  </div>
                </div>
              )}
              {!noteOpen ? (
                <button
                  type="button"
                  className="touch-btn text-sm min-h-11 px-3 rounded-xl bg-slate-800 border border-slate-600 text-slate-300"
                  onClick={() => setNoteOpen(true)}
                >
                  {t('admin.inventory.addNote')}
                </button>
              ) : (
                <input
                  className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('admin.inventory.noteOptional')}
                  autoFocus
                />
              )}
              <button
                type="button"
                disabled={busy || !variantId || receiveQty <= 0}
                className="touch-btn w-full min-h-14 text-lg py-3 rounded-xl bg-emerald-700 border border-emerald-500 disabled:opacity-40 font-semibold"
                onClick={() => void submitReceive()}
              >
                {t('admin.inventory.receiveAction')}
              </button>
            </>
          )}

          {mode === 'adjust' && (
            <>
              <div>
                <label className="block text-xs text-slate-400 mb-2 font-medium">{t('admin.inventory.howMuchChange')}</label>
                <p className="text-xs text-slate-500 mb-2">{t('admin.inventory.deltaExplain')}</p>
                <DeltaStepper value={qtyDelta} onChange={setQtyDelta} disabled={busy || !variantId} unit={unitOf(selectedVariant)} />
              </div>
              {selectedVariant && (
                <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-3 text-base text-slate-200 space-y-1">
                  <div>
                    {t('admin.inventory.currentStock')}:{' '}
                    <span className="font-semibold tabular-nums">{stockLabel(selectedVariant)}</span>
                  </div>
                  <div>
                    {t('admin.inventory.nextStock')}:{' '}
                    <span
                      className={`font-semibold tabular-nums ${
                        adjustAfterQty != null && adjustAfterQty < 0 ? 'text-red-400' : 'text-amber-200'
                      }`}
                    >
                      {adjustAfter}
                    </span>
                  </div>
                  {adjustAfterQty != null && adjustAfterQty < 0 && (
                    <p className="text-sm text-red-300">{t('admin.inventory.negativeStockWarn')}</p>
                  )}
                </div>
              )}
              {!noteOpen ? (
                <button
                  type="button"
                  className="touch-btn text-sm min-h-11 px-3 rounded-xl bg-slate-800 border border-slate-600 text-slate-300"
                  onClick={() => setNoteOpen(true)}
                >
                  {t('admin.inventory.addNote')}
                </button>
              ) : (
                <input
                  className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('admin.inventory.noteWhy')}
                  autoFocus
                />
              )}
              <button
                type="button"
                disabled={busy || !variantId || adjustQty === 0}
                className="touch-btn w-full min-h-14 text-lg py-3 rounded-xl bg-amber-700 border border-amber-500 disabled:opacity-40 font-semibold"
                onClick={() =>
                  void runAction(() => onAdjust(variantId, adjustQty, note), t('admin.inventory.adjustSuccess'), {
                    resetForm: true,
                  })
                }
              >
                {t('admin.inventory.adjustAction')}
              </button>
            </>
          )}
        </div>
      )}

      {mode === 'stocktake' && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-4">
          <div>
            <h3 className="font-semibold text-lg">{t('admin.settings.stocktakeTitle')}</h3>
            <p className="text-sm text-slate-400 mt-1">{t('admin.inventory.stocktakeSimple')}</p>
          </div>
          {!stocktake && (
            <div className="space-y-3">
              <input
                className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
                value={stocktakeNote}
                onChange={(e) => setStocktakeNote(e.target.value)}
                placeholder={t('admin.settings.sessionNote')}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="touch-btn flex-1 min-h-14 px-4 rounded-xl bg-emerald-700 border border-emerald-500 font-semibold"
                  onClick={() =>
                    void runAction(() => onCreateStocktake(stocktakeNote), t('admin.inventory.stocktakeStarted'))
                  }
                >
                  {t('admin.settings.stocktakeStart')}
                </button>
                <button
                  type="button"
                  className="touch-btn flex-1 min-h-14 px-4 rounded-xl bg-slate-800 border border-slate-700 font-medium"
                  onClick={() => void runAction(() => onReloadOpen(), t('admin.settings.stocktakeReload'))}
                >
                  {t('admin.settings.reopenSession')}
                </button>
              </div>
            </div>
          )}
          {stocktake && (
            <div className="space-y-3">
              <div className="text-sm text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  {t('admin.settings.session')}: {stocktake.id.slice(0, 8)}
                </span>
                <span>|</span>
                <span>{t(`status.${stocktake.status}`)}</span>
              </div>
              <label className="block text-xs text-slate-400">
                {t('admin.inventory.stocktakeFilter')}
                <input
                  type="search"
                  className="touch-btn mt-1 w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
                  value={stocktakeBarcodeFilter}
                  onChange={(e) => setStocktakeBarcodeFilter(e.target.value)}
                  placeholder={t('admin.inventory.searchPlaceholder')}
                />
              </label>
              <div className="max-h-[min(28rem,60vh)] overflow-auto kiosk-scrollbar rounded-xl border border-slate-800">
                {/* Compact cards on short / narrow POS; full table on larger screens */}
                <div className="pos-lg:hidden divide-y divide-slate-800">
                  {stocktakeLinesFiltered.map((ln) => {
                    const name = langRu
                      ? (ln as typeof ln & { product_name_ru?: string }).product_name_ru || ln.product_name_uz
                      : ln.product_name_uz
                    return (
                      <div key={ln.id} className="p-3 space-y-2">
                        <div className="font-medium text-slate-100">{name}</div>
                        <div className="flex flex-wrap gap-3 text-sm">
                          <span>
                            {t('admin.inventory.inComputer')}:{' '}
                            <span className="tabular-nums font-semibold">{ln.expected_qty}</span>
                          </span>
                          <span>
                            {t('admin.inventory.youCounted')}:{' '}
                            <span className="tabular-nums font-semibold">{ln.counted_qty ?? '—'}</span>
                          </span>
                          <span
                            className={`tabular-nums font-medium ${
                              ln.variance_qty === 0
                                ? 'text-slate-500'
                                : ln.variance_qty > 0
                                  ? 'text-emerald-400'
                                  : 'text-red-400'
                            }`}
                          >
                            {t('admin.inventory.difference')}: {ln.variance_qty}
                          </span>
                        </div>
                        <div className="flex flex-col gap-2 max-w-xs">
                          <DecimalQtyField
                            value={countByVariant[ln.variant] ?? '0'}
                            onChange={(v) => setCountByVariant((p) => ({ ...p, [ln.variant]: v }))}
                            placeholder={t('admin.settings.qty')}
                          />
                          <button
                            type="button"
                            className="touch-btn min-h-12 px-4 rounded-xl bg-slate-700 border border-slate-600 font-semibold"
                            onClick={() =>
                              void runAction(
                                () => onSetCount(ln.variant, parseQty(countByVariant[ln.variant] || '0')),
                                t('admin.inventory.stocktakeCountSaved'),
                              )
                            }
                          >
                            {t('admin.common.save')}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <table className="hidden pos-lg:table w-full text-sm min-w-0">
                  <thead className="bg-slate-900 text-slate-400 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-3">{t('admin.catalog.product')}</th>
                      <th className="text-left p-3 hidden xl:table-cell">{t('admin.catalog.customName')}</th>
                      <th className="text-right p-3 whitespace-nowrap">{t('admin.inventory.inComputer')}</th>
                      <th className="text-right p-3 whitespace-nowrap">{t('admin.inventory.youCounted')}</th>
                      <th className="text-right p-3 whitespace-nowrap">{t('admin.inventory.difference')}</th>
                      <th className="text-right p-3 min-w-[10rem]">{t('admin.inventory.enterCount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stocktakeLinesFiltered.map((ln) => (
                      <tr key={ln.id} className="border-t border-slate-800 align-top">
                        <td className="p-3">
                          {langRu
                            ? (ln as typeof ln & { product_name_ru?: string }).product_name_ru || ln.product_name_uz
                            : ln.product_name_uz}
                        </td>
                        <td className="p-3 text-slate-300 hidden xl:table-cell">
                          {langRu
                            ? (ln as typeof ln & { product_custom_name_ru?: string }).product_custom_name_ru || '-'
                            : (ln as typeof ln & { product_custom_name_uz?: string }).product_custom_name_uz || '-'}
                        </td>
                        <td className="p-3 text-right tabular-nums text-slate-300">{ln.expected_qty}</td>
                        <td className="p-3 text-right tabular-nums">{ln.counted_qty ?? '—'}</td>
                        <td
                          className={`p-3 text-right tabular-nums font-medium ${
                            ln.variance_qty === 0
                              ? 'text-slate-500'
                              : ln.variance_qty > 0
                                ? 'text-emerald-400'
                                : 'text-red-400'
                          }`}
                        >
                          {ln.variance_qty}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex flex-col gap-2 items-stretch min-w-0 max-w-xs ml-auto">
                            <DecimalQtyField
                              value={countByVariant[ln.variant] ?? '0'}
                              onChange={(v) => setCountByVariant((p) => ({ ...p, [ln.variant]: v }))}
                              placeholder={t('admin.settings.qty')}
                            />
                            <button
                              type="button"
                              className="touch-btn min-h-12 px-4 rounded-xl bg-slate-700 border border-slate-600 font-semibold whitespace-nowrap"
                              onClick={() =>
                                void runAction(
                                  () => onSetCount(ln.variant, parseQty(countByVariant[ln.variant] || '0')),
                                  t('admin.inventory.stocktakeCountSaved'),
                                )
                              }
                            >
                              {t('admin.common.save')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {stocktakeBarcodeFilter.trim() && stocktakeLinesFiltered.length === 0 && (
                <p className="text-sm text-slate-500">{t('admin.inventory.noneFound')}</p>
              )}
              {stocktake.status === 'OPEN' && (
                <button
                  type="button"
                  className="touch-btn min-h-14 px-6 rounded-xl bg-amber-700 border border-amber-500 text-lg font-semibold"
                  onClick={() => void runAction(() => onApplyStocktake(), t('admin.inventory.stocktakeApplied'))}
                >
                  {t('admin.settings.applyVariance')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {labelPrompt && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">{t('admin.inventory.printLabelsTitle')}</h3>
            <p className="text-sm text-slate-300">
              {pickProductName(labelPrompt.variant, langRu)}
            </p>
            <p className="text-xs text-slate-400">{t('admin.inventory.printLabelsHint')}</p>
            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">{t('admin.catalog.labelSize')}</span>
              <select
                className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
                value={labelPrompt.size}
                onChange={(e) =>
                  setLabelPrompt({
                    ...labelPrompt,
                    size: e.target.value as LabelStickerSize,
                  })
                }
              >
                {LABEL_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {t(`admin.settings.labelSize.${size}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">{t('admin.catalog.copies')}</span>
              <input
                className="touch-btn w-full min-h-12 px-3 rounded-xl bg-slate-950 border border-slate-700"
                type="number"
                min={1}
                max={200}
                value={labelPrompt.copies}
                onChange={(e) =>
                  setLabelPrompt({
                    ...labelPrompt,
                    copies: e.target.value.replace(/\D/g, '').slice(0, 3),
                  })
                }
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-600"
                disabled={labelBusy}
                onClick={() => closeLabelPrompt()}
              >
                {t('admin.inventory.printLabelsSkip')}
              </button>
              <button
                type="button"
                className="touch-btn min-h-12 px-4 rounded-xl bg-emerald-700 border border-emerald-500 font-semibold disabled:opacity-50"
                disabled={labelBusy}
                onClick={() => void printReceiveLabels()}
              >
                {labelBusy ? t('admin.common.loading') : t('admin.catalog.printLabel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
