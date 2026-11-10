import { PhoneIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicRestaurant } from '../../api/publicBooking.ts'
import { useMediaQuery } from '../../lib/use-media-query.ts'
import { cn } from '../../lib/utils.ts'
import { Button } from '../../ui/button.tsx'
import { Card } from '../../ui/card.tsx'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog.tsx'
import { layoutTransitions, sharedElementTransition } from '../../ui/motion/layout-transition.ts'
import { Sheet, SheetContent } from '../../ui/sheet.tsx'
import { BookingSteps } from './BookingSteps.tsx'
import { type GuestDetailsValues, initialDetails } from './guestDetails.ts'
import { formatLeft, useTimeLeft } from './holdTime.ts'
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
 * "System assigns" from the start); between them the dialog changes its size with the spring (BookingSteps). The chosen time's chip
 * moves into the time in the dialog's summary as it opens, and back as it closes (sharedElementTransition). On phones a sheet
 * nearly as high as the screen, dragged down to close only by its handle; when that, a tap above it or Escape would drop a held
 * table or what the guest typed, it asks first. Used by the booking page (/r/:slug) and the embed (/embed/:slug). A restaurant
 * that cannot be booked online shows a hint with its phone number instead.
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
  const { t } = useTranslation()
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
  // Where the dialog grows from where the browser has no view transitions: the centre of the chip it opens from.
  const origin = useRef<{ x: number; y: number } | null>(null)
  // The sheet asks whether the guest wants to leave (askToLeave).
  const [asking, setAsking] = useState(false)

  const chipOf = (time: string) => cardRef.current?.querySelector<HTMLElement>(`[${timeChipAttribute}="${time}"]`) ?? null
  const summaryTime = () => document.querySelector<HTMLElement>('[data-slot="dialog-content"] [data-summary-part="time"]')

  /** A time chip of the card opens the dialog: from 768 px on, the chip moves into the summary's time. */
  const openFromChip = (time: string) => {
    const chip = chipOf(time)
    if (!layoutTransitions && chip !== null) {
      const box = chip.getBoundingClientRect()
      origin.current = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    }
    sharedElementTransition(chip, 'booking-time', () => flow.chooseTime(time), summaryTime)
  }
  /** Closing the dialog from a step with the summary moves its time back into the card's chip. */
  const closeToChip = () => {
    const time = flow.time
    const from = summaryTime()
    if (time === null || from === null) {
      flow.closeDialog()
      return
    }
    sharedElementTransition(from, 'booking-time', flow.closeDialog, () => chipOf(time))
  }
  /** The dialog's content: the step's frame grows from the chip's centre where there is no view transition (openFromChip). */
  const dialogContentRef = (node: HTMLDivElement | null) => {
    contentRef.current = node
    if (node !== null && origin.current !== null) {
      const box = node.getBoundingClientRect()
      node.style.transformOrigin = `${origin.current.x - box.left}px ${origin.current.y - box.top}px`
      origin.current = null
    }
  }

  /**
   * The sheet is about to close by a drag on its handle, a tap above it or Escape. While a table is held for the guest, or the guest
   * has typed contact details, it springs back and asks first; otherwise it closes.
   */
  const askToLeave = (open: boolean) => {
    if (open) {
      return
    }
    const held = flow.hold !== null && Date.parse(flow.hold.expiresAtUtc) > Date.now()
    if (flow.result === null && (held || typedDetails(flow.details, restaurant.countryCode))) {
      springBack(contentRef.current)
      setAsking(true)
    } else {
      flow.closeDialog()
    }
  }
  const leave = () => {
    setAsking(false)
    flow.closeDialog()
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
  const steps = (frame: 'dialog' | 'sheet' | 'inline') => (
    <BookingSteps slug={slug} restaurant={restaurant} timeZoneId={timeZoneId} flow={frame === 'dialog' ? { ...flow, closeDialog: closeToChip } : flow} frame={frame} />
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
      <ReservationCard ref={cardRef} slug={slug} restaurant={restaurant} flow={wide ? { ...flow, chooseTime: openFromChip } : flow} className={className} />
      {wide ? (
        <Dialog open={flow.dialogOpen} onOpenChange={(open) => open || closeToChip()}>
          {/*
           * For the table nearly the whole window, so the plan of a large restaurant has room; otherwise compact, as high as its step.
           * The dialog scrolls inside when its step is higher than the window. "Close" is in the head of the steps.
           */}
          <DialogContent
            ref={dialogContentRef}
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
        <>
          {/* A little of the page shows above the sheet, so it reads as one; only its handle drags it (the plan pans on its own). */}
          <Sheet open={flow.dialogOpen} onOpenChange={askToLeave} handleOnly>
            <SheetContent
              ref={contentRef}
              aria-describedby={undefined}
              onOpenAutoFocus={focusHeading}
              onCloseAutoFocus={returnFocus}
              className="h-[calc(100dvh-0.75rem)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-0.75rem)]"
            >
              <div data-motion-frame-content="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {steps('sheet')}
              </div>
            </SheetContent>
          </Sheet>
          <Dialog open={asking} onOpenChange={setAsking}>
            <DialogContent closeButton={false} data-leave-question="">
              <DialogHeader className="pr-0">
                <DialogTitle>{t('booking.leave.title')}</DialogTitle>
                <DialogDescription>{flow.hold !== null ? <HeldFor expiresAtUtc={flow.hold.expiresAtUtc} /> : t('booking.leave.unfinished')}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={leave}>
                  {t('booking.leave.leave')}
                </Button>
                <Button onClick={() => setAsking(false)}>{t('booking.leave.stay')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  )
}

/** Whether the guest has typed contact details, a note or chosen an occasion: anything beyond what the form starts with. */
function typedDetails(details: GuestDetailsValues, countryCode: string | null) {
  const start = initialDetails(countryCode)
  return (['name', 'phone', 'email', 'notes', 'occasion'] as const).some((field) => details[field] !== start[field])
}

/**
 * Brings the sheet back up after vaul let it go to close (a drag on the handle), and its overlay to full strength, when it stays
 * open: vaul leaves both where the drag ended, as it expects the sheet to close.
 */
function springBack(sheet: HTMLElement | null) {
  const transition = 'var(--motion-slow) var(--ease-spring)'
  sheet?.style.setProperty('transition', `transform ${transition}`)
  sheet?.style.setProperty('transform', 'translate3d(0, 0, 0)')
  const overlay = document.querySelector<HTMLElement>('[data-slot="sheet-overlay"]')
  overlay?.style.setProperty('transition', `opacity ${transition}`)
  overlay?.style.setProperty('opacity', '1')
}

/** "Your table is held for 3:12 more.", counting down; once the hold has ended, that the booking is not finished. */
function HeldFor({ expiresAtUtc }: { expiresAtUtc: string }) {
  const { t } = useTranslation()
  const left = useTimeLeft(expiresAtUtc)
  return left > 0 ? t('booking.leave.held', { left: formatLeft(left) }) : t('booking.leave.unfinished')
}
