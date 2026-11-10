import { type ComponentProps, useContext } from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'
import { ThemeRootContext } from '../brandTheme.ts'
import { cn } from '../lib/utils.ts'

// A sheet (vaul): from the bottom on phones, where it can be dragged down to close (with `handleOnly` only by its handle), or
// from the side (`direction="right"`).
// vaul animates it itself (with its own stylesheet); its duration follows the motion token for sheets, also when the user
// asked for less motion, and it opens with the soft spring of the dialogs.
const motion = { animationDuration: 'var(--motion-slow)' }
const contentMotion = { ...motion, animationTimingFunction: 'var(--ease-spring)' }
const handleStyle = { width: '100%', height: '1.5rem', margin: 0, opacity: 1, background: 'none', borderRadius: 0, touchAction: 'none' }

function Sheet(props: ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(props: ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetContent({ className, children, style, ...props }: ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Portal container={useContext(ThemeRootContext)}>
      <DrawerPrimitive.Overlay data-slot="sheet-overlay" className="fixed inset-0 z-50 bg-stone-950/50" style={motion} />
      <DrawerPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'group/sheet fixed z-50 flex h-auto flex-col bg-card text-card-foreground shadow-dialog outline-hidden',
          'data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:max-h-[85dvh] data-[vaul-drawer-direction=bottom]:rounded-t-xl data-[vaul-drawer-direction=bottom]:border-t',
          'data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm',
          'border-border',
          className,
        )}
        style={{ ...contentMotion, ...style }}
        {...props}
      >
        {/*
         * The handle: shows that the sheet can be dragged down, across the sheet's width; with `handleOnly` on the Sheet it is the
         * only place a drag starts. vaul styles it as a small bar with a stylesheet of its own (outside the cascade layers), which
         * only the inline style overrides.
         */}
        <div className="hidden shrink-0 group-data-[vaul-drawer-direction=bottom]/sheet:block">
          <DrawerPrimitive.Handle style={handleStyle}>
            <span className="absolute top-1/2 left-1/2 h-1.5 w-12 -translate-1/2 rounded-full bg-muted" />
          </DrawerPrimitive.Handle>
        </div>
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1 p-6 pb-0', className)} {...props} />
}

function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-6', className)} {...props} />
}

function SheetTitle({ className, ...props }: ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title data-slot="sheet-title" className={cn('font-display text-xl', className)} {...props} />
}

function SheetDescription({ className, ...props }: ComponentProps<typeof DrawerPrimitive.Description>) {
  return <DrawerPrimitive.Description data-slot="sheet-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger }
