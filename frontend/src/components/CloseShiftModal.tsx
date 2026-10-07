import { useState, useMemo } from 'react'
import { AlertTriangle, Calculator, ChevronDown, ChevronUp, RotateCcw, Wifi, WifiOff, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatMoney } from '../utils/money'

type Props = {
  isOpen: boolean
  isOnline: boolean
  onCancel: () => void
  onConfirm: () => void
  isBusy?: boolean
}

const DENOMINATIONS = [200000, 100000, 50000, 20000, 10000, 5000, 1000]

export function CloseShiftModal({ isOpen, isOnline, onCancel, onConfirm, isBusy }: Props) {
  const { t } = useTranslation()
  const [showCashCounter, setShowCashCounter] = useState(false)
  const [counts, setCounts] = useState<Record<number, number>>({
    200000: 0,
    100000: 0,
    50000: 0,
    20000: 0,
    10000: 0,
    5000: 0,
    1000: 0,
  })

  const totalCalculatedCash = useMemo(() => {
    return DENOMINATIONS.reduce((acc, d) => acc + d * (counts[d] || 0), 0)
  }, [counts])

  function updateDenomCount(denom: number, delta: number) {
    setCounts((prev) => ({
      ...prev,
      [denom]: Math.max(0, (prev[denom] || 0) + delta),
    }))
  }

  function resetCounts() {
    setCounts({
      200000: 0,
      100000: 0,
      50000: 0,
      20000: 0,
      10000: 0,
      5000: 0,
      1000: 0,
    })
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="my-auto w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-6 space-y-4 shadow-2xl max-h-[min(94dvh,94svh)] overflow-y-auto kiosk-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
          <div
            className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center ${
              isOnline ? 'bg-amber-500/20 border border-amber-500/40' : 'bg-red-500/20 border border-red-500/40'
            }`}
          >
            {isOnline ? (
              <AlertTriangle className="h-6 w-6 text-amber-400" />
            ) : (
              <XCircle className="h-6 w-6 text-red-400" />
            )}
          </div>
          <div>
            <h3 className="text-xl font-bold text-amber-100">{t('shift.close.title')}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{t('shift.close.message')}</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Internet status indicator */}
          <div
            className={`flex items-center gap-2.5 text-sm p-3 rounded-xl border ${
              isOnline
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-600/40'
                : 'bg-red-950/40 text-red-300 border-red-600/60'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="h-5 w-5 text-emerald-400 shrink-0" />
                <span className="font-medium text-xs sm:text-sm">{t('shift.close.internetOk')}</span>
              </>
            ) : (
              <>
                <WifiOff className="h-5 w-5 text-red-400 shrink-0" />
                <span className="font-medium text-xs sm:text-sm">{t('shift.close.noInternet')}</span>
              </>
            )}
          </div>

          {!isOnline && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-xs sm:text-sm text-red-300 font-medium">⚠️ {t('shift.close.noInternetWarning')}</p>
              <p className="text-xs text-red-400 mt-1">{t('shift.close.noInternetHint')}</p>
            </div>
          )}

          {/* Cash Counting Assistant Accordion */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden">
            <button
              type="button"
              className="touch-btn w-full px-4 py-3 text-left flex items-center justify-between hover:bg-slate-800/40"
              onClick={() => setShowCashCounter((prev) => !prev)}
            >
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-emerald-400" />
                <span className="text-xs sm:text-sm font-semibold text-slate-200">
                  {t('shift.close.cashCounter', { defaultValue: 'Kassa naqd pulini sanash yordamchisi' })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {totalCalculatedCash > 0 && (
                  <span className="text-xs font-bold text-emerald-300 tabular-nums">
                    {formatMoney(String(totalCalculatedCash))}
                  </span>
                )}
                {showCashCounter ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </div>
            </button>

            {showCashCounter && (
              <div className="p-3 border-t border-slate-800 space-y-2 bg-slate-900/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DENOMINATIONS.map((denom) => {
                    const count = counts[denom] || 0
                    const lineSum = denom * count
                    return (
                      <div
                        key={denom}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-200 tabular-nums">{formatMoney(String(denom))}</div>
                          <div className="text-[10px] text-slate-400 tabular-nums">
                            {count} ta = {formatMoney(String(lineSum))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="touch-btn h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 text-base font-bold text-slate-300 flex items-center justify-center hover:bg-slate-700"
                            onClick={() => updateDenomCount(denom, -1)}
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-bold text-slate-100 tabular-nums text-sm">
                            {count}
                          </span>
                          <button
                            type="button"
                            className="touch-btn h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 text-base font-bold text-slate-300 flex items-center justify-center hover:bg-slate-700"
                            onClick={() => updateDenomCount(denom, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                  <button
                    type="button"
                    className="touch-btn px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 text-[11px]"
                    onClick={resetCounts}
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>{t('admin.common.reset', { defaultValue: 'Tozalash' })}</span>
                  </button>
                  <div className="text-right">
                    <span className="text-slate-400 mr-2">{t('admin.sales.grossTotal')}:</span>
                    <span className="text-sm font-black text-emerald-300 tabular-nums">
                      {formatMoney(String(totalCalculatedCash))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            className="touch-btn min-h-12 flex-1 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold text-sm"
            onClick={onCancel}
            disabled={isBusy}
          >
            {t('shift.close.cancel')}
          </button>
          <button
            type="button"
            className={`touch-btn min-h-12 flex-1 px-4 rounded-xl font-bold text-sm disabled:opacity-50 transition-all ${
              isOnline
                ? 'bg-amber-600 hover:bg-amber-500 border border-amber-400 text-white shadow-lg shadow-amber-950/60'
                : 'bg-slate-700 border border-slate-600 text-slate-400 cursor-not-allowed'
            }`}
            onClick={onConfirm}
            disabled={isBusy || !isOnline}
          >
            {isBusy ? t('admin.common.loading') : t('shift.close.confirm')}
          </button>
        </div>

        {!isOnline && (
          <p className="text-xs text-center text-slate-500">{t('shift.close.connectFirst')}</p>
        )}
      </div>
    </div>
  )
}
