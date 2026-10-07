import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Props = {
  isOpen: boolean
  openedAt?: string
  durationSeconds?: number
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function ShiftStatusBadge({ isOpen, openedAt, durationSeconds }: Props) {
  const { t } = useTranslation()

  if (!isOpen || !openedAt) return null

  const duration = durationSeconds ? formatDuration(durationSeconds) : ''
  const startTime = formatTime(openedAt)

  return (
    <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg px-3 py-2 flex items-center gap-2">
      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      <Clock className="h-4 w-4 text-emerald-400" />
      <span className="text-sm text-emerald-100 font-medium">{t('shift.status.open')}</span>
      {startTime && (
        <span className="text-xs text-emerald-300">{t('shift.status.since', { time: startTime })}</span>
      )}
      {duration && <span className="text-xs text-emerald-400 font-mono">({duration})</span>}
    </div>
  )
}
