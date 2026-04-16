import { useEffect, useState } from 'react'

interface FieldDef {
  id: number
  name: string
  field_type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options_json: string
}

interface FieldValue {
  field_id: number
  value: string
  name: string
  field_type: FieldDef['field_type']
  options_json: string
}

interface Props {
  contractId: number
}

export default function ContractCustomFields({ contractId }: Props) {
  const [defs, setDefs] = useState<FieldDef[]>([])
  const [valueByField, setValueByField] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<Record<number, boolean>>({})

  const load = () => {
    window.api.customFields.list('contract').then((res: any) => {
      if (res.success && res.data) setDefs(res.data)
    })
    window.api.customFields
      .values({ entity_type: 'contract', entity_id: contractId })
      .then((res: any) => {
        if (res.success && res.data) {
          const map: Record<number, string> = {}
          for (const v of res.data as FieldValue[]) map[v.field_id] = v.value
          setValueByField(map)
        }
      })
  }

  useEffect(() => { load() }, [contractId])

  const handleChange = async (field: FieldDef, value: string) => {
    setValueByField((m) => ({ ...m, [field.id]: value }))
    setSaving((m) => ({ ...m, [field.id]: true }))
    await window.api.customFields.setValue({
      entity_type: 'contract',
      entity_id: contractId,
      field_id: field.id,
      value
    })
    setSaving((m) => ({ ...m, [field.id]: false }))
  }

  if (defs.length === 0) {
    return (
      <div className="text-slate-400 text-xs">
        No custom fields defined. An admin can add them in Settings → Custom Fields.
      </div>
    )
  }

  const inputCls =
    'bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none w-full placeholder-slate-500'

  return (
    <div className="grid grid-cols-2 gap-4">
      {defs.map((field) => {
        const current = valueByField[field.id] ?? ''
        let options: string[] = []
        if (field.field_type === 'select') {
          try {
            options = JSON.parse(field.options_json || '[]')
          } catch {
            options = []
          }
        }
        return (
          <div key={field.id}>
            <label className="text-slate-400 text-xs font-medium block mb-1 flex items-center justify-between">
              <span>{field.name}</span>
              {saving[field.id] && <span className="text-slate-500">saving…</span>}
            </label>
            {field.field_type === 'text' && (
              <input
                type="text"
                className={inputCls}
                value={current}
                onChange={(e) => handleChange(field, e.target.value)}
              />
            )}
            {field.field_type === 'number' && (
              <input
                type="number"
                className={inputCls}
                value={current}
                onChange={(e) => handleChange(field, e.target.value)}
              />
            )}
            {field.field_type === 'date' && (
              <input
                type="date"
                className={inputCls}
                value={current}
                onChange={(e) => handleChange(field, e.target.value)}
              />
            )}
            {field.field_type === 'select' && (
              <select
                className={inputCls}
                value={current}
                onChange={(e) => handleChange(field, e.target.value)}
              >
                <option value="">— Select —</option>
                {options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            )}
            {field.field_type === 'boolean' && (
              <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-sm">
                <input
                  type="checkbox"
                  className="rounded accent-[var(--brand-primary)] cursor-pointer"
                  checked={current === 'true'}
                  onChange={(e) => handleChange(field, e.target.checked ? 'true' : 'false')}
                />
                {current === 'true' ? 'Yes' : 'No'}
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}
