import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

const iconUser = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" {...S} aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
  </svg>
)
const iconMail = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" {...S} aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
)
const iconLock = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" {...S} aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
)

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
      role: 'super_admin',
      department_ids: [],
      branch_ids: []
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-0 p-4">
      {/* Cinematic backdrop */}
      <div className="pointer-events-none absolute inset-0 aurora bg-mesh" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 grid-bg noise" aria-hidden="true" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl animate-pulse-glow"
        style={{ background: 'radial-gradient(circle, var(--brand-primary), transparent 65%)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center animate-fade-in-up">
          {logoPath ? (
            <img
              src={`file://${logoPath}`}
              alt="Logo"
              className="mb-4 h-16 w-16 rounded-2xl bg-white object-contain p-2 shadow-glow-lg animate-float"
            />
          ) : (
            <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient text-3xl font-bold text-white shadow-glow-lg animate-float">
              C
              <span className="absolute inset-0 rounded-2xl ring-1 ring-white/25" aria-hidden="true" />
            </div>
          )}
          <h1 className="font-display text-3xl font-bold tracking-tight text-gradient">
            Contract Manager
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {isFirstRun ? 'Create your admin account to get started' : 'Sign in to your account'}
          </p>
        </div>

        {/* Glass card */}
        <form
          onSubmit={isFirstRun ? handleFirstRunSetup : handleLogin}
          className="glass-strong gradient-border animate-fade-in-up rounded-2xl p-6 shadow-elevated [animation-delay:120ms]"
        >
          <div className="stagger space-y-4">
            {isFirstRun && (
              <Input
                label="Full Name"
                type="text"
                placeholder="Your name"
                icon={iconUser}
                value={setupName}
                onChange={(e) => setSetupName(e.target.value)}
                required
              />
            )}
            <Input
              label="Email"
              type="email"
              placeholder="you@company.com"
              icon={iconMail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              icon={iconLock}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <div className="animate-shake rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full justify-center" loading={loading}>
              {isFirstRun ? 'Create Admin Account' : 'Sign In'}
            </Button>
          </div>
        </form>

        <p className="mt-6 text-center font-mono text-[11px] text-slate-600 animate-fade-in [animation-delay:400ms]">
          Enterprise contract & budget management
        </p>
      </div>
    </div>
  )
}
