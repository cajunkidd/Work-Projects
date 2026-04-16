import { useEffect, useState } from 'react'

interface Tag {
  id: number
  name: string
  color: string
}

interface Props {
  contractId: number
}

const DEFAULT_TAG_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#84cc16', '#ec4899', '#f97316'
]

export default function ContractTags({ contractId }: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [attachedTags, setAttachedTags] = useState<Tag[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLORS[0])

  const load = () => {
    window.api.tags.list().then((res: any) => {
      if (res.success && res.data) setAllTags(res.data)
    })
    window.api.tags
      .forEntity({ entity_type: 'contract', entity_id: contractId })
      .then((res: any) => {
        if (res.success && res.data) setAttachedTags(res.data)
      })
  }

  useEffect(() => { load() }, [contractId])

  const attachedIds = new Set(attachedTags.map((t) => t.id))
  const availableTags = allTags.filter((t) => !attachedIds.has(t.id))

  const attach = async (tagId: number) => {
    await window.api.tags.attach({ entity_type: 'contract', entity_id: contractId, tag_id: tagId })
    load()
  }

  const detach = async (tagId: number) => {
    await window.api.tags.detach({ entity_type: 'contract', entity_id: contractId, tag_id: tagId })
    load()
  }

  const createTag = async () => {
    if (!newTagName.trim()) return
    const res = await window.api.tags.create({ name: newTagName.trim(), color: newTagColor })
    if (res.success && res.data) {
      await attach(res.data.id)
      setNewTagName('')
      setNewTagColor(DEFAULT_TAG_COLORS[0])
      setShowPicker(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {attachedTags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium"
          style={{ background: t.color + '33', color: t.color, border: `1px solid ${t.color}66` }}
        >
          {t.name}
          <button
            onClick={() => detach(t.id)}
            className="text-slate-400 hover:text-white ml-0.5"
            title={`Remove ${t.name}`}
          >
            ×
          </button>
        </span>
      ))}

      <button
        onClick={() => setShowPicker((v) => !v)}
        className="text-xs px-2 py-1 rounded-full border border-dashed border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200 transition-colors"
      >
        + Tag
      </button>

      {showPicker && (
        <div className="absolute mt-8 bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg z-10 w-72 space-y-3">
          {availableTags.length > 0 && (
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Existing</p>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { attach(t.id); setShowPicker(false) }}
                    className="text-xs px-2 py-1 rounded-full font-medium hover:opacity-80"
                    style={{ background: t.color + '33', color: t.color, border: `1px solid ${t.color}66` }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Create new</p>
            <div className="flex gap-2">
              <input
                className="bg-slate-900 border border-slate-700 text-white text-sm rounded px-2 py-1 flex-1"
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    createTag()
                  }
                }}
              />
              <button
                onClick={createTag}
                className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white"
              >
                Add
              </button>
            </div>
            <div className="flex gap-1.5 mt-2">
              {DEFAULT_TAG_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewTagColor(c)}
                  className={`w-5 h-5 rounded-full border-2 ${
                    newTagColor === c ? 'border-white' : 'border-transparent'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
