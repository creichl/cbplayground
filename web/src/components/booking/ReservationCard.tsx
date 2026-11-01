import { BadgeCheckIcon, MailQuestionIcon, RotateCcwIcon } from 'lucide-react'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicRestaurant } from '../../api/publicBooking.ts'
import { cn } from '../../lib/utils.ts'
import { Card } from '../../ui/card.tsx'
import { Skeleton } from '../../ui/skeleton.tsx'
import { BookingCalendar } from './BookingCalendar.tsx'
import { PartySizeCallHint, PartySizePicker } from './PartySizePicker.tsx'
import { TimeSlotGrid } from './TimeSlotGrid.tsx'
import type { BookingFlowState } from './useBookingFlow.ts'

type ReservationCardProps = {
  slug: string
  restaurant: PublicRestaurant
  flow: BookingFlowState
  /** The card's element, e.g. to bring a time chip back into focus. */
  ref?: Ref<HTMLDivElement>
  className?: string
}

/**
 * The reservation card: party size and date side by side, below them the free times of the day as chips right away (or the
 * hint to call for a party too large to book online), and at the bottom how the restaurant confirms and that the
 * reservation can be cancelled through the link. A click on a time opens the booking dialog.
 */
export function ReservationCard({ slug, restaurant, flow, ref, className }: ReservationCardProps) {
  const { t } = useTranslation()

  return (
    <Card ref={ref} className={cn('gap-0 py-0', className)}>
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <h2
          data-booking-heading=""
          tabIndex={-1}
          // Below the fixed header of the page when it is brought into view.
          className="scroll-mt-24 font-display text-2xl outline-none"
        >
          {t('booking.steps.time')}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <PartySizePicker value={flow.partySize} maxOnlinePartySize={restaurant.maxOnlinePartySize} onChange={flow.chooseGuests} />
          <BookingCalendar
            slug={slug}
            guests={flow.partySize}
            value={flow.tooLarge ? null : flow.day}
            minDate={flow.today}
            maxDate={flow.lastDay}
            onChange={flow.chooseDate}
          />
        </div>

        {flow.tooLarge ? (
          <PartySizeCallHint maxOnlinePartySize={restaurant.maxOnlinePartySize} phone={restaurant.phone} />
        ) : flow.day === null ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-5 w-40" />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-11 rounded-full" />
              ))}
            </div>
          </div>
        ) : (
          <TimeSlotGrid
            slug={slug}
            date={flow.day}
            guests={flow.partySize}
            value={flow.time}
            maxDate={flow.lastDay}
            notice={flow.timeNotice}
            onChange={flow.chooseTime}
            onChangeDate={flow.chooseDate}
          />
        )}
      </div>

      <ul className="flex flex-col gap-2 rounded-b-xl border-t border-border bg-muted/50 px-5 py-4 text-sm sm:px-6">
        <li className="flex items-start gap-2">
          {flow.request ? (
            <MailQuestionIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <BadgeCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          )}
          {flow.request ? t('booking.card.requestMode') : t('booking.card.instantMode')}
        </li>
        <li className="flex items-start gap-2">
          <RotateCcwIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {t('booking.card.freeCancellation')}
        </li>
      </ul>
    </Card>
  )
}

/** The reservation card while the restaurant loads, in its shape. */
export function ReservationCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('gap-5 p-5 sm:p-6', className)} aria-hidden="true">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="h-5 w-40" />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-11 rounded-full" />
        ))}
      </div>
    </Card>
  )
}
