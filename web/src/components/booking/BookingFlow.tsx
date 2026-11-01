import { Alert, Anchor, Box, Button, Card, Grid, Group, Skeleton, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import type { ParseKeys, TFunction } from 'i18next'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { ApiError, httpErrorMessage } from '../../api/client.ts'
import {
  nowIn,
  type PublicRestaurant,
  todayIn,
  useAvailability,
  useCreateBooking,
  useFirstFreeDay,
  usePublicTables,
} from '../../api/publicBooking.ts'
import { formatLongDate, formatShortDate, formatTime } from '../../i18n/format.ts'
import type { Language } from '../../i18n/index.ts'
import { ArmchairIcon, CalendarIcon, ClockIcon, UsersIcon } from '../icons.tsx'
import { BookingCalendar } from './BookingCalendar.tsx'
import { BookingConfirmation } from './BookingConfirmation.tsx'
import { GuestDetailsForm, type GuestDetailsValues } from './GuestDetailsForm.tsx'
import { PartySizeCallHint, PartySizePicker } from './PartySizePicker.tsx'
import { TablePicker } from './TablePicker.tsx'
import { TimeSelect, TimeSlotGrid } from './TimeSlotGrid.tsx'
import { headerHeight } from './layout.ts'

// Spacing follows an 8 px grid (8, 16, 24, 32), text sizes Mantine's fixed scale; step titles are in the heading font.

/**
 * The steps in the address: the booking bar with the free times, the table (only when the guest chooses it), the contact
 * details. The confirmation is not a step of the address: a reload after booking starts a new booking.
 */
const steps = ['time', 'table', 'details'] as const
type Step = (typeof steps)[number]

/** Steps of older links: party size and date are part of the booking bar now. */
const formerSteps: Record<string, Step> = { guests: 'time', date: 'time' }

const stepTitles: Record<Step, ParseKeys> = {
  time: 'booking.steps.time',
  table: 'booking.steps.table',
  details: 'booking.steps.details',
}

/** The party size a booking starts with, when the address has none. */
const presetGuests = 2

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

/**
 * The booking so far. It lives in the address (query parameters), so the back button and reloading keep it. Party size and
 * day are null while the guest has not chosen them: the booking then shows the presets (2 people, the first free day)
 * without writing them into the address, so a plain link stays plain and asks for nothing.
 */
type BookingState = { step: Step; guests: number | null; date: string | null; time: string | null; tableId: string | null }

const emptyState: BookingState = { step: 'time', guests: null, date: null, time: null, tableId: null }

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + days))
  return result.toISOString().slice(0, 10)
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
  const canBook = (guests ?? presetGuests) <= restaurant.maxOnlinePartySize
  const date =
    canBook && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateParam) && addDays(dateParam, 0) === dateParam && dateParam >= today && dateParam <= lastDay
      ? dateParam
      : null
  const time = date !== null && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(timeParam) ? timeParam : null
  const tableId = guestChooses && time !== null && tableParam !== '' ? tableParam : null

  const missing: Step = !canBook || time === null ? 'time' : guestChooses && tableId === null ? 'table' : 'details'
  const stepParam = params.get('step') ?? ''
  const requested = steps.find((step) => step === stepParam) ?? formerSteps[stepParam] ?? missing
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
  // A booking in which nothing is chosen yet keeps a clean address.
  if (state.step === 'time' && state.guests === null && state.date === null) {
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

type BookingFlowProps = {
  slug: string
  restaurant: PublicRestaurant
  /**
   * On phones, a bar fixed to the bottom of the screen with the choices so far and the step's main button (the booking
   * page). Without it (the embed, whose iframe grows with its content) the button stays below the step.
   */
  stickyBar?: boolean
}

/**
 * The guest books a table in a few steps; used by the booking page (/r/:slug) and the embed (/embed/:slug).
 * A restaurant that cannot be booked online shows a hint with its phone number instead.
 */
export function BookingFlow({ slug, restaurant, stickyBar = false }: BookingFlowProps) {
  const { t } = useTranslation()

  if (!restaurant.bookable || restaurant.timeZoneId === null) {
    return (
      <Alert color="gray" variant="light" title={t('booking.notBookable.title')}>
        <Stack gap={4}>
          <Text size="sm">{t('booking.notBookable.text')}</Text>
          {restaurant.phone !== null && (
            <Anchor href={`tel:${restaurant.phone.replace(/[^0-9+]/g, '')}`} fw={600} c="var(--mantine-color-text)" underline="always" lh="44px">
              {restaurant.phone}
            </Anchor>
          )}
        </Stack>
      </Alert>
    )
  }

  return <BookingSteps slug={slug} restaurant={restaurant} timeZoneId={restaurant.timeZoneId} stickyBar={stickyBar} />
}

function BookingSteps({ slug, restaurant, timeZoneId, stickyBar }: Required<BookingFlowProps> & { timeZoneId: string }) {
  const { t, i18n } = useTranslation()
  const language = (i18n.resolvedLanguage ?? 'en') as Language
  const guestChooses = restaurant.tableSelectionMode === 'GuestChooses'
  const request = restaurant.confirmationMode === 'Request'
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const formId = useId()

  const [details, setDetails] = useState<GuestDetailsValues>({ name: '', phone: '', email: '', notes: '' })
  const booking = useCreateBooking(slug)

  const today = todayIn(timeZoneId)
  const lastDay = addDays(today, restaurant.bookingHorizonDays)
  const state = readState(searchParams, restaurant, today, lastDay)
  const { step, guests, date, time, tableId } = state

  // The presets: 2 people (or fewer, if the restaurant takes no more online) and the first day with a free time.
  const partySize = guests ?? Math.min(presetGuests, restaurant.maxOnlinePartySize)
  const tooLarge = partySize > restaurant.maxOnlinePartySize
  const firstFreeDay = useFirstFreeDay(slug, today, lastDay, partySize, date === null && !tooLarge)
  const day = date ?? firstFreeDay.day ?? (firstFreeDay.isPending ? null : today)

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
  const availability = useAvailability(slug, date ?? '', partySize, checkTime)
  const slot = availability.data?.periods.flatMap((period) => period.times).find((option) => option.time === time)
  const timeTaken: ParseKeys | null =
    !checkTime || availability.data === undefined || slot?.available === true
      ? null
      : slot === undefined || (date === today && time !== null && time <= nowIn(timeZoneId))
        ? 'booking.errors.timeNotBookable'
        : 'booking.errors.slotTaken'

  const tables = usePublicTables(slug, date ?? '', time ?? '', partySize, guestChooses && tableId !== null && time !== null)
  const chosenArea = tables.data?.find((area) => area.tables.some((option) => option.id === tableId))
  const table = chosenArea?.tables.find((option) => option.id === tableId)
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

  const afterTime: Step = guestChooses ? 'table' : 'details'

  const chooseGuests = (value: number) => {
    if (value !== partySize) {
      void go({ guests: value, date, time: null, tableId: null }, 'time')
    }
  }

  const chooseDate = (value: string) => {
    if (value !== day) {
      void go({ guests, date: value, time: null, tableId: null }, 'time')
    }
  }

  // From here on, the presets are written into the address: the booking is about this party and this day.
  const chooseTime = (value: string) => {
    const next = { guests: partySize, date: day, time: value, tableId: value !== time ? null : tableId }
    void go(next, afterTime)
  }

  const submit = (values: GuestDetailsValues) => {
    if (date === null || time === null) {
      return
    }
    const optional = (value: string) => (value.trim() === '' ? null : value.trim())
    booking.mutate(
      {
        date,
        time,
        guests: partySize,
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
            setSearchParams(writeState(searchParams, { ...state, step: 'time', time: null, tableId: null }), { replace: true })
          }
        },
      },
    )
  }

  if (booking.isSuccess) {
    return <BookingConfirmation result={booking.data} slug={slug} restaurant={restaurant} timeZoneId={timeZoneId} />
  }

  // The choices so far in short; each part leads back to the step where it is chosen.
  const parts: { step: Step; icon: ReactNode; label: string; long: string }[] = []
  if (!tooLarge && day !== null) {
    parts.push({ step: 'time', icon: <UsersIcon />, label: t('booking.guestsCount', { count: partySize }), long: t('booking.guestsCount', { count: partySize }) })
    parts.push({ step: 'time', icon: <CalendarIcon />, label: formatShortDate(day, language), long: formatLongDate(day, language) })
  }
  if (time !== null) {
    parts.push({ step: 'time', icon: <ClockIcon />, label: formatTime(time, language), long: formatTime(time, language) })
  }
  if (table !== undefined && chosenArea !== undefined && guestChooses) {
    parts.push({
      step: 'table',
      icon: <ArmchairIcon />,
      label: t('booking.tableNumber', { number: table.number }),
      long: t('booking.table.selection', { number: table.number, count: table.seats, area: chosenArea.name }),
    })
  }
  const summaryText = parts.map((part) => part.label).join(' · ')

  // The main button of the step, in the bar at the bottom of the screen on phones.
  const barAction =
    step === 'time'
      ? { label: t('booking.continue'), disabled: time === null || tooLarge, onClick: () => void go(state, afterTime) }
      : step === 'table'
        ? { label: t('booking.continue'), disabled: tableId === null || table?.available !== true, onClick: () => void go(state, 'details') }
        : { label: request ? t('booking.details.submitRequest') : t('booking.details.submit'), disabled: false, submit: true }
  const barText =
    step === 'table' && table !== undefined && chosenArea !== undefined
      ? t('booking.table.selection', { number: table.number, count: table.seats, area: chosenArea.name })
      : step === 'table'
        ? t('booking.table.hint')
        : summaryText

  return (
    <>
      <Card p={{ base: 16, sm: 24 }}>
        <Stack gap={24}>
          {/* On the table step; the contact details have the summary as a card. */}
          {step === 'table' && (
            <Group gap={8} wrap="wrap" aria-label={t('booking.summaryLabel')} role="group">
              {parts.map((part, index) => (
                <Button
                  key={index}
                  variant="default"
                  radius="xl"
                  h={44}
                  leftSection={part.icon}
                  aria-label={t('booking.changePart', { part: part.label })}
                  onClick={() => void go(state, part.step)}
                >
                  {part.label}
                </Button>
              ))}
            </Group>
          )}

          <Title order={2} size="h2" ref={headingRef} tabIndex={-1} data-step-heading=""
            // Focused after a change of step; below the fixed header of the booking page.
            style={{ outline: 'none', scrollMarginTop: headerHeight + 16 }}>
            {t(stepTitles[step])}
          </Title>

          {checking ? (
            <Stack gap={16} aria-hidden="true">
              <Skeleton h={48} />
              <Skeleton h={160} />
            </Stack>
          ) : (
            <>
              {step === 'time' && (
                <Stack gap={24}>
                  <Grid gap={{ base: 8, sm: 16 }}>
                    <Grid.Col span={{ base: 6, sm: 4 }}>
                      <PartySizePicker value={partySize} maxOnlinePartySize={restaurant.maxOnlinePartySize} onChange={chooseGuests} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, sm: 4 }}>
                      <BookingCalendar
                        slug={slug}
                        guests={partySize}
                        value={tooLarge ? null : day}
                        minDate={today}
                        maxDate={lastDay}
                        onChange={chooseDate}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                      <TimeSelect slug={slug} date={tooLarge ? null : day} guests={partySize} value={time} onChange={chooseTime} />
                    </Grid.Col>
                  </Grid>

                  {tooLarge ? (
                    <PartySizeCallHint maxOnlinePartySize={restaurant.maxOnlinePartySize} phone={restaurant.phone} />
                  ) : day === null ? (
                    <Stack gap={8} aria-hidden="true">
                      <Skeleton h={24} w={160} />
                      <Skeleton h={96} />
                    </Stack>
                  ) : (
                    <TimeSlotGrid
                      slug={slug}
                      date={day}
                      guests={partySize}
                      value={time}
                      maxDate={lastDay}
                      notice={timeNotice}
                      onChange={chooseTime}
                      onChangeDate={chooseDate}
                    />
                  )}
                </Stack>
              )}

              {step === 'table' && date !== null && time !== null && (
                <TablePicker
                  slug={slug}
                  date={date}
                  time={time}
                  guests={partySize}
                  value={tableId}
                  onChange={(value) => void go({ guests, date, time, tableId: value }, 'table')}
                  onContinue={() => void go(state, 'details')}
                  onChangeTime={() => void go(state, 'time')}
                  stickyBar={stickyBar}
                />
              )}

              {step === 'details' && (
                <Grid gap={24}>
                  <Grid.Col span={{ base: 12, sm: 5 }} order={{ base: 1, sm: 2 }}>
                    <SummaryCard parts={parts} onChange={(part) => void go(state, part)} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 7 }} order={{ base: 2, sm: 1 }}>
                    <GuestDetailsForm
                      id={formId}
                      initialValues={details}
                      onValuesChange={setDetails}
                      onSubmit={submit}
                      submitting={booking.isPending}
                      error={booking.isError ? bookingErrorMessage(booking.error, t) : null}
                      request={request}
                      stickyBar={stickyBar}
                    />
                  </Grid.Col>
                </Grid>
              )}
            </>
          )}
        </Stack>
      </Card>

      {stickyBar && (
        <>
          {/* Room for the bar, so it never covers the end of the step. */}
          <Box hiddenFrom="md" h={80} />
          <Box
            hiddenFrom="md"
            pos="fixed"
            left={0}
            right={0}
            bottom={0}
            px={16}
            pt={12}
            bg="var(--mantine-color-body)"
            style={{
              zIndex: 200,
              paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
              borderTop: '1px solid var(--mantine-color-default-border)',
              boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.12)',
            }}
          >
            <Group justify="space-between" wrap="nowrap" gap={16}>
              <Text size="sm" fw={600} lineClamp={2} miw={0}>
                {barText}
              </Text>
              {'submit' in barAction ? (
                <Button type="submit" form={formId} h={48} loading={booking.isPending} style={{ flexShrink: 0 }}>
                  {barAction.label}
                </Button>
              ) : (
                <Button h={48} disabled={barAction.disabled} onClick={barAction.onClick} style={{ flexShrink: 0 }}>
                  {barAction.label}
                </Button>
              )}
            </Group>
          </Box>
        </>
      )}
    </>
  )
}

/** The choices next to the contact details (above them on phones); each row leads back to where it is chosen. */
function SummaryCard({ parts, onChange }: { parts: { step: Step; icon: ReactNode; long: string }[]; onChange: (step: Step) => void }) {
  const { t } = useTranslation()

  return (
    <Card withBorder shadow="none" padding={16} bg="var(--mantine-color-default-hover)">
      <Stack gap={8}>
        <Text fw={600}>{t('booking.summaryLabel')}</Text>
        <Stack gap={0} component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
          {parts.map((part, index) => (
            <li key={index}>
              <UnstyledButton
                onClick={() => onChange(part.step)}
                className="mantine-focus-auto"
                mih={44}
                w="100%"
                style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 'var(--mantine-radius-sm)' }}
              >
                <Box c="dimmed" style={{ display: 'flex', flexShrink: 0 }}>
                  {part.icon}
                </Box>
                <Text style={{ flex: 1 }}>{part.long}</Text>
                <Text size="sm" td="underline">
                  {t('booking.change')}
                </Text>
              </UnstyledButton>
            </li>
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}
