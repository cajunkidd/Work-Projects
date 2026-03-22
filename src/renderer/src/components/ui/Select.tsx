interface Option {
  value: string | number
  label: string
}

interface Props extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: Option[]
  error?: string
}

export default function Select({ label, options, error, className = '', ...rest }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-slate-300 text-sm font-medium">{label}</label>}
      <select
        className={`bg-slate-800 border ${error ? 'border-red-500' : 'border-slate-600'} text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:border-transparent cursor-pointer ${className}`}
        style={{ '--tw-ring-color': 'var(--brand-primary)' } as any}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
