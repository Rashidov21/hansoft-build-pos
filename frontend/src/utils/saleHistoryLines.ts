import { pickCategoryName, pickCustomName, pickProductName } from './localizedName'

export type SaleHistoryLineRow = {
  category_name_uz?: string
  category_name_ru?: string
  product_name_uz?: string
  product_name_ru?: string
  product_custom_name_uz?: string | null
  product_custom_name_ru?: string | null
  barcode?: string
  qty?: number
}

export function saleHistoryLineProductTitle(line: SaleHistoryLineRow, lang?: string): string {
  return (pickCustomName(line, lang) || pickProductName(line, lang)).trim()
}

export function saleHistoryLineModel(line: SaleHistoryLineRow, lang?: string): string {
  return pickProductName(line, lang).trim()
}

export function saleHistoryLineBrand(line: SaleHistoryLineRow, lang?: string): string {
  return pickCategoryName(line, lang).trim()
}

export function saleHistoryLineCode(line: SaleHistoryLineRow): string {
  return (line.barcode ?? '').trim()
}

/** What was sold — category + model/custom (answers «nima sotdim»). */
export function saleHistoryLineSoldLabel(line: SaleHistoryLineRow, lang?: string): string {
  const category = saleHistoryLineBrand(line, lang)
  const model = saleHistoryLineModel(line, lang)
  const custom = (pickCustomName(line, lang) || '').trim()
  const primary = custom || model
  if (!primary && !category) return '—'
  if (!primary) return category
  if (category && category !== primary) return `${category} · ${primary}`
  return primary
}

/** @deprecated Use saleHistoryLineSoldLabel */
export function saleHistoryLineSummary(line: SaleHistoryLineRow, lang?: string): string {
  const label = saleHistoryLineSoldLabel(line, lang)
  const qty = line.qty ?? 1
  if (label === '—') return qty > 1 ? `× ${qty}` : '—'
  return qty > 1 ? `${label} × ${qty}` : label
}
