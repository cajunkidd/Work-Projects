import { useId } from 'react'

interface Props {
  data: number[]
  /** Any CSS color; defaults to the brand primary. */
  color?: string
  height?: number
  className?: string
}

/**
 * Tiny inline SVG sparkline: gradient area fill + line that draws itself in.
 * Scales to the width of its container.
 */
export default function Sparkline({
  data,
  color = 'var(--brand-primary)',
  height = 32,
  className = ''
}: Props) {
  const gradientId = `spark${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  if (data.length < 2) {
    return <svg className={className} width="100%" height={height} aria-hidden="true" />
  }

  const W = 100
  const PAD = 3
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W
    const y = PAD + (1 - (d - min) / range) * (height - PAD * 2)
    return [x, y] as const
  })
  const lineD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const areaD = `${lineD} L${W},${height} L0,${height} Z`
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg
      className={className}
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={lineD}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className="sparkline-draw"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={2.4}
        fill={color}
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
    </svg>
  )
}
