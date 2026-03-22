import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, UserRole } from '../../../shared/types'

interface AuthState {
  user: User | null
  login: (user: User) => void
  logout: () => void
  can: (role: UserRole) => boolean
  canAccessDepartment: (department_id: number) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      login: (user) => set({ user }),
      logout: () => set({ user: null }),
      can: (minRole: UserRole) => {
        const { user } = get()
        if (!user) return false
        const levels: Record<UserRole, number> = { viewer: 0, editor: 1, admin: 2 }
        return levels[user.role] >= levels[minRole]
      },
      canAccessDepartment: (department_id: number) => {
        const { user } = get()
        if (!user) return false
        if (user.role === 'admin') return true
        if (!user.department_ids || user.department_ids.length === 0) return true
        return user.department_ids.includes(department_id)
      }
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({ user: state.user })
    }
  )
)
