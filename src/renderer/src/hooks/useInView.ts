import { useEffect, useRef, useState } from 'react'

interface UseInViewOptions extends IntersectionObserverInit {
  /** Stop observing after the first time the element becomes visible (default true). */
  once?: boolean
}

interface InViewBag<T extends HTMLElement> {
  ref: React.RefObject<T>
  inView: boolean
}

/**
 * IntersectionObserver helper for reveal-on-scroll effects.
 *
 * const { ref, inView } = useInView<HTMLDivElement>()
 * <div ref={ref} className={inView ? 'animate-fade-in-up' : 'opacity-0'}>...</div>
 */
export default function useInView<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {}
): InViewBag<T> {
  const { once = true, root = null, rootMargin, threshold } = options
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { root, rootMargin, threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [once, root, rootMargin, threshold])

  return { ref, inView }
}
