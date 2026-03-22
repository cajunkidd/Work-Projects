interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

const variants = {
  primary: 'text-white hover:opacity-90 active:opacity-80',
  secondary: 'bg-slate-700 text-white hover:bg-slate-600 active:bg-slate-500',
  danger: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700',
  ghost: 'bg-transparent text-slate-400 hover:text-white hover:bg-slate-800'
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base'
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  style,
  children,
  ...rest
}: Props) {
  const primaryStyle = variant === 'primary' ? { background: 'var(--brand-primary)', ...style } : style

  return (
    <button
      className={`inline-flex items-center gap-2 font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      style={primaryStyle}
      {...rest}
    >
      {children}
    </button>
  )
}
