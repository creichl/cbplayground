import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** A calm placeholder in the shape of what is loading; it pulses unless the user asked for less motion. */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('animate-pulse rounded-lg bg-muted motion-reduce:animate-none', className)} {...props} />
}

export { Skeleton }
