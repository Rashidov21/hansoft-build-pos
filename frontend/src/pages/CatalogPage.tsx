import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreVertical, PackagePlus, Pencil, Power, Trash2, Tags, RotateCcw, Plus } from 'lucide-react'
import {
  fetchLabelEscpos,
  fetchLabelQueueEscpos,
  fetchVariantByBarcode,
  type BulkGridCell,
  type Category,
  type LabelStickerSize,
  type Product,
  type ProductCategory,
  type StoreSettings,
  type Variant,
} from '../api'
import { formatMoney } from '../utils/money'
import {
  formatQty,
  isIntegerUnit,
  normalizeUnit,
  parseQty,
  PRODUCT_UNITS,
  type ProductUnit,
} from '../utils/qty'
import { ActionToast } from '../components/ActionToast'
import { ConfirmModal } from '../components/ConfirmModal'
import { dispatchLabel } from '../utils/printingHub'
import { isPrinterError, translatePrinterError } from '../utils/printerErrors'

const LABEL_SIZE_OPTIONS: LabelStickerSize[] = ['30x20', '40x30', '40x50', '50x40', '58mm']

const INPUT_CLS =
  'min-h-12 w-full rounded-xl bg-slate-950 border border-slate-600 px-3 text-base text-slate-100 placeholder:text-slate-500'
const BTN_CLS = 'touch-btn min-h-12 px-4 rounded-xl border text-sm font-medium'
const BTN_PRIMARY = `${BTN_CLS} bg-emerald-700 border-emerald-500 text-white disabled:opacity-50`
const BTN_NEUTRAL = `${BTN_CLS} bg-slate-800 border-slate-600 text-slate-100`

const GRID =
  'grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1.4fr)_minmax(0,1fr)_5rem_minmax(7rem,9rem)_minmax(6.5rem,8rem)_minmax(6.5rem,8rem)_3.25rem] items-center'

type CreateForm = {
  productCategory: string
  name: string
  barcode: string
  unit: ProductUnit
  purchase: string
  list: string
  wholesale: string
  qty: string
}

const EMPTY_FORM: CreateForm = {
  productCategory: '',
  name: '',
  barcode: '',
  unit: 'dona',
  purchase: '',
  list: '',
  wholesale: '',
  qty: '',
}

function digitsOnly(v: string): string {
  return (v || '').replace(/\D/g, '')
}

function variantUnit(v: Pick<Variant, 'unit'>): ProductUnit {
  return normalizeUnit(v.unit)
}

export function CatalogPage({
  categories,
  productCategories,
  variants,
  count,
  includeDeleted,
  setIncludeDeleted,
  page,
  onCreateVariantBulk,
  onCreateCategory,
  onCreateProduct,
  onUpdateProduct,
  onCreateProductCategory,
  onUpdateProductCategory,
  onDeleteProductCategory,
  onDeleteProduct,
  onRestoreProductCategory,
  onRestoreProduct,
  onRestoreVariant,
  onAdjustStockQuick,
  onToggleVariant,
  onUpdateVariant,
  onFilter,
  onPage,
  ordering,
  onFacetsChange,
  settings,
}: {
  categories: Category[]
  productCategories: ProductCategory[]
  /** Kept for API compatibility with App; not used in simplified honey catalog. */
  products?: Product[]
  variants: Variant[]
  count: number
  includeDeleted: boolean
  setIncludeDeleted: (v: boolean) => void
  page: number
  onCreateVariantBulk: (payload: { product_id: string; matrix: BulkGridCell[] }) => Promise<Variant[]>
  onCreateCategory: (payload: { name_uz: string; name_ru: string }) => Promise<Category>
  onCreateProduct: (payload: {
    category: string
    product_category?: string
    name_uz: string
    name_ru: string
  }) => Promise<Product>
  onUpdateProduct: (
    productId: string,
    payload: { name_uz?: string; name_ru?: string; product_category?: string | null },
  ) => Promise<void>
  onCreateProductCategory: (payload: { name_uz: string; name_ru: string }) => Promise<ProductCategory>
  onUpdateProductCategory: (productCategoryId: string, payload: { name_uz: string; name_ru: string }) => Promise<void>
  onDeleteProductCategory: (productCategoryId: string) => Promise<void>
  onDeleteProduct: (productId: string) => Promise<void>
  onRestoreProductCategory: (productCategoryId: string) => Promise<void>
  onRestoreProduct: (productId: string) => Promise<void>
  onRestoreVariant: (variantId: string) => Promise<void>
  onAdjustStockQuick: (variantId: string, qtyDelta: number, note: string) => Promise<void>
  onToggleVariant: (v: Variant) => Promise<void>
  onUpdateVariant: (
    v: Variant,
    patch: {
      purchase_price: string
      list_price: string
      wholesale_price?: string | null
      unit?: ProductUnit
    },
  ) => Promise<void>
  onFilter: (q: string) => void
  onPage: (page: number) => void
  ordering: 'name' | 'recent'
  onFacetsChange: (facets: { ordering?: 'name' | 'recent'; category_id?: string; product_id?: string }) => void
  settings: StoreSettings | null
}) {
  const { t, i18n } = useTranslation()
  const langRu = i18n.language.startsWith('ru')
  const lowStockThreshold = Number(settings?.low_stock_threshold ?? 2)

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [query, setQuery] = useState('')
  const [filterProductCategory, setFilterProductCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)

  const [actionMenu, setActionMenu] = useState<{ x: number; y: number; variant: Variant } | null>(null)
  const [editing, setEditing] = useState<Variant | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editUnit, setEditUnit] = useState<ProductUnit>('kg')
  const [editPurchase, setEditPurchase] = useState('')
  const [editList, setEditList] = useState('')
  const [editWholesale, setEditWholesale] = useState('')

  const [quickAdjust, setQuickAdjust] = useState<Variant | null>(null)
  const [quickMode, setQuickMode] = useState<'add' | 'sub'>('add')
  const [quickAmount, setQuickAmount] = useState('')

  const labelPrintingEnabled = settings?.label_printing_enabled !== false
  const [labelPrint, setLabelPrint] = useState<Variant | null>(null)
  const [labelSize, setLabelSize] = useState<LabelStickerSize>('40x30')
  const [labelCopies, setLabelCopies] = useState('1')
  const [labelShowPrice, setLabelShowPrice] = useState(true)
  const [labelBusy, setLabelBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchSize, setBatchSize] = useState<LabelStickerSize>('40x30')
  const [batchCopies, setBatchCopies] = useState('1')
  const [batchShowPrice, setBatchShowPrice] = useState(true)
  const [batchBusy, setBatchBusy] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState<Variant | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  const visibleProductCategories = useMemo(
    () => productCategories.filter((c) => includeDeleted || !c.deleted_at),
    [productCategories, includeDeleted],
  )
  const activeProductCategories = useMemo(
    () => productCategories.filter((c) => !c.deleted_at),
    [productCategories],
  )

  const maxPage = Math.max(1, Math.ceil(count / 20))

  const filteredVariants = useMemo(() => {
    return variants.filter((v) => {
      if (filterProductCategory && v.product_category_id !== filterProductCategory) return false
      if (lowOnly) {
        if (!v.is_active) return false
        if (!(Number(v.stock_qty ?? 0) < lowStockThreshold)) return false
      }
      return true
    })
  }, [variants, filterProductCategory, lowOnly, lowStockThreshold])

  const lowStockCount = useMemo(
    () => variants.filter((v) => v.is_active && Number(v.stock_qty ?? 0) < lowStockThreshold).length,
    [variants, lowStockThreshold],
  )

  useEffect(() => {
    const timer = setTimeout(() => onFilter(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query, onFilter])

  useEffect(() => {
    if (!actionMenu) return
    const close = () => setActionMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [actionMenu])

  const ok = (message: string) => setToast({ kind: 'ok', message })
  const err = (message: string) => setToast({ kind: 'err', message })

  function openLabelPrint(v: Variant) {
    const raw = settings?.default_label_size
    const size = LABEL_SIZE_OPTIONS.includes(raw as LabelStickerSize)
      ? (raw as LabelStickerSize)
      : '40x30'
    setLabelPrint(v)
    setLabelSize(size)
    setLabelCopies('1')
    setLabelShowPrice(settings?.show_price_on_labels_default !== false)
  }

  async function submitLabelPrint() {
    if (!labelPrint) return
    const barcode = (labelPrint.barcode || '').trim()
    if (!barcode) {
      err(t('admin.catalog.noBarcode'))
      return
    }
    const copies = Math.max(1, Math.min(200, Math.floor(Number(labelCopies) || 0)))
    if (!Number.isFinite(copies) || copies < 1) {
      err(t('admin.catalog.copiesInvalid'))
      return
    }
    setLabelBusy(true)
    try {
      const out = await fetchLabelEscpos(labelPrint.id, labelSize, copies, labelShowPrice)
      const b64 = (out.raw_base64 || out.escpos_base64 || '').trim()
      if (!b64) throw new Error(t('err.LABEL_PRINT_FAILED'))
      await dispatchLabel(b64, settings)
      ok(t('admin.catalog.printLabelOk', { count: copies }))
      setLabelPrint(null)
    } catch (e: unknown) {
      const rawMessage = e instanceof Error ? e.message : String(e || '')
      if (isPrinterError(rawMessage)) {
        err(translatePrinterError(rawMessage))
      } else {
        const code = (e as Error & { code?: string }).code
        err(code ? t(`err.${code}`, { defaultValue: rawMessage }) : rawMessage || t('err.LABEL_PRINT_FAILED'))
      }
    } finally {
      setLabelBusy(false)
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openBatchPrint() {
    const raw = settings?.default_label_size
    const size = LABEL_SIZE_OPTIONS.includes(raw as LabelStickerSize)
      ? (raw as LabelStickerSize)
      : '40x30'
    setBatchSize(size)
    setBatchCopies('1')
    setBatchShowPrice(settings?.show_price_on_labels_default !== false)
    setBatchOpen(true)
  }

  async function submitBatchPrint() {
    const selected = filteredVariants.filter((v) => selectedIds.has(v.id) && !v.deleted_at)
    const withBarcode = selected.filter((v) => (v.barcode || '').trim())
    if (withBarcode.length === 0) {
      err(t('admin.catalog.batchNoBarcode'))
      return
    }
    const copies = Math.max(1, Math.min(200, Math.floor(Number(batchCopies) || 0)))
    if (!Number.isFinite(copies) || copies < 1) {
      err(t('admin.catalog.copiesInvalid'))
      return
    }
    setBatchBusy(true)
    try {
      const queue = await fetchLabelQueueEscpos(
        withBarcode.map((v) => ({ variant_id: v.id, copies })),
        batchSize,
        batchShowPrice,
      )
      let printed = 0
      for (const item of queue.items) {
        const b64 = (item.raw_base64 || item.escpos_base64 || '').trim()
        if (!b64) continue
        await dispatchLabel(b64, settings)
        printed += copies
      }
      const skipped = selected.length - withBarcode.length
      ok(
        skipped > 0
          ? t('admin.catalog.queuePrintedWithSkip', {
              count: printed,
              skus: withBarcode.length,
              skipped,
            })
          : t('admin.catalog.queuePrintedCount', { count: printed, skus: withBarcode.length }),
      )
      setBatchOpen(false)
      setSelectedIds(new Set())
    } catch (e: unknown) {
      const rawMessage = e instanceof Error ? e.message : String(e || '')
      if (isPrinterError(rawMessage)) {
        err(translatePrinterError(rawMessage))
      } else {
        const code = (e as Error & { code?: string }).code
        err(code ? t(`err.${code}`, { defaultValue: rawMessage }) : rawMessage || t('err.LABEL_QUEUE_FAILED'))
      }
    } finally {
      setBatchBusy(false)
    }
  }

  function categoryLabel(c: ProductCategory): string {
    return langRu ? c.name_ru || c.name_uz : c.name_uz
  }

  function validateStockInput(raw: string, unit: ProductUnit): number | null {
    const qty = parseQty(raw || '0')
    if (qty < 0) return null
    if (isIntegerUnit(unit) && !Number.isInteger(qty)) {
      err(t('admin.catalog.honey.donaWhole'))
      return null
    }
    return qty
  }

  async function createCategoryInline() {
    const name = newCategoryName.trim()
    if (!name) return
    setBusy(true)
    try {
      const cat = await onCreateProductCategory({ name_uz: name, name_ru: name })
      setForm((f) => ({ ...f, productCategory: cat.id }))
      setNewCategoryName('')
      ok(t('admin.catalog.productCategoryCreated'))
    } catch {
      err(t('admin.catalog.honey.saveError'))
    } finally {
      setBusy(false)
    }
  }

  /** Product.category is required by the backend; use one hidden default bucket. */
  async function ensureDefaultCategory(): Promise<string> {
    const existing = categories.find((c) => !c.deleted_at)
    if (existing) return existing.id
    const created = await onCreateCategory({ name_uz: 'Category', name_ru: 'Category' })
    return created.id
  }

  async function submitCreate() {
    const name = form.name.trim()
    const barcode = form.barcode.trim()
    if (!form.productCategory) {
      err(t('admin.catalog.honey.needCategory'))
      return
    }
    if (!name) {
      err(t('admin.catalog.honey.needName'))
      return
    }
    const purchase = digitsOnly(form.purchase)
    if (!purchase || Number(purchase) <= 0) {
      err(t('admin.catalog.wizard.purchasePriceRequired'))
      return
    }
    const qty = validateStockInput(form.qty, form.unit)
    if (qty === null) return
    const list = digitsOnly(form.list)
    const wholesale = digitsOnly(form.wholesale)

    setBusy(true)
    try {
      if (barcode) {
        try {
          await fetchVariantByBarcode(barcode)
          err(t('admin.catalog.barcodeAlreadyUsed', { code: barcode }))
          setBusy(false)
          return
        } catch (e: unknown) {
          const code = (e as Error & { code?: string }).code
          if (code && code !== 'BARCODE_NOT_FOUND') {
            err(t(`err.${code}`, { defaultValue: t('admin.catalog.wizard.bulkError') }))
            setBusy(false)
            return
          }
          // 404 / BARCODE_NOT_FOUND → free to use
        }
      }
      const categoryId = await ensureDefaultCategory()
      const product = await onCreateProduct({
        category: categoryId,
        product_category: form.productCategory,
        name_uz: name,
        name_ru: name,
      })
      await onCreateVariantBulk({
        product_id: product.id,
        matrix: [
          {
            purchase_price: purchase,
            list_price: list || undefined,
            wholesale_price: wholesale || undefined,
            initial_qty: qty,
            unit: form.unit,
            ...(barcode ? { barcode } : {}),
          },
        ],
      })
      ok(t('admin.catalog.wizard.bulkSuccess'))
      setForm((f) => ({ ...EMPTY_FORM, productCategory: f.productCategory, unit: f.unit }))
    } catch {
      err(t('admin.catalog.wizard.bulkError'))
    } finally {
      setBusy(false)
    }
  }

  function openEdit(v: Variant) {
    setEditing(v)
    setEditName((langRu ? v.product_name_ru : v.product_name_uz) || v.product_name_uz || '')
    setEditCategory(v.product_category_id || '')
    setEditUnit(variantUnit(v))
    setEditPurchase(String(Math.round(Number(v.purchase_price || 0))))
    setEditList(v.list_price ? String(Math.round(Number(v.list_price))) : '')
    setEditWholesale(v.wholesale_price ? String(Math.round(Number(v.wholesale_price))) : '')
  }

  async function saveEdit() {
    if (!editing) return
    const name = editName.trim()
    if (!name) {
      err(t('admin.catalog.honey.needName'))
      return
    }
    const purchase = digitsOnly(editPurchase)
    if (!purchase || Number(purchase) <= 0) {
      err(t('admin.catalog.wizard.purchasePriceRequired'))
      return
    }
    if (isIntegerUnit(editUnit) && !Number.isInteger(Number(editing.stock_qty ?? 0))) {
      err(t('admin.catalog.honey.donaWhole'))
      return
    }
    const wholesale = digitsOnly(editWholesale)
    setBusy(true)
    try {
      await onUpdateProduct(editing.product, {
        name_uz: name,
        name_ru: name,
        product_category: editCategory || null,
      })
      await onUpdateVariant(editing, {
        purchase_price: purchase,
        list_price: digitsOnly(editList),
        wholesale_price: wholesale || null,
        unit: editUnit,
      })
      ok(t('admin.catalog.honey.saved'))
      setEditing(null)
    } catch {
      err(t('admin.catalog.honey.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function submitQuickAdjust() {
    if (!quickAdjust) return
    const unit = variantUnit(quickAdjust)
    const amount = validateStockInput(quickAmount, unit)
    if (amount === null || amount === 0) return
    const delta = quickMode === 'add' ? amount : -amount
    if (Number(quickAdjust.stock_qty ?? 0) + delta < 0) {
      err(t('admin.catalog.honey.stockBelowZero'))
      return
    }
    setBusy(true)
    try {
      await onAdjustStockQuick(quickAdjust.id, delta, 'Catalog quick adjust')
      ok(t('admin.catalog.honey.saved'))
      setQuickAdjust(null)
      setQuickAmount('')
    } catch {
      err(t('admin.catalog.honey.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function doDelete() {
    if (!confirmDelete) return
    setBusy(true)
    try {
      await onDeleteProduct(confirmDelete.product)
      ok(t('admin.catalog.modelDeleted'))
      setConfirmDelete(null)
    } catch {
      err(t('admin.catalog.honey.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function doRestore(v: Variant) {
    setBusy(true)
    try {
      let restored = false
      try {
        await onRestoreProduct(v.product)
        restored = true
      } catch {
        /* product may already be active */
      }
      try {
        await onRestoreVariant(v.id)
        restored = true
      } catch {
        /* variant may already be restored with product */
      }
      if (restored) ok(t('admin.catalog.restored'))
      else err(t('admin.catalog.honey.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function saveCategoryRename() {
    if (!editingCategory) return
    const name = editingCategoryName.trim()
    if (!name) {
      err(t('admin.catalog.productCategoryNameRequired'))
      return
    }
    setBusy(true)
    try {
      await onUpdateProductCategory(editingCategory.id, { name_uz: name, name_ru: name })
      ok(t('admin.catalog.productCategoryUpdated'))
      setEditingCategory(null)
    } catch {
      err(t('admin.catalog.honey.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteCategory(c: ProductCategory) {
    setBusy(true)
    try {
      await onDeleteProductCategory(c.id)
      if (filterProductCategory === c.id) setFilterProductCategory('')
      ok(t('admin.catalog.productCategoryDeleted'))
    } catch {
      err(t('admin.catalog.honey.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function restoreCategory(c: ProductCategory) {
    setBusy(true)
    try {
      await onRestoreProductCategory(c.id)
      ok(t('admin.catalog.restored'))
    } catch {
      err(t('admin.catalog.honey.saveError'))
    } finally {
      setBusy(false)
    }
  }

  function unitLabel(u: ProductUnit): string {
    return t(`unit.${u}`)
  }

  function rowClass(v: Variant): string {
    if (v.deleted_at || !v.is_active) return 'bg-violet-950/30 border-l-[3px] border-violet-500/55 text-slate-400'
    if (Number(v.stock_qty ?? 0) <= 0) return 'bg-amber-950/40 border-l-[3px] border-amber-600/90 text-slate-100'
    if (Number(v.stock_qty ?? 0) < lowStockThreshold) return 'border-l-[3px] border-amber-400/70'
    return 'border-l-[3px] border-transparent'
  }

  const formUnitHint = t(`admin.catalog.priceHint.${form.unit}`, {
    defaultValue: t('admin.catalog.honey.priceHintDona'),
  })

  return (
    <div className="p-3 pos-lg:p-4 space-y-3 pos-lg:space-y-4">
      {toast && <ActionToast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold shrink-0 mr-1">{t('admin.catalog.title')}</h2>
        <input
          className={`${INPUT_CLS} flex-1 min-w-[12rem] max-w-md`}
          placeholder={t('admin.catalog.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className={`${INPUT_CLS} w-auto max-w-[14rem]`}
          value={filterProductCategory}
          onChange={(e) => setFilterProductCategory(e.target.value)}
          aria-label={t('admin.catalog.filterProductCategory')}
        >
          <option value="">{t('admin.catalog.filterAll')}</option>
          {visibleProductCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <select
          className={`${INPUT_CLS} w-auto max-w-[12rem]`}
          value={ordering}
          onChange={(e) => onFacetsChange({ ordering: e.target.value as 'name' | 'recent' })}
          aria-label={t('admin.catalog.sortVariants')}
        >
          <option value="name">{t('admin.catalog.sortByName')}</option>
          <option value="recent">{t('admin.catalog.sortRecent')}</option>
        </select>
        <button
          type="button"
          className={`${BTN_CLS} ${
            lowOnly ? 'bg-amber-700 border-amber-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-100'
          }`}
          onClick={() => setLowOnly((v) => !v)}
          title={t('admin.catalog.lowStockViewTool')}
        >
          {t('admin.catalog.lowStockView')} ({lowStockCount})
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-300 min-h-12">
          <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
          {t('admin.catalog.showDeleted')}
        </label>
        <button type="button" className={`${BTN_NEUTRAL} inline-flex items-center gap-2`} onClick={() => setCategoriesOpen(true)}>
          <Tags className="h-4 w-4" aria-hidden />
          {t('admin.catalog.honey.manageCategories')}
        </button>
        <button
          type="button"
          className={`${BTN_PRIMARY} inline-flex items-center gap-2`}
          onClick={() => setFormOpen((v) => !v)}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {formOpen ? t('admin.catalog.wizard.close') : t('admin.catalog.wizard.addProductCta')}
        </button>
      </div>

      {formOpen && (
        <section className="rounded-xl border border-slate-700 bg-slate-900 p-3 pos-lg:p-4 space-y-3">
          <h3 className="text-base font-semibold">{t('admin.catalog.honey.createTitle')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">{t('admin.catalog.productCategory')}</span>
              <select
                className={INPUT_CLS}
                value={form.productCategory}
                onChange={(e) => setForm({ ...form, productCategory: e.target.value })}
              >
                <option value="">{t('admin.catalog.honey.pickCategory')}</option>
                {activeProductCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 pt-1">
                <input
                  className={INPUT_CLS}
                  placeholder={t('admin.catalog.productCategoryPlaceholder')}
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
                <button
                  type="button"
                  className={BTN_NEUTRAL}
                  disabled={busy || !newCategoryName.trim()}
                  onClick={() => void createCategoryInline()}
                >
                  {t('admin.catalog.addProductCategory')}
                </button>
              </div>
            </label>

            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">{t('admin.catalog.honey.name')}</span>
              <input
                className={INPUT_CLS}
                placeholder={t('admin.catalog.honey.namePlaceholder')}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">{t('admin.catalog.barcodeOptional')}</span>
              <input
                className={`${INPUT_CLS} font-mono`}
                inputMode="numeric"
                autoComplete="off"
                placeholder={t('admin.catalog.barcodePlaceholder')}
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value.replace(/\s/g, '') })}
                onKeyDown={(e) => {
                  // USB scanner usually ends with Enter — keep focus for next field / submit.
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ;(e.currentTarget as HTMLInputElement).blur()
                  }
                }}
              />
              <p className="text-xs text-slate-500">{t('admin.catalog.barcodeScanHint')}</p>
            </label>

            <div className="space-y-1">
              <span className="text-xs text-slate-400">{t('admin.catalog.honey.unit')}</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PRODUCT_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={`${BTN_CLS} flex-1 ${
                      form.unit === u
                        ? 'bg-emerald-700 border-emerald-400 text-white ring-2 ring-emerald-500/50'
                        : 'bg-slate-800 border-slate-600 text-slate-100'
                    }`}
                    onClick={() => setForm({ ...form, unit: u })}
                  >
                    {unitLabel(u)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {t('admin.catalog.unitHint', {
                  defaultValue: 'dona/qop — butun son; kg/m — kasr mumkin (masalan 0,5).',
                })}
              </p>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">
                {t('admin.catalog.honey.initialStock')} ({unitLabel(form.unit)})
              </span>
              <input
                className={INPUT_CLS}
                inputMode="decimal"
                placeholder={isIntegerUnit(form.unit) ? '10' : '12.5'}
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value.replace(',', '.') })}
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">
                {t('admin.catalog.purchasePrice')} — {formUnitHint}
              </span>
              <input
                className={INPUT_CLS}
                inputMode="numeric"
                placeholder={t('admin.catalog.purchasePricePlaceholder')}
                value={form.purchase}
                onChange={(e) => setForm({ ...form, purchase: digitsOnly(e.target.value) })}
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">
                {t('admin.catalog.salePrice')} — {formUnitHint}
              </span>
              <input
                className={INPUT_CLS}
                inputMode="numeric"
                placeholder={t('admin.catalog.listPricePlaceholder')}
                value={form.list}
                onChange={(e) => setForm({ ...form, list: digitsOnly(e.target.value) })}
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">
                {t('admin.catalog.wholesalePrice', { defaultValue: 'Ulgurji narx (ixtiyoriy)' })} —{' '}
                {formUnitHint}
              </span>
              <input
                className={INPUT_CLS}
                inputMode="numeric"
                placeholder={t('admin.catalog.wholesalePricePlaceholder', {
                  defaultValue: 'Bo‘sh qoldirish mumkin',
                })}
                value={form.wholesale}
                onChange={(e) => setForm({ ...form, wholesale: digitsOnly(e.target.value) })}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_NEUTRAL} onClick={() => setForm(EMPTY_FORM)}>
              {t('admin.common.cancel')}
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void submitCreate()}>
              {busy ? t('admin.common.loading') : t('admin.catalog.wizard.submitBulk')}
            </button>
          </div>
        </section>
      )}

      {labelPrintingEnabled && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-800 bg-emerald-950/30 px-3 py-2">
          <span className="text-sm text-emerald-100">
            {t('admin.catalog.batchSelected', { count: selectedIds.size })}
          </span>
          <div className="flex gap-2">
            <button type="button" className={BTN_NEUTRAL} onClick={() => setSelectedIds(new Set())}>
              {t('admin.catalog.batchClear')}
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => openBatchPrint()}>
              {t('admin.catalog.batchPrint')}
            </button>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className={`${GRID} bg-slate-900 text-xs pos-lg:text-sm text-slate-400 border-b border-slate-800`}>
          <div className="p-2 pos-lg:p-3 text-center">
            {labelPrintingEnabled ? (
              <input
                type="checkbox"
                className="h-4 w-4"
                aria-label={t('admin.catalog.batchSelectAll')}
                checked={
                  filteredVariants.length > 0 &&
                  filteredVariants.every((v) => v.deleted_at || selectedIds.has(v.id))
                }
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds(new Set(filteredVariants.filter((v) => !v.deleted_at).map((v) => v.id)))
                  } else {
                    setSelectedIds(new Set())
                  }
                }}
              />
            ) : null}
          </div>
          <div className="p-2 pos-lg:p-3">{t('admin.catalog.product')}</div>
          <div className="p-2 pos-lg:p-3">{t('admin.catalog.productCategory')}</div>
          <div className="p-2 pos-lg:p-3">{t('admin.catalog.honey.unit')}</div>
          <div className="p-2 pos-lg:p-3 text-right">{t('admin.catalog.stock')}</div>
          <div className="p-2 pos-lg:p-3 text-right">{t('admin.catalog.purchase')}</div>
          <div className="p-2 pos-lg:p-3 text-right">{t('admin.catalog.sale')}</div>
          <div className="p-2 pos-lg:p-3 text-center">{t('admin.catalog.action')}</div>
        </div>
        {filteredVariants.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">
            {variants.length === 0 && !query ? t('admin.catalog.empty') : t('admin.catalog.emptyFiltered')}
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredVariants.map((v) => {
              const unit = variantUnit(v)
              const name = (langRu ? v.product_name_ru : v.product_name_uz) || v.product_name_uz
              const categoryName = (langRu ? v.product_category_name_ru : v.product_category_name_uz) || ''
              const stock = Number(v.stock_qty ?? 0)
              const isLow = v.is_active && stock < lowStockThreshold
              return (
                <div key={v.id} className={`${GRID} ${rowClass(v)}`}>
                  <div className="p-2 flex justify-center">
                    {labelPrintingEnabled && !v.deleted_at ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedIds.has(v.id)}
                        onChange={() => toggleSelected(v.id)}
                        aria-label={t('admin.catalog.batchSelectRow')}
                      />
                    ) : null}
                  </div>
                  <div className="p-2 pos-lg:p-3 min-w-0">
                    <div className="font-medium truncate" title={name}>
                      {name}
                    </div>
                    {(v.deleted_at || !v.is_active) && (
                      <div className="text-xs text-slate-500">{t('admin.catalog.honey.inactive')}</div>
                    )}
                  </div>
                  <div className="p-2 pos-lg:p-3 text-sm text-slate-300 truncate" title={categoryName}>
                    {categoryName || '-'}
                  </div>
                  <div className="p-2 pos-lg:p-3 text-sm">{unitLabel(unit)}</div>
                  <div className="p-2 pos-lg:p-3 text-right">
                    <button
                      type="button"
                      disabled={Boolean(v.deleted_at)}
                      className={`touch-btn min-h-12 w-full px-2 rounded-lg border text-sm tabular-nums whitespace-nowrap ${
                        isLow ? 'bg-amber-900/40 border-amber-600 text-amber-200' : 'bg-slate-800 border-slate-600'
                      }`}
                      onClick={() => {
                        setQuickAdjust(v)
                        setQuickMode('add')
                        setQuickAmount('')
                      }}
                      title={t('admin.catalog.quickAdjust')}
                    >
                      {formatQty(stock, unit)} {unitLabel(unit)}
                    </button>
                  </div>
                  <div className="p-2 pos-lg:p-3 text-right tabular-nums text-xs pos-lg:text-sm whitespace-nowrap">
                    {formatMoney(v.purchase_price)}
                  </div>
                  <div className="p-2 pos-lg:p-3 text-right tabular-nums text-xs pos-lg:text-sm whitespace-nowrap">
                    {v.list_price ? formatMoney(v.list_price) : '-'}
                  </div>
                  <div className="p-2 flex justify-center">
                    <button
                      type="button"
                      className="touch-btn min-h-12 w-12 rounded-xl bg-slate-800 border border-slate-600 inline-flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        setActionMenu({ x: rect.right, y: rect.bottom, variant: v })
                      }}
                      aria-label={t('admin.catalog.action')}
                    >
                      <MoreVertical className="h-5 w-5 text-slate-300" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-slate-400">
          {count} · {page} / {maxPage}
        </div>
        <div className="flex gap-2">
          <button type="button" className={BTN_NEUTRAL} disabled={page <= 1} onClick={() => onPage(page - 1)}>
            {t('admin.common.prev')}
          </button>
          <button type="button" className={BTN_NEUTRAL} disabled={page >= maxPage} onClick={() => onPage(page + 1)}>
            {t('admin.common.next')}
          </button>
        </div>
      </div>

      {actionMenu && (
        <div
          className="fixed z-50 min-w-[12rem] rounded-xl border border-slate-600 bg-slate-900 shadow-xl p-1"
          style={{
            top: Math.min(actionMenu.y + 4, window.innerHeight - 300),
            left: Math.max(8, Math.min(actionMenu.x - 192, window.innerWidth - 208)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {actionMenu.variant.deleted_at ? (
            <button
              type="button"
              className="touch-btn w-full min-h-12 px-3 rounded-lg text-left text-sm hover:bg-slate-800 inline-flex items-center gap-2"
              onClick={() => {
                const v = actionMenu.variant
                setActionMenu(null)
                void doRestore(v)
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              {t('admin.catalog.restore')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="touch-btn w-full min-h-12 px-3 rounded-lg text-left text-sm hover:bg-slate-800 inline-flex items-center gap-2"
                onClick={() => {
                  const v = actionMenu.variant
                  setActionMenu(null)
                  openEdit(v)
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                {t('admin.catalog.edit')}
              </button>
              <button
                type="button"
                className="touch-btn w-full min-h-12 px-3 rounded-lg text-left text-sm hover:bg-slate-800 inline-flex items-center gap-2"
                onClick={() => {
                  const v = actionMenu.variant
                  setActionMenu(null)
                  setQuickAdjust(v)
                  setQuickMode('add')
                  setQuickAmount('')
                }}
              >
                <PackagePlus className="h-4 w-4" aria-hidden />
                {t('admin.catalog.quickAdjust')}
              </button>
              {labelPrintingEnabled && (
                <button
                  type="button"
                  className="touch-btn w-full min-h-12 px-3 rounded-lg text-left text-sm hover:bg-slate-800 inline-flex items-center gap-2"
                  onClick={() => {
                    const v = actionMenu.variant
                    setActionMenu(null)
                    openLabelPrint(v)
                  }}
                >
                  <Tags className="h-4 w-4" aria-hidden />
                  {t('admin.catalog.printLabel')}
                </button>
              )}
              <button
                type="button"
                className="touch-btn w-full min-h-12 px-3 rounded-lg text-left text-sm hover:bg-slate-800 inline-flex items-center gap-2"
                onClick={() => {
                  const v = actionMenu.variant
                  setActionMenu(null)
                  void onToggleVariant(v).catch(() => err(t('admin.catalog.honey.saveError')))
                }}
              >
                <Power className="h-4 w-4" aria-hidden />
                {actionMenu.variant.is_active ? t('admin.catalog.deactivate') : t('admin.catalog.activate')}
              </button>
              <button
                type="button"
                className="touch-btn w-full min-h-12 px-3 rounded-lg text-left text-sm text-red-300 hover:bg-slate-800 inline-flex items-center gap-2"
                onClick={() => {
                  const v = actionMenu.variant
                  setActionMenu(null)
                  setConfirmDelete(v)
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t('admin.catalog.deleteModelShort')}
              </button>
            </>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">{t('admin.catalog.editVariant')}</h3>
            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">{t('admin.catalog.honey.name')}</span>
              <input className={INPUT_CLS} value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">{t('admin.catalog.productCategory')}</span>
              <select className={INPUT_CLS} value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                <option value="">{t('admin.catalog.honey.pickCategory')}</option>
                {activeProductCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1">
              <span className="text-xs text-slate-400">{t('admin.catalog.honey.unit')}</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PRODUCT_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={`${BTN_CLS} flex-1 ${
                      editUnit === u
                        ? 'bg-emerald-700 border-emerald-400 text-white'
                        : 'bg-slate-800 border-slate-600 text-slate-100'
                    }`}
                    onClick={() => setEditUnit(u)}
                  >
                    {unitLabel(u)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 block">
                <span className="text-xs text-slate-400">{t('admin.catalog.purchasePrice')}</span>
                <input
                  className={INPUT_CLS}
                  inputMode="numeric"
                  value={editPurchase}
                  onChange={(e) => setEditPurchase(digitsOnly(e.target.value))}
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs text-slate-400">{t('admin.catalog.salePrice')}</span>
                <input
                  className={INPUT_CLS}
                  inputMode="numeric"
                  value={editList}
                  onChange={(e) => setEditList(digitsOnly(e.target.value))}
                />
              </label>
              <label className="space-y-1 block col-span-2">
                <span className="text-xs text-slate-400">
                  {t('admin.catalog.wholesalePrice', { defaultValue: 'Ulgurji narx (ixtiyoriy)' })}
                </span>
                <input
                  className={INPUT_CLS}
                  inputMode="numeric"
                  value={editWholesale}
                  onChange={(e) => setEditWholesale(digitsOnly(e.target.value))}
                  placeholder={t('admin.catalog.wholesalePricePlaceholder', {
                    defaultValue: 'Bo‘sh qoldirish mumkin',
                  })}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={BTN_NEUTRAL} onClick={() => setEditing(null)}>
                {t('admin.common.cancel')}
              </button>
              <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void saveEdit()}>
                {t('admin.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {batchOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">{t('admin.catalog.batchPrintTitle')}</h3>
            <p className="text-sm text-slate-300">
              {t('admin.catalog.batchPrintHint', { count: selectedIds.size })}
            </p>
            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">{t('admin.catalog.labelSize')}</span>
              <select
                className={INPUT_CLS}
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value as LabelStickerSize)}
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
                className={INPUT_CLS}
                type="number"
                min={1}
                max={200}
                value={batchCopies}
                onChange={(e) => setBatchCopies(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
              <span className="text-xs text-slate-500">{t('admin.catalog.batchCopiesHelp')}</span>
            </label>
            <label className="flex items-center gap-3 min-h-12 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={batchShowPrice}
                onChange={(e) => setBatchShowPrice(e.target.checked)}
              />
              <span>{t('admin.settings.showPriceOnLabels')}</span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className={BTN_NEUTRAL}
                disabled={batchBusy}
                onClick={() => setBatchOpen(false)}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={batchBusy}
                onClick={() => void submitBatchPrint()}
              >
                {batchBusy ? t('admin.common.loading') : t('admin.catalog.batchPrint')}
              </button>
            </div>
          </div>
        </div>
      )}

      {labelPrint && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">{t('admin.catalog.printLabelTitle')}</h3>
            <p className="text-sm text-slate-300">
              {(langRu ? labelPrint.product_name_ru : labelPrint.product_name_uz) || labelPrint.product_name_uz}
            </p>
            <p className="text-xs text-slate-400 tabular-nums">
              {t('admin.catalog.barcode')}: {(labelPrint.barcode || '').trim() || t('admin.catalog.noBarcodeShort')}
            </p>
            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">{t('admin.catalog.labelSize')}</span>
              <select
                className={INPUT_CLS}
                value={labelSize}
                onChange={(e) => setLabelSize(e.target.value as LabelStickerSize)}
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
                className={INPUT_CLS}
                type="number"
                min={1}
                max={200}
                step={1}
                value={labelCopies}
                onChange={(e) => setLabelCopies(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
            </label>
            <label className="flex items-center gap-3 min-h-12 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={labelShowPrice}
                onChange={(e) => setLabelShowPrice(e.target.checked)}
              />
              <span>{t('admin.settings.showPriceOnLabels')}</span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className={BTN_NEUTRAL}
                disabled={labelBusy}
                onClick={() => setLabelPrint(null)}
              >
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={labelBusy || !(labelPrint.barcode || '').trim()}
                onClick={() => void submitLabelPrint()}
              >
                {labelBusy ? t('admin.common.loading') : t('admin.catalog.printLabel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {quickAdjust && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">{t('admin.catalog.quickAdjust')}</h3>
            <p className="text-sm text-slate-300">
              {(langRu ? quickAdjust.product_name_ru : quickAdjust.product_name_uz) || quickAdjust.product_name_uz}
              {' — '}
              {formatQty(Number(quickAdjust.stock_qty ?? 0), variantUnit(quickAdjust))} {unitLabel(variantUnit(quickAdjust))}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={`${BTN_CLS} flex-1 ${
                  quickMode === 'add' ? 'bg-emerald-700 border-emerald-400 text-white' : 'bg-slate-800 border-slate-600'
                }`}
                onClick={() => setQuickMode('add')}
              >
                + {t('admin.catalog.honey.add')}
              </button>
              <button
                type="button"
                className={`${BTN_CLS} flex-1 ${
                  quickMode === 'sub' ? 'bg-red-700 border-red-400 text-white' : 'bg-slate-800 border-slate-600'
                }`}
                onClick={() => setQuickMode('sub')}
              >
                − {t('admin.catalog.honey.subtract')}
              </button>
            </div>
            <label className="space-y-1 block">
              <span className="text-xs text-slate-400">
                {t('admin.catalog.honey.amount')} ({unitLabel(variantUnit(quickAdjust))})
              </span>
              <input
                className={INPUT_CLS}
                inputMode="decimal"
                autoFocus
                value={quickAmount}
                onChange={(e) => setQuickAmount(e.target.value.replace(',', '.'))}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={BTN_NEUTRAL} onClick={() => setQuickAdjust(null)}>
                {t('admin.common.cancel')}
              </button>
              <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void submitQuickAdjust()}>
                {t('admin.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {categoriesOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('admin.catalog.honey.manageCategories')}</h3>
              <button type="button" className={BTN_NEUTRAL} onClick={() => setCategoriesOpen(false)}>
                {t('admin.catalog.wizard.close')}
              </button>
            </div>
            <ul className="space-y-2">
              {visibleProductCategories.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-700 p-2">
                  {editingCategory?.id === c.id ? (
                    <>
                      <input
                        className={INPUT_CLS}
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                      />
                      <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void saveCategoryRename()}>
                        {t('admin.common.save')}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`flex-1 truncate ${c.deleted_at ? 'text-slate-500 line-through' : ''}`}>
                        {categoryLabel(c)}
                      </span>
                      {c.deleted_at ? (
                        <button type="button" className={BTN_NEUTRAL} disabled={busy} onClick={() => void restoreCategory(c)}>
                          {t('admin.catalog.restore')}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={BTN_NEUTRAL}
                            onClick={() => {
                              setEditingCategory(c)
                              setEditingCategoryName(c.name_uz)
                            }}
                          >
                            {t('admin.catalog.edit')}
                          </button>
                          <button
                            type="button"
                            className={`${BTN_CLS} bg-red-900/40 border-red-700 text-red-200`}
                            disabled={busy}
                            onClick={() => void deleteCategory(c)}
                          >
                            {t('admin.catalog.deleteBrandShort')}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                className={INPUT_CLS}
                placeholder={t('admin.catalog.productCategoryPlaceholder')}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={busy || !newCategoryName.trim()}
                onClick={() => void createCategoryInline()}
              >
                {t('admin.catalog.addProductCategory')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title={t('admin.catalog.honey.deleteTitle')}
          message={t('admin.catalog.confirmDeleteModel')}
          cancelText={t('admin.common.cancel')}
          confirmText={t('admin.catalog.deleteModelShort')}
          isDangerous
          isLoading={busy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void doDelete()}
        />
      )}
    </div>
  )
}
