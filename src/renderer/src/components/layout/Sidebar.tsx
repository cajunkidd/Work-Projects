import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useThemeStore } from '../../store/themeStore'
import { useAuthStore } from '../../store/authStore'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '\u229E' },
  { to: '/contracts', label: 'Contracts', icon: '\uD83D\uDCC4' },
  { to: '/invoices', label: 'Invoices', icon: '\uD83D\uDCE7' },
  { to: '/competitors', label: 'Competitors', icon: '\u2696' },
  { to: '/projects', label: 'Projects', icon: '\uD83D\uDDC2' },
  { to: '/reports', label: 'Reports', icon: '\uD83D\uDCCA' },
  { to: '/settings', label: 'Settings', icon: '\u2699' }
]

export default function Sidebar() {
  const logoPath = useThemeStore((s) => s.logoPath)
  const { user, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)

  const width = collapsed ? 'w-16' : 'w-56'

  const linkCls = (isActive: boolean) =>
    `flex items-center gap-3 ${collapsed ? 'justify-center' : ''} px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      isActive
        ? 'text-white'
        : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`

  const linkStyle = (isActive: boolean) =>
    isActive ? { background: 'var(--brand-primary)' } : {}

  return (
    <aside className={`${width} flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200`}>
      {/* Logo / Brand */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-4 py-5 border-b border-slate-800`}>
        {logoPath ? (
          <img
            src={`app-local://${encodeURIComponent(logoPath)}`}
            alt="Logo"
            className="h-10 w-10 rounded-lg object-contain bg-white p-1 flex-shrink-0"
          />
        ) : (
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
            style={{ background: 'var(--brand-primary)' }}
          >
            C
          </div>
        )}
        {!collapsed && (
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Contract</p>
            <p className="text-slate-400 text-xs">Manager</p>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="mx-2 mt-2 px-2 py-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors text-xs text-center"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '\u25B6' : '\u25C0'}
      </button>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => linkCls(isActive)}
            style={({ isActive }) => linkStyle(isActive)}
            title={collapsed ? item.label : undefined}
          >
            <span className="text-base flex-shrink-0">{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}
        {user?.role === 'super_admin' && (
          <NavLink
            to="/assets"
            className={({ isActive }) => linkCls(isActive)}
            style={({ isActive }) => linkStyle(isActive)}
            title={collapsed ? 'Assets' : undefined}
          >
            <span className="text-base flex-shrink-0">{'\uD83D\uDDA5'}</span>
            {!collapsed && 'Assets'}
          </NavLink>
        )}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2'} mb-2`}>
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ background: 'var(--brand-secondary)' }}
          >
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.name}</p>
              <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
            </div>
          )}
        </div>
        <button
          onClick={logout}
          className={`w-full text-xs text-slate-400 hover:text-white py-1 px-2 rounded hover:bg-slate-800 transition-colors ${collapsed ? 'text-center' : 'text-left'}`}
          title="Sign out"
        >
          {collapsed ? '\u23FB' : 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
