import { flushSync } from 'react-dom'

/** The layout transition running, so an earlier one that ends late does not clear the names of a newer one. */
let current: ViewTransition | null = null

/**
 * Shows a state change that changes the height of a part of the page (e.g. the free times of another day) as a view
 * transition instead of a jump: the browser lays the page out once in its new state, and only snapshots move, with
 * transform and opacity, no layout per frame. While it runs, the document carries data-layout-transition; app.css names
 * the parts that move then (e.g. the reservation card, its times and its footer) and keeps the rest of the page as it is.
 * `element` is a part of the change, to read whether there is motion. Without the View Transitions API, with less motion
 * (the device's setting or data-reduce-motion) or in a hidden tab, the change is simply made.
 */
export function layoutTransition(element: Element | null, update: () => void) {
  const withoutMotion = element === null || parseFloat(getComputedStyle(element).getPropertyValue('--motion-slow')) === 0
  if (typeof document.startViewTransition !== 'function' || withoutMotion || document.visibilityState !== 'visible') {
    update()
    return
  }
  const root = document.documentElement
  // Before the old state is captured, so the parts carry their names in it.
  root.dataset.layoutTransition = ''
  const transition = document.startViewTransition(() => flushSync(update))
  current = transition
  void transition.finished.finally(() => {
    if (current === transition) {
      current = null
      delete root.dataset.layoutTransition
    }
  })
}

/** Whether the browser can show layout transitions; without it, new content fades in instead. */
export const layoutTransitions = typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
