import { useState } from 'react'
import type { IntegrationSettings } from '../api'
import { useTranslation } from 'react-i18next'
import { ActionToast } from '../components/ActionToast'

export function BotsPage({
  settings,
  onSave,
  onSendZReport,
}: {
  settings: IntegrationSettings | null
  onSave: (data: IntegrationSettings) => Promise<void>
  onSendZReport: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
  const [form, setForm] = useState<IntegrationSettings>({
    telegram_bot_token: settings?.telegram_bot_token ?? '',
    telegram_chat_id: settings?.telegram_chat_id ?? '',
    whatsapp_provider: settings?.whatsapp_provider ?? 'GREEN_API',
    whatsapp_api_base: settings?.whatsapp_api_base ?? '',
    whatsapp_api_token: settings?.whatsapp_api_token ?? '',
    whatsapp_sender: settings?.whatsapp_sender ?? '',
    greenapi_instance_id: settings?.greenapi_instance_id ?? '',
    greenapi_api_token_instance: settings?.greenapi_api_token_instance ?? '',
  })

  async function runAction(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    setToast(null)
    try {
      await fn()
      setToast({ kind: 'ok', message: ok })
    } catch (e: unknown) {
      const code = (e as Error & { code?: string }).code
      setToast({ kind: 'err', message: t(`err.${code || 'UNKNOWN'}`) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">{t('admin.bots.title')}</h2>
      {toast && <ActionToast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />}
      <div className="rounded border border-slate-700 bg-slate-900 p-3 space-y-2 max-w-2xl">
        <h3 className="font-medium">{t('admin.bots.telegram')}</h3>
        <input
          className="w-full px-2 py-2 rounded bg-slate-950 border border-slate-700"
          placeholder={t('admin.bots.telegramToken')}
          value={form.telegram_bot_token}
          onChange={(e) => setForm((p) => ({ ...p, telegram_bot_token: e.target.value }))}
        />
        <input
          className="w-full px-2 py-2 rounded bg-slate-950 border border-slate-700"
          placeholder={t('admin.bots.telegramChatId')}
          value={form.telegram_chat_id}
          onChange={(e) => setForm((p) => ({ ...p, telegram_chat_id: e.target.value }))}
        />
      </div>
      <div className="rounded border border-slate-700 bg-slate-900 p-3 space-y-2 max-w-2xl">
        <h3 className="font-medium">{t('admin.bots.whatsapp')}</h3>
        <input
          className="w-full px-2 py-2 rounded bg-slate-950 border border-slate-700"
          placeholder={t('admin.bots.whatsappApiBase')}
          value={form.whatsapp_api_base}
          onChange={(e) => setForm((p) => ({ ...p, whatsapp_api_base: e.target.value }))}
        />
        <input
          className="w-full px-2 py-2 rounded bg-slate-950 border border-slate-700"
          placeholder={t('admin.bots.whatsappToken')}
          value={form.whatsapp_api_token}
          onChange={(e) => setForm((p) => ({ ...p, whatsapp_api_token: e.target.value }))}
        />
        <input
          className="w-full px-2 py-2 rounded bg-slate-950 border border-slate-700"
          placeholder={t('admin.bots.whatsappSender')}
          value={form.whatsapp_sender}
          onChange={(e) => setForm((p) => ({ ...p, whatsapp_sender: e.target.value }))}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          className="px-3 py-2 rounded bg-emerald-700 border border-emerald-500 disabled:opacity-40"
          onClick={() => void runAction(() => onSave(form), t('admin.bots.saveSuccess'))}
        >
          {t('admin.bots.save')}
        </button>
        <button
          type="button"
          disabled={busy}
          className="px-3 py-2 rounded bg-slate-800 border border-slate-600 disabled:opacity-40"
          onClick={() => void runAction(() => onSendZReport(), t('admin.bots.zReportSent'))}
        >
          {t('admin.bots.sendZReport')}
        </button>
      </div>
    </div>
  )
}

