/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // Alpha-capable brand colors: `bg-brand-primary/40`, `text-brand-accent/80`, etc.
          // Channels are kept in sync with the hex vars by themeStore.applyThemeToDom().
          primary: 'rgb(var(--brand-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--brand-secondary-rgb) / <alpha-value>)',
          accent: 'rgb(var(--brand-accent-rgb) / <alpha-value>)',
          light: 'rgb(var(--brand-light-rgb) / <alpha-value>)',
          dark: 'rgb(var(--brand-dark-rgb) / <alpha-value>)'
        },
        // Elevation scale for the deep near-black base. surface-0 is the app
        // canvas; each step up is one layer of elevation.
        surface: {
          0: '#05070d',
          1: '#0a0f1c',
          2: '#0f172a',
          3: '#16203a',
          4: '#1d2a4a'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      boxShadow: {
        glow: '0 0 20px -4px rgb(var(--brand-primary-rgb) / 0.45)',
        'glow-lg': '0 0 44px -8px rgb(var(--brand-primary-rgb) / 0.55)',
        'inset-hairline': 'inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
        elevated: '0 12px 32px -12px rgb(0 0 0 / 0.6), 0 2px 8px -2px rgb(0 0 0 / 0.4)'
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
        mesh: 'radial-gradient(at 20% 0%, rgb(var(--brand-primary-rgb) / 0.14) 0px, transparent 55%), radial-gradient(at 90% 15%, rgb(var(--brand-accent-rgb) / 0.10) 0px, transparent 50%), radial-gradient(at 60% 100%, rgb(var(--brand-secondary-rgb) / 0.12) 0px, transparent 55%)'
      },
      // Keyframes live in src/renderer/src/index.css (global, always emitted).
      // These utilities just reference them by name.
      animation: {
        'fade-in-up': 'fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'scale-in': 'scale-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slide-in-right 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.8s linear infinite',
        'pulse-glow': 'pulse-glow 2.4s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'spin-slow': 'spin-slow 8s linear infinite',
        'gradient-pan': 'gradient-pan 6s linear infinite',
        'count-pop': 'count-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'aurora-drift': 'aurora-drift 26s ease-in-out infinite alternate',
        'border-flow': 'border-flow 5s linear infinite',
        shake: 'shake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both'
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)'
      },
      borderRadius: {
        '2.5xl': '1.25rem',
        '4xl': '2rem'
      },
      blur: {
        xs: '2px'
      }
    }
  },
  plugins: []
}
