import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { type ComponentProps, useContext } from 'react'
import { ThemeRootContext } from '@/brandTheme'
import { cn } from '@/lib/utils'

/** A short hint on hover and keyboard focus; its own provider, so it works without one around the app. */
function Tooltip({ delayDuration = 300, ...props }: ComponentProps<typeof TooltipPrimitive.Root> & { delayDuration?: number }) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipPrimitive.Provider>
  )
}

function TooltipTrigger(props: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal container={useContext(ThemeRootContext)}>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) rounded-lg bg-foreground px-3 py-1.5 text-xs text-balance text-background',
          'animate-pop-in data-[state=closed]:animate-pop-out',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipTrigger }
