import type { ReactNode } from 'react'
import { cn } from '../../lib/utils.ts'

/**
 * Content that unfolds in place below what is shown, e.g. the whole week of the opening hours: its height grows smoothly
 * (a grid row from 0 to its content's height) while the content fades in and slides down a little (opacity, transform);
 * folded it is inert, so it can neither be reached with the keyboard nor read out. With less motion it simply appears.
 * `id` is for the toggle's aria-controls.
 */
function Expand({ open, id, className, children }: { open: boolean; id?: string; className?: string; children: ReactNode }) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        'grid transition-[grid-template-rows] duration-(--motion-slow) ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      {/* 4 px wider on each side, so the focus rings of what is inside are not cut off. */}
      <div className="-mx-1 min-h-0 overflow-hidden px-1">
        <div
          className={cn(
            // Hidden once folded (visibility switches at the end of the transition), so nothing folded counts as on the screen.
            'transition-[opacity,translate,visibility] duration-(--motion-slow) ease-out motion-reduce:transition-none',
            open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0',
            className,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export { Expand }
