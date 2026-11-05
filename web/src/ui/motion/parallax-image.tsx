import { useLayoutEffect, useRef } from 'react'
import { cn } from '../../lib/utils.ts'
import { Photo } from '../photo.tsx'

type ParallaxImageProps = {
  src: string
  /** What the image shows; empty for an image that only decorates. */
  alt: string
  /** Called once the image has failed to load. */
  onError?: () => void
  /** The frame; it fills its parent unless the class says otherwise. */
  className?: string
}

/**
 * The large image at the top of a page (the cover image of the booking page): it zooms once, slowly, from a little larger
 * to its size when it has loaded (1.06 → 1 over 1.2 s), and while the page scrolls past it, it moves slower than the
 * content (parallax) and a shade darkens it. Loaded first and with high priority, as the largest element of the page.
 *
 * The scrolling runs as a scroll-driven animation in CSS (app.css). Where the browser has none, a passive scroll listener
 * hands the progress (0–1) to the CSS once per frame. With less motion the image stands still.
 */
function ParallaxImage({ src, alt, onError, className }: ParallaxImageProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (element === null || CSS.supports('animation-timeline: view()') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    let frame = 0
    const update = () => {
      frame = 0
      const { top, height } = element.getBoundingClientRect()
      element.style.setProperty('--parallax-progress', String(Math.min(Math.max(-top / height, 0), 1)))
    }
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update)
      }
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    // overflow-clip, not hidden: a scroll container would become the scroll-driven animation's scroller.
    <div ref={ref} data-parallax="" className={cn('absolute inset-0 overflow-clip', className)}>
      <div data-parallax-layer="" className="absolute inset-0">
        <Photo src={src} alt={alt} fallback={null} priority onError={onError} className="bg-transparent" imageClassName="data-loaded:animate-hero-zoom" />
      </div>
      <div data-parallax-shade="" aria-hidden="true" className="absolute inset-0 bg-black/45" />
    </div>
  )
}

export { ParallaxImage }
