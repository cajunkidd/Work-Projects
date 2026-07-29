import useSpotlight from '../../hooks/useSpotlight'

interface Props {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  /** Always-on brand glow (clickable cards already glow on hover). */
  glow?: boolean
  /** Pointer-tracked radial highlight following the cursor. */
  spotlight?: boolean
  /** Animated gradient hairline border. */
  gradientBorder?: boolean
  /** Set false to remove the default p-4 padding. */
  padded?: boolean
  as?: 'div' | 'section'
}

export default function Card({
  children,
  className = '',
  onClick,
  glow = false,
  spotlight = false,
  gradientBorder = false,
  padded = true,
  as: Tag = 'div'
}: Props) {
  const { ref, onMouseMove } = useSpotlight<HTMLElement>()

  const interactive = onClick
    ? 'cursor-pointer card-glow hover:-translate-y-0.5 will-change-transform'
    : ''

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={[
        'relative glass rounded-xl transition-all duration-300 ease-out-expo',
        padded ? 'p-4' : '',
        interactive,
        glow ? 'shadow-glow' : '',
        spotlight ? 'spotlight' : '',
        gradientBorder ? 'gradient-border' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      onMouseMove={spotlight ? onMouseMove : undefined}
    >
      {children}
    </Tag>
  )
}
