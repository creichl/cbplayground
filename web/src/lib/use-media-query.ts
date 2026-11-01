import { useSyncExternalStore } from 'react'

/** Whether a media query matches, e.g. "(min-width: 768px)"; known from the first render on, so nothing switches after it. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}
