import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import LoginPage from './pages/LoginPage'
import Layout from './components/layout/Layout'
import DashboardPage from './pages/DashboardPage'
import ContractsPage from './pages/ContractsPage'
import ContractDetailPage from './pages/ContractDetailPage'
import InvoicesPage from './pages/InvoicesPage'
import CompetitorsPage from './pages/CompetitorsPage'
import ProjectsPage from './pages/ProjectsPage'
import SettingsPage from './pages/SettingsPage'
import OrgDetailPage from './pages/OrgDetailPage'
import AssetsPage from './pages/AssetsPage'
import ReportsPage from './pages/ReportsPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const user = useAuthStore((s) => s.user)
  const applyThemeToDom = useThemeStore((s) => s.applyThemeToDom)

  // Apply saved theme on mount
  useEffect(() => {
    applyThemeToDom()
  }, [applyThemeToDom])

  // Re-register the current user as the audit actor after persist rehydrate.
  useEffect(() => {
    if (user) {
      window.api?.audit?.setActor({ user_id: user.id, user_name: user.name })
    }
  }, [user])

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="contracts" element={<ContractsPage />} />
          <Route path="contracts/:id" element={<ContractDetailPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="competitors" element={<CompetitorsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="department/:id" element={<OrgDetailPage type="department" />} />
          <Route path="branch/:id" element={<OrgDetailPage type="branch" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
