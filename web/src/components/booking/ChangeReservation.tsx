import type { ParseKeys, TFunction } from 'i18next'
import { ArrowRightIcon, CircleAlertIcon, LoaderCircleIcon, XIcon } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, httpErrorMessage } from '../../api/client.ts'
import {
  earliestStartIn,
  type GuestReservation,
  type PublicRestaurant,
  todayIn,
  useChangeGuestReservation,
} from '../../api/publicBooking.ts'
import { formatShortDate, formatTime } from '../../i18n/format.ts'
import { useMediaQuery } from '../../lib/use-media-query.ts'
import { Alert, AlertDescription } from '../../ui/alert.tsx'
import { Button } from '../../ui/button.tsx'
import { Card } from '../../ui/card.tsx'
import { Sheet, SheetContent, SheetTitle } from '../../ui/sheet.tsx'
import { BookingCalendar } from './BookingCalendar.tsx'
import { PartySizeCallHint, PartySizePicker } from './PartySizePicker.tsx'
import { updateRememberedBooking } from './rememberedBookings.ts'
import { TimeSlotGrid } from './TimeSlotGrid.tsx'
import { addDays } from './useBookingFlow.ts'

type ChangeReservationProps = {
  slug: string
  token: string
  restaurant: PublicRestaurant
  timeZoneId: string
  reservation: GuestReservation
  open: boolean
  onClose: () => void
  /** After the change: the page shows the result (the reservation itself is updated already). */
  onChanged: () => void
  /** Where the focus goes when the sheet has closed; by default back to the button that opened it. */
  onCloseAutoFocus?: (event: Event) => void
}

/** Errors after which the guest picks another time from the freshly loaded ones. */
const timeErrors: Record<string, ParseKeys> = {
  slot_unavailable: 'booking.errors.slotTaken',
  outside_opening_hours: 'booking.errors.timeNotBookable',
  in_the_past: 'booking.errors.timeNotBookable',
  too_short_notice: 'booking.errors.timeNotBookable',
  too_far_ahead: 'booking.errors.timeNotBookable',
}

/** A failed change in the guest's language. */
function changeErrorMessage(error: Error, t: TFunction) {
  if (error instanceof ApiError) {
    if (error.code !== null && error.code in timeErrors) {
      return t(timeErrors[error.code])
    }
    if (error.code === 'change_not_possible') {
      return t('guestReservation.change.notPossible')
    }
    if (error.code === 'invalid_party_size') {
      return t('guestReservation.change.invalidPartySize')
    }
    if (error.status === 429) {
      return t('guestReservation.errors.tooManyRequests')
    }
    if (error.kind === 'network') {
      return t('errors.network')
    }
    if (error.kind === 'http') {
      return httpErrorMessage(error, t)
    }
    return t('errors.invalidResponse')
  }
  return t('errors.unexpected')
}

/**
 * "Change reservation" on the guest's page: the party size chips, the date strip and the free times of the reservation card,
 * whose free days and times leave out the reservation itself (its own time counts as free). Once a new time is chosen, the
 * summary "Fri, Nov 14 · 7:30 PM · 4 people → Sat, Nov 15 · 8:00 PM · 4 people" and "Change". From 768 px on inline below the
 * details card, on phones in a sheet from the bottom. A taken time is said and the times are loaded anew.
 */
export function ChangeReservation(props: ChangeReservationProps) {
  const { t } = useTranslation()
  const wide = useMediaQuery('(min-width: 768px)')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()

  // The heading takes the focus when the panel opens inline; the sheet moves it there itself (onOpenAutoFocus).
  useEffect(() => {
    if (props.open && wide) {
      headingRef.current?.focus()
    }
  }, [props.open, wide])

  if (wide) {
    return props.open ? (
      <Card role="region" aria-labelledby={headingId} className="animate-rise gap-0 py-0">
        <ChangeForm
          {...props}
          heading={
            <h2 ref={headingRef} id={headingId} tabIndex={-1} className="font-display text-xl outline-hidden">
              {t('guestReservation.change.title')}
            </h2>
          }
        />
      </Card>
    ) : null
  }

  return (
    <Sheet open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          headingRef.current?.focus()
        }}
        onCloseAutoFocus={props.onCloseAutoFocus}
        className="max-h-[92dvh]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ChangeForm
            {...props}
            heading={
              <SheetTitle ref={headingRef} tabIndex={-1} className="outline-hidden">
                {t('guestReservation.change.title')}
              </SheetTitle>
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ChangeForm({ slug, token, restaurant, timeZoneId, reservation, onClose, onChanged, heading }: Omit<ChangeReservationProps, 'open'> & { heading: ReactNode }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const change = useChangeGuestReservation(slug, reservation.referenceCode, token)
  const [guests, setGuests] = useState(reservation.guests)
  const [date, setDate] = useState(reservation.date)
  const [time, setTime] = useState<string | null>(null)
  const exclude = { referenceCode: reservation.referenceCode, token }

  const today = todayIn(timeZoneId)
  const lastDay = addDays(today, restaurant.bookingHorizonDays)
  const tooLarge = guests > restaurant.maxOnlinePartySize
  const changed = time !== null && (date !== reservation.date || time !== reservation.time || guests !== reservation.guests)

  // Another party size or day asks for the time again.
  const chooseGuests = (value: number) => {
    setGuests(value)
    setTime(null)
    change.reset()
  }
  const chooseDate = (value: string) => {
    setDate(value)
    setTime(null)
    change.reset()
  }
  const chooseTime = (value: string) => {
    setTime(value)
    change.reset()
  }

  const describe = (day: string, at: string, people: number) =>
    [formatShortDate(day, language), formatTime(at, language), t('booking.guestsCount', { count: people })].join(' · ')

  const submit = () => {
    if (time === null) {
      return
    }
    change.mutate(
      { date, time, guests },
      {
        onSuccess: (result) => {
          updateRememberedBooking(slug, result.referenceCode, { date: result.date, time: result.time, guests: result.guests })
          onChanged()
        },
        onError: (error) => {
          // A time that cannot be booked (any more) is chosen again, from the times loaded anew.
          if (error instanceof ApiError && error.code !== null && error.code in timeErrors) {
            setTime(null)
          }
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          {heading}
          <p className="text-sm text-muted-foreground">{t('guestReservation.change.text')}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={onClose} className="-mt-1 -mr-2 shrink-0">
          <XIcon aria-hidden="true" />
        </Button>
      </div>

      <PartySizePicker value={guests} maxOnlinePartySize={restaurant.maxOnlinePartySize} onChange={chooseGuests} />

      {tooLarge ? (
        <PartySizeCallHint maxOnlinePartySize={restaurant.maxOnlinePartySize} phone={restaurant.phone} />
      ) : (
        <>
          <BookingCalendar slug={slug} guests={guests} value={date} minDate={today} maxDate={lastDay} onChange={chooseDate} exclude={exclude} />
          <TimeSlotGrid
            slug={slug}
            date={date}
            guests={guests}
            value={time}
            maxDate={lastDay}
            earliestStart={earliestStartIn(timeZoneId, restaurant.minLeadTimeMinutes)}
            notice={null}
            onChange={chooseTime}
            onChangeGuests={chooseGuests}
            onChooseDayAndTime={(day, at) => {
              setDate(day)
              chooseTime(at)
            }}
            exclude={exclude}
          />
        </>
      )}

      {change.isError && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{changeErrorMessage(change.error, t)}</AlertDescription>
        </Alert>
      )}

      {changed && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/50 p-4 animate-fade-in sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="sr-only">{t('guestReservation.change.summary')}: </span>
            <span className="text-muted-foreground line-through decoration-muted-foreground/60">{describe(reservation.date, reservation.time, reservation.guests)}</span>
            <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">{t('guestReservation.change.to')} </span>
            <span className="font-semibold">{describe(date, time, guests)}</span>
          </p>
          <Button size="lg" onClick={submit} disabled={change.isPending} className="shrink-0">
            {change.isPending && <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            {t('guestReservation.change.confirm')}
          </Button>
        </div>
      )}
    </div>
  )
}
