import { NavLink } from 'react-router-dom'
import { useThemeStore } from '../../store/themeStore'
import { useAuthStore } from '../../store/authStore'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { to: '/contracts', label: 'Contracts', icon: '📄' },
  { to: '/invoices', label: 'Invoices', icon: '📧' },
  { to: '/competitors', label: 'Competitors', icon: '⚖' },
  { to: '/projects', label: 'Projects', icon: '🗂' },
  { to: '/settings', label: 'Settings', icon: '⚙' }
]

export default function Sidebar() {
  const logoPath = useThemeStore((s) => s.logoPath)
  const { user, logout } = useAuthStore()

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800">
        {logoPath ? (
          <img
            src={`app-local://${encodeURIComponent(logoPath)}`}
            alt="Logo"
            className="h-10 w-10 rounded-lg object-contain bg-white p-1"
          />
        ) : (
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
            style={{ background: 'var(--brand-primary)' }}
          >
            C
          </div>
        )}
        <div>
          <p className="text-white font-semibold text-sm leading-tight">Contract</p>
          <p className="text-slate-400 text-xs">Manager</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`
            }
            style={({ isActive }) =>
              isActive ? { background: 'var(--brand-primary)' } : {}
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'var(--brand-secondary)' }}
          >
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-medium truncate">{user?.name}</p>
            <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full text-xs text-slate-400 hover:text-white py-1 px-2 rounded hover:bg-slate-800 transition-colors text-left"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
