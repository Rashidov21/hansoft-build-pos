import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StocktakeSession, UserRole, Variant } from '../api'
import { CashStockPage } from './CashStockPage'
import { InventoryPage } from './InventoryPage'

type HubTab = 'view' | 'ops'

/**
 * Single «Ombor» hub: stock list + kirim/tuzatish/inventar (avoids two sidebar entries).
 */
export function WarehousePage({
  role,
  variants,
  stocktake,
  onReceive,
  onAdjust,
  onCreateStocktake,
  onReloadOpen,
  onSetCount,
  onApplyStocktake,
}: {
  role: UserRole | null
  variants: Variant[]
  stocktake: StocktakeSession | null
  onReceive: (variantId: string, qty: number, note: string) => Promise<void>
  onAdjust: (variantId: string, qtyDelta: number, note: string) => Promise<void>
  onCreateStocktake: (note: string) => Promise<void>
  onReloadOpen: () => Promise<void>
  onSetCount: (variantId: string, countedQty: number) => Promise<void>
  onApplyStocktake: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<HubTab>('ops')

  const tabs = useMemo(
    () =>
      [
        { id: 'view' as const, label: t('admin.warehouse.tabView', { defaultValue: "Qoldiq" }) },
        {
          id: 'ops' as const,
          label: t('admin.warehouse.tabOps', { defaultValue: 'Kirim / tuzatish' }),
        },
      ] as const,
    [t],
  )

  return (
    <div className="space-y-3">
      <div className="px-4 pt-4 max-w-4xl mx-auto space-y-2">
        <h2 className="text-xl font-semibold">
          {t('admin.warehouse.title', { defaultValue: 'Ombor' })}
        </h2>
        <p className="text-sm text-slate-400">
          {t('admin.warehouse.intro', {
            defaultValue: 'Qoldiqni ko‘ring yoki kirim / tuzatish / inventarizatsiya qiling.',
          })}
        </p>
        <div className="inline-flex rounded-xl border border-slate-600 overflow-hidden">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`touch-btn min-h-11 px-4 text-sm font-semibold ${
                tab === item.id
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'view' ? (
        <CashStockPage role={role} embedded />
      ) : (
        <InventoryPage
          embedded
          variants={variants}
          stocktake={stocktake}
          onReceive={onReceive}
          onAdjust={onAdjust}
          onCreateStocktake={onCreateStocktake}
          onReloadOpen={onReloadOpen}
          onSetCount={onSetCount}
          onApplyStocktake={onApplyStocktake}
        />
      )}
    </div>
  )
}
