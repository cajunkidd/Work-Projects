import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Converts a hex color (#rgb or #rrggbb) to space-separated RGB channels
 * ("37 99 235") for use in `rgb(var(--x) / <alpha>)` CSS. Falls back to the
 * provided default when the value is not parseable hex.
 */
const hexToRgbChannels = (hex: string, fallback: string): string => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return fallback
  let h = match[1]
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const n = parseInt(h, 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

interface ThemeState {
  logoPath: string | null
  brandPrimary: string
  brandSecondary: string
  brandAccent: string
  brandLight: string
  brandDark: string
  selectedDeptId: number | null // null = company overview
  setTheme: (colors: { primary?: string; secondary?: string; accent?: string; light?: string; dark?: string }) => void
  setLogo: (path: string) => void
  setSelectedDept: (id: number | null) => void
  applyThemeToDom: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      logoPath: null,
      brandPrimary: '#2563eb',
      brandSecondary: '#1e40af',
      brandAccent: '#3b82f6',
      brandLight: '#eff6ff',
      brandDark: '#1e3a8a',
      selectedDeptId: null,
      setTheme: (colors) => {
        set((state) => ({
          brandPrimary: colors.primary ?? state.brandPrimary,
          brandSecondary: colors.secondary ?? state.brandSecondary,
          brandAccent: colors.accent ?? state.brandAccent,
          brandLight: colors.light ?? state.brandLight,
          brandDark: colors.dark ?? state.brandDark
        }))
        get().applyThemeToDom()
      },
      setLogo: (path) => set({ logoPath: path }),
      setSelectedDept: (id) => set({ selectedDeptId: id }),
      applyThemeToDom: () => {
        const state = get()
        const root = document.documentElement
        root.style.setProperty('--brand-primary', state.brandPrimary)
        root.style.setProperty('--brand-secondary', state.brandSecondary)
        root.style.setProperty('--brand-accent', state.brandAccent)
        root.style.setProperty('--brand-light', state.brandLight)
        root.style.setProperty('--brand-dark', state.brandDark)
        // Derived channel vars so CSS/Tailwind can alpha-blend the brand colors,
        // e.g. `rgb(var(--brand-primary-rgb) / 0.4)` or `bg-brand-primary/40`.
        root.style.setProperty('--brand-primary-rgb', hexToRgbChannels(state.brandPrimary, '37 99 235'))
        root.style.setProperty('--brand-secondary-rgb', hexToRgbChannels(state.brandSecondary, '30 64 175'))
        root.style.setProperty('--brand-accent-rgb', hexToRgbChannels(state.brandAccent, '59 130 246'))
        root.style.setProperty('--brand-light-rgb', hexToRgbChannels(state.brandLight, '239 246 255'))
        root.style.setProperty('--brand-dark-rgb', hexToRgbChannels(state.brandDark, '30 58 138'))
      }
    }),
    {
      name: 'theme-store'
    }
  )
)
