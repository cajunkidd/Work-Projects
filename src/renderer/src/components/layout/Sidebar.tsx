import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useThemeStore } from '../../store/themeStore'
import { useAuthStore } from '../../store/authStore'
import { Tooltip } from '../ui'

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

const icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...S} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  contracts: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...S} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  ),
  invoices: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...S} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  ),
  competitors: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...S} aria-hidden="true">
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </svg>
  ),
  projects: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...S} aria-hidden="true">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  ),
  assets: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...S} aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...S} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
    </svg>
  ),
  signOut: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...S} aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  collapse: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" {...S} aria-hidden="true">
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </svg>
  )
}

const mainNav = [
  { to: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
  { to: '/contracts', label: 'Contracts', icon: icons.contracts },
  { to: '/invoices', label: 'Invoices', icon: icons.invoices },
  { to: '/competitors', label: 'Competitors', icon: icons.competitors },
  { to: '/projects', label: 'Projects', icon: icons.projects }
]
const settingsNav = { to: '/settings', label: 'Settings', icon: icons.settings }
const assetsNav = { to: '/assets', label: 'Assets', icon: icons.assets }

const COLLAPSE_KEY = 'sidebar-collapsed'

export default function Sidebar() {
  const logoPath = useThemeStore((s) => s.logoPath)
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const navRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      return !c
    })
  }

  // Slide the active pill to the active NavLink (react-router marks it with aria-current).
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const active = nav.querySelector<HTMLElement>('a[aria-current="page"]')
      setIndicator(active ? { top: active.offsetTop, height: active.offsetHeight } : null)
    }
    measure()
    // Re-measure after the width transition settles.
    const t = window.setTimeout(measure, 320)
    return () => window.clearTimeout(t)
  }, [location.pathname, collapsed, user?.role])

  const items = [...mainNav, ...(user?.role === 'super_admin' ? [assetsNav] : []), settingsNav]

  const renderLink = (item: { to: string; label: string; icon: React.ReactNode }, i: number) => {
    const link = (
      <NavLink
        key={item.to}
        to={item.to}
        style={{ '--i': i } as React.CSSProperties}
        className={({ isActive }) =>
          [
            'group relative z-10 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
            'transition-colors duration-200',
            collapsed ? 'justify-center' : '',
            isActive ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
          ].join(' ')
        }
      >
        {({ isActive }) => (
          <>
            <span
              className={[
                'shrink-0 transition-transform duration-200 ease-spring',
                isActive ? 'scale-110' : 'group-hover:scale-110'
              ].join(' ')}
            >
              {item.icon}
            </span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </>
        )}
      </NavLink>
    )
    return collapsed ? (
      <Tooltip key={item.to} content={item.label} side="right">
        {link}
      </Tooltip>
    ) : (
      link
    )
  }

  return (
    <aside
      className={[
        'relative z-20 flex flex-shrink-0 flex-col glass border-r border-white/5',
        'transition-[width] duration-300 ease-out-expo',
        collapsed ? 'w-[68px]' : 'w-60'
      ].join(' ')}
    >
      {/* Brand */}
      <div
        className={`flex items-center gap-3 border-b border-white/5 py-5 ${
          collapsed ? 'justify-center px-0' : 'px-4'
        }`}
      >
        {logoPath ? (
          <img
            src={`app-local://${encodeURIComponent(logoPath)}`}
            alt="Logo"
            className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-1 shadow-glow"
          />
        ) : (
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-white shadow-glow">
            C
            <span className="absolute inset-0 rounded-xl ring-1 ring-white/20" aria-hidden="true" />
          </div>
        )}
        {!collapsed && (
          <div className="animate-fade-in">
            <p className="font-display text-sm font-semibold leading-tight text-white">Contract</p>
            <p className="text-xs text-slate-400">Manager</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav ref={navRef} className="stagger relative flex-1 space-y-1 px-2 py-4">
        {indicator && (
          <div
            className="absolute left-2 right-2 z-0 !m-0 rounded-xl bg-brand-gradient shadow-glow transition-all duration-300 ease-spring"
            style={{ top: indicator.top, height: indicator.height }}
            aria-hidden="true"
          />
        )}
        {items.map(renderLink)}
      </nav>

      {/* User footer */}
      <div className={`border-t border-white/5 py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        <div className={`mb-2 flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="relative h-9 w-9 shrink-0 rounded-full bg-brand-gradient p-[2px]">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-surface-1 text-xs font-bold text-white">
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          </div>
          {!collapsed && (
            <div className="min-w-0 animate-fade-in">
              <p className="truncate text-xs font-medium text-white">{user?.name}</p>
              <p className="truncate text-[11px] capitalize text-slate-400">
                {user?.role?.replace('_', ' ')}
              </p>
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
          <button
            onClick={logout}
            className={`flex items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-white ${
              collapsed ? '' : 'flex-1'
            }`}
          >
            {icons.signOut}
            {!collapsed && 'Sign out'}
          </button>
          <Tooltip content={collapsed ? 'Expand' : 'Collapse'} side={collapsed ? 'right' : 'top'}>
            <button
              onClick={toggleCollapsed}
              className="rounded-lg p-1.5 text-slate-500 transition-all hover:bg-white/5 hover:text-white"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className={`block transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}>
                {icons.collapse}
              </span>
            </button>
          </Tooltip>
        </div>
      </div>
    </aside>
  )
}
