import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** A note in the flow of the page: an optional icon on the left, a title and the text. Never by colour alone: say it in the text. */
const alertVariants = cva(
  "grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-xl border px-4 py-3 text-sm has-[>svg]:grid-cols-[1.25rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-px",
  {
    variants: {
      variant: {
        neutral: 'border-border bg-muted/60 text-foreground [&>svg]:text-muted-foreground',
        warning: 'border-warning/30 bg-warning/10 text-foreground [&>svg]:text-warning',
        destructive: 'border-destructive/30 bg-destructive/10 text-foreground [&>svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

function Alert({ className, variant, ...props }: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('col-start-2 font-semibold', className)} {...props} />
}

function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('col-start-2 flex flex-col gap-2 text-sm', className)} {...props} />
}

export { Alert, AlertDescription, AlertTitle }
