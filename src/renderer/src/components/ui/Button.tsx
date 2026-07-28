interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'glass'
  size?: 'sm' | 'md' | 'lg'
  /** Shows a spinner and disables the button. */
  loading?: boolean
  /** Leading icon node, rendered before children. */
  icon?: React.ReactNode
  children: React.ReactNode
}

const variants = {
  primary: 'btn-primary btn-sheen text-white hover:-translate-y-px active:translate-y-0 active:scale-[0.98]',
  secondary:
    'bg-slate-700/80 text-white border border-white/10 shadow-inset-hairline hover:bg-slate-600/80 hover:-translate-y-px hover:border-white/20 active:translate-y-0 active:scale-[0.98]',
  danger:
    'btn-sheen bg-gradient-to-br from-red-500 to-red-700 text-white shadow-inset-hairline hover:-translate-y-px hover:shadow-[0_0_24px_-4px_rgba(239,68,68,0.55)] active:translate-y-0 active:scale-[0.98]',
  success:
    'btn-sheen bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-inset-hairline hover:-translate-y-px hover:shadow-[0_0_24px_-4px_rgba(16,185,129,0.55)] active:translate-y-0 active:scale-[0.98]',
  ghost: 'bg-transparent text-slate-400 hover:text-white hover:bg-white/5 active:scale-[0.98]',
  glass:
    'glass text-slate-100 hover:-translate-y-px hover:border-white/20 hover:shadow-glow active:translate-y-0 active:scale-[0.98]'
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base'
}

const spinnerSizes = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' }

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  onClick,
  children,
  ...rest
}: Props) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    if (!prefersReducedMotion()) {
      const btn = e.currentTarget
      const rect = btn.getBoundingClientRect()
      const d = Math.max(rect.width, rect.height) * 2
      const ripple = document.createElement('span')
      ripple.className = 'btn-ripple'
      ripple.style.width = `${d}px`
      ripple.style.height = `${d}px`
      ripple.style.left = `${e.clientX - rect.left - d / 2}px`
      ripple.style.top = `${e.clientY - rect.top - d / 2}px`
      btn.appendChild(ripple)
      ripple.addEventListener('animationend', () => ripple.remove())
    }
    onClick?.(e)
  }

  return (
    <button
      className={`relative overflow-hidden inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 ease-out-expo disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      onClick={handleClick}
      {...rest}
    >
      {loading ? (
        <svg
          className={`${spinnerSizes[size]} animate-spin shrink-0`}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path
            d="M22 12a10 10 0 0 0-10-10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        icon && <span className="inline-flex shrink-0 items-center">{icon}</span>
      )}
      {children}
    </button>
  )
}
