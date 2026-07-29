import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import { getDb } from '../database'
import { requireRole, denied } from '../authz'
import { recordAudit } from '../audit'
import type { IpcResponse, User, LoginCredentials } from '../../shared/types'

function mapRow(r: any): User {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    department_ids: JSON.parse(r.department_ids || '[]'),
    branch_ids: JSON.parse(r.branch_ids || '[]'),
    created_at: r.created_at
  }
}

export function registerUserHandlers(): void {
  // Login
  ipcMain.handle('users:login', async (_e, creds: LoginCredentials): Promise<IpcResponse<User>> => {
    try {
      const db = getDb()
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(creds.email) as any
      if (!row) return { success: false, error: 'Invalid email or password' }

      const valid = await bcrypt.compare(creds.password, row.password_hash)
      if (!valid) return { success: false, error: 'Invalid email or password' }

      return { success: true, data: mapRow(row) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // List all users (super_admin only - enforced on renderer side)
  ipcMain.handle('users:list', async (): Promise<IpcResponse<User[]>> => {
    try {
      const rows = getDb().prepare('SELECT * FROM users ORDER BY name').all() as any[]
      return { success: true, data: rows.map(mapRow) }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Create user
  ipcMain.handle(
    'users:create',
    async (
      _e,
      payload: { name: string; email: string; password: string; role: string; department_ids: number[]; branch_ids: number[]; actor?: { id: number } }
    ): Promise<IpcResponse<User>> => {
      try {
        const db = getDb()

        // The very first account is created before anyone can be signed in;
        // after that, only a super admin may add users.
        const existing = db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number }
        if (existing.n > 0) {
          const gate = requireRole(db, payload.actor, 'super_admin')
          if (denied(gate)) return gate
        }

        const hash = await bcrypt.hash(payload.password, 10)
        const result = db
          .prepare(
            'INSERT INTO users (name, email, password_hash, role, department_ids, branch_ids) VALUES (?,?,?,?,?,?)'
          )
          .run(
            payload.name,
            payload.email,
            hash,
            payload.role,
            JSON.stringify(payload.department_ids || []),
            JSON.stringify(payload.branch_ids || [])
          )

        const row = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as any
        recordAudit(db, {
          entity_type: 'user',
          entity_id: row.id,
          entity_label: row.name,
          action: 'create',
          summary: `User "${row.name}" (${row.email}) created with role ${row.role}`,
          actor: payload.actor as any
        })
        return { success: true, data: mapRow(row) }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Update user
  ipcMain.handle(
    'users:update',
    async (
      _e,
      payload: { id: number; name?: string; role?: string; department_ids?: number[]; branch_ids?: number[]; password?: string; actor?: { id: number } }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const gate = requireRole(db, payload.actor, 'super_admin')
        if (denied(gate)) return gate

        const before = db.prepare('SELECT name, role FROM users WHERE id = ?').get(payload.id) as
          | { name: string; role: string }
          | undefined
        if (!before) return { success: false, error: 'User not found' }

        // Demoting the last super admin would lock everyone out of settings.
        if (payload.role && before.role === 'super_admin' && payload.role !== 'super_admin') {
          const admins = db
            .prepare("SELECT COUNT(*) as n FROM users WHERE role = 'super_admin'")
            .get() as { n: number }
          if (admins.n <= 1) {
            return { success: false, error: 'This is the only super admin — promote another user first.' }
          }
        }

        if (payload.password) {
          const hash = await bcrypt.hash(payload.password, 10)
          db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, payload.id)
        }
        if (payload.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(payload.name, payload.id)
        if (payload.role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(payload.role, payload.id)
        if (payload.department_ids !== undefined)
          db.prepare('UPDATE users SET department_ids = ? WHERE id = ?').run(
            JSON.stringify(payload.department_ids),
            payload.id
          )
        if (payload.branch_ids !== undefined)
          db.prepare('UPDATE users SET branch_ids = ? WHERE id = ?').run(
            JSON.stringify(payload.branch_ids),
            payload.id
          )

        recordAudit(db, {
          entity_type: 'user',
          entity_id: payload.id,
          entity_label: before.name,
          action: 'update',
          summary: `User "${before.name}" updated${payload.role && payload.role !== before.role ? ` — role ${before.role} → ${payload.role}` : ''}${payload.password ? ' (password reset)' : ''}`,
          actor: payload.actor as any
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Delete user. Accepts a bare id or { id, actor }.
  ipcMain.handle(
    'users:delete',
    async (_e, arg: number | { id: number; actor?: { id: number } }): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
        const id = typeof arg === 'number' ? arg : arg.id
        const actor = typeof arg === 'number' ? undefined : arg.actor

        const gate = requireRole(db, actor, 'super_admin')
        if (denied(gate)) return gate

        const target = db.prepare('SELECT name, email, role FROM users WHERE id = ?').get(id) as
          | { name: string; email: string; role: string }
          | undefined
        if (!target) return { success: false, error: 'User not found' }

        if (gate.id === id) {
          return { success: false, error: 'You cannot delete your own account.' }
        }
        if (target.role === 'super_admin') {
          const admins = db
            .prepare("SELECT COUNT(*) as n FROM users WHERE role = 'super_admin'")
            .get() as { n: number }
          if (admins.n <= 1) {
            return { success: false, error: 'This is the only super admin — promote another user first.' }
          }
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(id)

        recordAudit(db, {
          entity_type: 'user',
          entity_id: id,
          entity_label: target.name,
          action: 'delete',
          summary: `User "${target.name}" (${target.email}) deleted`,
          actor: actor as any
        })

        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Check if any super_admin exists (for first-run setup)
  ipcMain.handle('users:hasAdmin', async (): Promise<IpcResponse<boolean>> => {
    try {
      const row = getDb().prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1").get()
      return { success: true, data: !!row }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
