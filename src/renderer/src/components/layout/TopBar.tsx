import { useEffect, useState } from 'react'
import { useThemeStore } from '../../store/themeStore'
import type { Department } from '../../../../shared/types'

export default function TopBar() {
  const [departments, setDepartments] = useState<Department[]>([])
  const { selectedDeptId, setSelectedDept } = useThemeStore()

  useEffect(() => {
    window.api.departments.list().then((res) => {
      if (res.success && res.data) setDepartments(res.data)
    })
  }, [])

  return (
    <header className="h-14 flex-shrink-0 bg-slate-900 border-b border-slate-800 flex items-center px-6 gap-4">
      {/* Department switcher */}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-sm">View:</span>
        <select
          value={selectedDeptId ?? ''}
          onChange={(e) => setSelectedDept(e.target.value === '' ? null : Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-primary cursor-pointer"
          style={{ '--tw-ring-color': 'var(--brand-primary)' } as any}
        >
          <option value="">Company Overview</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1" />

      {/* Year indicator */}
      <span className="text-slate-400 text-sm">FY {new Date().getFullYear()}</span>
    </header>
  )
}
