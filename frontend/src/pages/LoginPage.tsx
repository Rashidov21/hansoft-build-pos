import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchLicenseStatus, fetchPinUsers, loginWithPin, type LicenseStatus } from '../api'
import { getTauriMachineId } from '../utils/tauriMachineId'
import { PinNumpadPanel } from '../components/PinNumpadPanel'
import { AppearanceDropdown } from '../components/AppearanceDropdown'
import hansoftLogo from '../assets/HanSoft_Logo_1_NavyFon.png'
import loginBg from '../assets/login_page_bg.png'

function roleLabel(t: (key: string) => string, role: string) {
  if (role === 'admin') return t('admin.users.roleAdmin')
  if (role === 'owner') return t('admin.users.roleOwner')
  if (role === 'cashier') return t('admin.users.roleCashier')
  return role
}

export function LoginPage({ onDone }: { onDone: () => void | Promise<void> }) {
  const { t } = useTranslation()
  const [users, setUsers] = useState<Array<{ username: string; display_name: string; role: string; pin_enabled: boolean }>>([])
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitInFlightRef = useRef(false)
  const [licenseInfo, setLicenseInfo] = useState<LicenseStatus | null>(null)
  const [hardwareId, setHardwareId] = useState<string | null>(null)

  const selected = users.find((row) => row.username === u) || null

  useEffect(() => {
    void (async () => {
      try {
        const rows = await fetchPinUsers()
        setUsers(rows)
        setU(rows[0]?.username || '')
      } catch {
        setUsers([])
      }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        setLicenseInfo(await fetchLicenseStatus())
      } catch {
        setLicenseInfo(null)
      }
      setHardwareId(await getTauriMachineId())
    })()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitInFlightRef.current) return
    submitInFlightRef.current = true
    setErr(null)
    setBusy(true)
    try {
      await loginWithPin(u, p)
      await onDone()
    } catch (ex: unknown) {
      const code = (ex as Error & { code?: string }).code
      setErr(t(`err.${code || 'INVALID_CREDENTIALS'}`, { defaultValue: t('msg.errorGeneric') }))
    } finally {
      setBusy(false)
      submitInFlightRef.current = false
    }
  }

  return (
    <div className="relative h-dvh max-h-dvh overflow-y-auto overflow-x-hidden kiosk-scrollbar bg-slate-950 text-slate-100 p-3 pos-lg:p-6 flex items-center justify-center">
      <div className="absolute top-3 right-3 pos-lg:top-4 pos-lg:right-4 z-20">
        <AppearanceDropdown variant="login" />
      </div>
      <div className="w-full max-w-lg pos-sm:max-w-3xl pos-lg:max-w-6xl grid grid-cols-1 pos-sm:grid-cols-2 pos-short:grid-cols-1 gap-3 pos-lg:gap-4 items-stretch my-auto">
        <section className="relative overflow-hidden rounded-2xl border border-slate-700/80 min-h-[18rem] pos-lg:min-h-[32rem] flex flex-col">
          <img
            src={loginBg}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            aria-hidden
          />
          <div className="absolute inset-0 bg-black/65" aria-hidden />

          <div className="relative z-10 flex flex-1 flex-col p-3 pos-lg:p-5 gap-3 pos-lg:gap-4 theme-on-media text-white">
            <div className="flex items-center gap-2.5 pos-lg:gap-3">
              <img
                src={hansoftLogo}
                alt="Hansoft POS"
                className="h-11 w-11 pos-lg:h-14 pos-lg:w-14 rounded-xl object-contain shrink-0 shadow-lg shadow-black/40"
              />
              <div className="min-w-0">
                <h1 className="text-kiosk-lg pos-lg:text-2xl font-semibold text-white truncate">
                  {t('app.title')}
                </h1>
                <p className="text-kiosk-sm text-slate-200/90 truncate">
                  {t('auth.userSelect', { defaultValue: t('auth.username') })}
                </p>
              </div>
            </div>

            {licenseInfo && licenseInfo.enforcement && (licenseInfo.requires_activation ?? true) && (
              <div className="rounded-xl border border-amber-700/80 bg-amber-950/55 backdrop-blur-sm p-2.5 pos-lg:p-3 text-kiosk-sm space-y-1.5 pos-lg:space-y-2">
                <p className="font-semibold text-amber-100">
                  {t('license.demoCardTitle', {
                    defaultValue: 'Demo muddat: {{left}} kun qoldi',
                    left: licenseInfo.demo_days_left ?? 0,
                  })}
                </p>
                <p className="text-amber-100/90 hidden pos-lg:block">
                  {t('license.demoCardBody', {
                    defaultValue:
                      "Dastur ishga tushgan kundan 14 kun demo ishlaydi. Faollashtirish uchun admin Settings -> Security bo'limida activation key yuboradi.",
                  })}
                </p>
                <div className="text-kiosk-sm text-amber-200 space-y-0.5">
                  <p className="truncate">
                    {t('license.demoExpires', { defaultValue: 'Demo tugash sanasi' })}:{' '}
                    {licenseInfo.demo_expires_at || '—'}
                  </p>
                  <p className="truncate pos-short:hidden" title={hardwareId || undefined}>
                    {t('license.hardwareIdLabel', { defaultValue: 'Hardware ID' })}:{' '}
                    {hardwareId || t('admin.common.na')}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-auto space-y-2">
              <p className="text-kiosk-sm text-slate-200/90">
                {t('auth.userSelect', { defaultValue: t('auth.username') })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {users.map((row) => {
                  const active = row.username === u
                  return (
                    <button
                      key={row.username}
                      type="button"
                      onClick={() => {
                        setU(row.username)
                        setP('')
                        setErr(null)
                      }}
                      className={`touch-btn min-h-kiosk-touch rounded-xl border px-3 py-2.5 text-left transition ${
                        active
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-slate-900/60 border-slate-500/70 text-slate-100 backdrop-blur-sm hover:bg-slate-800/70'
                      }`}
                    >
                      <div className="font-semibold text-kiosk-sm pos-lg:text-base truncate">
                        {row.username}
                      </div>
                      <div
                        className={`text-kiosk-sm truncate ${
                          active ? 'text-emerald-50/90' : 'text-slate-300'
                        }`}
                      >
                        {row.display_name || roleLabel(t, row.role)}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3 pos-lg:p-5 space-y-3 pos-lg:space-y-4 flex flex-col justify-center min-h-0"
        >
          <div className="space-y-1.5">
            <span className="block text-kiosk-sm pos-lg:text-sm text-slate-300">
              {t('auth.userSelect', { defaultValue: t('auth.username') })}
            </span>
            <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 pos-lg:px-4 pos-lg:py-3">
              <div className="font-semibold text-kiosk pos-lg:text-lg truncate">
                {selected?.username || '—'}
              </div>
              <div className="text-kiosk-sm text-slate-400 truncate">
                {selected
                  ? selected.display_name || roleLabel(t, selected.role)
                  : t('auth.userSelect', { defaultValue: t('auth.username') })}
              </div>
            </div>
          </div>

          <div className="block text-kiosk-sm pos-lg:text-sm space-y-1.5 pos-lg:space-y-2">
            <span className="block">{t('auth.pin', { defaultValue: 'PIN' })}</span>
            <PinNumpadPanel pin={p} setPin={setP} label={undefined} />
          </div>

          {err && <p className="text-red-400 text-kiosk-sm">{err}</p>}

          <button
            type="submit"
            disabled={busy || !u || p.replace(/\D/g, '').length < 4}
            className="touch-btn w-full min-h-kiosk-touch py-3 pos-lg:py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-kiosk pos-lg:text-lg font-semibold"
          >
            {busy ? t('auth.logging') : t('auth.login')}
          </button>

          <div className="text-kiosk-sm text-slate-400 text-center space-y-0.5 hidden pos-sm:block pos-short:hidden">
            <p>{t('auth.pinHint', { defaultValue: '4 xonali PIN kiriting' })}</p>
            <p>{t('auth.demo')}</p>
          </div>

          <button
            type="button"
            className="touch-btn w-full min-h-kiosk-touch py-2.5 pos-lg:py-3 rounded-xl bg-slate-950 border border-slate-600 text-slate-200 text-kiosk-sm pos-lg:text-sm"
            onClick={async () => {
              try {
                const { invoke } = await import('@tauri-apps/api/tauri')
                await invoke('request_app_exit')
              } catch {
                window.close()
              }
            }}
          >
            {t('auth.quitApp', { defaultValue: "Dasturni yopish" })}
          </button>
        </form>
      </div>
    </div>
  )
}
