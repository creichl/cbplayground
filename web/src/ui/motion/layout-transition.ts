import { flushSync } from 'react-dom'

/** The layout transition running, so an earlier one that ends late does not clear the names of a newer one. */
let current: ViewTransition | null = null

/**
 * Shows a state change that changes the height of a part of the page (e.g. the free times of another day) as a view
 * transition instead of a jump: the browser lays the page out once in its new state, and only snapshots move, with
 * transform and opacity, no layout per frame. While it runs, the document carries data-layout-transition; app.css names
 * the parts that move then (e.g. the reservation card, its times and its footer) and keeps the rest of the page as it is.
 * `element` is a part of the change, to read whether there is motion. Without the View Transitions API, with less motion
 * (the device's setting or data-reduce-motion), in a hidden tab or while a modal dialog or sheet is open (or still closing),
 * the change is simply made: a view transition paints its named parts above everything else, so they would cover the
 * dialog, which lies in the snapshot of the page.
 */
export function layoutTransition(element: Element | null, update: () => void) {
  const withoutMotion = element === null || parseFloat(getComputedStyle(element).getPropertyValue('--motion-slow')) === 0
  if (typeof document.startViewTransition !== 'function' || withoutMotion || document.visibilityState !== 'visible' || behindModal(element)) {
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

/**
 * Whether a modal is open: Radix and vaul hide everything outside it from assistive technology (aria-hidden) or make it inert,
 * and the booking dialog and the sheet have their overlays.
 */
function behindModal(element: Element) {
  return element.closest('[aria-hidden="true"],[inert]') !== null || document.querySelector('[data-slot="dialog-overlay"],[data-slot="sheet-overlay"]') !== null
}

/** Whether the browser can show layout transitions; without it, new content fades in instead. */
export const layoutTransitions = typeof document !== 'undefined' && typeof document.startViewTransition === 'function'

/**
 * Moves one element into another as a view transition, e.g. the time chip of the reservation card into the time in the booking
 * dialog's summary, and back when it closes. Only these two carry `name`, each for this one transition: `from` in the old state,
 * the element `to` returns once `update` is made (waited for up to half a second, e.g. until the dialog has rendered) in the new
 * one; once it has ended neither keeps it. While it runs, the document carries data-shared-transition: app.css then leaves the
 * parts named for page transitions without their names and shows the page in its new state at once, so only the element moves
 * (the dialog's own entrance or exit plays live in the page's new state). Returns false, and simply makes the change, without the
 * View Transitions API, with less motion, in a hidden tab or without `from`.
 */
export function sharedElementTransition(from: HTMLElement | null, name: string, update: () => void, to: () => HTMLElement | null) {
  const withoutMotion = from === null || parseFloat(getComputedStyle(from).getPropertyValue('--motion-slow')) === 0
  if (typeof document.startViewTransition !== 'function' || withoutMotion || document.visibilityState !== 'visible') {
    update()
    return false
  }
  const root = document.documentElement
  root.dataset.sharedTransition = ''
  from.style.viewTransitionName = name
  let target: HTMLElement | null = null
  const transition = document.startViewTransition(async () => {
    update()
    from.style.removeProperty('view-transition-name')
    // React renders the new state on its own schedule; the browser waits for it with the page as it was.
    for (let waited = 0; (target = to()) === null && waited < 500; waited += 20) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    target?.style.setProperty('view-transition-name', name)
  })
  void transition.finished.finally(() => {
    from.style.removeProperty('view-transition-name')
    target?.style.removeProperty('view-transition-name')
    delete root.dataset.sharedTransition
  })
  return true
}
