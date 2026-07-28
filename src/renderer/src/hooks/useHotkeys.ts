import { useEffect, useRef } from 'react'

/**
 * Binds a global keyboard shortcut. Combos are "+"-separated, lowercase:
 *   "mod+k"  (mod = Cmd on macOS, Ctrl elsewhere)
 *   "ctrl+shift+p", "escape", "alt+n"
 * Multiple combos can be given separated by commas: "mod+k, ctrl+p".
 */
export default function useHotkeys(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  enabled = true
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return undefined

    const combos = combo
      .toLowerCase()
      .split(',')
      .map((c) => c.trim().split('+').map((p) => p.trim()))

    const matches = (e: KeyboardEvent, parts: string[]): boolean => {
      let needMod = false
      let needCtrl = false
      let needMeta = false
      let needShift = false
      let needAlt = false
      let key = ''
      for (const part of parts) {
        if (part === 'mod') needMod = true
        else if (part === 'ctrl' || part === 'control') needCtrl = true
        else if (part === 'meta' || part === 'cmd') needMeta = true
        else if (part === 'shift') needShift = true
        else if (part === 'alt' || part === 'option') needAlt = true
        else key = part
      }
      if (needMod && !(e.metaKey || e.ctrlKey)) return false
      if (needCtrl && !e.ctrlKey) return false
      if (needMeta && !e.metaKey) return false
      if (needShift && !e.shiftKey) return false
      if (needAlt && !e.altKey) return false
      const eventKey = e.key.toLowerCase()
      return eventKey === key || (key === 'space' && eventKey === ' ')
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      for (const parts of combos) {
        if (matches(e, parts)) {
          e.preventDefault()
          handlerRef.current(e)
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [combo, enabled])
}
