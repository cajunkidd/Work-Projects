import AnimatedNumber from './AnimatedNumber'
import Sparkline from './Sparkline'
import useSpotlight from '../../hooks/useSpotlight'

interface Props {
  label: string
  value: number
  /** Formats the animated value, e.g. (n) => `$${Math.round(n).toLocaleString()}`. */
  format?: (n: number) => string
  /** Change vs the previous period, in percent. Positive renders up/green, negative down/red. */
  delta?: number
  /** Muted text after the delta chip, e.g. "vs last month". */
  deltaLabel?: string
  /** Icon rendered in the gradient bubble. */
  icon?: React.ReactNode
  /** Trend series rendered as a sparkline along the bottom. */
  data?: number[]
  /** CSS color used for the icon bubble + sparkline (defaults to brand primary). */
  accent?: string
  className?: string
  onClick?: () => void
}

/**
 * Hero KPI tile: label, count-up value, delta chip, gradient icon bubble and
 * an optional sparkline — on a glass surface with gradient border, pointer
 * spotlight and hover glow.
 */
export default function StatTile({
  label,
  value,
  format,
  delta,
  deltaLabel,
  icon,
  data,
  accent = 'var(--brand-primary)',
  className = '',
  onClick
}: Props) {
  const { ref, onMouseMove } = useSpotlight<HTMLDivElement>()
  const hasDelta = typeof delta === 'number'
  const direction = hasDelta ? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat') : 'flat'

  const deltaStyles = {
    up: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/25',
    down: 'text-red-300 bg-red-500/15 border-red-400/25',
    flat: 'text-slate-300 bg-slate-500/15 border-slate-400/25'
  } as const

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onClick={onClick}
      className={[
        'relative overflow-hidden glass gradient-border spotlight rounded-2xl p-5',
        'transition-all duration-300 ease-out-expo',
        onClick ? 'cursor-pointer card-glow hover:-translate-y-0.5 will-change-transform' : 'card-glow',
        className
      ].join(' ')}
    >
      {/* Faint accent wash in the corner behind the icon */}
      <div
        aria-hidden="true"
        className="absolute -top-10 -right-10 w-36 h-36 rounded-full pointer-events-none opacity-25"
        style={{ background: `radial-gradient(circle, ${accent}, transparent 70%)`, filter: 'blur(24px)' }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-3xl font-display font-semibold tracking-tight text-white leading-none">
            <AnimatedNumber value={value} format={format} />
          </p>
        </div>
        {icon && (
          <span
            className="shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-xl text-white [&>svg]:w-5 [&>svg]:h-5"
            style={{
              background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 55%, #000))`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 18px -6px ${accent}`
            }}
          >
            {icon}
          </span>
        )}
      </div>

      {(hasDelta || deltaLabel) && (
        <div className="relative mt-3 flex items-center gap-2">
          {hasDelta && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-semibold tabular-nums ${deltaStyles[direction]}`}
            >
              {direction !== 'flat' && (
                <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" aria-hidden="true">
                  <path
                    d={direction === 'up' ? 'M6 9.5v-7M3 5l3-2.5L9 5' : 'M6 2.5v7M3 7l3 2.5L9 7'}
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {direction === 'flat' && <span aria-hidden="true">–</span>}
              {Math.abs(delta as number).toLocaleString(undefined, { maximumFractionDigits: 1 })}%
            </span>
          )}
          {deltaLabel && <span className="text-xs text-slate-500">{deltaLabel}</span>}
        </div>
      )}

      {data && data.length > 1 && (
        <div className="relative mt-4 -mb-1">
          <Sparkline data={data} color={accent} height={36} />
        </div>
      )}
    </div>
  )
}
