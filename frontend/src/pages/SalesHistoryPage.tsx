import type { SaleHistoryLineRow, SaleHistoryRow } from '../api'
import { saleHistoryLineCode, saleHistoryLineSoldLabel } from '../utils/saleHistoryLines'
import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { List, type RowComponentProps } from 'react-window'
import { formatMoney, netMoney, toIntAmount } from '../utils/money'
import { dateLocale as resolveDateLocale } from '../utils/localizedName'
import { isPrinterError, translatePrinterError } from '../utils/printerErrors'
import { ActionToast } from '../components/ActionToast'
import { SaleDetailModal } from '../components/SaleDetailModal'
import { playUiSound } from '../utils/uiSound'
import { buildVoidSuccessMessage } from '../utils/voidRefundMessage'
import { MoreVertical } from 'lucide-react'

function showVoidButton(s: SaleHistoryRow, canVoid: boolean) {
  return canVoid && s.status !== 'VOIDED' && (s.can_void ?? true)
}

const SALES_HISTORY_CELL = 'min-w-0 overflow-hidden p-2'
const SALES_HISTORY_TRUNC = 'block w-full min-w-0 truncate'

function salesHistoryGridCols(isCashier: boolean) {
  return isCashier
    ? 'grid w-full min-w-0 grid-cols-[minmax(5.5rem,6.5rem)_minmax(8.5rem,10rem)_minmax(0,1fr)_minmax(7.5rem,9.5rem)_minmax(5.75rem,6.75rem)_2.75rem]'
    : 'grid w-full min-w-0 grid-cols-[minmax(5.5rem,6.5rem)_minmax(8.5rem,10rem)_minmax(0,1fr)_minmax(7.5rem,9.5rem)_minmax(5.75rem,6.75rem)_minmax(4.5rem,6rem)_2.75rem]'
}

function SaleHistoryProductsCell({
  lines,
  lang,
  t,
}: {
  lines?: SaleHistoryLineRow[]
  lang: string
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  if (!lines?.length) {
    return <span className="text-slate-500">—</span>
  }
  return (
    <div className="space-y-2 min-w-0 w-full">
      {lines.map((ln, i) => {
        const label = saleHistoryLineSoldLabel(ln, lang)
        const qty = ln.qty ?? 1
        const code = saleHistoryLineCode(ln)
        const qtyPart =
          ln.unit_price && qty > 0
            ? t('admin.sales.lineQtyPrice', {
                qty,
                price: formatMoney(ln.unit_price),
                defaultValue: '{{qty}} × {{price}}',
              })
            : qty > 1
              ? `× ${qty}`
              : ''
        const moneyPart = ln.line_total ? formatMoney(ln.line_total) : ''
        const subline = [qtyPart, moneyPart].filter(Boolean).join(' · ')
        const subTitle = [subline, code].filter(Boolean).join(' · ')

        return (
          <div key={i} className="min-w-0">
            <div className={`text-sm font-medium text-slate-100 ${SALES_HISTORY_TRUNC}`} title={label}>
              {label}
              {qty > 1 && !ln.unit_price ? (
                <span className="font-normal text-slate-400"> × {qty}</span>
              ) : null}
            </div>
            {(subline || code) && (
              <div className={`text-xs text-slate-400 mt-0.5 ${SALES_HISTORY_TRUNC}`} title={subTitle}>
                {subline}
                {subline && code ? ' · ' : null}
                {code ? <span className="font-mono">{code}</span> : null}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatusBadges({
  s,
  t,
}: {
  s: SaleHistoryRow
  t: (key: string, opts?: { defaultValue?: string }) => string
}) {
  const statusClass =
    s.status === 'VOIDED'
      ? 'bg-red-950/60 text-red-200 border-red-800/80'
      : 'bg-emerald-950/50 text-emerald-200 border-emerald-800/70'
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={`inline-block px-2 py-0.5 rounded-md text-xs border ${statusClass}`}>
        {t(`status.${s.status}`, { defaultValue: s.status })}
      </span>
      {s.return_status === 'partial' && (
        <span className="inline-block px-2 py-0.5 rounded-md text-xs border border-amber-700/80 bg-amber-950/50 text-amber-200">
          {t('admin.sales.badgePartial')}
        </span>
      )}
      {s.return_status === 'full' && (
        <span className="inline-block px-2 py-0.5 rounded-md text-xs border border-sky-700/80 bg-sky-950/50 text-sky-200">
          {t('admin.sales.badgeFull')}
        </span>
      )}
    </div>
  )
}

function SaleRowActions({
  s,
  canVoid,
  canArchive,
  t,
  onReprint,
  onVoidClick,
  onArchiveClick,
  onDetailsClick,
  setActionToast,
  canReprint = true,
}: {
  s: SaleHistoryRow
  canVoid: boolean
  canArchive: boolean
  t: (key: string, opts?: { defaultValue?: string }) => string
  onReprint: (saleId: string) => Promise<void>
  onVoidClick: () => void
  onArchiveClick: () => void
  onDetailsClick: () => void
  setActionToast: (v: { kind: 'ok' | 'err'; message: string }) => void
  canReprint?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  function toggleDropdown() {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.right - 160 })
    }
    setIsOpen(!isOpen)
  }

  return (
    <div className="relative inline-flex flex-col items-end gap-1">
      <button
        ref={triggerRef}
        type="button"
        className="touch-btn p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100"
        onClick={toggleDropdown}
        aria-label={t('admin.common.actions')}
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed z-[1000] min-w-[160px] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl py-1"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          <button
            type="button"
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-800 text-slate-100 flex items-center gap-2"
            onClick={() => {
              setIsOpen(false)
              onDetailsClick()
            }}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            {t('admin.sales.details')}
          </button>
          {canReprint && (
          <button
            type="button"
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-800 text-slate-100 flex items-center gap-2"
            onClick={async () => {
              setIsOpen(false)
              try {
                await onReprint(s.id)
                setActionToast({ kind: 'ok', message: t('admin.sales.reprintSuccess') })
              } catch (e: unknown) {
                const rawMessage = e instanceof Error ? e.message : String(e || '')
                if (isPrinterError(rawMessage)) {
                  setActionToast({ kind: 'err', message: translatePrinterError(rawMessage) })
                  return
                }
                const code = (e as Error & { code?: string }).code
                setActionToast({
                  kind: 'err',
                  message: t(`err.${code || 'PRINT_FAILED'}`),
                })
              }
            }}
          >
            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
            {t('admin.sales.reprint')}
          </button>
          )}
          {showVoidButton(s, canVoid) && (
            <button
              type="button"
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-800 text-red-400 flex items-center gap-2"
              onClick={() => {
                setIsOpen(false)
                onVoidClick()
              }}
            >
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              {t('admin.sales.void')}
            </button>
          )}
          {canArchive && (
            <button
              type="button"
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-800 text-amber-300 flex items-center gap-2"
              onClick={() => {
                setIsOpen(false)
                onArchiveClick()
              }}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              {t('admin.sales.archive')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function SalesHistoryPage({
  sales,
  count,
  page,
  onPage,
  onFilter,
  onExport,
  onVoid,
  onArchive,
  onReprint,
  canVoid,
  canArchive = false,
  canExport = true,
  isCashier = false,
  canReprint = true,
}: {
  sales: SaleHistoryRow[]
  count: number
  page: number
  onPage: (p: number) => void
  onFilter: (from: string, to: string, q: string) => void
  onExport: () => Promise<void>
  onVoid: (saleId: string, reason: string) => Promise<{
    sale_id?: string
    status?: string
    return_amount?: string
    refunds?: Array<{ method: string; amount: string }>
    restocked_lines?: Array<{ variant_id: string; qty: number }>
    reverted_partner_loans?: string[]
  }>
  onArchive: (saleId: string, reason: string) => Promise<void>
  onReprint: (saleId: string) => Promise<void>
  canVoid: boolean
  canArchive?: boolean
  canExport?: boolean
  isCashier?: boolean
  canReprint?: boolean
}) {
  const { t, i18n } = useTranslation()
  const dateLocaleStr = resolveDateLocale(i18n.language)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [query, setQuery] = useState('')
  const [voiding, setVoiding] = useState<SaleHistoryRow | null>(null)
  const [archiving, setArchiving] = useState<SaleHistoryRow | null>(null)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [archiveReason, setArchiveReason] = useState('')
  const [actionToast, setActionToast] = useState<{
    kind: 'ok' | 'err'
    message: string
  } | null>(null)
  const [voidBusy, setVoidBusy] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const maxPage = Math.max(1, Math.ceil(count / 20))
  const useVirtualRows = false // Disabled to maintain proper table alignment

  useEffect(() => {
    const timer = setTimeout(() => onFilter(from, to, query.trim()), 300)
    return () => clearTimeout(timer)
  }, [from, to, query, onFilter])

  useEffect(() => {
    if (voiding) playUiSound('confirm')
  }, [voiding])

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">{t('admin.sales.title')}</h2>
      {actionToast && (
        <ActionToast kind={actionToast.kind} message={actionToast.message} onClose={() => setActionToast(null)} />
      )}
      <div className="sticky top-0 z-10 flex flex-wrap gap-2 items-center rounded-xl border border-slate-800 bg-slate-950/95 p-2 backdrop-blur">
        <input type="date" className="touch-btn min-h-12 px-3 rounded-xl bg-slate-900 border border-slate-700" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="touch-btn min-h-12 px-3 rounded-xl bg-slate-900 border border-slate-700" value={to} onChange={(e) => setTo(e.target.value)} />
        <input
          className="touch-btn min-h-12 flex-1 min-w-[10rem] px-3 rounded-xl bg-slate-900 border border-slate-700"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.sales.searchPlaceholder')}
        />
        {canExport && (
          <button
            type="button"
            disabled={exportBusy}
            className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-700 font-medium disabled:opacity-50"
            onClick={async () => {
              setExportBusy(true)
              try {
                await onExport()
                setActionToast({ kind: 'ok', message: t('admin.sales.exportSuccess') })
              } catch (e: unknown) {
                const code = (e as Error & { code?: string }).code
                const message = t(`err.${code || 'EXPORT_SALES_FAILED'}`)
                setActionToast({ kind: 'err', message })
              } finally {
                setExportBusy(false)
              }
            }}
          >
            {exportBusy ? t('admin.common.loading') : t('admin.sales.exportExcel')}
          </button>
        )}
        <button
          type="button"
          className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-700 font-medium"
          onClick={() => {
            setFrom('')
            setTo('')
            setQuery('')
          }}
        >
          {t('admin.common.reset')}
        </button>
      </div>
      <p className="text-xs text-slate-400">{t('admin.sales.hint')}</p>
      {isCashier && !from && !to && (
        <p className="text-xs text-amber-400">{t('admin.sales.cashierDefaultToday')}</p>
      )}
      <div className="rounded border border-slate-700 overflow-hidden min-w-0 text-sm">
        <div className={`${salesHistoryGridCols(isCashier)} bg-slate-900 text-slate-400 border-b border-slate-800`}>
          <div className={`${SALES_HISTORY_CELL} font-medium ${SALES_HISTORY_TRUNC}`}>{t('admin.sales.saleId')}</div>
          <div className={`${SALES_HISTORY_CELL} font-medium ${SALES_HISTORY_TRUNC}`}>{t('admin.sales.time')}</div>
          <div className={`${SALES_HISTORY_CELL} font-medium`}>{t('admin.sales.colProducts')}</div>
          <div className={`${SALES_HISTORY_CELL} font-medium`}>{t('admin.sales.status')}</div>
          <div className={`${SALES_HISTORY_CELL} font-medium text-right whitespace-nowrap`}>{t('admin.sales.netTotal')}</div>
          {!isCashier && (
            <div className={`${SALES_HISTORY_CELL} font-medium ${SALES_HISTORY_TRUNC}`}>{t('admin.sales.cashier')}</div>
          )}
          <div className={`${SALES_HISTORY_CELL} text-center whitespace-nowrap`}>{t('admin.sales.action')}</div>
        </div>
        {!useVirtualRows && (
          <div>
            {sales.map((s) => (
              <div key={s.id} className={`${salesHistoryGridCols(isCashier)} border-t border-slate-800 items-start`}>
                <div className={`${SALES_HISTORY_CELL} font-mono text-xs whitespace-nowrap`}>
                  {s.public_sale_no || s.id.slice(0, 8)}
                </div>
                <div className={`${SALES_HISTORY_CELL} text-xs whitespace-nowrap`}>
                  {new Date(s.completed_at).toLocaleString(dateLocaleStr)}
                </div>
                <div className={SALES_HISTORY_CELL}>
                  <SaleHistoryProductsCell lines={s.lines} lang={i18n.language} t={t} />
                </div>
                <div className={SALES_HISTORY_CELL}>
                  <StatusBadges s={s} t={t} />
                  {toIntAmount(s.refund_total) > 0 && (
                    <div className={`text-xs text-amber-400/90 mt-1 ${SALES_HISTORY_TRUNC}`}>
                      {t('admin.sales.refundTotal', { amount: formatMoney(s.refund_total) })}
                    </div>
                  )}
                </div>
                <div className={`${SALES_HISTORY_CELL} text-right tabular-nums font-medium whitespace-nowrap`}>
                  {netMoney(s.grand_total, s.refund_total)}
                </div>
                {!isCashier && (
                  <div className={`${SALES_HISTORY_CELL} text-xs ${SALES_HISTORY_TRUNC}`} title={s.cashier_username}>
                    {s.cashier_username}
                  </div>
                )}
                <div className={`${SALES_HISTORY_CELL} flex justify-center`}>
                  <SaleRowActions
                    s={s}
                    canVoid={canVoid}
                    canArchive={canArchive}
                    canReprint={canReprint}
                    t={t}
                    onReprint={onReprint}
                    onVoidClick={() => setVoiding(s)}
                    onArchiveClick={() => setArchiving(s)}
                    onDetailsClick={() => setSelectedSaleId(s.id)}
                    setActionToast={setActionToast}
                  />
                </div>
              </div>
            ))}
            {sales.length === 0 && (
              <div className="p-6 text-center text-slate-500">{t('admin.sales.empty')}</div>
            )}
          </div>
        )}
        {useVirtualRows && (
          <div className="overflow-x-auto kiosk-scrollbar min-w-0">
          <div className="min-w-[52rem]">
          <List
            defaultHeight={Math.min(560, Math.max(220, sales.length * 64))}
            rowCount={sales.length}
            rowHeight={64}
            style={{ height: Math.min(560, Math.max(220, sales.length * 64)), width: '100%' }}
            rowComponent={({ index, style, rows }: RowComponentProps<{ rows: SaleHistoryRow[] }>) => {
              const s = rows[index]
              return (
                <div
                  style={style}
                  className="grid grid-cols-[1fr_1fr_1.1fr_1.2fr_0.75fr_0.75fr_4rem] items-center border-b border-slate-800 px-2 text-sm gap-1 min-w-[52rem]"
                >
                  <div>{s.public_sale_no || s.id.slice(0, 8)}</div>
                  <div>{s.cashier_username}</div>
                  <div className="text-xs">{new Date(s.completed_at).toLocaleString(dateLocaleStr)}</div>
                  <div>
                    <StatusBadges s={s} t={t} />
                  </div>
                  <div className="text-right tabular-nums">{formatMoney(s.grand_total)}</div>
                  <div className="text-right tabular-nums font-medium">{netMoney(s.grand_total, s.refund_total)}</div>
                  <div className="text-center">
                    <SaleRowActions
                      s={s}
                      canVoid={canVoid}
                      canArchive={canArchive}
                      canReprint={canReprint}
                      t={t}
                      onReprint={onReprint}
                      onVoidClick={() => setVoiding(s)}
                      onArchiveClick={() => setArchiving(s)}
                      onDetailsClick={() => setSelectedSaleId(s.id)}
                      setActionToast={setActionToast}
                    />
                  </div>
                </div>
              )
            }}
            rowProps={{ rows: sales }}
            className="border-t border-slate-800"
          />
          </div>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-700 font-medium"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          {t('admin.common.prev')}
        </button>
        <div className="px-3 py-2 text-sm text-slate-400">
          {t('admin.common.pageOf', { page, maxPage })}
        </div>
        <button
          type="button"
          className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-700 font-medium"
          disabled={page >= maxPage}
          onClick={() => onPage(page + 1)}
        >
          {t('admin.common.next')}
        </button>
      </div>
      {archiving && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">
              {t('admin.sales.archiveTitle', { saleId: archiving.public_sale_no || archiving.id.slice(0, 8) })}
            </h3>
            <p className="text-sm text-slate-400">{t('admin.sales.archiveHint')}</p>
            <textarea
              className="touch-btn w-full min-h-24 px-3 py-3 rounded-xl bg-slate-950 border border-slate-700"
              placeholder={t('admin.sales.archiveReason')}
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <button type="button" className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-700" onClick={() => setArchiving(null)}>
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className="touch-btn min-h-12 px-5 rounded-xl bg-amber-700 border border-amber-500 disabled:opacity-50 font-medium"
                disabled={archiveBusy}
                onClick={async () => {
                  setArchiveBusy(true)
                  try {
                    await onArchive(archiving.id, archiveReason)
                    setActionToast({ kind: 'ok', message: t('admin.sales.archiveSuccess') })
                    setArchiving(null)
                    setArchiveReason('')
                  } catch (e: unknown) {
                    const code = (e as Error & { code?: string }).code
                    setActionToast({ kind: 'err', message: t(`err.${code || 'ARCHIVE_FAILED'}`) })
                  } finally {
                    setArchiveBusy(false)
                  }
                }}
              >
                {archiveBusy ? t('admin.common.loading') : t('admin.sales.confirmArchive')}
              </button>
            </div>
          </div>
        </div>
      )}
      {voiding && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h3 className="text-lg font-semibold">
              {t('admin.sales.voidTitle', { saleId: voiding.id.slice(0, 8) })}
            </h3>
            <p className="text-xs text-slate-400">{t('admin.sales.voidHint')}</p>
            <textarea
              className="touch-btn w-full min-h-24 px-3 py-3 rounded-xl bg-slate-950 border border-slate-700"
              placeholder={t('admin.sales.voidReason')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <button type="button" className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-700" onClick={() => setVoiding(null)}>
                {t('admin.common.cancel')}
              </button>
              <button
                type="button"
                className="touch-btn min-h-12 px-5 rounded-xl bg-red-700 border border-red-500 disabled:opacity-50 font-medium"
                disabled={voidBusy}
                onClick={async () => {
                  if (!canVoid) {
                    setActionToast({ kind: 'err', message: t('err.PERMISSION_DENIED') })
                    return
                  }
                  setVoidBusy(true)
                  try {
                    const result = await onVoid(voiding.id, reason)
                    setActionToast({
                      kind: 'ok',
                      message: buildVoidSuccessMessage(t, result),
                    })
                    setVoiding(null)
                    setReason('')
                  } catch (e: unknown) {
                    const code = (e as Error & { code?: string }).code
                    const message = t(`err.${code || 'VOID_FAILED'}`, {
                      defaultValue: t('err.VOID_FAILED'),
                    })
                    setActionToast({ kind: 'err', message })
                  } finally {
                    setVoidBusy(false)
                  }
                }}
              >
                {voidBusy ? t('admin.sales.voiding') : t('admin.sales.confirmVoid')}
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedSaleId && (
        <SaleDetailModal
          saleId={selectedSaleId}
          saleStatus={sales.find(s => s.id === selectedSaleId)?.status}
          onClose={() => setSelectedSaleId(null)}
        />
      )}
    </div>
  )
}
