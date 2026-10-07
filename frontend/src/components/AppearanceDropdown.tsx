import { useEffect, useId, useRef, useState } from 'react'
import { Check, Languages, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { loadLocale } from '../i18n'
import { useTheme } from '../hooks/useTheme'

const LANGS = ['uz', 'uz-cyrl', 'ru'] as const

const LANG_SHORT: Record<(typeof LANGS)[number], string> = {
  uz: 'UZ',
  'uz-cyrl': 'ЎЗ',
  ru: 'RU',
}

type Variant = 'sidebar' | 'sidebar-collapsed' | 'navbar' | 'login'

export function AppearanceDropdown({
  variant = 'sidebar',
  className = '',
}: {
  variant?: Variant
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const collapsed = variant === 'sidebar-collapsed'
  const isNavbar = variant === 'navbar'
  const isLogin = variant === 'login'

  const currentLang =
    LANGS.find((lang) => (lang === 'ru' ? i18n.language.startsWith('ru') : i18n.language === lang)) ||
    'uz'

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const triggerLabel = `${LANG_SHORT[currentLang]} · ${theme === 'light' ? t('appearance.light') : t('appearance.dark')}`

  const panelPos =
    isNavbar || isLogin
      ? 'absolute right-0 top-[calc(100%+0.35rem)] z-50'
      : collapsed
        ? 'absolute left-full bottom-0 ml-2 z-50'
        : 'absolute left-0 right-0 bottom-[calc(100%+0.35rem)] z-50'

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        className={`touch-btn inline-flex items-center justify-center gap-2 rounded-xl border text-kiosk-sm font-medium transition-colors ${
          collapsed
            ? 'min-h-kiosk-touch min-w-kiosk-touch px-0'
            : isNavbar || isLogin
              ? 'min-h-kiosk-touch px-3 py-2'
              : 'w-full min-h-kiosk-touch px-3 py-2.5'
        } ${
          open
            ? 'bg-emerald-700 border-emerald-500 text-white'
            : 'bg-slate-900 border-slate-700 text-slate-100 hover:bg-slate-800'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={t('appearance.controls')}
        onClick={() => setOpen((v) => !v)}
      >
        {theme === 'light' ? <Sun className="h-4 w-4 shrink-0" aria-hidden /> : <Moon className="h-4 w-4 shrink-0" aria-hidden />}
        {!collapsed && (
          <>
            <Languages className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            <span className="truncate">{isNavbar || isLogin ? triggerLabel : t('appearance.controls')}</span>
          </>
        )}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className={`${panelPos} w-[13.5rem] rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-xl shadow-black/30`}
        >
          <div className="px-2 pt-1 pb-1.5 text-[0.7rem] uppercase tracking-wide text-slate-500">
            {t('appearance.theme', { defaultValue: 'Tema' })}
          </div>
          <div className="grid grid-cols-2 gap-1 mb-2">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={theme === 'light'}
              className={`touch-btn min-h-kiosk-touch rounded-xl border px-2 text-kiosk-sm font-semibold inline-flex items-center justify-center gap-1.5 ${
                theme === 'light'
                  ? 'bg-emerald-700 border-emerald-500 text-white'
                  : 'bg-slate-800 border-slate-600 text-slate-200'
              }`}
              onClick={() => setTheme('light')}
            >
              <Sun className="h-4 w-4" aria-hidden />
              {t('appearance.light')}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={theme === 'dark'}
              className={`touch-btn min-h-kiosk-touch rounded-xl border px-2 text-kiosk-sm font-semibold inline-flex items-center justify-center gap-1.5 ${
                theme === 'dark'
                  ? 'bg-emerald-700 border-emerald-500 text-white'
                  : 'bg-slate-800 border-slate-600 text-slate-200'
              }`}
              onClick={() => setTheme('dark')}
            >
              <Moon className="h-4 w-4" aria-hidden />
              {t('appearance.dark')}
            </button>
          </div>

          <div className="px-2 pt-1 pb-1.5 text-[0.7rem] uppercase tracking-wide text-slate-500">
            {t('admin.sidebar.language')}
          </div>
          <div className="space-y-1">
            {LANGS.map((lang) => {
              const active = lang === currentLang
              return (
                <button
                  key={lang}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={`touch-btn w-full min-h-kiosk-touch rounded-xl border px-3 text-kiosk-sm font-medium inline-flex items-center justify-between gap-2 ${
                    active
                      ? 'bg-emerald-700 border-emerald-500 text-white'
                      : 'bg-slate-800 border-slate-600 text-slate-200'
                  }`}
                  onClick={() => {
                    void loadLocale(lang)
                    setOpen(false)
                  }}
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="font-semibold tracking-wide">{LANG_SHORT[lang]}</span>
                    <span className="truncate opacity-90">{t(`lang.${lang}`)}</span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
