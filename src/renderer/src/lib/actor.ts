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

/**
 * The same value outside a React component, for call sites that aren't hooks.
 * Main-process handlers re-read the user by id, so this is an identity claim,
 * not a permission grant.
 */
export function currentActor(): Actor | undefined {
  const user = useAuthStore.getState().user
  if (!user) return undefined
  return { id: user.id, name: user.name, role: user.role }
}
