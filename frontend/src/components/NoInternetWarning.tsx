import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'

type Props = {
  isOpen: boolean
  onRetry: () => Promise<void>
  onCancel: () => void
}

export function NoInternetWarning({ isOpen, onRetry, onCancel }: Props) {
  const { t } = useTranslation()
  const [retrying, setRetrying] = useState(false)

  if (!isOpen) return null

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/70 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-red-700 bg-slate-900 p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
            <WifiOff className="h-6 w-6 text-red-500" />
          </div>
          <h3 className="text-xl font-semibold text-red-100">{t('shift.noInternet.title')}</h3>
        </div>

        <p className="text-slate-300">{t('shift.noInternet.message')}</p>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            className="touch-btn min-h-12 flex-1 px-4 rounded-xl bg-slate-800 border border-slate-600 text-slate-100 font-medium"
            onClick={onCancel}
            disabled={retrying}
          >
            {t('shift.noInternet.cancel')}
          </button>
          <button
            type="button"
            className="touch-btn min-h-12 flex-1 px-4 rounded-xl bg-emerald-600 border border-emerald-500 text-white font-semibold disabled:opacity-50"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? t('admin.common.loading') : t('shift.noInternet.retry')}
          </button>
        </div>
      </div>
    </div>
  )
}
