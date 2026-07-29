import { useCallback, useRef } from 'react'

interface SpotlightBag<T extends HTMLElement> {
  ref: React.RefObject<T>
  onMouseMove: (e: React.MouseEvent<T>) => void
}

/**
 * Tracks the pointer inside an element and writes `--mx` / `--my` custom
 * properties (in px) onto it, powering the `.spotlight` CSS utility.
 *
 * const { ref, onMouseMove } = useSpotlight<HTMLDivElement>()
 * <div ref={ref} onMouseMove={onMouseMove} className="spotlight">...</div>
 */
export default function useSpotlight<T extends HTMLElement = HTMLDivElement>(): SpotlightBag<T> {
  const ref = useRef<T>(null)

  const onMouseMove = useCallback((e: React.MouseEvent<T>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
    el.style.setProperty('--my', `${e.clientY - rect.top}px`)
  }, [])

  return { ref, onMouseMove }
}
