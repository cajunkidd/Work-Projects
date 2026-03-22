import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import { getDb } from '../database'
import type { IpcResponse, User, LoginCredentials } from '../../shared/types'

export function registerUserHandlers(): void {
  // Login
  ipcMain.handle('users:login', async (_e, creds: LoginCredentials): Promise<IpcResponse<User>> => {
    try {
      const db = getDb()
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(creds.email) as any
      if (!row) return { success: false, error: 'Invalid email or password' }

      const valid = await bcrypt.compare(creds.password, row.password_hash)
      if (!valid) return { success: false, error: 'Invalid email or password' }

      const user: User = {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        department_ids: JSON.parse(row.department_ids || '[]'),
        created_at: row.created_at
      }
      return { success: true, data: user }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // List all users (admin only - enforced on renderer side)
  ipcMain.handle('users:list', async (): Promise<IpcResponse<User[]>> => {
    try {
      const rows = getDb().prepare('SELECT * FROM users ORDER BY name').all() as any[]
      const users: User[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        department_ids: JSON.parse(r.department_ids || '[]'),
        created_at: r.created_at
      }))
      return { success: true, data: users }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Create user
  ipcMain.handle(
    'users:create',
    async (
      _e,
      payload: { name: string; email: string; password: string; role: string; department_ids: number[] }
    ): Promise<IpcResponse<User>> => {
      try {
        const db = getDb()
        const hash = await bcrypt.hash(payload.password, 10)
        const result = db
          .prepare(
            'INSERT INTO users (name, email, password_hash, role, department_ids) VALUES (?,?,?,?,?)'
          )
          .run(payload.name, payload.email, hash, payload.role, JSON.stringify(payload.department_ids))

        const row = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as any
        return {
          success: true,
          data: {
            id: row.id,
            name: row.name,
            email: row.email,
            role: row.role,
            department_ids: JSON.parse(row.department_ids),
            created_at: row.created_at
          }
        }
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
      payload: { id: number; name?: string; role?: string; department_ids?: number[]; password?: string }
    ): Promise<IpcResponse<void>> => {
      try {
        const db = getDb()
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
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    }
  )

  // Delete user
  ipcMain.handle('users:delete', async (_e, id: number): Promise<IpcResponse<void>> => {
    try {
      getDb().prepare('DELETE FROM users WHERE id = ?').run(id)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Check if any admin exists (for first-run setup)
  ipcMain.handle('users:hasAdmin', async (): Promise<IpcResponse<boolean>> => {
    try {
      const row = getDb().prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()
      return { success: true, data: !!row }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
