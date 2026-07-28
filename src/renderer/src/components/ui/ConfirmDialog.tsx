import { useCallback, useRef, useState } from 'react'
import Modal from './Modal'
import Button from './Button'

export interface ConfirmOptions {
  title?: string
  message?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm button as destructive. */
  danger?: boolean
}

interface Props extends ConfirmOptions {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Shows a spinner on the confirm button (for async confirms). */
  loading?: boolean
}

/** Confirmation dialog built on Modal. For a promise API, see useConfirm(). */
export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-slate-300 text-sm leading-relaxed">{message}</div>
    </Modal>
  )
}

/**
 * Promise-friendly confirm:
 *
 *   const { confirm, dialog } = useConfirm()
 *   ...
 *   if (await confirm({ title: 'Delete contract?', danger: true })) { ... }
 *   ...
 *   return <>{page}{dialog}</>   // render `dialog` once in the tree
 */
export function useConfirm(): {
  confirm: (options?: ConfirmOptions) => Promise<boolean>
  dialog: React.ReactNode
} {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions>({})
  const resolverRef = useRef<((result: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions = {}): Promise<boolean> => {
    setOptions(opts)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const settle = useCallback((result: boolean) => {
    setOpen(false)
    resolverRef.current?.(result)
    resolverRef.current = null
  }, [])

  const dialog = (
    <ConfirmDialog
      open={open}
      {...options}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  )

  return { confirm, dialog }
}
