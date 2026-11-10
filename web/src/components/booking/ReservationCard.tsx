import { BadgeCheckIcon, MailQuestionIcon, RotateCcwIcon } from 'lucide-react'
import { type Ref, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { earliestStartIn, type PublicRestaurant } from '../../api/publicBooking.ts'
import { formatShortDate, formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Button } from '../../ui/button.tsx'
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
  /**
   * The embed: while the steps follow below the card, it folds to one line with the choice and "Change", which unfolds it
   * again; choosing a time folds it.
   */
  foldable?: boolean
  /** The card's element, e.g. to bring a time chip back into focus. */
  ref?: Ref<HTMLDivElement>
  className?: string
}

/** Whether the device asks for less motion, as app.css reads it (--motion-fast is 0s then). */
function lessMotion(element: Element) {
  return !(Number.parseFloat(getComputedStyle(element).getPropertyValue('--motion-fast')) > 0)
}

/** A short tap of the phone (10 ms) on a choice, where the device can; never with less motion. */
function tap() {
  if (typeof navigator.vibrate === 'function' && !lessMotion(document.documentElement)) {
    navigator.vibrate(10)
  }
}

/**
 * The reservation card: the heading and below it what is chosen so far ("4 people · Fri, Nov 14 · 7:00 PM"), the party size as
 * chips, below it the next days as a strip, below them the times of the day as chips right away (or the hint to call for a
 * party too large to book online), and at the bottom, quieter, how the restaurant confirms and that the reservation can be
 * cancelled through the link. A click on a time opens the booking dialog. In the embed it folds while the steps are open.
 */
export function ReservationCard({ slug, restaurant, flow, foldable = false, ref, className }: ReservationCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  // The day and party size of the times shown last. While the first free day for another party size is looked up, their
  // times stay (dimmed) instead of a skeleton, so the card does not jump.
  const [shown, setShown] = useState<{ day: string; guests: number } | null>(null)
  if (flow.day !== null && (shown?.day !== flow.day || shown.guests !== flow.partySize)) {
    setShown({ day: flow.day, guests: flow.partySize })
  }
  const times = flow.day !== null ? { day: flow.day, guests: flow.partySize } : shown

  // Unfolded with "Change" while the steps are open, until the next time is chosen.
  const [unfolded, setUnfolded] = useState(false)
  const folded = foldable && flow.dialogOpen && !unfolded
  const headerRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useFold(headerRef, bodyRef, folded)

  const chooseTime = (time: string) => {
    tap()
    setUnfolded(false)
    flow.chooseTime(time)
  }

  const summary = [
    flow.tooLarge ? t('booking.partySize.moreThan', { count: restaurant.maxOnlinePartySize }) : t('booking.guestsCount', { count: flow.partySize }),
    !flow.tooLarge && times !== null ? formatShortDate(times.day, language) : null,
    !flow.tooLarge && flow.time !== null ? formatTime(flow.time, language) : null,
  ]

  return (
    <Card ref={ref} data-layout-part="booking-card" className={cn('gap-0 py-0', className)}>
      <div
        ref={headerRef}
        className={cn('flex px-5 sm:px-6', folded ? 'items-center gap-3 py-3' : 'flex-col gap-1 pt-5 sm:pt-6')}
      >
        <h2
          ref={headingRef}
          data-booking-heading=""
          tabIndex={-1}
          // Below the fixed header of the page when it is brought into view.
          className={cn('scroll-mt-24 font-display text-2xl outline-none', folded && 'sr-only')}
        >
          {t('booking.steps.time')}
        </h2>
        <ChoiceSummary parts={summary} className={folded ? 'min-w-0 flex-1 font-medium' : 'text-sm text-muted-foreground'} />
        {folded && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              flushSync(() => setUnfolded(true))
              headingRef.current?.focus({ preventScroll: true })
            }}
          >
            {t('booking.card.change')}
          </Button>
        )}
      </div>

      {/* What folds in the embed: the choice and the footer. Folded it is out of the way: no height, invisible and inert. */}
      <div ref={bodyRef} inert={folded} className={cn('overflow-hidden', folded && 'invisible h-0')}>
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <PartySizePicker
            value={flow.partySize}
            maxOnlinePartySize={restaurant.maxOnlinePartySize}
            onChange={(guests) => {
              tap()
              flow.chooseGuests(guests)
            }}
          />

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
                onChange={(date) => {
                  tap()
                  flow.chooseDate(date)
                }}
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
                  onChange={chooseTime}
                  onChangeGuests={(guests) => {
                    tap()
                    flow.chooseGuests(guests)
                  }}
                  onChooseDayAndTime={(date, time, combined) => {
                    tap()
                    setUnfolded(false)
                    flow.chooseDayAndTime(date, time, combined)
                  }}
                />
              )}
            </>
          )}
        </div>

        <ul
          data-layout-part="booking-card-footer"
          className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6"
        >
          <li className="flex items-center gap-1.5">
            {flow.request ? (
              <MailQuestionIcon aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <BadgeCheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
            )}
            {flow.request ? t('booking.card.requestMode') : t('booking.card.instantMode')}
          </li>
          <li className="flex items-center gap-1.5">
            <RotateCcwIcon aria-hidden="true" className="size-3.5 shrink-0" />
            {t('booking.card.freeCancellation')}
          </li>
        </ul>
      </div>
    </Card>
  )
}

/**
 * Folds the card's body away (or unfolds it) when `folded` changes: its height (measured) and its opacity run from the old
 * state to the new, and the card's bottom margin runs against its height, so everything below it, and the height the embed
 * reports, is in its final place at once; the header with the summary fades in. Nothing moves with less motion.
 */
function useFold(headerRef: RefObject<HTMLElement | null>, bodyRef: RefObject<HTMLElement | null>, folded: boolean) {
  const before = useRef(folded)

  useLayoutEffect(() => {
    const header = headerRef.current
    const body = bodyRef.current
    const card = body?.parentElement
    const changed = before.current !== folded
    before.current = folded
    if (!changed || header === null || body === null || card === null || card === undefined || lessMotion(body)) {
      return
    }
    const style = getComputedStyle(body)
    const options = { duration: Number.parseFloat(style.getPropertyValue('--motion-slow')), easing: style.getPropertyValue('--ease-out').trim() || 'ease-out' }
    // The body's full height; folded it has none but keeps its content.
    const full = body.scrollHeight
    const animations = [
      body.animate(
        { height: folded ? [`${full}px`, '0px'] : ['0px', `${full}px`], opacity: folded ? [1, 0] : [0, 1], visibility: ['visible', 'visible'] },
        options,
      ),
      // Height and margin together always add up to the final height of the card.
      card.animate({ marginBottom: folded ? [`${-full}px`, '0px'] : [`${full}px`, '0px'] }, options),
      header.animate({ opacity: [0, 1] }, options),
    ]
    return () => {
      for (const animation of animations) {
        animation.cancel()
      }
    }
  }, [headerRef, bodyRef, folded])
}

/**
 * What the guest has chosen so far in one line ("4 people · Fri, Nov 14 · 7:00 PM"): the party size, the day once it is known
 * and the time once it is chosen. A part that changes lights up briefly in the accent colour, and so does the time when it is
 * chosen; the day does not when it first becomes known, as the card loads.
 */
function ChoiceSummary({ parts: [guests, day, time], className }: { parts: (string | null)[]; className?: string }) {
  return (
    <p data-booking-summary="" className={cn('truncate', className)}>
      <SummaryPart text={guests} />
      <SummaryPart text={day} separated />
      <SummaryPart text={time} separated lightsOnArrival />
    </p>
  )
}

/**
 * A part of the summary, after a dot when `separated`: when its text changes (or, with `lightsOnArrival`, appears), its
 * colour pulses from the accent colour back to its own (--motion-long).
 */
function SummaryPart({ text, separated = false, lightsOnArrival = false }: { text: string | null; separated?: boolean; lightsOnArrival?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const previous = useRef(text)

  useEffect(() => {
    const element = ref.current
    const before = previous.current
    previous.current = text
    if (element === null || text === null || before === text || (before === null && !lightsOnArrival) || lessMotion(element)) {
      return
    }
    const style = getComputedStyle(element)
    const animation = element.animate(
      { color: [style.getPropertyValue('--primary-text').trim(), style.color] },
      { duration: Number.parseFloat(style.getPropertyValue('--motion-long')), easing: style.getPropertyValue('--ease-out').trim() || 'ease-out' },
    )
    return () => animation.cancel()
  }, [text, lightsOnArrival])

  if (text === null) {
    return null
  }
  return (
    <>
      {separated && <span aria-hidden="true"> · </span>}
      <span ref={ref}>{text}</span>
    </>
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

/** The reservation card while the restaurant loads, in its shape: heading and summary, party size, date strip, times. */
export function ReservationCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('gap-5 p-5 sm:p-6', className)} aria-hidden="true">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-40" />
      </div>
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
