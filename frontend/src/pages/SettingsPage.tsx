import { useEffect, useMemo, useState } from 'react'
import { Building2, HardDriveDownload, Printer, ScanLine, ShieldCheck, Bot, Cog, Users } from 'lucide-react'
import {
  activateLicense,
  createReportChannel,
  deleteReportChannel,
  fetchLicenseStatus,
  fetchPinUsers,
  fetchReportChannels,
  fetchReportRoutes,
  sendLowStockReport,
  setUserPin,
  testLabelPrintPayload,
  testReceiptPrintPayload,
  updateReportChannel,
  updateReportRoute,
  type IntegrationSettings,
  type LabelStickerSize,
  type LicenseStatus,
  type PinUser,
  type ReportChannel,
  type ReportRoute,
  type StocktakeSession,
  type StoreSettings,
} from '../api'
import { useTranslation } from 'react-i18next'
import { BUILD_INFO } from '../generated/build-info'
import { labelPrinterStatus, receiptPrinterStatus } from '../utils/hardwareStatus'
import { dispatchLabel, dispatchReceipt } from '../utils/printingHub'
import { isPrinterError, translatePrinterError } from '../utils/printerErrors'
import { ActionToast } from '../components/ActionToast'
import { getTauriMachineId } from '../utils/tauriMachineId'
import { UsersPage } from './UsersPage'

const LABEL_SIZE_OPTIONS: LabelStickerSize[] = ['30x20', '40x30', '40x50', '50x40', '58mm']

export function SettingsPage({
  settings,
  integrations,
  onSave,
  onSaveIntegrations,
  onSendZReport,
  stocktake,
  onCreateStocktake,
  onSetCount,
  onApplyStocktake,
  onReloadOpen,
  onBackupNow,
  canManageInventory,
}: {
  settings: StoreSettings | null
  integrations: IntegrationSettings | null
  onSave: (data: {
    brand_name: string
    phone: string
    address: string
    footer_note: string
    transliterate_uz: boolean
    receipt_printer_name: string
    receipt_printer_type: 'ESC_POS' | 'TSPL'
    receipt_printer_port?: string
    label_printer_name: string
    label_printer_type: 'ESC_POS' | 'TSPL'
    label_printer_port?: string
    label_printing_enabled?: boolean
    default_label_size?: LabelStickerSize
    label_gap_mm?: number | string
    label_direction?: number
    receipt_lang?: string
    receipt_width: '58mm' | '80mm'
    receipt_font_size?: number
    receipt_render_mode?: 'text' | 'image'
    receipt_printing_enabled?: boolean
    auto_print_on_sale: boolean
    scanner_mode: 'keyboard' | 'serial'
    scanner_prefix: string
    scanner_suffix: string
    lock_timeout_minutes?: number
    low_stock_threshold?: number
    show_price_on_labels_default?: boolean
    show_selling_price_in_catalog?: boolean
    logo?: File | null
  }) => Promise<void>
  onSaveIntegrations: (data: IntegrationSettings) => Promise<void>
  onSendZReport: () => Promise<unknown>
  stocktake: StocktakeSession | null
  onCreateStocktake: (note: string) => Promise<void>
  onSetCount: (variantId: string, countedQty: number) => Promise<void>
  onApplyStocktake: () => Promise<void>
  onReloadOpen: () => Promise<void>
  onBackupNow: () => Promise<{ ok: boolean; backup_path: string }>
  canManageInventory: boolean
}) {
  const { t, i18n } = useTranslation()
  const [activeTab, setActiveTab] = useState<'store' | 'bots' | 'security' | 'users'>('store')
  const [actionToast, setActionToast] = useState<{
    kind: 'ok' | 'err'
    message: string
  } | null>(null)
  const [logo, setLogo] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [stocktakeBusy, setStocktakeBusy] = useState(false)
  const [stocktakeNote, setStocktakeNote] = useState('')
  const [countByVariant, setCountByVariant] = useState<Record<string, string>>({})
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    brand_name: settings?.brand_name ?? '',
    phone: settings?.phone ?? '',
    address: settings?.address ?? '',
    footer_note: settings?.footer_note ?? '',
    transliterate_uz: settings?.transliterate_uz ?? true,
    receipt_lang: settings?.receipt_lang ?? '',
    receipt_printer_name: settings?.receipt_printer_name ?? '',
    receipt_printer_type: settings?.receipt_printer_type ?? 'ESC_POS',
    receipt_printer_port: settings?.receipt_printer_port ?? '',
    label_printer_name: settings?.label_printer_name ?? '',
    label_printer_type: settings?.label_printer_type ?? 'TSPL',
    label_printer_port: settings?.label_printer_port ?? '',
    label_printing_enabled: settings?.label_printing_enabled ?? true,
    default_label_size: settings?.default_label_size ?? '40x30',
    label_gap_mm: settings?.label_gap_mm ?? 2,
    label_direction: settings?.label_direction ?? 1,
    receipt_width: settings?.receipt_width ?? '58mm',
    receipt_font_size: settings?.receipt_font_size ?? 0,
    receipt_render_mode: (settings?.receipt_render_mode === 'text' ? 'text' : 'image') as 'text' | 'image',
    receipt_printing_enabled: settings?.receipt_printing_enabled ?? false,
    auto_print_on_sale: settings?.auto_print_on_sale ?? true,
    scanner_mode: settings?.scanner_mode ?? 'keyboard',
    scanner_prefix: settings?.scanner_prefix ?? '',
    scanner_suffix: settings?.scanner_suffix ?? '\t',
    lock_timeout_minutes: settings?.lock_timeout_minutes ?? 5,
    low_stock_threshold: settings?.low_stock_threshold ?? 2,
    show_price_on_labels_default: settings?.show_price_on_labels_default ?? true,
    show_selling_price_in_catalog: settings?.show_selling_price_in_catalog ?? false,
  })
  const [pinUsers, setPinUsers] = useState<PinUser[]>([])
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({})
  const [printerOptions, setPrinterOptions] = useState<string[]>([])
  const [scannerTest, setScannerTest] = useState('')
  const [scannerTestOk, setScannerTestOk] = useState(false)
  const [hwStep, setHwStep] = useState<1 | 2 | 3>(1)
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null)
  const [hardwareId, setHardwareId] = useState('')
  const [activationKey, setActivationKey] = useState('')
  const [licenseBusy, setLicenseBusy] = useState(false)
  const [integrationForm, setIntegrationForm] = useState<IntegrationSettings>({
    telegram_bot_token: integrations?.telegram_bot_token ?? '',
    telegram_chat_id: integrations?.telegram_chat_id ?? '',
    whatsapp_provider: integrations?.whatsapp_provider ?? 'GREEN_API',
    whatsapp_api_base: integrations?.whatsapp_api_base ?? '',
    whatsapp_api_token: integrations?.whatsapp_api_token ?? '',
    whatsapp_sender: integrations?.whatsapp_sender ?? '',
    greenapi_instance_id: integrations?.greenapi_instance_id ?? '',
    greenapi_api_token_instance: integrations?.greenapi_api_token_instance ?? '',
    primary_report_channel: integrations?.primary_report_channel ?? 'both',
    report_lang: integrations?.report_lang ?? '',
    auto_daily_z_report_enabled: integrations?.auto_daily_z_report_enabled ?? true,
    auto_low_stock_report_enabled: integrations?.auto_low_stock_report_enabled ?? true,
    telegram_db_backup_interval_days: integrations?.telegram_db_backup_interval_days ?? 3,
    auto_debt_whatsapp_reminder_enabled: integrations?.auto_debt_whatsapp_reminder_enabled ?? true,
  })
  const [reportChannels, setReportChannels] = useState<ReportChannel[]>([])
  const [reportRoutes, setReportRoutes] = useState<ReportRoute[]>([])
  const [channelDraft, setChannelDraft] = useState({
    name: '',
    kind: 'telegram' as 'telegram' | 'whatsapp',
    address: '',
  })
  const [routingBusy, setRoutingBusy] = useState(false)

  useEffect(() => {
    setForm({
      brand_name: settings?.brand_name ?? '',
      phone: settings?.phone ?? '',
      address: settings?.address ?? '',
      footer_note: settings?.footer_note ?? '',
      transliterate_uz: settings?.transliterate_uz ?? true,
      receipt_lang: settings?.receipt_lang ?? '',
      receipt_printer_name: settings?.receipt_printer_name ?? '',
      receipt_printer_type: settings?.receipt_printer_type ?? 'ESC_POS',
      receipt_printer_port: settings?.receipt_printer_port ?? '',
      label_printer_name: settings?.label_printer_name ?? '',
      label_printer_type: settings?.label_printer_type ?? 'TSPL',
      label_printer_port: settings?.label_printer_port ?? '',
      label_printing_enabled: settings?.label_printing_enabled ?? true,
      default_label_size: settings?.default_label_size ?? '40x30',
      label_gap_mm: settings?.label_gap_mm ?? 2,
      label_direction: settings?.label_direction ?? 1,
      receipt_width: settings?.receipt_width ?? '58mm',
      receipt_font_size: settings?.receipt_font_size ?? 0,
      receipt_render_mode: (settings?.receipt_render_mode === 'text' ? 'text' : 'image') as 'text' | 'image',
      receipt_printing_enabled: settings?.receipt_printing_enabled ?? false,
      auto_print_on_sale: settings?.auto_print_on_sale ?? true,
      scanner_mode: settings?.scanner_mode ?? 'keyboard',
      scanner_prefix: settings?.scanner_prefix ?? '',
      scanner_suffix: settings?.scanner_suffix ?? '\t',
      lock_timeout_minutes: settings?.lock_timeout_minutes ?? 5,
      low_stock_threshold: settings?.low_stock_threshold ?? 2,
      show_price_on_labels_default: settings?.show_price_on_labels_default ?? true,
      show_selling_price_in_catalog: settings?.show_selling_price_in_catalog ?? false,
    })
  }, [settings])

  useEffect(() => {
    void (async () => {
      try {
        setPinUsers(await fetchPinUsers())
      } catch {
        setPinUsers([])
      }
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/tauri')
        const names = await invoke<string[]>('list_printers')
        if (Array.isArray(names)) setPrinterOptions(names)
      } catch {
        setPrinterOptions([])
      }
    })()
  }, [])

  useEffect(() => {
    setIntegrationForm({
      telegram_bot_token: integrations?.telegram_bot_token ?? '',
      telegram_chat_id: integrations?.telegram_chat_id ?? '',
      whatsapp_provider: integrations?.whatsapp_provider ?? 'GREEN_API',
      whatsapp_api_base: integrations?.whatsapp_api_base ?? '',
      whatsapp_api_token: integrations?.whatsapp_api_token ?? '',
      whatsapp_sender: integrations?.whatsapp_sender ?? '',
      greenapi_instance_id: integrations?.greenapi_instance_id ?? '',
      greenapi_api_token_instance: integrations?.greenapi_api_token_instance ?? '',
      primary_report_channel: integrations?.primary_report_channel ?? 'both',
      report_lang: integrations?.report_lang ?? '',
      auto_daily_z_report_enabled: integrations?.auto_daily_z_report_enabled ?? true,
      auto_low_stock_report_enabled: integrations?.auto_low_stock_report_enabled ?? true,
      telegram_db_backup_interval_days: (integrations?.telegram_db_backup_interval_days ?? 3) as 0 | 1 | 3,
      auto_debt_whatsapp_reminder_enabled: integrations?.auto_debt_whatsapp_reminder_enabled ?? true,
    })
  }, [integrations])

  const reloadReportRouting = async () => {
    try {
      const [chs, routes] = await Promise.all([fetchReportChannels(), fetchReportRoutes()])
      setReportChannels(chs)
      setReportRoutes(routes)
    } catch {
      setReportChannels([])
      setReportRoutes([])
    }
  }

  useEffect(() => {
    if (activeTab !== 'bots') return
    void reloadReportRouting()
  }, [activeTab])

  useEffect(() => {
    void (async () => {
      const machineId = (await getTauriMachineId()) || ''
      setHardwareId(machineId)
      try {
        setLicenseStatus(await fetchLicenseStatus())
      } catch {
        setLicenseStatus(null)
      }
    })()
  }, [])

  const receiptHw = useMemo(
    () => receiptPrinterStatus(printerOptions, form.receipt_printer_name),
    [printerOptions, form.receipt_printer_name],
  )
  const labelHw = useMemo(
    () => labelPrinterStatus(printerOptions, form.label_printer_name),
    [printerOptions, form.label_printer_name],
  )

  const printersSameQueue =
    Boolean(form.receipt_printer_name.trim()) &&
    Boolean(form.label_printer_name.trim()) &&
    form.receipt_printer_name.trim().toLowerCase() === form.label_printer_name.trim().toLowerCase()

  const hardwareAlert =
    (form.receipt_printing_enabled && receiptHw === 'missing') ||
    (form.label_printing_enabled && labelHw === 'missing') ||
    printersSameQueue
      ? 'err'
      : (form.receipt_printing_enabled && receiptHw === 'no_device_list') ||
          (form.label_printing_enabled && labelHw === 'no_device_list')
        ? 'warn'
        : 'ok'

  const inputCls = 'touch-btn w-full min-h-14 px-4 rounded-xl bg-slate-900 border border-slate-700 text-base'
  const inputSoftCls =
    'touch-btn w-full min-h-14 px-4 rounded-xl bg-slate-950 border border-slate-700 text-base'
  const sectionCardCls = 'rounded-2xl border border-slate-700 bg-slate-900/70 p-4 md:p-5 space-y-3'

  if (!settings && !integrations) {
    return <div className="p-3 pos-lg:p-4">{t('admin.common.loading')}</div>
  }

  async function runAction(label: string, fn: () => Promise<unknown>) {
    try {
      await fn()
      setActionToast({ kind: 'ok', message: t('admin.settings.actionCompleted', { label }) })
    } catch (e: unknown) {
      const rawMessage = e instanceof Error ? e.message : String(e || '')
      if (rawMessage.startsWith('Printer ulanmagan:')) {
        setActionToast({ kind: 'err', message: rawMessage })
        return
      }
      const code = (e as Error & { code?: string }).code
      const message = t(`err.${code || 'UNKNOWN'}`, {
        defaultValue: t('admin.settings.actionFailed', { label }),
      })
      setActionToast({ kind: 'err', message })
    }
  }

  function shortBackupName(path: string): string {
    const p = (path || '').trim()
    if (!p) return ''
    const chunks = p.split(/[/\\]/)
    return chunks[chunks.length - 1] || p
  }

  return (
    <div className="p-3 pos-lg:p-4 space-y-3 pos-lg:space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{t('admin.settings.title')}</h2>
        <p className="text-xs text-slate-400">
          {t('admin.settings.headerHint')}
        </p>
      </div>
      <div className="inline-flex flex-wrap rounded-xl border border-slate-700 overflow-hidden">
        <button
          type="button"
          className={`touch-btn min-h-12 px-5 py-3 text-sm inline-flex items-center gap-2 ${activeTab === 'store' ? 'bg-emerald-700' : 'bg-slate-900'}`}
          onClick={() => setActiveTab('store')}
        >
          <Building2 className="h-4 w-4" />
          {t('admin.settings.tabStore')}
        </button>
        <button
          type="button"
          className={`touch-btn min-h-12 px-5 py-3 text-sm inline-flex items-center gap-2 ${activeTab === 'bots' ? 'bg-emerald-700' : 'bg-slate-900'}`}
          onClick={() => setActiveTab('bots')}
        >
          <Bot className="h-4 w-4" />
          {t('admin.settings.tabBots')}
        </button>
        <button
          type="button"
          className={`touch-btn min-h-12 px-5 py-3 text-sm inline-flex items-center gap-2 ${activeTab === 'users' ? 'bg-emerald-700' : 'bg-slate-900'}`}
          onClick={() => setActiveTab('users')}
        >
          <Users className="h-4 w-4" />
          {t('admin.settings.tabUsers')}
        </button>
        <button
          type="button"
          className={`touch-btn min-h-12 px-5 py-3 text-sm inline-flex items-center gap-2 ${activeTab === 'security' ? 'bg-emerald-700' : 'bg-slate-900'}`}
          onClick={() => setActiveTab('security')}
        >
          <ShieldCheck className="h-4 w-4" />
          {t('admin.settings.tabSecurity', { defaultValue: 'Security' })}
        </button>
      </div>
      {actionToast && (
        <ActionToast kind={actionToast.kind} message={actionToast.message} onClose={() => setActionToast(null)} />
      )}
      {activeTab === 'store' && (
        <>
          <div> 
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 inline-flex items-center gap-2 text-slate-200">
            <Building2 className="h-5 w-5 text-emerald-400" />
            <span className="font-medium">{t('admin.settings.tabStore')}</span>
          </div>
          </div>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              try {
                await onSave({ ...form, logo })
                setActionToast({ kind: 'ok', message: t('admin.settings.savedToast') })
              } catch (e: unknown) {
                const code = (e as Error & { code?: string }).code
                const message = t(`err.${code || 'UNKNOWN'}`, {
                  defaultValue: t('admin.settings.actionFailed', { label: t('admin.settings.saveSettings') }),
                })
                setActionToast({ kind: 'err', message })
              } finally {
                setBusy(false)
              }
            }}
          >
            <div className="grid gap-4 xl:grid-cols-3 items-start">
              <div className="space-y-4 xl:col-span-2">
              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-xs text-slate-400">
                {t('admin.settings.headerHint')}
              </div>
            <div className={sectionCardCls}>
              <div className="inline-flex items-center gap-2 text-slate-200">
                <Cog className="h-4 w-4 text-emerald-400" />
                <h3 className="font-medium">{t('admin.settings.saveSettings')}</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs text-slate-400">{t('admin.settings.brandName')}</label>
                  <input
                    className={inputCls}
                    value={form.brand_name}
                    onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
                    placeholder={t('admin.settings.brandNameExample')}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-slate-400">{t('admin.settings.phone')}</label>
                  <input
                    className={inputCls}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder={t('admin.settings.phoneExample')}
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="block text-xs text-slate-400">{t('admin.settings.address')}</label>
                  <input
                    className={inputCls}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder={t('admin.settings.addressExample')}
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-xs text-slate-400">{t('admin.settings.logoHint')}</label>
                  <div className="rounded-2xl border border-slate-700 bg-slate-950/50 p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      {settings?.logo_url && !logo ? (
                        <img
                          src={settings.logo_url}
                          alt="logo"
                          className="h-20 w-20 object-contain bg-white p-2 rounded-xl border border-slate-700"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-xl border border-dashed border-slate-600 bg-slate-900 grid place-items-center text-[10px] text-slate-500">
                          LOGO
                        </div>
                      )}
                      <div className="flex-1 min-w-[220px] space-y-2">
                        <p className="text-xs text-slate-400">
                          {logo?.name || t('admin.settings.logoHint')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <label className="touch-btn min-h-12 px-4 rounded-xl bg-slate-800 border border-slate-600 cursor-pointer inline-flex items-center">
                            {logo
                              ? t('admin.common.change', { defaultValue: 'Change' })
                              : t('admin.common.upload', { defaultValue: 'Upload logo' })}
                            <input
                              className="hidden"
                              type="file"
                              accept="image/*"
                              onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                            />
                          </label>
                          {logo && (
                            <button
                              type="button"
                              className="touch-btn min-h-12 px-4 rounded-xl bg-slate-900 border border-slate-700"
                              onClick={() => setLogo(null)}
                            >
                              {t('admin.common.remove', { defaultValue: 'Remove' })}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="block text-xs text-slate-400">{t('admin.settings.footer')}</label>
                  <input
                    className={inputCls}
                    value={form.footer_note}
                    onChange={(e) => setForm({ ...form, footer_note: e.target.value })}
                    placeholder={t('admin.settings.footerExample')}
                  />
                </div>
              </div>
            </div>
            <div
              className={`rounded-xl border p-3 text-sm ${
                hardwareAlert === 'err'
                  ? 'border-red-600 bg-red-950/40 text-red-100'
                  : hardwareAlert === 'warn'
                    ? 'border-amber-600 bg-amber-950/30 text-amber-100'
                    : 'border-emerald-800 bg-emerald-950/20 text-emerald-100'
              }`}
            >
              <div className="font-medium text-base inline-flex items-center gap-2">
                <Printer className="h-4 w-4" />
                {t('admin.settings.printersTitle')}
              </div>
              <ul className="mt-2 list-disc list-inside text-xs space-y-1 opacity-95">
                {form.receipt_printing_enabled ? (
                  <li>
                    {receiptHw === 'ok' && t('admin.settings.statusReceiptOk')}
                    {receiptHw === 'default_printer' && t('admin.settings.statusReceiptDefault')}
                    {receiptHw === 'missing' && t('admin.settings.statusReceiptMissing')}
                    {receiptHw === 'no_device_list' && t('admin.settings.statusReceiptNoList')}
                  </li>
                ) : (
                  <li>{t('admin.settings.statusReceiptDisabled')}</li>
                )}
                {form.label_printing_enabled ? (
                  <li>
                    {labelHw === 'ok' && t('admin.settings.statusLabelOk')}
                    {labelHw === 'default_printer' && t('admin.settings.statusLabelDefault')}
                    {labelHw === 'missing' && t('admin.settings.statusLabelMissing')}
                    {labelHw === 'no_device_list' && t('admin.settings.statusLabelNoList')}
                  </li>
                ) : (
                  <li>{t('admin.settings.statusLabelDisabled')}</li>
                )}
                {printersSameQueue && (
                  <li>{t('err.PRINTER_SAME_QUEUE', { printer: form.receipt_printer_name.trim() })}</li>
                )}
              </ul>
            </div>

            <div className={sectionCardCls}>
              <label className="flex items-center gap-3 min-h-12 text-base">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={form.receipt_printing_enabled}
                  onChange={(e) => {
                    const on = e.target.checked
                    setForm({
                      ...form,
                      receipt_printing_enabled: on,
                      auto_print_on_sale: on ? form.auto_print_on_sale : false,
                    })
                  }}
                />
                <span>
                  <span className="font-medium">{t('admin.settings.receiptPrintingEnabled')}</span>
                  <span className="block text-xs text-slate-400 font-normal">
                    {t('admin.settings.receiptPrintingEnabledHelp')}
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3 min-h-12 text-base">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={form.label_printing_enabled}
                  onChange={(e) => {
                    setForm({ ...form, label_printing_enabled: e.target.checked })
                  }}
                />
                <span>
                  <span className="font-medium">{t('admin.settings.labelPrintingEnabled')}</span>
                  <span className="block text-xs text-slate-400 font-normal">
                    {t('admin.settings.labelPrintingEnabledHelp')}
                  </span>
                </span>
              </label>
            </div>

            <div className={sectionCardCls}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-100 inline-flex items-center gap-2">
                  <ScanLine className="h-4 w-4" />
                  {t('admin.settings.hwWizard.title')}
                </h3>
                <div className="flex gap-1">
                  {[1, 2, 3].map((s) => (
                    <div
                      key={s}
                      className={`h-2 w-8 rounded-full ${hwStep >= s ? 'bg-emerald-500' : 'bg-slate-700'}`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500">{t('admin.settings.hwWizard.doneHint')}</p>
              <datalist id="printer-options">
                {printerOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>

              {hwStep === 1 && !form.receipt_printing_enabled && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">{t('admin.settings.receiptStepSkipped')}</p>
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      className="touch-btn min-h-12 px-6 rounded-xl bg-emerald-700 border border-emerald-500 font-medium"
                      onClick={() => setHwStep(2)}
                    >
                      {t('admin.settings.hwWizard.next')}
                    </button>
                  </div>
                </div>
              )}

              {hwStep === 1 && form.receipt_printing_enabled && (
                <div className="space-y-3">
                  <div className="text-slate-300">{t('admin.settings.hwWizard.step1')}</div>
                  <label className="block text-xs text-slate-400">{t('admin.settings.receiptPrinterName')}</label>
                  <input
                    list="printer-options"
                    className={inputSoftCls}
                    value={form.receipt_printer_name}
                    onChange={(e) => setForm({ ...form, receipt_printer_name: e.target.value })}
                    placeholder={t('admin.settings.printerNameExample')}
                  />
                  <label className="block text-xs text-slate-400">
                    {t('admin.settings.printerPortLabel', { defaultValue: 'Receipt port (e.g. USB001)' })}
                  </label>
                  <input
                    className={inputSoftCls}
                    value={form.receipt_printer_port || ''}
                    onChange={(e) => setForm({ ...form, receipt_printer_port: e.target.value })}
                    placeholder="USB001"
                  />
                  <p className="text-xs text-slate-500">{t('admin.settings.printerNameHelp')}</p>
                  <select
                    className={inputSoftCls}
                    value={form.receipt_printer_type}
                    onChange={(e) =>
                      setForm({ ...form, receipt_printer_type: e.target.value as 'ESC_POS' | 'TSPL' })
                    }
                  >
                    <option value="ESC_POS">ESC/POS</option>
                    <option value="TSPL">TSPL</option>
                  </select>
                  <button
                    type="button"
                    className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-600"
                    onClick={async () => {
                      try {
                        const out = await testReceiptPrintPayload()
                        const b64 = (out.raw_base64 || out.escpos_base64 || '').trim()
                        if (!b64) throw new Error(t('err.PRINTER_RECEIPT_PAYLOAD_EMPTY'))
                        await dispatchReceipt(b64, {
                          receipt_printer_name: form.receipt_printer_name,
                          receipt_printer_port: form.receipt_printer_port,
                          label_printer_name: form.label_printer_name,
                          label_printer_port: form.label_printer_port,
                        })
                        setActionToast({ kind: 'ok', message: t('admin.settings.testReceiptOk') })
                      } catch (e: unknown) {
                        const rawMessage = e instanceof Error ? e.message : String(e || '')
                        if (isPrinterError(rawMessage)) {
                          setActionToast({ kind: 'err', message: translatePrinterError(rawMessage) })
                          return
                        }
                        const code = (e as Error & { code?: string }).code
                        setActionToast({
                          kind: 'err',
                          message: code
                            ? t(`err.${code}`, { defaultValue: rawMessage || t('err.TEST_RECEIPT_FAILED') })
                            : rawMessage || t('err.TEST_RECEIPT_FAILED'),
                        })
                      }
                    }}
                  >
                    {t('admin.settings.testReceipt')}
                  </button>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">
                      {t('admin.settings.receiptPaperWidth')}
                    </label>
                    <select
                      className={inputSoftCls}
                      value={form.receipt_width}
                      onChange={(e) => setForm({ ...form, receipt_width: e.target.value as '58mm' | '80mm' })}
                    >
                      <option value="58mm">{t('admin.settings.receiptPaperWidth58')}</option>
                      <option value="80mm">{t('admin.settings.receiptPaperWidth80')}</option>
                    </select>
                    <p className="text-xs text-slate-500 leading-snug">{t('admin.settings.receiptPaperWidthHelp')}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">
                      {t('admin.settings.receiptFontSize')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      step={1}
                      className={inputSoftCls}
                      value={String(form.receipt_font_size ?? 0)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          receipt_font_size: Math.max(0, Math.min(40, Number(e.target.value || 0))),
                        })
                      }
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500 leading-snug">{t('admin.settings.receiptFontSizeHelp')}</p>
                    {(form.receipt_font_size ?? 0) === 0 && (
                      <p className="text-xs text-emerald-600/90">
                        {t('admin.settings.receiptFontSizeAutoPreview', {
                          size: form.receipt_width === '80mm' ? 26 : 22,
                        })}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">
                      {t('admin.settings.receiptLanguage')}
                    </label>
                    <select
                      className={inputSoftCls}
                      value={form.receipt_lang || ''}
                      onChange={(e) => {
                        const lang = e.target.value
                        setForm({
                          ...form,
                          receipt_lang: lang,
                          // Rus/kirill matn: RAW codepage ko‘pincha xitoycha chiqadi → rasm.
                          ...(lang === 'ru' ? { receipt_render_mode: 'image' as const } : {}),
                        })
                      }}
                    >
                      <option value="">{t('admin.settings.receiptLanguageAuto')}</option>
                      <option value="uz">{t('admin.settings.receiptLangUz')}</option>
                      <option value="ru">{t('admin.settings.receiptLangRu')}</option>
                    </select>
                    <p className="text-xs text-slate-500 leading-snug">
                      {t('admin.settings.receiptLanguageHelp')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">
                      {t('admin.settings.receiptRenderMode')}
                    </label>
                    <select
                      className={inputSoftCls}
                      value={form.receipt_render_mode === 'image' ? 'image' : 'text'}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          receipt_render_mode: e.target.value === 'image' ? 'image' : 'text',
                        })
                      }
                    >
                      <option value="image">{t('admin.settings.receiptRenderModeImage')}</option>
                      <option value="text">{t('admin.settings.receiptRenderModeText')}</option>
                    </select>
                    <p className="text-xs text-slate-500 leading-snug">
                      {form.receipt_render_mode === 'image'
                        ? t('admin.settings.receiptRenderModeImageHelp')
                        : t('admin.settings.receiptRenderModeTextHelp')}
                    </p>
                  </div>

                  <div className="flex justify-between pt-2">
                    <label className="flex items-center gap-3 min-h-12 text-base">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={form.auto_print_on_sale}
                        onChange={(e) => setForm({ ...form, auto_print_on_sale: e.target.checked })}
                      />
                      {t('admin.settings.autoPrintOnSale')}
                    </label>
                    <button
                      type="button"
                      className="touch-btn min-h-12 px-6 rounded-xl bg-emerald-700 border border-emerald-500 font-medium"
                      onClick={() => setHwStep(2)}
                    >
                      {t('admin.settings.hwWizard.next')}
                    </button>
                  </div>
                </div>
              )}

              {hwStep === 2 && !form.label_printing_enabled && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">{t('admin.settings.labelStepSkipped')}</p>
                  <div className="flex justify-between pt-2">
                    <button
                      type="button"
                      className="touch-btn min-h-12 px-6 rounded-xl bg-slate-800 border border-slate-600"
                      onClick={() => setHwStep(1)}
                    >
                      {t('admin.settings.hwWizard.back')}
                    </button>
                    <button
                      type="button"
                      className="touch-btn min-h-12 px-6 rounded-xl bg-emerald-700 border border-emerald-500 font-medium"
                      onClick={() => setHwStep(3)}
                    >
                      {t('admin.settings.hwWizard.next')}
                    </button>
                  </div>
                </div>
              )}

              {hwStep === 2 && form.label_printing_enabled && (
                <div className="space-y-3">
                  <div className="text-slate-300">{t('admin.settings.hwWizard.step2')}</div>
                  <label className="block text-xs text-slate-400">{t('admin.settings.labelPrinterName')}</label>
                  <input
                    list="printer-options"
                    className={inputSoftCls}
                    value={form.label_printer_name}
                    onChange={(e) => setForm({ ...form, label_printer_name: e.target.value })}
                    placeholder={t('admin.settings.labelPrinterNameExample')}
                  />
                  <label className="block text-xs text-slate-400">
                    {t('admin.settings.labelPrinterPortLabel', { defaultValue: 'Label port (e.g. USB002)' })}
                  </label>
                  <input
                    className={inputSoftCls}
                    value={form.label_printer_port || ''}
                    onChange={(e) => setForm({ ...form, label_printer_port: e.target.value })}
                    placeholder="USB002"
                  />
                  <p className="text-xs text-slate-500">{t('admin.settings.printerNameHelp')}</p>
                  <label className="block text-xs text-slate-400">{t('admin.settings.labelPrinterType')}</label>
                  <select
                    className={inputSoftCls}
                    value={form.label_printer_type}
                    onChange={(e) =>
                      setForm({ ...form, label_printer_type: e.target.value as 'ESC_POS' | 'TSPL' })
                    }
                  >
                    <option value="TSPL">TSPL</option>
                    <option value="ESC_POS">ESC/POS</option>
                  </select>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">{t('admin.settings.defaultLabelSize')}</label>
                    <select
                      className={inputSoftCls}
                      value={form.default_label_size || '40x30'}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          default_label_size: e.target.value as LabelStickerSize,
                        })
                      }
                    >
                      {LABEL_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {t(`admin.settings.labelSize.${size}`)}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 leading-snug">{t('admin.settings.defaultLabelSizeHelp')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 block">
                      <span className="block text-xs text-slate-400">{t('admin.settings.labelGapMm')}</span>
                      <input
                        type="number"
                        min={0.5}
                        max={20}
                        step={0.5}
                        className={inputSoftCls}
                        value={String(form.label_gap_mm ?? 2)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            label_gap_mm: Math.max(0.5, Math.min(20, Number(e.target.value || 2))),
                          })
                        }
                      />
                    </label>
                    <label className="space-y-1 block">
                      <span className="block text-xs text-slate-400">{t('admin.settings.labelDirection')}</span>
                      <select
                        className={inputSoftCls}
                        value={String(form.label_direction ?? 1)}
                        onChange={(e) =>
                          setForm({ ...form, label_direction: Number(e.target.value) === 0 ? 0 : 1 })
                        }
                      >
                        <option value="1">1</option>
                        <option value="0">0</option>
                      </select>
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 leading-snug">{t('admin.settings.labelGapDirectionHelp')}</p>
                  <label className="flex items-center gap-3 min-h-12 text-base">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={form.show_price_on_labels_default}
                      onChange={(e) =>
                        setForm({ ...form, show_price_on_labels_default: e.target.checked })
                      }
                    />
                    <span>
                      <span className="font-medium">{t('admin.settings.showPriceOnLabels')}</span>
                      <span className="block text-xs text-slate-400 font-normal">
                        {t('admin.settings.showPriceOnLabelsHelp')}
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    className="touch-btn min-h-12 px-5 rounded-xl bg-slate-800 border border-slate-600 disabled:opacity-50"
                    onClick={async () => {
                      setBusy(true)
                      try {
                        // Persist size/type before test so backend uses current store defaults.
                        await onSave({ ...form, logo: null })
                        const out = await testLabelPrintPayload()
                        const b64 = (out.raw_base64 || out.escpos_base64 || '').trim()
                        if (!b64) throw new Error(t('err.TEST_LABEL_FAILED'))
                        await dispatchLabel(b64, {
                          label_printer_name: form.label_printer_name,
                          label_printer_port: form.label_printer_port,
                        })
                        setActionToast({ kind: 'ok', message: t('admin.settings.testLabelOk') })
                      } catch (e: unknown) {
                        const rawMessage = e instanceof Error ? e.message : String(e || '')
                        if (isPrinterError(rawMessage)) {
                          setActionToast({ kind: 'err', message: translatePrinterError(rawMessage) })
                          return
                        }
                        const code = (e as Error & { code?: string }).code
                        setActionToast({
                          kind: 'err',
                          message: code
                            ? t(`err.${code}`, { defaultValue: rawMessage || t('err.TEST_LABEL_FAILED') })
                            : rawMessage || t('err.TEST_LABEL_FAILED'),
                        })
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    {t('admin.settings.testLabel')}
                  </button>
                  <div className="flex justify-between pt-2">
                    <button
                      type="button"
                      className="touch-btn min-h-12 px-6 rounded-xl bg-slate-800 border border-slate-600"
                      onClick={() => setHwStep(1)}
                    >
                      {t('admin.settings.hwWizard.back')}
                    </button>
                    <button
                      type="button"
                      className="touch-btn min-h-12 px-6 rounded-xl bg-emerald-700 border border-emerald-500 font-medium"
                      onClick={() => setHwStep(3)}
                    >
                      {t('admin.settings.hwWizard.next')}
                    </button>
                  </div>
                </div>
              )}

              {hwStep === 3 && (
                <div className="space-y-3">
                  <div className="text-slate-300">{t('admin.settings.hwWizard.step3')}</div>
                  <select
                    className={inputSoftCls}
                    value={form.scanner_mode}
                    onChange={(e) => setForm({ ...form, scanner_mode: e.target.value as 'keyboard' | 'serial' })}
                  >
                    <option value="keyboard">{t('admin.settings.scannerModeKeyboard')}</option>
                    <option value="serial">{t('admin.settings.scannerModeSerial')}</option>
                  </select>
                  {form.scanner_mode === 'serial' && (
                    <p className="text-xs text-amber-200/90 rounded-lg border border-amber-700/50 bg-amber-950/30 p-2">
                      {t('admin.settings.scannerSerialHint')}
                    </p>
                  )}
                  <label className="block text-xs text-slate-400">{t('admin.settings.scannerPrefix')}</label>
                  <input
                    className={inputSoftCls}
                    value={form.scanner_prefix}
                    onChange={(e) => setForm({ ...form, scanner_prefix: e.target.value })}
                    placeholder={t('admin.settings.scannerPrefixExample')}
                  />
                  <label className="block text-xs text-slate-400">{t('admin.settings.scannerSuffix')}</label>
                  <input
                    className={inputSoftCls}
                    value={form.scanner_suffix}
                    onChange={(e) => setForm({ ...form, scanner_suffix: e.target.value })}
                    placeholder={t('admin.settings.scannerSuffixExample')}
                  />
                  <p className="text-xs text-slate-500">{t('admin.settings.scannerSuffixHelp')}</p>
                  <input
                    className={inputSoftCls}
                    value={scannerTest}
                    onChange={(e) => {
                      const raw = e.target.value
                      const suffixRaw = (form.scanner_suffix || '').trim()
                      const suffix = suffixRaw === '\\t' ? '\t' : suffixRaw === '\\n' ? '\n' : suffixRaw
                      const normalized = suffix && raw.includes(suffix) ? raw.replaceAll(suffix, '') : raw
                      setScannerTest(normalized)
                      setScannerTestOk(Boolean(normalized.trim()))
                    }}
                    placeholder={t('admin.settings.scannerTestField')}
                  />
                  {scannerTestOk && <div className="text-sm text-emerald-400">{t('admin.settings.scannerTestOk')}</div>}
                  <div className="flex justify-between gap-3 pt-2">
                    <button
                      type="button"
                      className="touch-btn min-h-12 px-6 rounded-xl bg-slate-800 border border-slate-600"
                      onClick={() => setHwStep(2)}
                    >
                      {t('admin.settings.hwWizard.back')}
                    </button>
                    <button
                      type="button"
                      className="touch-btn min-h-12 px-6 rounded-xl bg-emerald-800 border border-emerald-600 font-medium"
                      onClick={() => setHwStep(1)}
                    >
                      {t('admin.settings.hwWizard.restartWizard')}
                    </button>
                  </div>
                </div>
              )}
            </div>
              </div>
              <div className="space-y-4 xl:sticky xl:top-4">
            <div className={sectionCardCls}>
            <label className="text-sm flex items-center gap-2 hidden">
              <input
                type="checkbox"
                checked={form.transliterate_uz}
                onChange={(e) => setForm({ ...form, transliterate_uz: e.target.checked })}
              />
              {t('admin.settings.transliterate')}
            </label>
            <label className="block text-xs text-slate-400">
              {t('admin.settings.lockTimeout', { defaultValue: 'Auto-lock timeout (minutes)' })}
            </label>
            <input
              type="number"
              min={1}
              max={240}
              className={inputCls}
              value={String(form.lock_timeout_minutes ?? 5)}
              onChange={(e) =>
                setForm({ ...form, lock_timeout_minutes: Math.max(1, Number(e.target.value || 5)) })
              }
            />
            </div>
            <div className={sectionCardCls}>
              <div className="inline-flex items-center gap-2 text-slate-200">
                <Cog className="h-4 w-4 text-emerald-400" />
                <h3 className="font-medium">{t('admin.settings.inventoryPricing', { defaultValue: 'Inventory & Pricing' })}</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs text-slate-400">
                    {t('admin.settings.lowStockThreshold', { defaultValue: 'Low Stock Threshold (units)' })}
                  </label>
                  <input
                    type="number"
                    min={0.1}
                    max={1000}
                    step={0.1}
                    className={inputCls}
                    value={form.low_stock_threshold ?? 2}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value || 2))
                      setForm({ ...form, low_stock_threshold: val })
                    }}
                  />
                  <p className="text-xs text-slate-500">
                    {t('admin.settings.lowStockThresholdHelp', { defaultValue: 'Products below this quantity will be marked as low stock' })}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 min-h-12 text-base">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={form.show_selling_price_in_catalog ?? false}
                      onChange={(e) => {
                        setForm({ ...form, show_selling_price_in_catalog: e.target.checked })
                      }}
                    />
                    {t('admin.settings.showSellingPrice', { defaultValue: 'Show selling price in catalog' })}
                  </label>
                  <p className="text-xs text-slate-500">
                    {t('admin.settings.showSellingPriceHelp', { defaultValue: 'Display selling price in product list and POS' })}
                  </p>
                </div>
              </div>
            </div>
            
              <div className="flex flex-wrap gap-2 items-center rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
        <HardDriveDownload className="h-5 w-5 text-emerald-400 shrink-0" />
        <div className="mr-auto">
          <div className="font-medium text-slate-200">{t('admin.settings.backupNow')}</div>
          <div className="text-xs text-slate-400">{t('admin.settings.backupHint')}</div>
        </div>
        <button
          type="button"
          className="touch-btn min-h-12 px-3 py-2 rounded bg-slate-800 border border-slate-700 disabled:opacity-50"
          disabled={backupBusy}
          onClick={async () => {
            setBackupBusy(true)
            try {
              const res = await onBackupNow()
              setBackupMsg(res.backup_path)
              setActionToast({
                kind: 'ok',
                message: `${t('admin.settings.backupSuccess')}: ${shortBackupName(res.backup_path)}`,
              })
            } catch (e: unknown) {
              const code = (e as Error & { code?: string }).code
              const message = t(`err.${code || 'BACKUP_FAILED'}`, {
                defaultValue: t('err.BACKUP_FAILED'),
              })
              setActionToast({ kind: 'err', message: `${message}. ${t('admin.settings.backupRetry')}` })
            } finally {
              setBackupBusy(false)
            }
          }}
        >
          {backupBusy ? t('admin.settings.backingUp') : t('admin.settings.backupNow')}
        </button>
        {backupMsg && <span className="text-xs text-slate-400">{backupMsg}</span>}
      </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="touch-btn min-h-14 px-6 rounded-xl bg-emerald-700 border border-emerald-500 disabled:opacity-40 text-base font-semibold"
            >
              {busy ? t('admin.common.saving') : t('admin.settings.saveSettings')}
            </button>
          </form>
        </>
      )}
      {activeTab === 'bots' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 inline-flex items-center gap-2 text-slate-200">
            <Bot className="h-5 w-5 text-emerald-400" />
            <span className="font-medium">{t('admin.settings.tabBots')}</span>
          </div>
          <p className="text-xs text-slate-400">{t('admin.settings.botsHelp')}</p>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 space-y-2">
            <h3 className="font-medium">{t('admin.bots.telegram')}</h3>
            <label className="block text-xs text-slate-400">{t('admin.bots.telegramToken')}</label>
            <input
              className="touch-btn min-h-12 w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
              value={integrationForm.telegram_bot_token}
              onChange={(e) => setIntegrationForm((p) => ({ ...p, telegram_bot_token: e.target.value }))}
              placeholder={t('admin.bots.telegramToken')}
              onFocus={() => {
                if ((integrationForm.telegram_bot_token || '').includes('*')) {
                  setIntegrationForm((p) => ({ ...p, telegram_bot_token: '' }))
                }
              }}
            />
            <label className="block text-xs text-slate-400">{t('admin.bots.telegramChatId')}</label>
            <input
              className="touch-btn min-h-12 w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
              value={integrationForm.telegram_chat_id}
              onChange={(e) => setIntegrationForm((p) => ({ ...p, telegram_chat_id: e.target.value }))}
              placeholder={t('admin.bots.telegramChatId')}
            />
            <p className="text-xs text-slate-500">{t('admin.bots.telegramChatIdHelp')}</p>
            <label className="block text-xs text-slate-400">{t('admin.bots.reportLang')}</label>
            <select
              className="touch-btn min-h-12 w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
              value={integrationForm.report_lang || ''}
              onChange={(e) =>
                setIntegrationForm((p) => ({
                  ...p,
                  report_lang: e.target.value as '' | 'uz' | 'ru' | 'uz-cyrl',
                }))
              }
            >
              <option value="">{t('admin.bots.reportLangAuto')}</option>
              <option value="uz">{t('lang.uz')}</option>
              <option value="uz-cyrl">{t('lang.uz-cyrl')}</option>
              <option value="ru">{t('lang.ru')}</option>
            </select>
            <label className="flex items-center gap-3 touch-btn min-h-12 cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-slate-600"
                checked={integrationForm.auto_daily_z_report_enabled !== false}
                onChange={(e) =>
                  setIntegrationForm((p) => ({
                    ...p,
                    auto_daily_z_report_enabled: e.target.checked,
                  }))
                }
              />
              <span className="text-sm text-slate-200">{t('admin.bots.autoDailyZ')}</span>
            </label>
            <p className="text-xs text-slate-500">{t('admin.bots.autoDailyZHelp')}</p>
            <label className="flex items-center gap-3 touch-btn min-h-12 cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-slate-600"
                checked={integrationForm.auto_low_stock_report_enabled !== false}
                onChange={(e) =>
                  setIntegrationForm((p) => ({
                    ...p,
                    auto_low_stock_report_enabled: e.target.checked,
                  }))
                }
              />
              <span className="text-sm text-slate-200">{t('admin.bots.autoLowStock')}</span>
            </label>
            <p className="text-xs text-slate-500">{t('admin.bots.autoLowStockHelp')}</p>
            <label className="block text-xs text-slate-400">{t('admin.bots.telegramDbBackup')}</label>
            <select
              className="touch-btn min-h-12 w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
              value={String(integrationForm.telegram_db_backup_interval_days ?? 3)}
              onChange={(e) =>
                setIntegrationForm((p) => ({
                  ...p,
                  telegram_db_backup_interval_days: Number(e.target.value) as 0 | 1 | 3,
                }))
              }
            >
              <option value="0">{t('admin.bots.telegramDbBackupOff')}</option>
              <option value="1">{t('admin.bots.telegramDbBackupDaily')}</option>
              <option value="3">{t('admin.bots.telegramDbBackup3Days')}</option>
            </select>
            <p className="text-xs text-slate-500">{t('admin.bots.telegramDbBackupHelp')}</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 space-y-2">
            <h3 className="font-medium">{t('admin.bots.whatsapp')}</h3>
            <label className="block text-xs text-slate-400">{t('admin.bots.whatsappApiBase')}</label>
            <input
              className="touch-btn min-h-12 w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
              value={integrationForm.whatsapp_api_base}
              onChange={(e) => setIntegrationForm((p) => ({ ...p, whatsapp_api_base: e.target.value }))}
              placeholder={t('admin.bots.whatsappApiBase')}
            />
            <p className="text-xs text-slate-500">{t('admin.bots.whatsappApiBaseHelp')}</p>
            <label className="block text-xs text-slate-400">{t('admin.bots.whatsappProvider')}</label>
            <select
              className="touch-btn min-h-12 w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
              value={integrationForm.whatsapp_provider}
              onChange={(e) =>
                setIntegrationForm((p) => ({
                  ...p,
                  whatsapp_provider: e.target.value as 'GREEN_API' | 'CUSTOM',
                }))
              }
            >
              <option value="GREEN_API">GreenAPI</option>
              <option value="CUSTOM">Custom API</option>
            </select>
            {integrationForm.whatsapp_provider === 'GREEN_API' && (
              <>
                <label className="block text-xs text-slate-400">{t('admin.bots.greenApiInstanceId')}</label>
                <input
                  className="touch-btn min-h-12 w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
                  value={integrationForm.greenapi_instance_id}
                  onChange={(e) => setIntegrationForm((p) => ({ ...p, greenapi_instance_id: e.target.value }))}
                  placeholder={t('admin.bots.greenApiInstanceId')}
                />
                <label className="block text-xs text-slate-400">{t('admin.bots.greenApiTokenInstance')}</label>
                <input
                  className="touch-btn min-h-12 w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
                  value={integrationForm.greenapi_api_token_instance}
                  onChange={(e) =>
                    setIntegrationForm((p) => ({ ...p, greenapi_api_token_instance: e.target.value }))
                  }
                  placeholder={t('admin.bots.greenApiTokenInstance')}
                  onFocus={() => {
                    if ((integrationForm.greenapi_api_token_instance || '').includes('*')) {
                      setIntegrationForm((p) => ({ ...p, greenapi_api_token_instance: '' }))
                    }
                  }}
                />
              </>
            )}
            <label className="block text-xs text-slate-400">{t('admin.bots.whatsappToken')}</label>
            <input
              className="touch-btn min-h-12 w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
              value={integrationForm.whatsapp_api_token}
              onChange={(e) => setIntegrationForm((p) => ({ ...p, whatsapp_api_token: e.target.value }))}
              placeholder={t('admin.bots.whatsappToken')}
              onFocus={() => {
                if ((integrationForm.whatsapp_api_token || '').includes('*')) {
                  setIntegrationForm((p) => ({ ...p, whatsapp_api_token: '' }))
                }
              }}
            />
            <label className="block text-xs text-slate-400">{t('admin.bots.whatsappSender')}</label>
            <input
              className="touch-btn min-h-12 w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
              value={integrationForm.whatsapp_sender}
              onChange={(e) => setIntegrationForm((p) => ({ ...p, whatsapp_sender: e.target.value }))}
              placeholder={t('admin.bots.whatsappSender')}
            />
            <label className="block text-xs text-slate-400">{t('admin.bots.primaryChannel', { defaultValue: 'Primary Z-Report channel' })}</label>
            <select
              className="touch-btn min-h-12 w-full px-3 py-2 rounded bg-slate-950 border border-slate-700"
              value={integrationForm.primary_report_channel || 'both'}
              onChange={(e) =>
                setIntegrationForm((p) => ({
                  ...p,
                  primary_report_channel: e.target.value as 'telegram' | 'whatsapp' | 'both',
                }))
              }
            >
              <option value="telegram">Telegram</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="both">Both</option>
            </select>
            <label className="flex items-center gap-3 touch-btn min-h-12 cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-slate-600"
                checked={integrationForm.auto_debt_whatsapp_reminder_enabled !== false}
                onChange={(e) =>
                  setIntegrationForm((p) => ({
                    ...p,
                    auto_debt_whatsapp_reminder_enabled: e.target.checked,
                  }))
                }
              />
              <span className="text-sm text-slate-200">
                {t('admin.bots.autoDebtReminder', {
                  defaultValue: 'Har kuni avtomatik qarz eslatmasi (WhatsApp)',
                })}
              </span>
            </label>
            <p className="text-xs text-slate-500">
              {t('admin.bots.autoDebtReminderHelp', {
                defaultValue:
                  "Har kuni soat 09:00 da ochiq qarzdorlarga savdo va mahsulot tafsilotlari bilan xabar yuboriladi.",
              })}
            </p>
          </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 space-y-3">
            <h3 className="font-medium">{t('admin.bots.reportChannels')}</h3>
            <p className="text-xs text-slate-500">{t('admin.bots.reportChannelsHelp')}</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                className="touch-btn min-h-12 px-3 py-2 rounded bg-slate-950 border border-slate-700 md:col-span-1"
                placeholder={t('admin.bots.channelName')}
                value={channelDraft.name}
                onChange={(e) => setChannelDraft((p) => ({ ...p, name: e.target.value }))}
              />
              <select
                className="touch-btn min-h-12 px-3 py-2 rounded bg-slate-950 border border-slate-700"
                value={channelDraft.kind}
                onChange={(e) =>
                  setChannelDraft((p) => ({
                    ...p,
                    kind: e.target.value as 'telegram' | 'whatsapp',
                  }))
                }
              >
                <option value="telegram">Telegram</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <input
                className="touch-btn min-h-12 px-3 py-2 rounded bg-slate-950 border border-slate-700 md:col-span-1"
                placeholder={t('admin.bots.channelAddress')}
                value={channelDraft.address}
                onChange={(e) => setChannelDraft((p) => ({ ...p, address: e.target.value }))}
              />
              <button
                type="button"
                disabled={routingBusy || !channelDraft.name.trim() || !channelDraft.address.trim()}
                className="touch-btn min-h-12 px-3 rounded bg-slate-800 border border-slate-600 disabled:opacity-40"
                onClick={async () => {
                  setRoutingBusy(true)
                  try {
                    await createReportChannel({
                      name: channelDraft.name.trim(),
                      kind: channelDraft.kind,
                      address: channelDraft.address.trim(),
                      is_active: true,
                    })
                    setChannelDraft({ name: '', kind: 'telegram', address: '' })
                    await reloadReportRouting()
                    setActionToast({ kind: 'ok', message: t('admin.bots.channelSaved') })
                  } catch {
                    setActionToast({ kind: 'err', message: t('msg.errorGeneric') })
                  } finally {
                    setRoutingBusy(false)
                  }
                }}
              >
                {t('admin.bots.addChannel')}
              </button>
            </div>
            <div className="space-y-2">
              {reportChannels.length === 0 && (
                <p className="text-sm text-slate-500">{t('admin.bots.noChannels')}</p>
              )}
              {reportChannels.map((ch) => (
                <div
                  key={ch.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2"
                >
                  <span className="text-sm font-medium text-slate-100 min-w-[8rem]">{ch.name}</span>
                  <span className="text-xs uppercase text-slate-400">{ch.kind}</span>
                  <span className="text-sm text-slate-300 font-mono flex-1 break-all">{ch.address}</span>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-600"
                      checked={ch.is_active}
                      onChange={async (e) => {
                        setRoutingBusy(true)
                        try {
                          await updateReportChannel(ch.id, { is_active: e.target.checked })
                          await reloadReportRouting()
                        } catch {
                          setActionToast({ kind: 'err', message: t('msg.errorGeneric') })
                        } finally {
                          setRoutingBusy(false)
                        }
                      }}
                    />
                    {t('admin.bots.channelActive')}
                  </label>
                  <button
                    type="button"
                    disabled={routingBusy}
                    className="touch-btn min-h-10 px-3 rounded border border-rose-700/60 text-rose-300 text-sm disabled:opacity-40"
                    onClick={async () => {
                      setRoutingBusy(true)
                      try {
                        await deleteReportChannel(ch.id)
                        await reloadReportRouting()
                      } catch {
                        setActionToast({ kind: 'err', message: t('msg.errorGeneric') })
                      } finally {
                        setRoutingBusy(false)
                      }
                    }}
                  >
                    {t('admin.bots.deleteChannel')}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 space-y-3">
            <h3 className="font-medium">{t('admin.bots.reportRoutes')}</h3>
            <p className="text-xs text-slate-500">{t('admin.bots.reportRoutesHelp')}</p>
            {reportRoutes.map((route) => {
              const selected = new Set(route.channels.map((c) => c.id))
              const typeLabel =
                route.report_type === 'daily_z'
                  ? t('admin.bots.routeDailyZ')
                  : route.report_type === 'low_stock'
                    ? t('admin.bots.routeLowStock')
                    : t('admin.bots.routeDbBackup')
              return (
                <div key={route.id} className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-100">{typeLabel}</span>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-600"
                        checked={route.enabled}
                        onChange={async (e) => {
                          setRoutingBusy(true)
                          try {
                            await updateReportRoute(route.id, { enabled: e.target.checked })
                            await reloadReportRouting()
                          } catch {
                            setActionToast({ kind: 'err', message: t('msg.errorGeneric') })
                          } finally {
                            setRoutingBusy(false)
                          }
                        }}
                      />
                      {t('admin.bots.routeEnabled')}
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {reportChannels.map((ch) => {
                      const disabledForBackup =
                        route.report_type === 'db_backup' && ch.kind !== 'telegram'
                      return (
                        <label
                          key={`${route.id}-${ch.id}`}
                          className={`flex items-center gap-2 text-sm ${
                            disabledForBackup ? 'text-slate-600' : 'text-slate-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-600"
                            disabled={disabledForBackup || routingBusy}
                            checked={selected.has(ch.id)}
                            onChange={async (e) => {
                              const next = new Set(selected)
                              if (e.target.checked) next.add(ch.id)
                              else next.delete(ch.id)
                              setRoutingBusy(true)
                              try {
                                await updateReportRoute(route.id, {
                                  channel_ids: Array.from(next),
                                })
                                await reloadReportRouting()
                              } catch {
                                setActionToast({ kind: 'err', message: t('msg.errorGeneric') })
                              } finally {
                                setRoutingBusy(false)
                              }
                            }}
                          />
                          {ch.name}
                        </label>
                      )
                    })}
                    {reportChannels.length === 0 && (
                      <span className="text-xs text-slate-500">{t('admin.bots.noChannels')}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="touch-btn min-h-12 px-4 py-2 rounded bg-emerald-700 border border-emerald-500 disabled:opacity-40"
              onClick={async () => {
                setBusy(true)
                try {
                  await runAction(t('admin.bots.save'), () => onSaveIntegrations(integrationForm))
                  await reloadReportRouting()
                } finally {
                  setBusy(false)
                }
              }}
            >
              {t('admin.bots.save')}
            </button>
            <button
              type="button"
              disabled={busy}
              className="touch-btn min-h-12 px-4 py-2 rounded bg-slate-800 border border-slate-700 disabled:opacity-40"
              onClick={async () => {
                setBusy(true)
                try {
                  await runAction(t('admin.bots.sendZReport'), () => onSendZReport())
                } finally {
                  setBusy(false)
                }
              }}
            >
              {t('admin.bots.sendZReport')}
            </button>
            <button
              type="button"
              disabled={busy}
              className="touch-btn min-h-12 px-4 py-2 rounded bg-slate-800 border border-slate-700 disabled:opacity-40"
              onClick={async () => {
                setBusy(true)
                try {
                  await runAction(t('admin.bots.sendLowStock'), () => sendLowStockReport())
                } finally {
                  setBusy(false)
                }
              }}
            >
              {t('admin.bots.sendLowStock')}
            </button>
          </div>
        </div>
      )}
      {activeTab === 'security' && (
        <div className="space-y-3 max-w-4xl">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 inline-flex items-center gap-2 text-slate-200">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <span className="font-medium">{t('admin.settings.tabSecurity')}</span>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 space-y-3">
            <h3 className="text-lg font-semibold">{t('license.title')}</h3>
            <div className="text-sm text-slate-300 space-y-1">
              <p>
                {t('license.demoCardTitle', { defaultValue: 'Demo muddat: {{left}} kun qoldi', left: licenseStatus?.demo_days_left ?? 0 })}
              </p>
              <p>
                {t('license.demoExpires', { defaultValue: 'Demo tugash sanasi' })}: {licenseStatus?.demo_expires_at || '-'}
              </p>
              <p>
                {t('license.expiresLabel')}:{' '}
                {licenseStatus?.license_type === 'lifetime'
                  ? t('license.lifetimeLabel')
                  : licenseStatus?.expires_at || '-'}
              </p>
              {licenseStatus?.activation_mode === 'offline' && (
                <p className="text-emerald-400/90">{t('license.offlineActivateSuccess')}</p>
              )}
              <p className="break-all">
                {t('license.hardwareIdLabel', { defaultValue: 'Hardware ID' })}: {hardwareId || t('admin.common.na')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-400 space-y-1">
              <p className="font-medium text-slate-300">{t('admin.settings.appVersionTitle')}</p>
              <p className="tabular-nums text-slate-200">{BUILD_INFO.fullVersion}</p>
              {BUILD_INFO.builtAt ? (
                <p className="text-xs">
                  {t('admin.settings.appVersionBuiltAt')}:{' '}
                  {new Date(BUILD_INFO.builtAt).toLocaleString()}
                </p>
              ) : null}
              {BUILD_INFO.git ? (
                <p className="text-xs font-mono break-all">
                  {t('admin.settings.appVersionGit')}: {BUILD_INFO.git}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-sky-700/60 bg-sky-950/30 p-3 text-sm text-sky-100 space-y-1">
              <p className="font-medium">{t('license.contactDeveloperTitle')}</p>
              <p className="text-sky-200/90">{t('license.contactDeveloperHint')}</p>
              <p className="text-sky-200/90">{t('license.contactDeveloperTelegram1')}</p>
              <p className="text-sky-200/90">{t('license.contactDeveloperTelegram2')}</p>
              <p className="text-sky-200/90">{t('license.contactDeveloperPhone1')}</p>
              <p className="text-sky-200/90">{t('license.contactDeveloperPhone2')}</p>
            </div>
            <p className="text-xs text-slate-500">{t('license.offlineHint')}</p>
            <input
              className="touch-btn w-full min-h-14 px-4 rounded-xl bg-slate-950 border border-slate-700 text-base"
              value={activationKey}
              onChange={(e) => setActivationKey(e.target.value)}
              placeholder={t('license.keyPlaceholder')}
            />
            <button
              type="button"
              disabled={licenseBusy || !activationKey.trim() || !hardwareId.trim()}
              className="touch-btn min-h-12 px-5 rounded-xl bg-emerald-700 border border-emerald-500 disabled:opacity-50"
              onClick={async () => {
                setLicenseBusy(true)
                try {
                  const next = await activateLicense(hardwareId.trim(), activationKey.trim())
                  setLicenseStatus(next)
                  setActivationKey('')
                  const okMsg =
                    next.activation_mode === 'offline' || next.license_type === 'lifetime'
                      ? t('license.offlineActivateSuccess')
                      : t('license.activate')
                  setActionToast({ kind: 'ok', message: okMsg })
                } catch (e: unknown) {
                  const code = (e as Error & { code?: string }).code
                  setActionToast({
                    kind: 'err',
                    message: t(`err.${code || 'LICENSE_ACTIVATE_FAILED'}`, { defaultValue: t('msg.errorGeneric') }),
                  })
                } finally {
                  setLicenseBusy(false)
                }
              }}
            >
              {licenseBusy ? t('admin.common.saving') : t('license.activate')}
            </button>
          </div>
          <h3 className="text-lg font-semibold">{t('admin.settings.pinUsers', { defaultValue: 'User PIN management' })}</h3>
          <div className="rounded-2xl border border-slate-700 overflow-hidden bg-slate-900/40">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left p-2">{t('auth.username')}</th>
                  <th className="text-left p-2">{t('admin.sales.role', { defaultValue: 'Role' })}</th>
                  <th className="text-left p-2">{t('auth.pin', { defaultValue: 'PIN' })}</th>
                  <th className="text-right p-2">{t('admin.catalog.action')}</th>
                </tr>
              </thead>
              <tbody>
                {pinUsers.map((u) => (
                  <tr key={u.username} className="border-t border-slate-800">
                    <td className="p-2">{u.display_name}</td>
                    <td className="p-2">{u.role}</td>
                    <td className="p-2">
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        className="touch-btn min-h-12 w-32 px-3 py-2 rounded bg-slate-950 border border-slate-700 text-base"
                        value={pinDrafts[u.username] || ''}
                        onChange={(e) =>
                          setPinDrafts((p) => ({
                            ...p,
                            [u.username]: e.target.value.replace(/\D/g, '').slice(0, 4),
                          }))
                        }
                        placeholder={u.pin_enabled ? '****' : '1234'}
                      />
                    </td>
                    <td className="p-2 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          className="touch-btn min-h-12 px-3 py-2 rounded bg-emerald-700 border border-emerald-500"
                          onClick={async () => {
                            const pin = pinDrafts[u.username] || ''
                            if (pin.length !== 4) return
                            await runAction(t('admin.settings.saveSettings'), async () => {
                              await setUserPin(u.username, pin, true)
                              setPinUsers(await fetchPinUsers())
                            })
                          }}
                        >
                          {t('admin.common.save')}
                        </button>
                        <button
                          type="button"
                          className="touch-btn min-h-12 px-3 py-2 rounded bg-slate-800 border border-slate-700"
                          onClick={async () => {
                            await runAction(t('admin.settings.saveSettings'), async () => {
                              await setUserPin(u.username, '0000', false)
                              setPinUsers(await fetchPinUsers())
                            })
                          }}
                        >
                          {t('admin.settings.resetPin', { defaultValue: 'Reset' })}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      

      {canManageInventory && activeTab === 'security' && (
        <div className="pt-6 border-t border-slate-800 space-y-3">
          <h3 className="text-lg font-semibold">{t('admin.settings.stocktakeTitle')}</h3>
          {!stocktake && (
          <div className="flex flex-wrap gap-2">
            <input
              className="touch-btn min-h-12 px-3 py-2 rounded bg-slate-900 border border-slate-700"
              value={stocktakeNote}
              onChange={(e) => setStocktakeNote(e.target.value)}
              placeholder={t('admin.settings.sessionNote')}
            />
            <button
              type="button"
              className="touch-btn min-h-12 px-3 py-2 rounded bg-emerald-700 border border-emerald-500 disabled:opacity-50"
              disabled={stocktakeBusy}
              onClick={async () => {
                setStocktakeBusy(true)
                try {
                  await runAction(t('admin.settings.stocktakeStart'), () => onCreateStocktake(stocktakeNote))
                } finally {
                  setStocktakeBusy(false)
                }
              }}
            >
              {stocktakeBusy ? t('admin.settings.starting') : t('admin.settings.stocktakeStart')}
            </button>
            <button
              type="button"
              className="touch-btn min-h-12 px-3 py-2 rounded bg-slate-800 border border-slate-700 disabled:opacity-50"
              disabled={stocktakeBusy}
              onClick={async () => {
                setStocktakeBusy(true)
                try {
                  await runAction(t('admin.settings.stocktakeReload'), () => onReloadOpen())
                } finally {
                  setStocktakeBusy(false)
                }
              }}
            >
              {t('admin.settings.reopenSession')}
            </button>
          </div>
          )}
          {stocktake && (
          <div className="space-y-2">
            <div className="text-sm text-slate-400">
              {t('admin.settings.session')}: {stocktake.id.slice(0, 8)} | {t('admin.sales.status')}:{' '}
              {t(`status.${stocktake.status}`, { defaultValue: stocktake.status })}
            </div>
            <div className="max-h-72 overflow-auto kiosk-scrollbar rounded border border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="text-left p-2">{t('admin.catalog.product')}</th>
                    <th className="text-left p-2">{t('admin.catalog.color')}</th>
                    <th className="text-left p-2">{t('admin.catalog.barcode')}</th>
                    <th className="text-right p-2">{t('admin.settings.expected')}</th>
                    <th className="text-right p-2">{t('admin.settings.counted')}</th>
                    <th className="text-right p-2">{t('admin.settings.variance')}</th>
                    <th className="text-right p-2">{t('admin.common.save')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stocktake.lines.map((ln) => (
                    <tr key={ln.id} className="border-t border-slate-800">
                      <td className="p-2">
                        {i18n.language.startsWith('ru')
                          ? (ln as typeof ln & { product_name_ru?: string }).product_name_ru || ln.product_name_uz
                          : ln.product_name_uz}
                      </td>
                      <td className="p-2 text-slate-300">{ln.color || '-'}</td>
                      <td className="p-2">{ln.barcode}</td>
                      <td className="p-2 text-right">{ln.expected_qty}</td>
                      <td className="p-2 text-right">{ln.counted_qty ?? '-'}</td>
                      <td className="p-2 text-right">{ln.variance_qty}</td>
                      <td className="p-2 text-right">
                        <div className="inline-flex gap-2">
                          <input
                            className="touch-btn min-h-12 px-3 py-2 rounded bg-slate-950 border border-slate-700 w-32 text-base"
                            value={countByVariant[ln.variant] ?? ''}
                            onChange={(e) =>
                              setCountByVariant((p) => ({ ...p, [ln.variant]: e.target.value }))
                            }
                            placeholder={t('admin.settings.qty')}
                          />
                          <button
                            type="button"
                            className="touch-btn min-h-12 px-3 py-2 rounded bg-slate-800 border border-slate-600 disabled:opacity-50"
                            disabled={stocktakeBusy}
                            onClick={async () => {
                              setStocktakeBusy(true)
                              try {
                                await runAction(t('admin.settings.stocktakeCount'), () =>
                                  onSetCount(ln.variant, Number(countByVariant[ln.variant] || '0')),
                                )
                              } finally {
                                setStocktakeBusy(false)
                              }
                            }}
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
            {stocktake.status === 'OPEN' && (
              <button
                type="button"
                className="touch-btn min-h-12 px-3 py-2 rounded bg-amber-700 border border-amber-500 disabled:opacity-50"
                disabled={stocktakeBusy}
                onClick={async () => {
                  setStocktakeBusy(true)
                  try {
                    await runAction(t('admin.settings.stocktakeApply'), () => onApplyStocktake())
                  } finally {
                    setStocktakeBusy(false)
                  }
                }}
              >
                {t('admin.settings.applyVariance')}
              </button>
            )}
          </div>
          )}
        </div>
      )}
      {activeTab === 'users' && (
        <div className="space-y-3 max-w-4xl">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 inline-flex items-center gap-2 text-slate-200">
            <Users className="h-5 w-5 text-emerald-400" />
            <span className="font-medium">{t('admin.settings.tabUsers')}</span>
          </div>
          <UsersPage />
        </div>
      )}
    </div>
  )
}
