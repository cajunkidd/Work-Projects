import { useId } from 'react'

interface Props {
  /** Progress 0–100. */
  value: number
  /** Outer diameter in px (default 96). */
  size?: number
  strokeWidth?: number
  /** Single color override; by default the stroke is a brand gradient. */
  color?: string
  /** Brand-tinted glow behind the arc (default true). */
  glow?: boolean
  className?: string
  /** Center content; defaults to the rounded percentage. */
  children?: React.ReactNode
}

/**
 * Animated circular progress with a gradient stroke. The arc eases to its new
 * position whenever `value` changes.
 */
export default function ProgressRing({
  value,
  size = 96,
  strokeWidth = 8,
  color,
  glow = true,
  className = '',
  children
}: Props) {
  const gradientId = `ring${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const clamped = Math.max(0, Math.min(100, value))
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - clamped / 100)
  const stroke = color ?? `url(#${gradientId})`

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        style={
          glow
            ? { filter: `drop-shadow(0 0 ${strokeWidth}px rgb(var(--brand-primary-rgb) / 0.35))` }
            : undefined
        }
      >
        {!color && (
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--brand-primary)" />
              <stop offset="100%" stopColor="var(--brand-accent)" />
            </linearGradient>
          </defs>
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(148 163 184 / 0.12)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children ?? (
          <span className="text-white font-display font-semibold tabular-nums text-sm">
            {Math.round(clamped)}%
          </span>
        )}
      </div>
    </div>
  )
}
