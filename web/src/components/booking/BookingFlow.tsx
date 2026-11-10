import { PhoneIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicRestaurant } from '../../api/publicBooking.ts'
import { useMediaQuery } from '../../lib/use-media-query.ts'
import { cn } from '../../lib/utils.ts'
import { Card } from '../../ui/card.tsx'
import { Dialog, DialogContent } from '../../ui/dialog.tsx'
import { Sheet, SheetContent } from '../../ui/sheet.tsx'
import { BookingSteps } from './BookingSteps.tsx'
import { RememberedBookingNotice } from './RememberedBookingNotice.tsx'
import { ReservationCard } from './ReservationCard.tsx'
import { timeChipAttribute } from './TimeSlotGrid.tsx'
import { useBookingFlow } from './useBookingFlow.ts'

type BookingFlowProps = {
  slug: string
  restaurant: PublicRestaurant
  /**
   * The embed: the steps after the time follow below the card instead of in a dialog, so the height the embed reports
   * to the page around it fits (an overlay in an iframe that grows with its content does not).
   */
  inline?: boolean
  className?: string
}

/**
 * The guest books a table: the reservation card with the free times, and from a time on the booking dialog with the table (only
 * when the guest chooses it), the contact details and the confirmation. From 768 px on the table step is a dialog of nearly the
 * whole window, for the plan, and the contact details and the confirmation a compact dialog of about 560 px in the middle (with
 * "System assigns" from the start); between them the dialog changes its size with the spring (BookingSteps). On phones a
 * full-screen sheet. Used by the booking page (/r/:slug) and the embed (/embed/:slug). A restaurant that cannot be booked online
 * shows a hint with its phone number instead.
 */
export function BookingFlow({ slug, restaurant, inline = false, className }: BookingFlowProps) {
  const { t } = useTranslation()

  if (!restaurant.bookable || restaurant.timeZoneId === null) {
    return (
      <Card className={className}>
        <div className="flex flex-col gap-3 px-6">
          <h2 data-booking-heading="" tabIndex={-1} className="scroll-mt-24 font-display text-2xl outline-none">
            {t('booking.notBookable.title')}
          </h2>
          <p className="text-muted-foreground">{t('booking.notBookable.text')}</p>
          {restaurant.phone !== null && (
            <a
              href={`tel:${restaurant.phone.replace(/[^0-9+]/g, '')}`}
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg text-lg font-semibold underline focus-ring"
            >
              <PhoneIcon aria-hidden="true" className="size-5 text-muted-foreground" />
              {restaurant.phone}
            </a>
          )}
        </div>
      </Card>
    )
  }

  return <Booking slug={slug} restaurant={restaurant} timeZoneId={restaurant.timeZoneId} inline={inline} className={className} />
}

function Booking({ slug, restaurant, timeZoneId, inline, className }: Required<Omit<BookingFlowProps, 'className'>> & { timeZoneId: string; className?: string }) {
  const flow = useBookingFlow(slug, restaurant, timeZoneId)
  const cardRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const wide = useMediaQuery('(min-width: 768px)')
  // The size of the dialog: large for the table's plan, compact for the rest; kept while the dialog closes.
  const nextSize = flow.result === null && flow.step === 'table' ? 'large' : 'compact'
  const [size, setSize] = useState(nextSize)
  if (flow.dialogOpen && nextSize !== size) {
    setSize(nextSize)
  }

  /** Closing the dialog brings the focus back to the chosen time's chip, or to the card's heading. */
  const returnFocus = (event: Event) => {
    event.preventDefault()
    const card = cardRef.current
    const chip = flow.time !== null ? card?.querySelector<HTMLElement>(`[${timeChipAttribute}="${flow.time}"]`) : null
    ;(chip ?? card?.querySelector<HTMLElement>('[data-booking-heading]'))?.focus()
  }
  /** Opening it moves the focus to the step's heading instead of its first button. */
  const focusHeading = (event: Event) => {
    event.preventDefault()
    contentRef.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus()
  }
  const onOpenChange = (open: boolean) => {
    if (!open) {
      flow.closeDialog()
    }
  }
  const steps = (frame: 'dialog' | 'sheet' | 'inline') => (
    <BookingSteps slug={slug} restaurant={restaurant} timeZoneId={timeZoneId} flow={flow} frame={frame} />
  )

  if (inline) {
    return (
      // A column with gaps, not margins: the card folds with a margin of its own that must add up (ReservationCard).
      <div className={cn('flex flex-col gap-4', className)}>
        <RememberedBookingNotice slug={slug} newTab />
        {/* While the steps are open, the card folds to one line with the choice and "Change". */}
        <ReservationCard ref={cardRef} slug={slug} restaurant={restaurant} flow={flow} foldable />
        {/*
         * The steps rise in below the card. The main buttons stay below the step: a bar at the bottom of the screen does not
         * work in an iframe that grows with its content.
         */}
        {flow.dialogOpen && (
          <Card
            data-motion-frame=""
            className="gap-0 overflow-clip py-0 motion-safe:animate-rise [&_[data-slot=step-actions]]:static [&_[data-slot=step-actions]]:mx-0 [&_[data-slot=step-actions]]:border-0 [&_[data-slot=step-actions]]:bg-transparent [&_[data-slot=step-actions]]:p-0 [&_[data-slot=step-actions]]:pb-6"
          >
            <div data-motion-frame-content="">{steps('inline')}</div>
          </Card>
        )}
      </div>
    )
  }

  return (
    <>
      <RememberedBookingNotice slug={slug} className="mb-4" />
      <ReservationCard ref={cardRef} slug={slug} restaurant={restaurant} flow={flow} className={className} />
      {wide ? (
        <Dialog open={flow.dialogOpen} onOpenChange={onOpenChange}>
          {/*
           * For the table nearly the whole window, so the plan of a large restaurant has room; otherwise compact, as high as its step.
           * The dialog scrolls inside when its step is higher than the window. "Close" is in the head of the steps.
           */}
          <DialogContent
            ref={contentRef}
            data-motion-frame=""
            aria-describedby={undefined}
            closeButton={false}
            onOpenAutoFocus={focusHeading}
            onCloseAutoFocus={returnFocus}
            className={cn(
              'flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0',
              size === 'large' ? 'h-[calc(100dvh-2rem)] max-w-[min(120rem,calc(100vw-2rem))]' : 'max-w-140',
            )}
          >
            <div data-motion-frame-content="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {steps('dialog')}
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={flow.dialogOpen} onOpenChange={onOpenChange}>
          <SheetContent
            ref={contentRef}
            aria-describedby={undefined}
            onOpenAutoFocus={focusHeading}
            onCloseAutoFocus={returnFocus}
            className="h-dvh data-[vaul-drawer-direction=bottom]:max-h-dvh data-[vaul-drawer-direction=bottom]:rounded-t-none"
          >
            <div data-motion-frame-content="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {steps('sheet')}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
