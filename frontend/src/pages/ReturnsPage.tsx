import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ReturnSalePage } from './ReturnSalePage'
import { ReturnsHistoryPage } from './ReturnsHistoryPage'

export function ReturnsPage() {
  const { t } = useTranslation()
  const tabCls = ({ isActive }: { isActive: boolean }) =>
    `touch-btn inline-flex items-center justify-center text-center min-h-11 px-5 sm:px-6 rounded-xl border text-sm font-medium leading-tight ${
      isActive
        ? 'bg-amber-950/60 border-amber-600 text-amber-100'
        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
    }`

  return (
    <div className="min-h-0 flex flex-col">
      <div className="px-4 pt-4 pb-3 flex justify-center border-b border-slate-800">
        <div className="grid w-full max-w-lg grid-cols-2 gap-2">
          <NavLink to="/admin/returns/process" className={tabCls} end={false}>
            {t('admin.return.tabProcess')}
          </NavLink>
          <NavLink to="/admin/returns/history" className={tabCls} end={false}>
            {t('admin.return.tabHistory')}
          </NavLink>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <Routes>
          <Route index element={<Navigate to="process" replace />} />
          <Route path="process" element={<ReturnSalePage embedded />} />
          <Route path="history" element={<ReturnsHistoryPage />} />
          <Route path="*" element={<ReturnSalePage embedded />} />
        </Routes>
      </div>
    </div>
  )
}
