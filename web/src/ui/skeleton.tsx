import type { ComponentProps } from 'react'
import { cn } from '../lib/utils.ts'

/** A calm placeholder in the shape of what is loading; a soft light sweeps over it unless the user asked for less motion. */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'relative overflow-hidden rounded-lg bg-muted',
        'after:absolute after:inset-0 after:animate-shimmer after:bg-linear-to-r after:from-transparent after:via-white/45 after:to-transparent dark:after:via-white/5 motion-reduce:after:hidden',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
