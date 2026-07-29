import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Animates a number from its previously displayed value to `target` using
 * requestAnimationFrame and an ease-out-expo curve. Respects reduced motion.
 */
export default function useCountUp(target: number, duration = 900): number {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? target : 0))
  const displayRef = useRef(display)

  useEffect(() => {
    if (prefersReducedMotion() || duration <= 0) {
      displayRef.current = target
      setDisplay(target)
      return undefined
    }
    const from = displayRef.current
    if (from === target) return undefined
    const start = performance.now()
    let raf = 0
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / duration)
      const eased = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)
      const v = from + (target - from) * eased
      displayRef.current = v
      setDisplay(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return display
}
