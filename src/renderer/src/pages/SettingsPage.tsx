import { useEffect, useState } from 'react'
import { useThemeStore } from '../store/themeStore'
import { useAuthStore } from '../store/authStore'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Modal from '../components/ui/Modal'
import RoleGuard from '../components/layout/RoleGuard'
import Badge from '../components/ui/Badge'
import type { Department, User } from '../../../shared/types'

export default function SettingsPage() {
  const { setTheme, setLogo, logoPath, brandPrimary } = useThemeStore()
  const { user: currentUser } = useAuthStore()
  const [settings, setSettings] = useState<any>({})
  const [departments, setDepartments] = useState<Department[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [newDeptName, setNewDeptName] = useState('')
  const [deptSaving, setDeptSaving] = useState(false)

  // Gmail
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [showGmailCode, setShowGmailCode] = useState(false)
  const [gmailMsg, setGmailMsg] = useState('')

  // User management
  const [showUserModal, setShowUserModal] = useState(false)
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'viewer', department_ids: [] as number[] })

  // Budget
  const [budgetDeptId, setBudgetDeptId] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetYear, setBudgetYear] = useState(String(new Date().getFullYear()))
  const [budgetSaving, setBudgetSaving] = useState(false)
  const [budgetMsg, setBudgetMsg] = useState('')

  // DB path
  const [dbPath, setDbPath] = useState('')
  const [logoMsg, setLogoMsg] = useState('')

  const load = () => {
    window.api.settings.get().then((res) => {
      if (res.success && res.data) {
        setSettings(res.data)
        setGmailConnected(res.data.gmail_connected === 'true')
        setGmailEmail(res.data.gmail_email || '')
        setDbPath(res.data.db_network_path || '')
      }
    })
    window.api.departments.list().then((res) => {
      if (res.success && res.data) setDepartments(res.data)
    })
    window.api.users.list().then((res) => {
      if (res.success && res.data) setUsers(res.data)
    })
  }

  useEffect(() => { load() }, [])

  // Logo upload
  const handleLogoUpload = async () => {
    const res = await window.api.settings.uploadLogo()
    if (res.success && res.data) {
      const path = res.data
      setLogo(path)
      await window.api.settings.set({ logo_path: path })

      // Extract colors
      const colorRes = await window.api.settings.extractColors(path)
      if (colorRes.success && colorRes.data) {
        const { primary, secondary, palette } = colorRes.data
        const light = palette[palette.length - 1] || '#eff6ff'
        const dark = palette[0] || primary
        setTheme({ primary, secondary, accent: palette[2] || primary, light, dark })
        await window.api.settings.set({
          brand_primary: primary,
          brand_secondary: secondary,
          brand_accent: palette[2] || primary,
          brand_light: light,
          brand_dark: dark
        })
        setLogoMsg('Logo uploaded and colors applied!')
      } else {
        setLogoMsg('Logo uploaded (color extraction failed — using defaults)')
      }
      setTimeout(() => setLogoMsg(''), 4000)
    }
  }

  // Manual color override
  const handleColorSave = async () => {
    await window.api.settings.set({ brand_primary: brandPrimary })
    setTheme({ primary: brandPrimary })
  }

  // Add department
  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDeptName.trim()) return
    setDeptSaving(true)
    await window.api.departments.create(newDeptName.trim())
    setNewDeptName('')
    setDeptSaving(false)
    load()
  }

  const handleDeleteDept = async (id: number) => {
    await window.api.departments.delete(id)
    setDepartments((prev) => prev.filter((d) => d.id !== id))
  }

  // Gmail
  const handleGmailAuth = async () => {
    const res = await window.api.gmail.getAuthUrl()
    if (res.success && res.data) {
      await window.api.gmail.openUrl(res.data)
      setShowGmailCode(true)
    }
  }

  const handleGmailConnect = async () => {
    const res = await window.api.gmail.connect(authCode.trim())
    if (res.success) {
      setGmailConnected(true)
      setGmailEmail(res.data || '')
      setGmailMsg('Connected!')
      setShowGmailCode(false)
      setAuthCode('')
    } else {
      setGmailMsg(res.error || 'Failed to connect')
    }
    setTimeout(() => setGmailMsg(''), 4000)
  }

  const handleGmailDisconnect = async () => {
    await window.api.gmail.disconnect()
    setGmailConnected(false)
    setGmailEmail('')
  }

  // Budget upsert
  const handleBudgetSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setBudgetSaving(true)
    await window.api.budget.upsert({
      department_id: budgetDeptId ? parseInt(budgetDeptId) : null,
      fiscal_year: parseInt(budgetYear),
      total_amount: parseFloat(budgetAmount) || 0
    })
    setBudgetSaving(false)
    setBudgetMsg('Budget saved!')
    setTimeout(() => setBudgetMsg(''), 3000)
  }

  // Network DB
  const handlePickFolder = async () => {
    const res = await window.api.settings.pickDbFolder()
    if (res.success && res.data) {
      setDbPath(res.data)
      await window.api.settings.set({ db_network_path: res.data })
    }
  }

  // Create user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    await window.api.users.create(userForm)
    setShowUserModal(false)
    setUserForm({ name: '', email: '', password: '', role: 'viewer', department_ids: [] })
    load()
  }

  const handleDeleteUser = async (id: number) => {
    if (id === currentUser?.id) return
    await window.api.users.delete(id)
    setUsers((prev) => prev.filter((u) => u.id !== id))
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-white text-2xl font-bold">Settings</h1>
        <p className="text-slate-400 text-sm">Configure your application</p>
      </div>

      {/* ─── Branding ─── */}
      <RoleGuard minRole="admin">
        <section className="space-y-4">
          <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">Branding</h2>
          <Card>
            <div className="flex items-start gap-6">
              <div className="flex-shrink-0">
                {logoPath ? (
                  <img src={`file://${logoPath}`} alt="Logo" className="h-16 w-16 rounded-xl object-contain bg-white p-2" />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 text-2xl">?</div>
                )}
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-white font-medium text-sm">Company Logo</p>
                  <p className="text-slate-400 text-xs">Upload your logo to auto-extract brand colors and display it in the app.</p>
                </div>
                <Button variant="secondary" onClick={handleLogoUpload}>Upload Logo</Button>
                {logoMsg && <p className="text-emerald-400 text-sm">{logoMsg}</p>}
              </div>
              <div className="flex-shrink-0 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full border border-slate-600" style={{ background: brandPrimary }} />
                <span className="text-slate-400 text-sm">Brand color</span>
              </div>
            </div>
          </Card>
        </section>
      </RoleGuard>

      {/* ─── Departments ─── */}
      <RoleGuard minRole="admin">
        <section className="space-y-4">
          <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">Departments</h2>
          <form onSubmit={handleAddDept} className="flex gap-2">
            <Input
              placeholder="Department name (e.g. IT, HR, Finance)"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={deptSaving}>Add</Button>
          </form>
          <div className="space-y-2">
            {departments.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-2">
                <span className="text-white text-sm">{d.name}</span>
                <button onClick={() => handleDeleteDept(d.id)} className="text-slate-500 hover:text-red-400 text-lg transition-colors">×</button>
              </div>
            ))}
            {departments.length === 0 && <p className="text-slate-400 text-sm">No departments yet. Add one above.</p>}
          </div>
        </section>
      </RoleGuard>

      {/* ─── Budget ─── */}
      <RoleGuard minRole="admin">
        <section className="space-y-4">
          <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">Budget Configuration</h2>
          <Card>
            <form onSubmit={handleBudgetSave} className="space-y-4">
              <Select
                label="Department (leave blank for Company-level)"
                value={budgetDeptId}
                onChange={(e) => setBudgetDeptId(e.target.value)}
                options={[
                  { value: '', label: 'Company Overall' },
                  ...departments.map((d) => ({ value: d.id, label: d.name }))
                ]}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Fiscal Year" type="number" value={budgetYear} onChange={(e) => setBudgetYear(e.target.value)} required />
                <Input label="Total Budget ($)" type="number" min="0" step="0.01" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} required />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={budgetSaving}>Save Budget</Button>
                {budgetMsg && <span className="text-emerald-400 text-sm">{budgetMsg}</span>}
              </div>
            </form>
          </Card>
        </section>
      </RoleGuard>

      {/* ─── Gmail ─── */}
      <RoleGuard minRole="admin">
        <section className="space-y-4">
          <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">Gmail Integration</h2>
          <Card>
            {gmailConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="success">Connected</Badge>
                  <span className="text-slate-300 text-sm">{gmailEmail}</span>
                </div>
                <Button variant="danger" onClick={handleGmailDisconnect}>Disconnect Gmail</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-slate-400 text-sm">Connect your Gmail account to automatically import vendor billing emails.</p>
                <p className="text-amber-400/80 text-xs">Requires Google OAuth credentials set in your environment (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).</p>
                <Button variant="secondary" onClick={handleGmailAuth}>Connect Gmail Account</Button>
                {showGmailCode && (
                  <div className="space-y-2">
                    <p className="text-slate-300 text-sm">A browser window has opened. Authorize the app, then paste the code below:</p>
                    <div className="flex gap-2">
                      <Input placeholder="Authorization code" value={authCode} onChange={(e) => setAuthCode(e.target.value)} className="flex-1" />
                      <Button onClick={handleGmailConnect}>Connect</Button>
                    </div>
                  </div>
                )}
                {gmailMsg && <p className="text-sm text-slate-300">{gmailMsg}</p>}
              </div>
            )}
          </Card>
        </section>
      </RoleGuard>

      {/* ─── Network DB ─── */}
      <RoleGuard minRole="admin">
        <section className="space-y-4">
          <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">Shared Database Location</h2>
          <Card>
            <p className="text-slate-400 text-sm mb-3">Point the app to a shared network folder so all team members use the same database file.</p>
            {dbPath && <p className="text-slate-300 text-sm mb-3 break-all">{dbPath}</p>}
            <Button variant="secondary" onClick={handlePickFolder}>
              📁 {dbPath ? 'Change Folder' : 'Select Network Folder'}
            </Button>
          </Card>
        </section>
      </RoleGuard>

      {/* ─── User Management ─── */}
      <RoleGuard minRole="admin">
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="text-white font-semibold text-lg">User Management</h2>
            <Button size="sm" onClick={() => setShowUserModal(true)}>+ Add User</Button>
          </div>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
                <div>
                  <p className="text-white text-sm font-medium">{u.name}</p>
                  <p className="text-slate-400 text-xs">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={u.role === 'admin' ? 'info' : u.role === 'editor' ? 'success' : 'neutral'}>
                    {u.role}
                  </Badge>
                  {u.id !== currentUser?.id && (
                    <button onClick={() => handleDeleteUser(u.id)} className="text-slate-500 hover:text-red-400 text-lg transition-colors">×</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </RoleGuard>

      <Modal open={showUserModal} onClose={() => setShowUserModal(false)} title="Add User">
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input label="Full Name" value={userForm.name} onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))} required />
          <Input label="Email" type="email" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} required />
          <Input label="Password" type="password" value={userForm.password} onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))} required />
          <Select
            label="Role"
            value={userForm.role}
            onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}
            options={[{ value: 'admin', label: 'Admin' }, { value: 'editor', label: 'Editor' }, { value: 'viewer', label: 'Viewer' }]}
          />
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 text-sm font-medium">Department Access (leave empty = all departments)</label>
            <div className="flex flex-wrap gap-2">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={userForm.department_ids.includes(d.id)}
                    onChange={(e) => {
                      setUserForm((f) => ({
                        ...f,
                        department_ids: e.target.checked
                          ? [...f.department_ids, d.id]
                          : f.department_ids.filter((id) => id !== d.id)
                      }))
                    }}
                    className="rounded"
                  />
                  <span className="text-slate-300 text-sm">{d.name}</span>
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full justify-center">Create User</Button>
        </form>
      </Modal>
    </div>
  )
}
