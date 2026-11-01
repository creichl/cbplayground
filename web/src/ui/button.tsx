import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap',
    'transition-[color,background-color,border-color,scale] focus-ring active:scale-98 motion-reduce:active:scale-100',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        outline: 'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary-text underline-offset-4 hover:underline',
      },
      // On touch screens every size is at least 44 px high.
      size: {
        sm: 'h-8 px-3 text-sm touch:h-11',
        md: 'h-10 px-4 text-sm touch:h-11',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10 touch:size-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Renders the child (e.g. a router Link) in the look of the button instead of a <button>. */
    asChild?: boolean
  }

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { Button }
