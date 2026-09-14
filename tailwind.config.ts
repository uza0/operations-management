import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-ui)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Operational dark foundation
        ink: {
          950: '#080b11',
          900: '#0d1117',
          850: '#11161f',
          800: '#161c27',
          750: '#1c2431',
          700: '#232c3b',
          600: '#2f3a4c',
          500: '#44526a',
          400: '#64748b',
          300: '#94a3b8',
          200: '#cbd5e1',
          100: '#e8edf4',
        },
        brand: {
          50: '#ecfdf6',
          100: '#d1fae5',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          900: '#064e3b',
        },
        ok: { DEFAULT: '#16a34a', soft: '#0f2a1c', text: '#4ade80' },
        warn: { DEFAULT: '#d97706', soft: '#2b1f0a', text: '#fbbf24' },
        crit: { DEFAULT: '#dc2626', soft: '#2b1114', text: '#f87171' },
        info: { DEFAULT: '#2563eb', soft: '#0f1c33', text: '#60a5fa' },
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -18px rgba(0,0,0,0.9)',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        pulseSoft: 'pulseSoft 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
