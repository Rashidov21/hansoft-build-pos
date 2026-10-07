import { AlertTriangle, Wifi, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Props = {
  isOpen: boolean
  shiftStartTime: string
  isOnline?: boolean
  mode?: 'exit' | 'logout'
  onCancel: () => void
  onCloseShift: () => void
}

export function ShiftExitWarning({
  isOpen,
  shiftStartTime,
  isOnline = true,
  mode = 'exit',
  onCancel,
  onCloseShift,
}: Props) {
  const { t } = useTranslation()

  if (!isOpen) return null

  const isLogoutMode = mode === 'logout'

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/70 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-amber-700 bg-slate-900 p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <h3 className="text-xl font-semibold text-amber-100">
            {isLogoutMode ? t('shift.logout.title') : t('shift.exitWarning.title')}
          </h3>
        </div>

        <div className="space-y-3">
          <p className="text-slate-300">
            {isLogoutMode
              ? isOnline
                ? t('shift.logout.messageWithInternet')
                : t('shift.logout.messageNoInternet')
              : t('shift.exitWarning.message')}
          </p>
          <p className="text-sm text-slate-400">{t('shift.status.since', { time: shiftStartTime })}</p>

          {/* Internet status indicator */}
          <div
            className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="h-4 w-4" />
                <span className="font-medium">{t('shift.close.internetOk')}</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4" />
                <span className="font-medium">{t('shift.close.noInternet')}</span>
              </>
            )}
          </div>

          {!isOnline && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-sm text-red-300">
                ⚠️{' '}
                {isLogoutMode
                  ? t('shift.logout.noInternetWarning')
                  : t('shift.exitWarning.noInternetWarning')}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            className="touch-btn min-h-12 flex-1 px-4 rounded-xl bg-slate-800 border border-slate-600 text-slate-100 font-medium"
            onClick={onCancel}
          >
            {isLogoutMode ? t('shift.logout.cancel') : t('shift.exitWarning.cancel')}
          </button>
          <button
            type="button"
            className="touch-btn min-h-12 flex-1 px-4 rounded-xl bg-amber-600 border border-amber-500 text-white font-semibold"
            onClick={onCloseShift}
          >
            {isLogoutMode ? t('shift.logout.confirm') : t('shift.exitWarning.closeShift')}
          </button>
        </div>

        {!isOnline && isLogoutMode && (
          <p className="text-xs text-center text-slate-500">{t('shift.logout.hint')}</p>
        )}
        {!isOnline && !isLogoutMode && (
          <p className="text-xs text-center text-slate-500">{t('shift.exitWarning.internetHint')}</p>
        )}
      </div>
    </div>
  )
}
