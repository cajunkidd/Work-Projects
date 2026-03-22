import { useAuthStore } from '../../store/authStore'
import type { UserRole } from '../../../../shared/types'

interface Props {
  minRole: UserRole
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function RoleGuard({ minRole, children, fallback = null }: Props) {
  const can = useAuthStore((s) => s.can)
  if (!can(minRole)) return <>{fallback}</>
  return <>{children}</>
}
