import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../lib/utils.ts'

/**
 * A message in the flow of the page, e.g. why a sign-in failed or that a time has just been taken: an optional icon in the
 * first column, title and text beside it. Never by colour alone: the text says it.
 */
const alertVariants = cva(
  "grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-xl border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*5)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-px [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        warning: 'border-warning/30 bg-warning/10 text-warning',
        destructive: 'border-destructive/30 bg-destructive/5 text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

/** Announced by screen readers when it appears (role "alert"); pass another role, e.g. "note", for a lasting hint. */
function Alert({ className, variant, role = 'alert', ...props }: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role={role} className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('col-start-2 font-semibold', className)} {...props} />
}

/** In the text colour, so it stays easy to read in every variant; its parts (text, a link, a button) one below the other. */
function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('col-start-2 flex flex-col gap-2 text-foreground', className)} {...props} />
}

export { Alert, AlertDescription, AlertTitle }
