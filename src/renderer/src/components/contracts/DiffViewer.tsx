import { useState } from 'react'
import type { DiffLine, DiffStats, FieldChange } from '../../../../shared/types'

interface Props {
  lines: DiffLine[]
  stats: DiffStats
  fieldChanges?: FieldChange[]
  fromLabel: string
  toLabel: string
}

type ViewMode = 'redline' | 'changes'

/**
 * Renders a document comparison. 'redline' shows the full text with insertions
 * underlined and deletions struck through; 'changes' hides untouched lines so
 * a small edit in a long agreement is actually findable.
 */
export default function DiffViewer({ lines, stats, fieldChanges = [], fromLabel, toLabel }: Props) {
  const [mode, setMode] = useState<ViewMode>('changes')

  const hasChanges = stats.added + stats.removed + stats.modified > 0

  // In 'changes' mode keep two lines of context around each changed line.
  const visible =
    mode === 'redline'
      ? lines.map((_, i) => i)
      : lines.reduce<number[]>((acc, line, i) => {
          if (line.type === 'equal') return acc
          for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
            if (!acc.includes(j)) acc.push(j)
          }
          return acc
        }, []).sort((a, b) => a - b)

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-400">
            {fromLabel} <span className="text-slate-600">→</span> {toLabel}
          </span>
          <span className="text-emerald-400">+{stats.added}</span>
          <span className="text-red-400">−{stats.removed}</span>
          <span className="text-amber-400">~{stats.modified} modified</span>
          <span className="text-slate-500">{stats.unchanged} unchanged</span>
        </div>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
          {(['changes', 'redline'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                mode === m ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {m === 'changes' ? 'Changes only' : 'Full redline'}
            </button>
          ))}
        </div>
      </div>

      {/* Structured field changes */}
      {fieldChanges.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
          <p className="text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">
            Contract terms that changed
          </p>
          <div className="space-y-1">
            {fieldChanges.map((change) => (
              <div key={change.field} className="flex items-baseline gap-2 text-sm">
                <span className="text-slate-400 min-w-[150px]">{change.label}</span>
                <span className="text-red-400 line-through">{change.old_value || '(empty)'}</span>
                <span className="text-slate-600">→</span>
                <span className="text-emerald-400">{change.new_value || '(empty)'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasChanges ? (
        <div className="text-slate-400 text-sm text-center py-8 border border-slate-800 rounded-lg">
          The document text is identical between these two versions.
        </div>
      ) : (
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto font-mono text-xs leading-relaxed">
            {visible.map((index) => {
              const line = lines[index]
              const prev = visible[visible.indexOf(index) - 1]
              const gap = prev !== undefined && index - prev > 1

              return (
                <div key={index}>
                  {gap && (
                    <div className="px-3 py-1 bg-slate-800/60 text-slate-500 text-center select-none">
                      ⋯
                    </div>
                  )}
                  <div
                    className={`flex ${
                      line.type === 'insert'
                        ? 'bg-emerald-500/10'
                        : line.type === 'delete'
                          ? 'bg-red-500/10'
                          : line.type === 'modified'
                            ? 'bg-amber-500/10'
                            : ''
                    }`}
                  >
                    {/* Gutter */}
                    <span className="w-10 flex-shrink-0 px-1 text-right text-slate-600 select-none border-r border-slate-800">
                      {line.old_line_no ?? ''}
                    </span>
                    <span className="w-10 flex-shrink-0 px-1 text-right text-slate-600 select-none border-r border-slate-800">
                      {line.new_line_no ?? ''}
                    </span>
                    <span
                      className={`w-5 flex-shrink-0 text-center select-none ${
                        line.type === 'insert'
                          ? 'text-emerald-400'
                          : line.type === 'delete'
                            ? 'text-red-400'
                            : line.type === 'modified'
                              ? 'text-amber-400'
                              : 'text-slate-700'
                      }`}
                    >
                      {line.type === 'insert'
                        ? '+'
                        : line.type === 'delete'
                          ? '−'
                          : line.type === 'modified'
                            ? '~'
                            : ' '}
                    </span>
                    {/* Content */}
                    <span className="flex-1 px-2 py-0.5 whitespace-pre-wrap break-words">
                      {line.segments.map((segment, si) => (
                        <span
                          key={si}
                          className={
                            segment.type === 'insert'
                              ? 'bg-emerald-500/25 text-emerald-200 underline decoration-emerald-400'
                              : segment.type === 'delete'
                                ? 'bg-red-500/25 text-red-300 line-through decoration-red-400'
                                : line.type === 'insert'
                                  ? 'text-emerald-200'
                                  : line.type === 'delete'
                                    ? 'text-red-300'
                                    : 'text-slate-300'
                          }
                        >
                          {segment.value}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
