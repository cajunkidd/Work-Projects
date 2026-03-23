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
import type { Department, Branch, User } from '../../../shared/types'

export default function SettingsPage() {
  const { setTheme, setLogo, logoPath, brandPrimary } = useThemeStore()
  const { user: currentUser } = useAuthStore()
  const [settings, setSettings] = useState<any>({})
  const [departments, setDepartments] = useState<Department[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [newDeptName, setNewDeptName] = useState('')
  const [deptSaving, setDeptSaving] = useState(false)

  // Branch management
  const [newBranchNumber, setNewBranchNumber] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [branchSaving, setBranchSaving] = useState(false)

  // Email notifications (SMTP)
  const [smtpForm, setSmtpForm] = useState({
    smtp_enabled: 'false',
    smtp_host: '',
    smtp_port: '587',
    smtp_secure: 'false',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: ''
  })
  const [smtpSaving, setSmtpSaving] = useState(false)
  const [smtpMsg, setSmtpMsg] = useState('')
  const [testingEmail, setTestingEmail] = useState(false)

  // Gmail
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [showGmailCode, setShowGmailCode] = useState(false)
  const [gmailMsg, setGmailMsg] = useState('')

  // User management
  const [showUserModal, setShowUserModal] = useState(false)
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'store_manager',
    department_ids: [] as number[],
    branch_ids: [] as number[]
  })

  // Budget — supports department or branch
  const [budgetScope, setBudgetScope] = useState<'company' | 'department' | 'branch'>('company')
  const [budgetDeptId, setBudgetDeptId] = useState('')
  const [budgetBranchId, setBudgetBranchId] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetYear, setBudgetYear] = useState(String(new Date().getFullYear()))
  const [budgetSaving, setBudgetSaving] = useState(false)
  const [budgetMsg, setBudgetMsg] = useState('')

  // DB path
  const [dbPath, setDbPath] = useState('')
  const [logoMsg, setLogoMsg] = useState('')

  // E-Signature (Documenso)
  const [documensoUrl, setDocumensoUrl] = useState('')
  const [documensoApiKey, setDocumensoApiKey] = useState('')
  const [documensoSaving, setDocumensoSaving] = useState(false)
  const [documensoMsg, setDocumensoMsg] = useState('')
  const [documensoTesting, setDocumensoTesting] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  const load = () => {
    window.api.settings.get().then((res) => {
      if (res.success && res.data) {
        setSettings(res.data)
        setGmailConnected(res.data.gmail_connected === 'true')
        setGmailEmail(res.data.gmail_email || '')
        setDbPath(res.data.db_network_path || '')
        setSmtpForm({
          smtp_enabled: res.data.smtp_enabled || 'false',
          smtp_host: res.data.smtp_host || '',
          smtp_port: res.data.smtp_port || '587',
          smtp_secure: res.data.smtp_secure || 'false',
          smtp_user: res.data.smtp_user || '',
          smtp_pass: res.data.smtp_pass || '',
          smtp_from: res.data.smtp_from || ''
        })
        setDocumensoUrl(res.data.documenso_url || '')
        setDocumensoApiKey(res.data.documenso_api_key || '')
      }
    })
    window.api.departments.list().then((res) => {
      if (res.success && res.data) setDepartments(res.data)
    })
    window.api.branches.list().then((res) => {
      if (res.success && res.data) setBranches(res.data)
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

  // Add branch
  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBranchName.trim() || !newBranchNumber.trim()) return
    setBranchSaving(true)
    await window.api.branches.create({ number: parseInt(newBranchNumber), name: newBranchName.trim() })
    setNewBranchNumber('')
    setNewBranchName('')
    setBranchSaving(false)
    load()
  }

  const handleDeleteBranch = async (id: number) => {
    await window.api.branches.delete(id)
    setBranches((prev) => prev.filter((b) => b.id !== id))
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
      department_id: budgetScope === 'department' && budgetDeptId ? parseInt(budgetDeptId) : null,
      branch_id: budgetScope === 'branch' && budgetBranchId ? parseInt(budgetBranchId) : null,
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
    setUserForm({ name: '', email: '', password: '', role: 'store_manager', department_ids: [], branch_ids: [] })
    load()
  }

  const handleDeleteUser = async (id: number) => {
    if (id === currentUser?.id) return
    await window.api.users.delete(id)
    setUsers((prev) => prev.filter((u) => u.id !== id))
  }

  const roleLabel = (role: string) => {
    if (role === 'super_admin') return 'Super Admin'
    if (role === 'director') return 'Director'
    return 'Store Manager'
  }

  const roleBadgeVariant = (role: string): 'info' | 'success' | 'neutral' => {
    if (role === 'super_admin') return 'info'
    if (role === 'director') return 'success'
    return 'neutral'
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-white text-2xl font-bold">Settings</h1>
        <p className="text-slate-400 text-sm">Configure your application</p>
      </div>

      {/* ─── Branding ─── */}
      <RoleGuard minRole="super_admin">
        <section className="space-y-4">
          <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">Branding</h2>
          <Card>
            <div className="flex items-start gap-6">
              <div className="flex-shrink-0">
                {logoPath ? (
                  <img src={`app-local://${encodeURIComponent(logoPath)}`} alt="Logo" className="h-16 w-16 rounded-xl object-contain bg-white p-2" />
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
      <RoleGuard minRole="super_admin">
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

      {/* ─── Branches ─── */}
      <RoleGuard minRole="super_admin">
        <section className="space-y-4">
          <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">Store Branches</h2>
          <form onSubmit={handleAddBranch} className="flex gap-2">
            <Input
              placeholder="Branch #"
              type="number"
              value={newBranchNumber}
              onChange={(e) => setNewBranchNumber(e.target.value)}
              className="w-28"
            />
            <Input
              placeholder="Branch name (e.g. Sulphur)"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={branchSaving}>Add</Button>
          </form>
          <div className="space-y-2">
            {branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-2">
                <span className="text-white text-sm">Branch {b.number} – {b.name}</span>
                <button onClick={() => handleDeleteBranch(b.id)} className="text-slate-500 hover:text-red-400 text-lg transition-colors">×</button>
              </div>
            ))}
            {branches.length === 0 && <p className="text-slate-400 text-sm">No branches yet. Add one above.</p>}
          </div>
        </section>
      </RoleGuard>

      {/* ─── Budget ─── */}
      <RoleGuard minRole="super_admin">
        <section className="space-y-4">
          <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">Budget Configuration</h2>
          <Card>
            <form onSubmit={handleBudgetSave} className="space-y-4">
              <Select
                label="Budget Scope"
                value={budgetScope}
                onChange={(e) => setBudgetScope(e.target.value as any)}
                options={[
                  { value: 'company', label: 'Company Overall' },
                  { value: 'department', label: 'Department' },
                  { value: 'branch', label: 'Store Branch' }
                ]}
              />
              {budgetScope === 'department' && (
                <Select
                  label="Department"
                  value={budgetDeptId}
                  onChange={(e) => setBudgetDeptId(e.target.value)}
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
              )}
              {budgetScope === 'branch' && (
                <Select
                  label="Store Branch"
                  value={budgetBranchId}
                  onChange={(e) => setBudgetBranchId(e.target.value)}
                  options={branches.map((b) => ({ value: b.id, label: `Branch ${b.number} – ${b.name}` }))}
                />
              )}
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
      <RoleGuard minRole="super_admin">
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

      {/* ─── Email Notifications ─── */}
      <RoleGuard minRole="super_admin">
        <section className="space-y-4">
          <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">Email Notifications</h2>
          <Card>
            <div className="space-y-4">
              <p className="text-slate-400 text-sm">
                Send automatic email alerts to users when contracts or budgets relevant to their department or branch are added, changed, or removed.
              </p>

              {/* Master toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smtpForm.smtp_enabled === 'true'}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_enabled: e.target.checked ? 'true' : 'false' }))}
                  className="w-4 h-4 rounded accent-[var(--brand-primary)] cursor-pointer"
                />
                <span className="text-white text-sm font-medium">Enable email notifications</span>
              </label>

              {/* SMTP fields */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="SMTP Host"
                  placeholder="smtp.gmail.com"
                  value={smtpForm.smtp_host}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_host: e.target.value }))}
                />
                <Input
                  label="SMTP Port"
                  type="number"
                  placeholder="587"
                  value={smtpForm.smtp_port}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_port: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Username / Email"
                  placeholder="you@company.com"
                  value={smtpForm.smtp_user}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_user: e.target.value }))}
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  value={smtpForm.smtp_pass}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_pass: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="From Address"
                  placeholder="noreply@company.com"
                  value={smtpForm.smtp_from}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_from: e.target.value }))}
                />
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smtpForm.smtp_secure === 'true'}
                      onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_secure: e.target.checked ? 'true' : 'false' }))}
                      className="w-4 h-4 rounded accent-[var(--brand-primary)] cursor-pointer"
                    />
                    <span className="text-slate-300 text-sm">Use SSL/TLS (port 465)</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-1">
                <Button
                  variant="primary"
                  disabled={smtpSaving}
                  onClick={async () => {
                    setSmtpSaving(true)
                    await window.api.settings.set(smtpForm)
                    setSmtpSaving(false)
                    setSmtpMsg('Settings saved!')
                    setTimeout(() => setSmtpMsg(''), 3000)
                  }}
                >
                  {smtpSaving ? 'Saving...' : 'Save Settings'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={testingEmail || !smtpForm.smtp_host}
                  onClick={async () => {
                    setTestingEmail(true)
                    setSmtpMsg('')
                    const res = await window.api.settings.testEmail(currentUser?.email || '')
                    setTestingEmail(false)
                    setSmtpMsg(res.success ? '✓ Test email sent!' : `Failed: ${res.error}`)
                    setTimeout(() => setSmtpMsg(''), 6000)
                  }}
                >
                  {testingEmail ? 'Sending...' : 'Send Test Email'}
                </Button>
                {smtpMsg && (
                  <span className={`text-sm ${smtpMsg.startsWith('✓') ? 'text-emerald-400' : smtpMsg.startsWith('Settings') ? 'text-emerald-400' : 'text-red-400'}`}>
                    {smtpMsg}
                  </span>
                )}
              </div>
            </div>
          </Card>
        </section>
      </RoleGuard>

      {/* ─── E-Signature (Documenso) ─── */}
      <RoleGuard minRole="super_admin">
        <section className="space-y-4">
          <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">E-Signature (Documenso)</h2>
          <Card>
            <div className="space-y-4">
              <p className="text-slate-400 text-sm">
                Connect to a{' '}
                <span className="text-slate-300 font-medium">Documenso</span> instance to send
                contracts for legally-binding electronic signature. Use{' '}
                <span className="text-slate-300">app.documenso.com</span> or your own self-hosted
                instance.
              </p>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1.5">
                    Documenso API URL
                  </label>
                  <input
                    className="bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] w-full placeholder-slate-500"
                    placeholder="https://app.documenso.com"
                    value={documensoUrl}
                    onChange={(e) => setDocumensoUrl(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1.5">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      className="bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 pr-16 focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] w-full placeholder-slate-500"
                      placeholder="api_xxxxxxxxxxxxxxxx"
                      value={documensoApiKey}
                      onChange={(e) => setDocumensoApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <p className="text-slate-500 text-xs mt-1">
                    Generate an API key in Documenso → Settings → API Tokens
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={async () => {
                    setDocumensoSaving(true)
                    setDocumensoMsg('')
                    await window.api.settings.set({
                      documenso_url: documensoUrl,
                      documenso_api_key: documensoApiKey
                    })
                    setDocumensoSaving(false)
                    setDocumensoMsg('✓ Settings saved')
                    setTimeout(() => setDocumensoMsg(''), 3000)
                  }}
                  disabled={documensoSaving}
                >
                  {documensoSaving ? 'Saving...' : 'Save'}
                </Button>

                <Button
                  variant="secondary"
                  onClick={async () => {
                    setDocumensoTesting(true)
                    setDocumensoMsg('')
                    // Save first so the IPC handler reads the latest values
                    await window.api.settings.set({
                      documenso_url: documensoUrl,
                      documenso_api_key: documensoApiKey
                    })
                    const res = await window.api.contractCreation.testDocumenso()
                    setDocumensoTesting(false)
                    if (res.success) {
                      setDocumensoMsg('✓ Connected to Documenso successfully!')
                    } else {
                      setDocumensoMsg(`Error: ${res.error}`)
                    }
                    setTimeout(() => setDocumensoMsg(''), 6000)
                  }}
                  disabled={documensoTesting}
                >
                  {documensoTesting ? 'Testing...' : 'Test Connection'}
                </Button>

                {documensoMsg && (
                  <span
                    className={`text-sm ${
                      documensoMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {documensoMsg}
                  </span>
                )}
              </div>
            </div>
          </Card>
        </section>
      </RoleGuard>

      {/* ─── Network DB ─── */}
      <RoleGuard minRole="super_admin">
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
      <RoleGuard minRole="super_admin">
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
                  <Badge variant={roleBadgeVariant(u.role)}>
                    {roleLabel(u.role)}
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
            onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value, department_ids: [], branch_ids: [] }))}
            options={[
              { value: 'super_admin', label: 'Super Admin' },
              { value: 'director', label: 'Director' },
              { value: 'store_manager', label: 'Store Manager' }
            ]}
          />

          {/* Branch access — shown for director and store_manager */}
          {(userForm.role === 'store_manager' || userForm.role === 'director') && (
            <div className="flex flex-col gap-1">
              <label className="text-slate-300 text-sm font-medium">
                {userForm.role === 'store_manager' ? 'Assigned Branch' : 'Assigned Branches'}
              </label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type={userForm.role === 'store_manager' ? 'radio' : 'checkbox'}
                      name="branch_select"
                      checked={userForm.branch_ids.includes(b.id)}
                      onChange={(e) => {
                        if (userForm.role === 'store_manager') {
                          setUserForm((f) => ({ ...f, branch_ids: e.target.checked ? [b.id] : [] }))
                        } else {
                          setUserForm((f) => ({
                            ...f,
                            branch_ids: e.target.checked
                              ? [...f.branch_ids, b.id]
                              : f.branch_ids.filter((id) => id !== b.id)
                          }))
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-slate-300 text-sm">Branch {b.number} – {b.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Department access — shown for director only */}
          {userForm.role === 'director' && (
            <div className="flex flex-col gap-1">
              <label className="text-slate-300 text-sm font-medium">Assigned Departments</label>
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
          )}

          <Button type="submit" className="w-full justify-center">Create User</Button>
        </form>
      </Modal>
    </div>
  )
}
