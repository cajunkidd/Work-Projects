import { useEffect, useState } from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'

interface FieldDef {
  id: number
  entity_type: string
  name: string
  field_type: 'text' | 'number' | 'date' | 'select' | 'boolean'
  options_json: string
  sort_order: number
}

interface Tag {
  id: number
  name: string
  color: string
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select (dropdown)' },
  { value: 'boolean', label: 'Yes/No' }
]

export default function CustomFieldsSection() {
  const [fields, setFields] = useState<FieldDef[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [newField, setNewField] = useState({
    name: '',
    field_type: 'text' as FieldDef['field_type'],
    options: ''
  })
  const [newTag, setNewTag] = useState({ name: '', color: '#6366f1' })

  const loadFields = () => {
    window.api.customFields.list('contract').then((res: any) => {
      if (res.success && res.data) setFields(res.data)
    })
  }
  const loadTags = () => {
    window.api.tags.list().then((res: any) => {
      if (res.success && res.data) setTags(res.data)
    })
  }

  useEffect(() => {
    loadFields()
    loadTags()
  }, [])

  const addField = async () => {
    if (!newField.name.trim()) return
    const options_json =
      newField.field_type === 'select'
        ? JSON.stringify(
            newField.options
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        : '[]'
    const res = await window.api.customFields.create({
      entity_type: 'contract',
      name: newField.name.trim(),
      field_type: newField.field_type,
      options_json,
      sort_order: fields.length
    })
    if (res.success) {
      setNewField({ name: '', field_type: 'text', options: '' })
      loadFields()
    }
  }

  const deleteField = async (id: number) => {
    if (!confirm('Delete this custom field? All saved values for it across contracts will also be deleted.')) return
    await window.api.customFields.delete(id)
    loadFields()
  }

  const addTag = async () => {
    if (!newTag.name.trim()) return
    const res = await window.api.tags.create({ name: newTag.name.trim(), color: newTag.color })
    if (res.success) {
      setNewTag({ name: '', color: '#6366f1' })
      loadTags()
    }
  }

  const deleteTag = async (id: number) => {
    if (!confirm('Delete this tag? It will be removed from all contracts.')) return
    await window.api.tags.delete(id)
    loadTags()
  }

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg border-b border-slate-800 pb-2">
        Custom Fields &amp; Tags
      </h2>

      <Card>
        <p className="text-white font-semibold mb-1">Contract Custom Fields</p>
        <p className="text-slate-400 text-xs mb-4">
          Add extra fields (MSA type, data classification, jurisdiction, etc.) that appear on every contract's Overview tab.
        </p>

        {fields.length === 0 ? (
          <p className="text-slate-400 text-sm mb-4">No custom fields defined yet.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {fields.map((f) => {
              let opts: string[] = []
              try {
                opts = JSON.parse(f.options_json || '[]')
              } catch {
                /* ignore */
              }
              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{f.name}</p>
                    <p className="text-slate-500 text-xs">
                      {f.field_type}
                      {f.field_type === 'select' && opts.length > 0 && ` · ${opts.join(', ')}`}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteField(f.id)}
                    className="text-xs text-slate-500 hover:text-red-400 px-2"
                  >
                    Delete
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 items-end pt-3 border-t border-slate-800">
          <Input
            label="Name"
            placeholder="e.g. MSA Type"
            value={newField.name}
            onChange={(e) => setNewField((n) => ({ ...n, name: e.target.value }))}
          />
          <Select
            label="Type"
            value={newField.field_type}
            onChange={(e) => setNewField((n) => ({ ...n, field_type: e.target.value as any }))}
            options={FIELD_TYPES}
          />
          <Button onClick={addField} disabled={!newField.name.trim()}>+ Add Field</Button>
        </div>
        {newField.field_type === 'select' && (
          <div className="mt-2">
            <Input
              label="Options (comma-separated)"
              placeholder="MSA, SOW, NDA, Amendment"
              value={newField.options}
              onChange={(e) => setNewField((n) => ({ ...n, options: e.target.value }))}
            />
          </div>
        )}
      </Card>

      <Card>
        <p className="text-white font-semibold mb-1">Tags</p>
        <p className="text-slate-400 text-xs mb-4">
          Reusable labels (e.g. "IT", "compliance", "renewal-risk") attachable to contracts.
        </p>

        {tags.length === 0 ? (
          <p className="text-slate-400 text-sm mb-4">No tags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium"
                style={{ background: t.color + '33', color: t.color, border: `1px solid ${t.color}66` }}
              >
                {t.name}
                <button
                  onClick={() => deleteTag(t.id)}
                  className="text-slate-400 hover:text-white ml-0.5"
                  title={`Delete ${t.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end pt-3 border-t border-slate-800">
          <Input
            label="Tag name"
            placeholder="e.g. renewal-risk"
            value={newTag.name}
            onChange={(e) => setNewTag((n) => ({ ...n, name: e.target.value }))}
          />
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1">Color</label>
            <input
              type="color"
              value={newTag.color}
              onChange={(e) => setNewTag((n) => ({ ...n, color: e.target.value }))}
              className="w-14 h-8 bg-transparent border border-slate-700 rounded cursor-pointer"
            />
          </div>
          <Button onClick={addTag} disabled={!newTag.name.trim()}>+ Add Tag</Button>
        </div>
      </Card>
    </section>
  )
}
