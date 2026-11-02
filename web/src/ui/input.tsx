import type { ComponentProps } from 'react'
import { cn } from '../lib/utils.ts'

/** 16 px text, so phones do not zoom in when the field gets the focus. */
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base text-foreground transition-colors touch:h-11',
        'placeholder:text-muted-foreground focus-ring focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
