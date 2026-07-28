import { useAuthStore } from '../store/authStore'
import type { Actor } from '../../../shared/types'

/**
 * The signed-in user in the shape the IPC layer wants for audit attribution.
 * Handlers that make security decisions re-read the user from the database by
 * id rather than trusting these fields.
 */
export function useActor(): Actor | undefined {
  const user = useAuthStore((s) => s.user)
  if (!user) return undefined
  return { id: user.id, name: user.name, role: user.role }
}
