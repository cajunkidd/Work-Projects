interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export default function Input({ label, error, className = '', ...rest }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-slate-300 text-sm font-medium">{label}</label>}
      <input
        className={`bg-slate-800 border ${error ? 'border-red-500' : 'border-slate-600'} text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:border-transparent placeholder-slate-500 ${className}`}
        style={{ '--tw-ring-color': 'var(--brand-primary)' } as any}
        {...rest}
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
