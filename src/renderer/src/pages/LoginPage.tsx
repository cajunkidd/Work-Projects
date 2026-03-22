import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [setupName, setSetupName] = useState('')
  const navigate = useNavigate()
  const { login, user } = useAuthStore()
  const logoPath = useThemeStore((s) => s.logoPath)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    window.api.users.hasAdmin().then((res) => {
      if (res.success && res.data === false) setIsFirstRun(true)
    })
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await window.api.users.login({ email, password })
    setLoading(false)
    if (res.success && res.data) {
      login(res.data)
      navigate('/dashboard', { replace: true })
    } else {
      setError(res.error || 'Login failed')
    }
  }

  const handleFirstRunSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await window.api.users.create({
      name: setupName,
      email,
      password,
      role: 'admin',
      department_ids: []
    })
    setLoading(false)
    if (res.success && res.data) {
      login(res.data)
      navigate('/dashboard', { replace: true })
    } else {
      setError(res.error || 'Setup failed')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {logoPath ? (
            <img
              src={`file://${logoPath}`}
              alt="Logo"
              className="h-16 w-16 rounded-xl object-contain bg-white p-2 mb-4"
            />
          ) : (
            <div
              className="h-16 w-16 rounded-xl flex items-center justify-center text-white font-bold text-3xl mb-4"
              style={{ background: 'var(--brand-primary)' }}
            >
              C
            </div>
          )}
          <h1 className="text-white text-2xl font-bold">Contract Manager</h1>
          <p className="text-slate-400 text-sm mt-1">
            {isFirstRun ? 'Create your admin account' : 'Sign in to your account'}
          </p>
        </div>

        <form
          onSubmit={isFirstRun ? handleFirstRunSetup : handleLogin}
          className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4"
        >
          {isFirstRun && (
            <Input
              label="Full Name"
              type="text"
              placeholder="Your name"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              required
            />
          )}
          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">
              {error}
            </div>
          )}
          <Button type="submit" className="w-full justify-center" disabled={loading}>
            {loading ? 'Please wait...' : isFirstRun ? 'Create Admin Account' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  )
}
