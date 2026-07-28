import { useEffect, useRef, useState } from 'react'

interface Option {
  value: string | number
  label: string
}

interface Props extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: Option[]
  error?: string
  /** Leading icon inside the field. */
  icon?: React.ReactNode
  /** Helper text below the field (hidden while an error is shown). */
  hint?: string
}

export default function Select({
  label,
  options,
  error,
  icon,
  hint,
  className = '',
  ...rest
}: Props) {
  const [shake, setShake] = useState(false)
  const prevError = useRef(error)

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
        <select
          className={`w-full appearance-none bg-transparent text-white text-sm rounded-lg px-3 py-2 pr-9 ${
            icon ? 'pl-9' : ''
          } focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none transition-transform duration-200"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
