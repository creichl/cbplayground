import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { cn } from '../../lib/utils.ts'

/**
 * A wrapper whose height follows its content smoothly instead of jumping, e.g. the free times when another day has more of
 * them, so what comes below glides along. Its content is measured (ResizeObserver) once per change; only then the wrapper
 * moves from its old to the new height in a short transition, and afterwards it takes the height of its content again, so
 * while nothing changes nothing moves (the height the embed reports stays). Without motion (the device's setting or
 * data-reduce-motion) the height changes at once.
 */
function AnimatedHeight({ children, className }: { children: ReactNode; className?: string }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (outer === null || inner === null) {
      return
    }
    let last = inner.offsetHeight
    let fallback = 0
    const release = () => {
      window.clearTimeout(fallback)
      outer.style.height = ''
      delete outer.dataset.animating
    }
    // Called after the layout and before the paint, so the new height never shows before the transition starts.
    const observer = new ResizeObserver(() => {
      const next = inner.offsetHeight
      if (next === last) {
        return
      }
      // From where it is now, also in the middle of a transition.
      const from = last === 0 ? next : outer.getBoundingClientRect().height
      last = next
      // A duration of 0 (less motion) starts no transition, so there is nothing to wait for.
      if (from === next || parseFloat(getComputedStyle(outer).transitionDuration) === 0) {
        release()
        return
      }
      outer.style.height = `${from}px`
      outer.dataset.animating = ''
      // Applies the start height before the goal, so the transition runs between them.
      void outer.offsetHeight
      outer.style.height = `${next}px`
      window.clearTimeout(fallback)
      // In case no transitionend comes (e.g. the element is hidden meanwhile).
      fallback = window.setTimeout(release, 1000)
    })
    const onEnd = (event: TransitionEvent) => {
      if (event.target === outer && event.propertyName === 'height') {
        release()
      }
    }
    observer.observe(inner)
    outer.addEventListener('transitionend', onEnd)
    outer.addEventListener('transitioncancel', onEnd)
    return () => {
      observer.disconnect()
      outer.removeEventListener('transitionend', onEnd)
      outer.removeEventListener('transitioncancel', onEnd)
      window.clearTimeout(fallback)
    }
  }, [])

  return (
    <div
      ref={outerRef}
      // Clipped only while it moves, so focus rings and the pulse of a chosen time are not cut off otherwise.
      className={cn('transition-[height] duration-(--motion-slow) ease-out data-animating:overflow-hidden', className)}
    >
      {/* flow-root: the margins of the content stay inside, so the measured height is the whole one. */}
      <div ref={innerRef} className="flow-root">
        {children}
      </div>
    </div>
  )
}

export { AnimatedHeight }
