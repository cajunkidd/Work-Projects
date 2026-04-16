import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, UserRole } from '../../../shared/types'

interface AuthState {
  user: User | null
  login: (user: User) => void
  logout: () => void
  can: (role: UserRole) => boolean
  canAccessDepartment: (department_id: number) => boolean
  canAccessBranch: (branch_id: number) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      login: (user) => {
        set({ user })
        // Tell the main process who is making subsequent mutations so the
        // audit log can attribute them.
        window.api?.audit?.setActor({ user_id: user.id, user_name: user.name })
      },
      logout: () => {
        set({ user: null })
        window.api?.audit?.setActor(null)
      },
      can: (minRole: UserRole) => {
        const { user } = get()
        if (!user) return false
        const levels: Record<string, number> = { store_manager: 0, director: 1, super_admin: 2, viewer: 0, editor: 1, admin: 2 }
        return (levels[user.role] ?? 0) >= levels[minRole]
      },
      canAccessDepartment: (department_id: number) => {
        const { user } = get()
        if (!user) return false
        if (user.role === 'super_admin') return true
        if (user.role === 'store_manager') return false
        // director: scoped to assigned departments
        if (!user.department_ids || user.department_ids.length === 0) return true
        return user.department_ids.includes(department_id)
      },
      canAccessBranch: (branch_id: number) => {
        const { user } = get()
        if (!user) return false
        if (user.role === 'super_admin') return true
        if (!user.branch_ids || user.branch_ids.length === 0) return false
        return user.branch_ids.includes(branch_id)
      }
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({ user: state.user })
    }
  )
)
