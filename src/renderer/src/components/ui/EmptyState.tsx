interface Props {
  title: string
  description?: string
  /** Action area, typically a <Button>. */
  action?: React.ReactNode
  /** Replaces the default illustration. */
  icon?: React.ReactNode
  className?: string
}

/**
 * Brand-tinted illustrated empty state with a floating document illustration,
 * title, description and optional call-to-action.
 */
export default function EmptyState({ title, description, action, icon, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-14 px-6 ${className}`}>
      <div className="relative mb-6 animate-float">
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full blur-2xl opacity-40"
          style={{
            background: 'radial-gradient(circle, rgb(var(--brand-primary-rgb) / 0.5), transparent 70%)'
          }}
        />
        {icon ? (
          <span className="relative inline-flex text-slate-300 [&>svg]:w-20 [&>svg]:h-20">{icon}</span>
        ) : (
          <svg viewBox="0 0 96 96" className="relative w-24 h-24" fill="none" aria-hidden="true">
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="rgb(var(--brand-primary-rgb) / 0.25)"
              strokeWidth="1.5"
              strokeDasharray="4 6"
            />
            {/* back sheet */}
            <rect
              x="26"
              y="24"
              width="34"
              height="44"
              rx="4"
              transform="rotate(-8 26 24)"
              fill="rgb(var(--brand-primary-rgb) / 0.12)"
              stroke="rgb(var(--brand-primary-rgb) / 0.35)"
              strokeWidth="1.5"
            />
            {/* front sheet */}
            <rect
              x="36"
              y="28"
              width="34"
              height="44"
              rx="4"
              fill="var(--surface-2)"
              stroke="rgb(var(--brand-accent-rgb) / 0.55)"
              strokeWidth="1.5"
            />
            <path
              d="M43 40h20M43 47h20M43 54h12"
              stroke="rgb(var(--brand-accent-rgb) / 0.6)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            {/* sparkles */}
            <path
              d="M74 22l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2 1.2-3z"
              fill="rgb(var(--brand-accent-rgb) / 0.8)"
            />
            <circle cx="22" cy="60" r="2" fill="rgb(var(--brand-primary-rgb) / 0.6)" />
            <circle cx="70" cy="70" r="1.5" fill="rgb(var(--brand-accent-rgb) / 0.6)" />
          </svg>
        )}
      </div>
      <h3 className="text-white font-display font-semibold text-lg tracking-tight">{title}</h3>
      {description && <p className="text-slate-400 text-sm mt-1.5 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
