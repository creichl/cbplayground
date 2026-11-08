import { Slot } from '@radix-ui/react-slot'
import { type ReactElement, useLayoutEffect, useRef } from 'react'

/**
 * Keeps an element that starts below the first screen invisible (data-reveal="hidden") until it comes into view, then lets
 * it rise in once (data-reveal="shown"). An element in the first screen stays as it is, so nothing in view waits (LCP).
 * The attribute is set on the element itself, not through React, so the page does not render again. app.css draws the
 * states, only on screens and only with motion: with less motion everything is visible right away.
 */
function useRevealOnce() {
  const ref = useRef<HTMLElement>(null)

  // Before the first paint, so an element below the fold never shows before it hides.
  useLayoutEffect(() => {
    const element = ref.current
    // An element hidden by an earlier run of this effect (React runs it twice in development) waits for the view again, also
    // when the page has jumped to it in between, e.g. to a section in the address; otherwise it would stay hidden.
    if (element === null || (element.dataset.reveal !== 'hidden' && element.getBoundingClientRect().top < window.innerHeight)) {
      return
    }
    element.dataset.reveal = 'hidden'
    const observer = new IntersectionObserver(
      ([entry]) => {
        // The report can stem from before a jump in the same frame (e.g. to a section in the address), and the browser then
        // sends no new one: where the element is now counts as well, with the same 10 % above the bottom edge.
        const { top, bottom } = element.getBoundingClientRect()
        if (entry.isIntersecting || (top < window.innerHeight * 0.9 && bottom > 0)) {
          element.dataset.reveal = 'shown'
          observer.disconnect()
        }
      },
      // A little above the bottom edge, so the motion is seen.
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return ref
}

/**
 * A section or card that rises in once with a short offset upwards when it is scrolled into view. Renders no element of
 * its own: it passes its behaviour to its only child, e.g. `<Reveal><section>…</section></Reveal>`.
 */
function Reveal({ children }: { children: ReactElement }) {
  return <Slot ref={useRevealOnce()}>{children}</Slot>
}

/**
 * A list whose children rise in one after another (40 ms apart): right away when it appears in view (e.g. the free times
 * once they are loaded), otherwise once it is scrolled into view. Renders no element of its own: it passes its behaviour to
 * its only child, whose direct children move, e.g. `<Stagger><ul><li>…</li></ul></Stagger>`.
 */
function Stagger({ children }: { children: ReactElement }) {
  return (
    <Slot ref={useRevealOnce()} data-stagger="">
      {children}
    </Slot>
  )
}

export { Reveal, Stagger }
