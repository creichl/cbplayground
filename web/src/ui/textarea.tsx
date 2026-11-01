import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-24 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground transition-colors',
        'placeholder:text-muted-foreground focus-ring focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
