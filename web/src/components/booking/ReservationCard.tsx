import { BadgeCheckIcon, MailQuestionIcon, RotateCcwIcon } from 'lucide-react'
import { type Ref, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { earliestStartIn, type PublicRestaurant } from '../../api/publicBooking.ts'
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
 * The reservation card: the party size as chips, below it the next days as a strip, below them the times of the day as chips
 * right away (or the hint to call for a party too large to book online), and at the bottom how the restaurant confirms and
 * that the reservation can be cancelled through the link. A click on a time opens the booking dialog.
 */
export function ReservationCard({ slug, restaurant, flow, ref, className }: ReservationCardProps) {
  const { t } = useTranslation()
  // The day and party size of the times shown last. While the first free day for another party size is looked up, their
  // times stay (dimmed) instead of a skeleton, so the card does not jump.
  const [shown, setShown] = useState<{ day: string; guests: number } | null>(null)
  if (flow.day !== null && (shown?.day !== flow.day || shown.guests !== flow.partySize)) {
    setShown({ day: flow.day, guests: flow.partySize })
  }
  const times = flow.day !== null ? { day: flow.day, guests: flow.partySize } : shown

  return (
    <Card ref={ref} data-layout-part="booking-card" className={cn('gap-0 py-0', className)}>
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <h2
          data-booking-heading=""
          tabIndex={-1}
          // Below the fixed header of the page when it is brought into view.
          className="scroll-mt-24 font-display text-2xl outline-none"
        >
          {t('booking.steps.time')}
        </h2>

        <PartySizePicker value={flow.partySize} maxOnlinePartySize={restaurant.maxOnlinePartySize} onChange={flow.chooseGuests} />

        {flow.tooLarge ? (
          <PartySizeCallHint maxOnlinePartySize={restaurant.maxOnlinePartySize} phone={restaurant.phone} />
        ) : (
          <>
            <BookingCalendar
              slug={slug}
              guests={flow.partySize}
              value={times?.day ?? null}
              minDate={flow.today}
              maxDate={flow.lastDay}
              onChange={flow.chooseDate}
            />
            {times === null ? (
              <TimesSkeleton />
            ) : (
              <TimeSlotGrid
                slug={slug}
                date={times.day}
                guests={times.guests}
                waiting={flow.day === null}
                value={flow.time}
                maxDate={flow.lastDay}
                earliestStart={earliestStartIn(restaurant.timeZoneId ?? 'UTC', restaurant.minLeadTimeMinutes)}
                notice={flow.timeNotice}
                onChange={flow.chooseTime}
                onChangeGuests={flow.chooseGuests}
                onChooseDayAndTime={flow.chooseDayAndTime}
              />
            )}
          </>
        )}
      </div>

      <ul data-layout-part="booking-card-footer" className="flex flex-col gap-2 rounded-b-xl border-t border-border bg-muted/50 px-5 py-4 text-sm sm:px-6">
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

/** The times while the first free day is not known yet, in the shape of TimeSlotGrid's skeleton. */
function TimesSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-5 w-40" />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-11 rounded-full" />
        ))}
      </div>
    </div>
  )
}

/** The reservation card while the restaurant loads, in its shape: heading, party size, date strip, times. */
export function ReservationCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('gap-5 p-5 sm:p-6', className)} aria-hidden="true">
      <Skeleton className="h-8 w-48" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-16" />
        <div className="flex gap-1.5 overflow-hidden">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="size-11 shrink-0 rounded-full" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-8 w-32 rounded-full touch:h-11" />
        </div>
        <div className="flex gap-1 overflow-hidden">
          {Array.from({ length: 14 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-11 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
      <TimesSkeleton />
    </Card>
  )
}
