/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      screens: {
        'pos-sm': '768px',
        'pos-lg': '1366px',
        'pos-short': { raw: '(max-width: 1365px) and (max-height: 800px)' },
      },
      spacing: {
        'sidebar-collapsed': '6rem',
        'sidebar-expanded': '16rem',
        kiosk: 'var(--kiosk-gap, 0.5rem)',
        'kiosk-pad': 'var(--kiosk-pad, 0.5rem)',
      },
      minHeight: {
        touch: 'max(2.75rem, 44px)',
        'kiosk-touch': 'max(3rem, 48px)',
      },
      minWidth: {
        'kiosk-touch': 'max(3rem, 48px)',
      },
      fontSize: {
        kiosk: ['var(--kiosk-text, 1rem)', { lineHeight: '1.35' }],
        'kiosk-sm': ['var(--kiosk-text-sm, 0.857rem)', { lineHeight: '1.25' }],
        'kiosk-lg': ['var(--kiosk-text-lg, 1.143rem)', { lineHeight: '1.3' }],
      },
      width: {
        'sidebar-collapsed': 'var(--sidebar-width, 6rem)',
        'sidebar-expanded': 'var(--sidebar-width, 16rem)',
      },
      colors: {
        // Remappable slate: light theme inverts scale so existing bg-slate-950 / text-slate-100 stay readable
        slate: {
          50: 'rgb(var(--c-slate-50) / <alpha-value>)',
          100: 'rgb(var(--c-slate-100) / <alpha-value>)',
          200: 'rgb(var(--c-slate-200) / <alpha-value>)',
          300: 'rgb(var(--c-slate-300) / <alpha-value>)',
          400: 'rgb(var(--c-slate-400) / <alpha-value>)',
          500: 'rgb(var(--c-slate-500) / <alpha-value>)',
          600: 'rgb(var(--c-slate-600) / <alpha-value>)',
          700: 'rgb(var(--c-slate-700) / <alpha-value>)',
          800: 'rgb(var(--c-slate-800) / <alpha-value>)',
          900: 'rgb(var(--c-slate-900) / <alpha-value>)',
          950: 'rgb(var(--c-slate-950) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
