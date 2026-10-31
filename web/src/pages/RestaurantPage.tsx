import { Alert, Anchor, Button, Card, Group, Skeleton, Stack, Text, Title } from '@mantine/core'
import type { ParseKeys, TFunction } from 'i18next'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ApiError } from '../api/client.ts'
import { isNotFound, type PublicRestaurant, todayIn, useCreateBooking, usePublicRestaurant } from '../api/publicBooking.ts'
import { BookingCalendar } from '../components/booking/BookingCalendar.tsx'
import { BookingConfirmation } from '../components/booking/BookingConfirmation.tsx'
import { formatDate, formatTime } from '../components/booking/format.ts'
import { GuestDetailsForm, type GuestDetailsValues } from '../components/booking/GuestDetailsForm.tsx'
import { PartySizePicker } from '../components/booking/PartySizePicker.tsx'
import { RestaurantHeader } from '../components/booking/RestaurantHeader.tsx'
import { type ChosenTable, TablePicker } from '../components/booking/TablePicker.tsx'
import { TimeSlotGrid } from '../components/booking/TimeSlotGrid.tsx'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import type { Language } from '../i18n/index.ts'

/** Online bookings reach at most this many days ahead, as on the server. */
const maxDaysAhead = 90

type Step = 'guests' | 'date' | 'time' | 'table' | 'details'

const stepTitles: Record<Step, ParseKeys> = {
  guests: 'booking.steps.guests',
  date: 'booking.steps.date',
  time: 'booking.steps.time',
  table: 'booking.steps.table',
  details: 'booking.steps.details',
}

/** Errors of the booking that the guest corrects in the form. */
const detailsErrors: Record<string, ParseKeys> = {
  invalid_name: 'booking.details.nameRequired',
  contact_required: 'booking.details.contactRequired',
  invalid_phone: 'booking.details.invalidPhone',
  invalid_email: 'booking.details.invalidEmail',
  invalid_notes: 'booking.details.invalidNotes',
}

/** Errors after which the guest picks the time again, from freshly loaded times. */
const timeErrors: Record<string, ParseKeys> = {
  slot_unavailable: 'booking.errors.slotTaken',
  table_unavailable: 'booking.errors.tableTaken',
  outside_opening_hours: 'booking.errors.timeNotBookable',
  in_the_past: 'booking.errors.timeNotBookable',
  too_far_ahead: 'booking.errors.timeNotBookable',
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + days))
  return result.toISOString().slice(0, 10)
}

/** A failed booking that is not about the time, in the guest's language. */
function bookingErrorMessage(error: Error, t: TFunction) {
  if (error instanceof ApiError) {
    if (error.code !== null && error.code in detailsErrors) {
      return t(detailsErrors[error.code])
    }
    if (error.status === 429) {
      return t('booking.errors.tooManyBookings')
    }
    if (error.kind === 'network') {
      return t('errors.network')
    }
    if (error.status === 400) {
      return t('booking.errors.invalidBooking')
    }
    if (error.kind === 'http') {
      return t('errors.http', { status: error.status })
    }
    return t('errors.invalidResponse')
  }
  return t('errors.unexpected')
}

/** The booking page of a restaurant: the restaurant at the top, then the guest books a table in a few steps. */
export function RestaurantPage() {
  const { t } = useTranslation()
  const { slug = '' } = useParams()
  const restaurant = usePublicRestaurant(slug)

  if (restaurant.isPending) {
    return (
      <Stack gap="lg">
        <Skeleton h={40} w="60%" />
        <Skeleton h={200} radius="md" />
        <Skeleton h={160} radius="md" />
      </Stack>
    )
  }

  if (restaurant.isError) {
    if (isNotFound(restaurant.error)) {
      return (
        <Stack gap="md" align="flex-start" py="xl">
          <Title order={1}>{t('restaurant.notFoundTitle')}</Title>
          <Text c="dimmed">{t('restaurant.notFoundText')}</Text>
          <Button component={Link} to="/" size="md">
            {t('common.backToStart')}
          </Button>
        </Stack>
      )
    }
    return <ErrorAlert error={restaurant.error} onRetry={() => void restaurant.refetch()} />
  }

  return (
    <Stack gap="xl">
      <RestaurantHeader restaurant={restaurant.data} />
      {restaurant.data.bookable && restaurant.data.timeZoneId !== null ? (
        // A new restaurant starts a new booking.
        <BookingFlow key={slug} slug={slug} restaurant={restaurant.data} timeZoneId={restaurant.data.timeZoneId} />
      ) : (
        <Alert color="gray" variant="light" title={t('booking.notBookable.title')}>
          <Stack gap={4}>
            <Text size="sm">{t('booking.notBookable.text')}</Text>
            {restaurant.data.phone !== null && (
              <Anchor href={`tel:${restaurant.data.phone.replace(/[^0-9+]/g, '')}`} fw={600}>
                {restaurant.data.phone}
              </Anchor>
            )}
          </Stack>
        </Alert>
      )}
    </Stack>
  )
}

type BookingFlowProps = { slug: string; restaurant: PublicRestaurant; timeZoneId: string }

function BookingFlow({ slug, restaurant, timeZoneId }: BookingFlowProps) {
  const { t, i18n } = useTranslation()
  const language = (i18n.resolvedLanguage ?? 'en') as Language
  const guestChooses = restaurant.tableSelectionMode === 'GuestChooses'

  const [step, setStep] = useState<Step>('guests')
  const [guests, setGuests] = useState<number | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const [table, setTable] = useState<ChosenTable | null>(null)
  const [details, setDetails] = useState<GuestDetailsValues>({ name: '', phone: '', email: '', notes: '' })
  const [timeNotice, setTimeNotice] = useState<ParseKeys | null>(null)
  const booking = useCreateBooking(slug)

  const today = todayIn(timeZoneId)
  const lastDay = addDays(today, maxDaysAhead)

  // After a change of step, the focus moves to the new step's heading, so keyboard and screen reader users follow along.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusedStep = useRef(step)
  useEffect(() => {
    if (focusedStep.current !== step) {
      focusedStep.current = step
      headingRef.current?.focus()
    }
  }, [step])

  const goTo = (next: Step) => {
    booking.reset()
    setStep(next)
  }

  const chooseGuests = (value: number) => {
    if (value !== guests) {
      setGuests(value)
      setTime(null)
      setTable(null)
    }
    if (value <= restaurant.maxOnlinePartySize) {
      goTo('date')
    }
  }

  const chooseDate = (value: string) => {
    if (value !== date) {
      setDate(value)
      setTime(null)
      setTable(null)
    }
    setTimeNotice(null)
    goTo('time')
  }

  const chooseTime = (value: string) => {
    if (value !== time) {
      setTime(value)
      setTable(null)
    }
    setTimeNotice(null)
    goTo(guestChooses ? 'table' : 'details')
  }

  const submit = (values: GuestDetailsValues) => {
    if (guests === null || date === null || time === null) {
      return
    }
    const optional = (value: string) => (value.trim() === '' ? null : value.trim())
    booking.mutate(
      {
        date,
        time,
        guests,
        tableId: guestChooses ? (table?.id ?? null) : null,
        name: values.name.trim(),
        phone: optional(values.phone),
        email: optional(values.email),
        notes: optional(values.notes),
        language,
      },
      {
        onError: (error) => {
          const code = error instanceof ApiError ? error.code : null
          if (code !== null && code in timeErrors) {
            // The availability is loaded anew (useCreateBooking), so the guest gets the times that are free now.
            setTimeNotice(timeErrors[code])
            setTime(null)
            setTable(null)
            setStep('time')
          } else if (code === 'table_required') {
            setStep('table')
          } else if (code === 'invalid_party_size') {
            setStep('guests')
          }
        },
      },
    )
  }

  if (booking.isSuccess) {
    return <BookingConfirmation result={booking.data} slug={slug} restaurant={restaurant} timeZoneId={timeZoneId} />
  }

  // The choices so far in short; each part leads back to its step.
  const summary: { step: Step; label: string }[] = []
  // A party too large to book online has nothing to summarise; the step shows the hint to call.
  if (guests !== null && guests <= restaurant.maxOnlinePartySize) {
    summary.push({ step: 'guests', label: t('booking.guestsCount', { count: guests }) })
  }
  if (date !== null) {
    summary.push({ step: 'date', label: formatDate(date, language, { weekday: 'short', day: 'numeric', month: 'short' }) })
  }
  if (time !== null) {
    summary.push({ step: 'time', label: formatTime(time, language) })
  }
  if (table !== null && guestChooses) {
    summary.push({ step: 'table', label: t('booking.tableNumber', { number: table.number }) })
  }

  return (
    <Card>
      <Stack gap="lg">
        {summary.length > 0 && (
          <Group gap={4} wrap="wrap" aria-label={t('booking.summaryLabel')} role="group">
            {summary.map((part, index) => (
              <Group key={part.step} gap={4} wrap="nowrap">
                {index > 0 && (
                  <Text c="dimmed" aria-hidden="true">
                    ·
                  </Text>
                )}
                <Button
                  variant={part.step === step ? 'light' : 'subtle'}
                  size="compact-md"
                  aria-label={t('booking.changePart', { part: part.label })}
                  onClick={() => goTo(part.step)}
                >
                  {part.label}
                </Button>
              </Group>
            ))}
          </Group>
        )}

        <Title order={2} size="h3" ref={headingRef} tabIndex={-1} style={{ outline: 'none' }}>
          {t(stepTitles[step])}
        </Title>

        {step === 'guests' && (
          <PartySizePicker
            value={guests}
            maxOnlinePartySize={restaurant.maxOnlinePartySize}
            phone={restaurant.phone}
            onChange={chooseGuests}
          />
        )}

        {step === 'date' && guests !== null && (
          <BookingCalendar slug={slug} guests={guests} value={date} minDate={today} maxDate={lastDay} onChange={chooseDate} />
        )}

        {step === 'time' && guests !== null && date !== null && (
          <TimeSlotGrid
            slug={slug}
            date={date}
            guests={guests}
            value={time}
            maxDate={lastDay}
            notice={timeNotice}
            onChange={chooseTime}
            onChangeDate={chooseDate}
          />
        )}

        {step === 'table' && guests !== null && date !== null && time !== null && (
          <TablePicker
            slug={slug}
            date={date}
            time={time}
            guests={guests}
            value={table}
            onChange={setTable}
            onContinue={() => goTo('details')}
            onChangeTime={() => goTo('time')}
          />
        )}

        {step === 'details' && (
          <GuestDetailsForm
            initialValues={details}
            onValuesChange={setDetails}
            onSubmit={submit}
            submitting={booking.isPending}
            error={booking.isError ? bookingErrorMessage(booking.error, t) : null}
            request={restaurant.confirmationMode === 'Request'}
          />
        )}
      </Stack>
    </Card>
  )
}
