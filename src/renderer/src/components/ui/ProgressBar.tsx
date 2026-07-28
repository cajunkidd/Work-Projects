interface Props {
  value: number
  /** Denominator for `value` (default 100). */
  max?: number
  /** Track height in px (default 8). */
  height?: number
  /** Show the percentage to the right of the bar. */
  showLabel?: boolean
  /**
   * Percentage breakpoints for automatic coloring: below `warn` the fill is a
   * brand gradient, between `warn` and `danger` it is amber, above `danger`
   * it is red. Defaults `{ warn: 75, danger: 90 }`.
   */
  thresholds?: { warn: number; danger: number }
  /** Explicit CSS color/gradient for the fill — disables threshold coloring. */
  color?: string
  className?: string
}

/**
 * Animated horizontal progress bar with a shimmer sweep and threshold
 * coloring (useful for budget-consumption meters).
 */
export default function ProgressBar({
  value,
  max = 100,
  height = 8,
  showLabel = false,
  thresholds = { warn: 75, danger: 90 },
  color,
  className = ''
}: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0

  let fill: string
  let glowColor: string
  if (color) {
    fill = color
    glowColor = color
  } else if (pct >= thresholds.danger) {
    fill = 'linear-gradient(90deg, #f87171, #dc2626)'
    glowColor = 'rgb(239 68 68 / 0.5)'
  } else if (pct >= thresholds.warn) {
    fill = 'linear-gradient(90deg, #fbbf24, #d97706)'
    glowColor = 'rgb(245 158 11 / 0.5)'
  } else {
    fill = 'linear-gradient(90deg, var(--brand-primary), var(--brand-accent))'
    glowColor = 'rgb(var(--brand-primary-rgb) / 0.5)'
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="relative flex-1 rounded-full bg-white/5 border border-white/5 overflow-hidden"
        style={{ height }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full overflow-hidden transition-[width] duration-700 ease-out-expo"
          style={{ width: `${pct}%`, background: fill, boxShadow: `0 0 12px -2px ${glowColor}` }}
        >
          <div className="absolute inset-0 shimmer !bg-transparent" />
        </div>
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-slate-300 tabular-nums w-9 text-right">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  )
}
