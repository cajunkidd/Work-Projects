/**
 * Text diffing for contract redlining.
 *
 * Runs in two stages: an LCS diff over lines, then a word-level LCS inside runs
 * of changed lines so a reworded sentence renders as a true redline rather than
 * a whole-line delete plus insert. Both stages trim the common prefix/suffix
 * first, which keeps the quadratic table small for the usual case of a long
 * document with localised edits.
 */

export type DiffType = 'equal' | 'insert' | 'delete'

export interface DiffSegment {
  type: DiffType
  value: string
}

export type DiffLineType = 'equal' | 'insert' | 'delete' | 'modified'

export interface DiffLine {
  type: DiffLineType
  old_line_no: number | null
  new_line_no: number | null
  /** Word-level breakdown for 'modified' lines; a single segment otherwise. */
  segments: DiffSegment[]
}

export interface DiffStats {
  added: number
  removed: number
  modified: number
  unchanged: number
}

/**
 * Above this many cells the LCS table is skipped and the changed region is
 * reported as a wholesale replacement. 4M cells ≈ 16 MB as an Int32Array.
 */
const MAX_LCS_CELLS = 4_000_000

/** Two lines are only paired into a redline if they still share this much text. */
const PAIR_SIMILARITY_THRESHOLD = 0.3

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n')
}

function splitWords(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? []
}

/**
 * Longest-common-subsequence diff over an arbitrary token array.
 * Returns ops in order; `value` holds the token itself.
 */
function lcsDiff(a: string[], b: string[]): { type: DiffType; index_a: number; index_b: number }[] {
  const ops: { type: DiffType; index_a: number; index_b: number }[] = []

  // Trim common prefix.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) {
    ops.push({ type: 'equal', index_a: start, index_b: start })
    start++
  }

  // Trim common suffix.
  let endA = a.length
  let endB = b.length
  const tail: { type: DiffType; index_a: number; index_b: number }[] = []
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
    tail.unshift({ type: 'equal', index_a: endA, index_b: endB })
  }

  const n = endA - start
  const m = endB - start

  if (n === 0 || m === 0 || n * m > MAX_LCS_CELLS) {
    // Nothing in common to align (or the region is too large to align cheaply):
    // report it as a delete of the old block followed by an insert of the new.
    for (let i = start; i < endA; i++) ops.push({ type: 'delete', index_a: i, index_b: -1 })
    for (let j = start; j < endB; j++) ops.push({ type: 'insert', index_a: -1, index_b: j })
    return ops.concat(tail)
  }

  // table[i][j] = LCS length of a[start+i..] and b[start+j..]
  const width = m + 1
  const table = new Int32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[start + i] === b[start + j]
          ? table[(i + 1) * width + (j + 1)] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)])
    }
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      ops.push({ type: 'equal', index_a: start + i, index_b: start + j })
      i++
      j++
    } else if (table[(i + 1) * width + j] >= table[i * width + (j + 1)]) {
      ops.push({ type: 'delete', index_a: start + i, index_b: -1 })
      i++
    } else {
      ops.push({ type: 'insert', index_a: -1, index_b: start + j })
      j++
    }
  }
  while (i < n) {
    ops.push({ type: 'delete', index_a: start + i, index_b: -1 })
    i++
  }
  while (j < m) {
    ops.push({ type: 'insert', index_a: -1, index_b: start + j })
    j++
  }

  return ops.concat(tail)
}

/** Word-level redline between two single lines. */
export function diffWords(oldText: string, newText: string): DiffSegment[] {
  const a = splitWords(oldText)
  const b = splitWords(newText)
  const ops = lcsDiff(a, b)

  // Coalesce adjacent ops of the same type into one segment.
  const segments: DiffSegment[] = []
  for (const op of ops) {
    const value = op.type === 'insert' ? b[op.index_b] : a[op.index_a]
    const last = segments[segments.length - 1]
    if (last && last.type === op.type) {
      last.value += value
    } else {
      segments.push({ type: op.type, value })
    }
  }
  return segments
}

/** Fraction of characters the two lines share, used to decide whether to pair them. */
function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1
  if (!a.length || !b.length) return 0
  const segments = diffWords(a, b)
  const common = segments
    .filter((s) => s.type === 'equal')
    .reduce((sum, s) => sum + s.value.trim().length, 0)
  const total = Math.max(a.trim().length, b.trim().length)
  return total === 0 ? 1 : common / total
}

/**
 * Full document redline. Deleted and inserted lines that are similar enough get
 * paired into a single 'modified' line carrying word-level segments.
 */
export function diffText(oldText: string, newText: string): DiffLine[] {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)
  const ops = lcsDiff(oldLines, newLines)

  const result: DiffLine[] = []
  let index = 0

  while (index < ops.length) {
    const op = ops[index]

    if (op.type === 'equal') {
      result.push({
        type: 'equal',
        old_line_no: op.index_a + 1,
        new_line_no: op.index_b + 1,
        segments: [{ type: 'equal', value: oldLines[op.index_a] }]
      })
      index++
      continue
    }

    // Collect the full run of deletes then inserts at this position.
    const deletions: number[] = []
    const insertions: number[] = []
    while (index < ops.length && ops[index].type === 'delete') {
      deletions.push(ops[index].index_a)
      index++
    }
    while (index < ops.length && ops[index].type === 'insert') {
      insertions.push(ops[index].index_b)
      index++
    }

    const pairCount = Math.min(deletions.length, insertions.length)
    let paired = 0
    for (let p = 0; p < pairCount; p++) {
      const oldLine = oldLines[deletions[p]]
      const newLine = newLines[insertions[p]]
      if (similarity(oldLine, newLine) < PAIR_SIMILARITY_THRESHOLD) break
      result.push({
        type: 'modified',
        old_line_no: deletions[p] + 1,
        new_line_no: insertions[p] + 1,
        segments: diffWords(oldLine, newLine)
      })
      paired++
    }

    for (let d = paired; d < deletions.length; d++) {
      result.push({
        type: 'delete',
        old_line_no: deletions[d] + 1,
        new_line_no: null,
        segments: [{ type: 'delete', value: oldLines[deletions[d]] }]
      })
    }
    for (let n = paired; n < insertions.length; n++) {
      result.push({
        type: 'insert',
        old_line_no: null,
        new_line_no: insertions[n] + 1,
        segments: [{ type: 'insert', value: newLines[insertions[n]] }]
      })
    }
  }

  return result
}

export function diffStats(lines: DiffLine[]): DiffStats {
  return {
    added: lines.filter((l) => l.type === 'insert').length,
    removed: lines.filter((l) => l.type === 'delete').length,
    modified: lines.filter((l) => l.type === 'modified').length,
    unchanged: lines.filter((l) => l.type === 'equal').length
  }
}

// ─── Structured field comparison ─────────────────────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
  vendor_name: 'Vendor',
  status: 'Status',
  approval_state: 'Approval State',
  start_date: 'Start Date',
  end_date: 'End Date',
  monthly_cost: 'Monthly Cost',
  annual_cost: 'Annual Cost',
  total_cost: 'Total Cost',
  poc_name: 'Contact Name',
  poc_email: 'Contact Email',
  poc_phone: 'Contact Phone',
  department_id: 'Department',
  branch_id: 'Branch',
  file_path: 'Contract File',
  renewal_type: 'Renewal Type',
  cancellation_notice_days: 'Cancellation Notice (days)'
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Compare two records and return only the fields that actually changed.
 * Values are stringified so they can be stored in the audit log as text.
 */
export function compareRecords(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields?: string[]
): { field: string; label: string; old_value: string; new_value: string }[] {
  const keys = fields ?? Object.keys(after)
  const changes: { field: string; label: string; old_value: string; new_value: string }[] = []

  for (const key of keys) {
    if (!(key in after)) continue
    const oldRaw = before[key]
    const newRaw = after[key]
    const oldValue = oldRaw === null || oldRaw === undefined ? '' : String(oldRaw)
    const newValue = newRaw === null || newRaw === undefined ? '' : String(newRaw)
    if (oldValue === newValue) continue
    changes.push({ field: key, label: fieldLabel(key), old_value: oldValue, new_value: newValue })
  }

  return changes
}
