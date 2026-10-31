import { Alert, Anchor, Button, Card, Group, Skeleton, Stack, Text, Title } from '@mantine/core'
import type { ParseKeys, TFunction } from 'i18next'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { ApiError, httpErrorMessage } from '../../api/client.ts'
import { type PublicRestaurant, todayIn, useAvailability, useCreateBooking, usePublicTables } from '../../api/publicBooking.ts'
import { formatShortDate, formatTime } from '../../i18n/format.ts'
import type { Language } from '../../i18n/index.ts'
import { BookingCalendar } from './BookingCalendar.tsx'
import { BookingConfirmation } from './BookingConfirmation.tsx'
import { GuestDetailsForm, type GuestDetailsValues } from './GuestDetailsForm.tsx'
import { PartySizePicker } from './PartySizePicker.tsx'
import { TablePicker } from './TablePicker.tsx'
import { TimeSlotGrid } from './TimeSlotGrid.tsx'

const steps = ['guests', 'date', 'time', 'table', 'details'] as const
type Step = (typeof steps)[number]

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
  too_short_notice: 'booking.errors.timeNotBookable',
  too_far_ahead: 'booking.errors.timeNotBookable',
}

/** The booking so far. It lives in the address (query parameters), so the back button and reloading keep it. */
type BookingState = { step: Step; guests: number | null; date: string | null; time: string | null; tableId: string | null }

const emptyState: BookingState = { step: 'guests', guests: null, date: null, time: null, tableId: null }

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + days))
  return result.toISOString().slice(0, 10)
}

/** The restaurant's local time "HH:mm" now. */
function nowIn(timeZoneId: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timeZoneId, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
}

/**
 * Reads the booking from the address. Invalid or outdated values (e.g. a day in the past) are left out together with
 * everything chosen after them, and the step is at most the first one whose choice is still missing.
 */
function readState(params: URLSearchParams, restaurant: PublicRestaurant, today: string, lastDay: string): BookingState {
  const guestChooses = restaurant.tableSelectionMode === 'GuestChooses'
  const guestsParam = params.get('guests') ?? ''
  const dateParam = params.get('date') ?? ''
  const timeParam = params.get('time') ?? ''
  const tableParam = params.get('table') ?? ''

  const guests = /^[0-9]{1,3}$/.test(guestsParam) && Number(guestsParam) >= 1 ? Number(guestsParam) : null
  // A party too large to book online stays at the hint to call.
  const canBook = guests !== null && guests <= restaurant.maxOnlinePartySize
  const date =
    canBook && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateParam) && addDays(dateParam, 0) === dateParam && dateParam >= today && dateParam <= lastDay
      ? dateParam
      : null
  const time = date !== null && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(timeParam) ? timeParam : null
  const tableId = guestChooses && time !== null && tableParam !== '' ? tableParam : null

  const missing: Step = !canBook ? 'guests' : date === null ? 'date' : time === null ? 'time' : guestChooses && tableId === null ? 'table' : 'details'
  const stepParam = params.get('step')
  const requested = steps.find((step) => step === stepParam) ?? missing
  let step = steps.indexOf(requested) <= steps.indexOf(missing) ? requested : missing
  if (step === 'table' && !guestChooses) {
    step = 'details'
  }
  return { step, guests, date, time, tableId }
}

/** The address of a booking state; other parameters, such as the language, stay as they are. */
function writeState(params: URLSearchParams, state: BookingState) {
  const next = new URLSearchParams(params)
  const values = { guests: state.guests?.toString() ?? null, date: state.date, time: state.time, table: state.tableId }
  for (const [key, value] of Object.entries(values)) {
    if (value === null) {
      next.delete(key)
    } else {
      next.set(key, value)
    }
  }
  // A booking that has not started yet keeps a clean address.
  if (state.step === 'guests' && state.guests === null) {
    next.delete('step')
  } else {
    next.set('step', state.step)
  }
  return next
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
      return httpErrorMessage(error, t)
    }
    return t('errors.invalidResponse')
  }
  return t('errors.unexpected')
}

type BookingFlowProps = { slug: string; restaurant: PublicRestaurant }

/**
 * The guest books a table in a few steps; used by the booking page (/r/:slug) and the embed (/embed/:slug).
 * A restaurant that cannot be booked online shows a hint with its phone number instead.
 */
export function BookingFlow({ slug, restaurant }: BookingFlowProps) {
  const { t } = useTranslation()

  if (!restaurant.bookable || restaurant.timeZoneId === null) {
    return (
      <Alert color="gray" variant="light" title={t('booking.notBookable.title')}>
        <Stack gap={4}>
          <Text size="sm">{t('booking.notBookable.text')}</Text>
          {restaurant.phone !== null && (
            <Anchor href={`tel:${restaurant.phone.replace(/[^0-9+]/g, '')}`} fw={600}>
              {restaurant.phone}
            </Anchor>
          )}
        </Stack>
      </Alert>
    )
  }

  return <BookingSteps slug={slug} restaurant={restaurant} timeZoneId={restaurant.timeZoneId} />
}

function BookingSteps({ slug, restaurant, timeZoneId }: BookingFlowProps & { timeZoneId: string }) {
  const { t, i18n } = useTranslation()
  const language = (i18n.resolvedLanguage ?? 'en') as Language
  const guestChooses = restaurant.tableSelectionMode === 'GuestChooses'
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [details, setDetails] = useState<GuestDetailsValues>({ name: '', phone: '', email: '', notes: '' })
  const booking = useCreateBooking(slug)

  const today = todayIn(timeZoneId)
  const lastDay = addDays(today, restaurant.bookingHorizonDays)
  const state = readState(searchParams, restaurant, today, lastDay)
  const { step, guests, date, time, tableId } = state
  // Why the guest has to pick the time again; it belongs to the history entry of the time step.
  const location = useLocation()
  const timeNotice = step === 'time' ? ((location.state as { timeNotice?: ParseKeys } | null)?.timeNotice ?? null) : null

  // An address with invalid or outdated values is corrected in place.
  const canonical = writeState(searchParams, state).toString()
  useEffect(() => {
    if (canonical !== searchParams.toString()) {
      setSearchParams(canonical, { replace: true })
    }
  }, [canonical, searchParams, setSearchParams])

  // Beyond the time step (e.g. after reloading or going back), the chosen time and table must still be free.
  const settled = booking.isIdle
  const checkTime = settled && (step === 'table' || step === 'details') && time !== null
  const availability = useAvailability(slug, date ?? '', guests ?? 0, checkTime)
  const slot = availability.data?.periods.flatMap((period) => period.times).find((option) => option.time === time)
  const timeTaken: ParseKeys | null =
    !checkTime || availability.data === undefined || slot?.available === true
      ? null
      : slot === undefined || (date === today && time !== null && time <= nowIn(timeZoneId))
        ? 'booking.errors.timeNotBookable'
        : 'booking.errors.slotTaken'

  const tables = usePublicTables(slug, date ?? '', time ?? '', guests ?? 0, guestChooses && tableId !== null && time !== null)
  const table = tables.data?.flatMap((area) => area.tables).find((option) => option.id === tableId)
  const checkTable = checkTime && timeTaken === null && guestChooses && tableId !== null
  const tableTaken = checkTable && tables.data !== undefined && table?.available !== true

  // Wait for the checks before the step is shown; a failed check leaves it to the booking itself.
  const checking = (checkTime && availability.isPending) || (checkTable && tables.isPending)

  const correction =
    timeTaken !== null
      ? writeState(searchParams, { ...state, step: 'time', time: null, tableId: null }).toString()
      : tableTaken
        ? writeState(searchParams, { ...state, step: 'table', tableId: null }).toString()
        : null
  useEffect(() => {
    if (correction !== null) {
      setSearchParams(correction, { replace: true, state: timeTaken !== null ? { timeNotice: timeTaken } : undefined })
    }
  }, [timeTaken, correction, setSearchParams])

  // After a change of step, the focus moves to the new step's heading, so keyboard and screen reader users follow along.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusedStep = useRef(step)
  useEffect(() => {
    if (focusedStep.current !== step) {
      focusedStep.current = step
      headingRef.current?.focus()
    }
  }, [step])

  /**
   * Stores the new choices. Moving to another step adds an entry to the browser history, so the back button returns
   * to the current step with the choice made in it; within a step, the entry is replaced.
   */
  const go = async (next: Omit<BookingState, 'step'>, nextStep: Step) => {
    booking.reset()
    const current = `?${writeState(searchParams, { ...next, step })}`
    if (nextStep === step) {
      await navigate({ search: current }, { replace: true })
      return
    }
    // One navigation after the other: a second one started right away would cancel the first.
    if (current !== `?${searchParams}`) {
      await navigate({ search: current }, { replace: true })
    }
    await navigate({ search: `?${writeState(searchParams, { ...next, step: nextStep })}` })
  }

  const chooseGuests = (value: number) => {
    const next = value !== guests ? { guests: value, date, time: null, tableId: null } : state
    void go(next, value <= restaurant.maxOnlinePartySize ? 'date' : 'guests')
  }

  const chooseDate = (value: string) => {
    const next = value !== date ? { guests, date: value, time: null, tableId: null } : state
    void go(next, 'time')
  }

  const chooseTime = (value: string) => {
    const next = value !== time ? { guests, date, time: value, tableId: null } : state
    void go(next, guestChooses ? 'table' : 'details')
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
        tableId: guestChooses ? tableId : null,
        name: values.name.trim(),
        phone: optional(values.phone),
        email: optional(values.email),
        notes: optional(values.notes),
        language,
      },
      {
        // A reload after the booking starts a new one instead of showing the booked choices again.
        onSuccess: () => setSearchParams(writeState(searchParams, emptyState), { replace: true }),
        onError: (error) => {
          const code = error instanceof ApiError ? error.code : null
          if (code !== null && code in timeErrors) {
            // The availability is loaded anew (useCreateBooking), so the guest gets the times that are free now.
            setSearchParams(writeState(searchParams, { ...state, step: 'time', time: null, tableId: null }), {
              replace: true,
              state: { timeNotice: timeErrors[code] },
            })
          } else if (code === 'table_required') {
            setSearchParams(writeState(searchParams, { ...state, step: 'table' }), { replace: true })
          } else if (code === 'invalid_party_size') {
            setSearchParams(writeState(searchParams, { ...state, step: 'guests' }), { replace: true })
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
    summary.push({ step: 'date', label: formatShortDate(date, language) })
  }
  if (time !== null) {
    summary.push({ step: 'time', label: formatTime(time, language) })
  }
  if (table !== undefined && guestChooses) {
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
                  onClick={() => void go(state, part.step)}
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

        {checking ? (
          <Skeleton h={160} />
        ) : (
          <>
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
                value={tableId}
                onChange={(value) => void go({ guests, date, time, tableId: value }, 'table')}
                onContinue={() => void go(state, 'details')}
                onChangeTime={() => void go(state, 'time')}
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
          </>
        )}
      </Stack>
    </Card>
  )
}
