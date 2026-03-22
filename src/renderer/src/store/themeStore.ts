import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
      }
    }),
    {
      name: 'theme-store'
    }
  )
)
