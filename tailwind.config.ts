import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-ui)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      /*
       * Every colour is a CSS variable holding bare RGB channels, so the same
       * class names paint a dark interface or a light one depending on what
       * :root says. The scale is semantic rather than literal: ink-950 is
       * always "the page", ink-100 is always "the text on it", and in the
       * light theme those two swap ends. That is what lets the theme change
       * without touching a single component.
       */
      colors: {
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          750: 'rgb(var(--ink-750) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
        },
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        ok: {
          DEFAULT: 'rgb(var(--ok) / <alpha-value>)',
          soft: 'rgb(var(--ok-soft) / <alpha-value>)',
          text: 'rgb(var(--ok-text) / <alpha-value>)',
        },
        warn: {
          DEFAULT: 'rgb(var(--warn) / <alpha-value>)',
          soft: 'rgb(var(--warn-soft) / <alpha-value>)',
          text: 'rgb(var(--warn-text) / <alpha-value>)',
        },
        crit: {
          DEFAULT: 'rgb(var(--crit) / <alpha-value>)',
          soft: 'rgb(var(--crit-soft) / <alpha-value>)',
          text: 'rgb(var(--crit-text) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          soft: 'rgb(var(--info-soft) / <alpha-value>)',
          text: 'rgb(var(--info-text) / <alpha-value>)',
        },
        type: {
          football: 'rgb(var(--type-football) / <alpha-value>)',
          concert: 'rgb(var(--type-concert) / <alpha-value>)',
          festival: 'rgb(var(--type-festival) / <alpha-value>)',
          exhibition: 'rgb(var(--type-exhibition) / <alpha-value>)',
          conference: 'rgb(var(--type-conference) / <alpha-value>)',
          workshop: 'rgb(var(--type-workshop) / <alpha-value>)',
          promotional: 'rgb(var(--type-promotional) / <alpha-value>)',
          other: 'rgb(var(--type-other) / <alpha-value>)',
        },
      },
      /*
       * Ticket Zone's geometry, named by what it holds rather than by size:
       * a pill for anything you press, `control` for anything you type into,
       * `card` for anything that holds content. Using the names instead of
       * `rounded-lg` is what stops the radii drifting apart again.
       */
      borderRadius: {
        /*
         * Fourteen and ten, down from sixteen and twelve. At sixteen every
         * surface had the same soft corner as every button, and a screen of
         * boxes read as one undifferentiated cushion; a slightly squarer
         * panel lets the fully round buttons be the round things.
         */
        card: '14px',
        control: '10px',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        raised: 'var(--shadow-raised)',
        float: 'var(--shadow-float)',
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
