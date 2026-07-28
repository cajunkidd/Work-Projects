interface Props {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'
  children: React.ReactNode
  className?: string
  /** Renders a small status dot before the label. */
  dot?: boolean
  /** Animated ping ring on the dot — for live/urgent states. Implies `dot`. */
  pulse?: boolean
}

const variants = {
  success:
    'bg-emerald-500/15 text-emerald-300 border-emerald-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_12px_-4px_rgba(16,185,129,0.45)]',
  warning:
    'bg-amber-500/15 text-amber-300 border-amber-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_12px_-4px_rgba(245,158,11,0.45)]',
  danger:
    'bg-red-500/15 text-red-300 border-red-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_12px_-4px_rgba(239,68,68,0.45)]',
  info: 'bg-blue-500/15 text-blue-300 border-blue-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_12px_-4px_rgba(59,130,246,0.45)]',
  neutral:
    'bg-slate-500/15 text-slate-300 border-slate-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
  brand:
    'bg-brand-primary/15 text-brand-light border-brand-accent/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_12px_-4px_rgb(var(--brand-primary-rgb)/0.5)]'
}

export default function Badge({
  variant = 'neutral',
  children,
  className = '',
  dot = false,
  pulse = false
}: Props) {
  const showDot = dot || pulse
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border backdrop-blur-sm ${variants[variant]} ${className}`}
    >
      {showDot && (
        <span className="relative inline-flex w-1.5 h-1.5 shrink-0">
          {pulse && (
            <span className="absolute inline-flex w-full h-full rounded-full bg-current opacity-60 animate-ping" />
          )}
          <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  )
}
