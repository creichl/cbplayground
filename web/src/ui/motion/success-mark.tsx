import type { CSSProperties } from 'react'
import { cn } from '../../lib/utils.ts'

/** The directions in which the particles fly out, in degrees. */
const particleAngles = [0, 45, 90, 135, 180, 225, 270, 315]

/**
 * The moment of success, e.g. a confirmed booking: a circle pops in with a spring, a check draws itself as an SVG stroke,
 * and a few small particles in the accent colour fly out once around it; no rain of confetti. Only decoration: the text
 * next to it says what happened. With less motion the check simply stands there.
 */
function SuccessMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative flex size-16 items-center justify-center', className)}>
      <span className="flex size-16 animate-success-pop items-center justify-center rounded-full bg-success/15 text-success">
        <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} strokeDasharray={1} className="animate-check-draw" />
        </svg>
      </span>
      {particleAngles.map((angle) => (
        <span
          key={angle}
          className="absolute top-1/2 left-1/2 -mt-1 -ml-1 size-2 animate-particle rounded-full bg-primary motion-reduce:hidden"
          style={{ '--angle': `${angle}deg` } as CSSProperties}
        />
      ))}
    </span>
  )
}

export { SuccessMark }
