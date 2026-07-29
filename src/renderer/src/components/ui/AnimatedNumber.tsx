import useCountUp from '../../hooks/useCountUp'

interface Props {
  value: number
  /** Formats the in-flight number, e.g. (n) => `$${n.toLocaleString()}`. */
  format?: (n: number) => string
  /** Animation duration in ms (default 900). */
  duration?: number
  className?: string
}

/**
 * Count-up number that eases from its previously displayed value to `value`
 * whenever `value` changes. Uses tabular figures so digits don't jitter.
 */
export default function AnimatedNumber({ value, format, duration = 900, className = '' }: Props) {
  const current = useCountUp(value, duration)
  const decimals = Number.isInteger(value) ? 0 : 2
  const text = format
    ? format(current)
    : current.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals
      })
  return <span className={`tabular-nums ${className}`}>{text}</span>
}
