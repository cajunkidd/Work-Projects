import { useMemo } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { CommandPalette, PageTransition } from '../ui'
import type { Command } from '../ui'
import { useAuthStore } from '../../store/authStore'

/* Minimal stroke icon set for the command palette (18px, currentColor). */
const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

const iconDashboard = (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
)
const iconContracts = (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </svg>
)
const iconInvoices = (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
)
const iconCompetitors = (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true">
    <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="M7 21h10" />
    <path d="M12 3v18" />
    <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
  </svg>
)
const iconProjects = (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true">
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
)
const iconAssets = (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
)
const iconSettings = (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
  </svg>
)
const iconSignOut = (
  <svg viewBox="0 0 24 24" {...S} aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
)

export default function Layout() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: 'go-dashboard', label: 'Go to Dashboard', group: 'Navigate', hint: '/dashboard', icon: iconDashboard, run: () => navigate('/dashboard') },
      { id: 'go-contracts', label: 'Go to Contracts', group: 'Navigate', hint: '/contracts', icon: iconContracts, run: () => navigate('/contracts') },
      { id: 'go-invoices', label: 'Go to Invoices', group: 'Navigate', hint: '/invoices', icon: iconInvoices, run: () => navigate('/invoices') },
      { id: 'go-competitors', label: 'Go to Competitors', group: 'Navigate', hint: '/competitors', icon: iconCompetitors, run: () => navigate('/competitors') },
      { id: 'go-projects', label: 'Go to Projects', group: 'Navigate', hint: '/projects', icon: iconProjects, run: () => navigate('/projects') }
    ]
    if (user?.role === 'super_admin') {
      nav.push({ id: 'go-assets', label: 'Go to Assets', group: 'Navigate', hint: '/assets', icon: iconAssets, run: () => navigate('/assets') })
    }
    nav.push({ id: 'go-settings', label: 'Go to Settings', group: 'Navigate', hint: '/settings', icon: iconSettings, run: () => navigate('/settings') })
    nav.push({ id: 'sign-out', label: 'Sign out', group: 'Actions', icon: iconSignOut, run: () => logout() })
    return nav
  }, [navigate, logout, user?.role])

  return (
    <div className="relative flex h-screen overflow-hidden bg-surface-0">
      {/* Ambient backdrop — aurora blobs + mesh tint + drifting grid, all behind content */}
      <div className="pointer-events-none absolute inset-0 aurora bg-mesh opacity-60" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 grid-bg noise opacity-70" aria-hidden="true" />

      <Sidebar />

      <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>

      {/* Global ⌘K palette — mounted exactly once */}
      <CommandPalette commands={commands} placeholder="Search pages and actions…" />
    </div>
  )
}
