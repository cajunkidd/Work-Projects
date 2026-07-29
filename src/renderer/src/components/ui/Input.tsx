import { useEffect, useRef, useState } from 'react'

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  /** Leading icon inside the field. */
  icon?: React.ReactNode
  /** Helper text below the field (hidden while an error is shown). */
  hint?: string
}

export default function Input({ label, error, icon, hint, className = '', ...rest }: Props) {
  const [shake, setShake] = useState(false)
  const prevError = useRef(error)

  // Replay the shake whenever a (new) error message arrives.
  useEffect(() => {
    if (error && error !== prevError.current) {
      setShake(true)
      const t = setTimeout(() => setShake(false), 500)
      prevError.current = error
      return () => clearTimeout(t)
    }
    prevError.current = error
    return undefined
  }, [error])

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className={`field-shell ${error ? 'field-error' : ''} ${shake ? 'animate-shake' : ''}`}>
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none inline-flex items-center [&>svg]:w-4 [&>svg]:h-4">
            {icon}
          </span>
        )}
        <input
          className={`w-full bg-transparent text-white text-sm rounded-lg px-3 py-2 ${
            icon ? 'pl-9' : ''
          } focus:outline-none placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          {...rest}
        />
      </div>
      {hint && !error && <p className="text-slate-500 text-xs">{hint}</p>}
      {error && (
        <p className="text-red-400 text-xs flex items-center gap-1 animate-fade-in">
          <svg viewBox="0 0 16 16" className="w-3 h-3 shrink-0" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 3.5c.41 0 .75.34.75.75v3.5a.75.75 0 0 1-1.5 0v-3.5c0-.41.34-.75.75-.75ZM8 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}
