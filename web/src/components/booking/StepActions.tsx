import type { ReactNode } from 'react'
import { cn } from '../../lib/utils.ts'

/**
 * The main actions at the end of a step of the booking dialog. On phones (the sheet) they stay at the bottom of the screen
 * while the step scrolls, above the home indicator; from 768 px on, and in the embed (BookingFlow), they are part of the step.
 */
export function StepActions({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      data-slot="step-actions"
      className={cn(
        'sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
        'md:static md:mx-0 md:border-0 md:bg-transparent md:p-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
