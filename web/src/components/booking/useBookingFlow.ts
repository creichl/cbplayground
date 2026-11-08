import type { ParseKeys, TFunction } from 'i18next'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { ApiError, httpErrorMessage } from '../../api/client.ts'
import {
  type Availability,
  createHold,
  type Hold,
  type HoldRequest,
  nowIn,
  type PublicRestaurant,
  releaseHold,
  todayIn,
  useAvailability,
  useCreateBooking,
  useFirstFreeDay,
  usePublicTables,
  useReloadAvailability,
} from '../../api/publicBooking.ts'
import type { Language } from '../../i18n/index.ts'
import { type GuestDetailsValues, initialDetails } from './guestDetails.ts'
import { rememberBooking } from './rememberedBookings.ts'

// The logic of the booking, without its views: the booking so far in the address, its checks, the hold of the table while the
// guest enters the contact details, the booking itself and its errors. The reservation card, the booking dialog and the embed
// show it (BookingFlow).

/**
 * The steps in the address: the time (the reservation card), the table (only when the guest chooses it), the contact
 * details. Table and contact details are the booking dialog: a step after the time means the dialog is open. The
 * confirmation is not a step of the address: a reload after booking starts a new booking.
 */
export const steps = ['time', 'table', 'details'] as const
export type Step = (typeof steps)[number]

/** Steps of older links: party size and date are part of the reservation card now. */
const formerSteps: Record<string, Step> = { guests: 'time', date: 'time' }

/** The party size a booking starts with, when the address has none. */
const presetGuests = 2

/** Errors of the booking that the guest corrects in the form. */
const detailsErrors: Record<string, ParseKeys> = {
  invalid_name: 'booking.details.nameRequired',
  contact_required: 'booking.details.contactRequired',
  invalid_phone: 'booking.details.invalidPhone',
  invalid_email: 'booking.details.invalidEmail',
  invalid_notes: 'booking.details.invalidNotes',
  invalid_occasion: 'booking.details.invalidOccasion',
}

/**
 * Errors after which the guest picks the time again, from freshly loaded times: on the table step the dialog closes and the card
 * says why; at the contact details (the hold or the booking failed) the dialog says it and offers the nearest free times.
 */
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
export type BookingState = { step: Step; guests: number | null; date: string | null; time: string | null; tableId: string | null }

const emptyState: BookingState = { step: 'time', guests: null, date: null, time: null, tableId: null }

/**
 * What the history entries of the dialog's steps carry: how many entries back the time step is, so closing the dialog
 * returns there instead of adding an entry the back button would reopen the dialog from.
 */
type DialogEntry = { dialogDepth: number }

function dialogDepth(state: unknown) {
  return typeof state === 'object' && state !== null && 'dialogDepth' in state && typeof state.dialogDepth === 'number'
    ? state.dialogDepth
    : null
}

export function addDays(date: string, days: number) {
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
  // The contact details follow the time without a table when only a combination of tables is free then; the flow checks
  // that once the times are loaded (useBookingFlow) and otherwise goes back to the table.
  if (requested === 'details' && missing === 'table') {
    step = 'details'
  }
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

/** How many of the nearest free times the dialog offers when the chosen one is taken. */
const nearbyCount = 4

/** The free times of the day nearest to `time`, at most nearbyCount, in their order; `time` itself only when `withTime`. */
function nearbyTimes(availability: Availability | undefined, time: string | null, withTime: boolean) {
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  const target = time === null ? 0 : minutes(time)
  return (availability?.periods ?? [])
    .flatMap((period) => period.times)
    .filter((option) => option.available && (withTime || option.time !== time))
    .map((option) => option.time)
    .sort((a, b) => Math.abs(minutes(a) - target) - Math.abs(minutes(b) - target))
    .slice(0, nearbyCount)
    .sort()
}

/** A random id for the idempotency key of the booking; also outside a secure context, where crypto.randomUUID is missing. */
function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A failed booking that is not about the time (that one the dialog shows with the nearest free times), in the guest's language. */
function bookingErrorMessage(error: Error, t: TFunction) {
  if (error instanceof ApiError) {
    if (error.code !== null && error.code in timeErrors) {
      return null
    }
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

/**
 * The booking of a restaurant that can be booked online: what is chosen (from the address, with the presets), whether the
 * chosen time and table are still free, and the actions of the card and the dialog.
 */
export function useBookingFlow(slug: string, restaurant: PublicRestaurant, timeZoneId: string) {
  const { t, i18n } = useTranslation()
  const language = (i18n.resolvedLanguage ?? 'en') as Language
  const guestChooses = restaurant.tableSelectionMode === 'GuestChooses'
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  // The remembered details of this device, if the guest asked for it; otherwise empty with the restaurant's calling code.
  const [details, setDetails] = useState<GuestDetailsValues>(() => initialDetails(restaurant.countryCode))
  const booking = useCreateBooking(slug)
  const reloadAvailability = useReloadAvailability(slug)

  const today = todayIn(timeZoneId)
  const lastDay = addDays(today, restaurant.bookingHorizonDays)
  const state = readState(searchParams, restaurant, today, lastDay)
  const { step, guests, date, time, tableId } = state

  // While the confirmation is shown, the card keeps the booked party and day: the address already starts a new booking (so a
  // reload does), and the presets behind the open dialog would change the card's times under it. Closing it shows the presets.
  const booked = booking.isSuccess ? booking.data : null
  // The presets: 2 people (or fewer, if the restaurant takes no more online) and the first day with a free time.
  const partySize = guests ?? booked?.guests ?? Math.min(presetGuests, restaurant.maxOnlinePartySize)
  const tooLarge = partySize > restaurant.maxOnlinePartySize
  const firstFreeDay = useFirstFreeDay(slug, today, lastDay, partySize, date === null && booked === null && !tooLarge)
  const day = date ?? booked?.date ?? firstFreeDay.day ?? (firstFreeDay.isPending ? null : today)
  // The times of the card (the same request as its grid), to know which ones only a combination of tables has free.
  const dayAvailability = useAvailability(slug, day ?? '', partySize, guestChooses && day !== null && !tooLarge)

  // Why the guest has to pick the time again; it belongs to the history entry of the time step.
  const timeNotice = step === 'time' ? ((location.state as { timeNotice?: ParseKeys } | null)?.timeNotice ?? null) : null

  // An address with invalid or outdated values is corrected in place.
  const canonical = writeState(searchParams, state).toString()
  useEffect(() => {
    if (canonical !== searchParams.toString()) {
      setSearchParams(canonical, { replace: true })
    }
  }, [canonical, searchParams, setSearchParams])

  // The guest's holds being released (below): until then, and until the times and tables are loaded anew, they would count as taken.
  const [releasing, setReleasing] = useState(0)

  // On the table step (e.g. after reloading or going back), the chosen time and table must still be free. At the contact details
  // the hold checks them (below): the times loaded there would count the guest's own hold as taken.
  const settled = booking.isIdle && releasing === 0
  const checkTime = settled && step === 'table' && time !== null
  const availability = useAvailability(slug, date ?? '', partySize, checkTime)
  const slot = availability.data?.periods.flatMap((period) => period.times).find((option) => option.time === time)
  const timeTaken: ParseKeys | null =
    !checkTime || availability.data === undefined || slot?.available === true
      ? null
      : slot === undefined || (date === today && time !== null && time <= nowIn(timeZoneId))
        ? 'booking.errors.timeNotBookable'
        : 'booking.errors.slotTaken'

  // Only a combination of tables is free at the chosen time: the system assigns it, the guest chooses no table. At the contact
  // details that is the case without a table (otherwise the hold answers "table_required" and the guest goes to the table).
  const combined = guestChooses && (step === 'details' ? tableId === null : slot?.available === true && slot.combined)
  const tableStepWrong = checkTime && timeTaken === null && guestChooses && slot !== undefined && combined

  const tables = usePublicTables(slug, date ?? '', time ?? '', partySize, guestChooses && tableId !== null && time !== null)
  const chosenArea = tables.data?.find((area) => area.tables.some((option) => option.id === tableId))
  const table = chosenArea?.tables.find((option) => option.id === tableId)
  const checkTable = checkTime && timeTaken === null && guestChooses && tableId !== null
  const tableTaken = checkTable && tables.data !== undefined && table?.available !== true

  // Wait for the checks (and the release of a hold) before the step is shown; a failed check leaves it to the booking itself.
  const checking = (checkTime && availability.isPending) || (checkTable && tables.isPending) || (step === 'table' && releasing > 0)

  /*
   * The hold: at the contact details the table (or the one the system assigns) is held for 5 minutes, so nobody takes it while
   * the guest types. It is released when the guest leaves the step (back to the table, to the card, closing the dialog, another
   * time) or the page, and the booking turns it into the reservation.
   */
  const holdKey =
    step === 'details' && date !== null && time !== null && !booking.isSuccess
      ? JSON.stringify({ date, time, guests: partySize, tableId: guestChooses ? tableId : null } satisfies HoldRequest)
      : null
  const [holdResult, setHoldResult] = useState<{ key: string; hold: Hold | null; error: Error | null } | null>(null)
  // The hold the booking is using: once booked it is the reservation, and releasing it would only answer 404.
  const bookingHold = useRef<string | null>(null)
  useEffect(() => {
    if (holdKey === null) {
      return
    }
    let active = true
    let token: string | null = null
    const leavePage = () => {
      if (token !== null && token !== bookingHold.current) {
        void releaseHold(slug, token)
      }
    }
    createHold(slug, JSON.parse(holdKey) as HoldRequest).then(
      (hold) => {
        if (active) {
          token = hold.holdToken
          setHoldResult({ key: holdKey, hold, error: null })
        } else {
          void releaseHold(slug, hold.holdToken)
        }
      },
      (error: Error) => {
        if (active) {
          setHoldResult({ key: holdKey, hold: null, error })
          // The guest gets the times that are free now.
          void reloadAvailability()
        }
      },
    )
    window.addEventListener('pagehide', leavePage)
    return () => {
      active = false
      window.removeEventListener('pagehide', leavePage)
      if (token !== null && token !== bookingHold.current) {
        setReleasing((count) => count + 1)
        void releaseHold(slug, token)
          .then(reloadAvailability)
          .finally(() => setReleasing((count) => count - 1))
      }
    }
  }, [holdKey, slug, reloadAvailability])
  const holdState = holdKey !== null && holdResult?.key === holdKey ? holdResult : null
  const holdError = holdState?.error instanceof ApiError ? holdState.error.code : null

  // The time or table was taken: by the hold or, after it expired or when staff took the table, by the booking.
  const bookingError = booking.isError && booking.error instanceof ApiError ? booking.error.code : null
  const unavailableCode = bookingError !== null && bookingError in timeErrors ? bookingError : holdError !== null && holdError in timeErrors ? holdError : null
  const unavailable: ParseKeys | null = step === 'details' && unavailableCode !== null ? timeErrors[unavailableCode] : null
  const freshTimes = useAvailability(slug, date ?? '', partySize, unavailable !== null && date !== null)

  const correction =
    timeTaken !== null
      ? writeState(searchParams, { ...state, step: 'time', time: null, tableId: null }).toString()
      : tableTaken
        ? writeState(searchParams, { ...state, step: 'table', tableId: null }).toString()
        : tableStepWrong
          ? writeState(searchParams, { ...state, step: 'details', tableId: null }).toString()
          : holdError === 'table_required'
            ? writeState(searchParams, { ...state, step: 'table' }).toString()
            : holdError === 'invalid_party_size'
              ? writeState(searchParams, { ...state, step: 'time', time: null, tableId: null }).toString()
              : null
  useEffect(() => {
    if (correction !== null) {
      setSearchParams(correction, { replace: true, state: timeTaken !== null ? { timeNotice: timeTaken } : undefined })
    }
  }, [timeTaken, correction, setSearchParams])

  /**
   * Stores the new choices. Moving to another step adds an entry to the browser history, so the back button returns
   * to the current step with the choice made in it; within a step, the entry is replaced. The entries of the dialog's steps
   * know how far back the time step is (DialogEntry).
   */
  const go = async (next: Omit<BookingState, 'step'>, nextStep: Step) => {
    booking.reset()
    const depth = dialogDepth(location.state)
    const keep: DialogEntry | undefined = step !== 'time' && depth !== null ? { dialogDepth: depth } : undefined
    const current = `?${writeState(searchParams, { ...next, step })}`
    if (nextStep === step) {
      await navigate({ search: current }, { replace: true, state: keep })
      return
    }
    // One navigation after the other: a second one started right away would cancel the first.
    if (current !== `?${searchParams}`) {
      await navigate({ search: current }, { replace: true, state: keep })
    }
    const entry: DialogEntry | undefined =
      nextStep === 'time' ? undefined : { dialogDepth: step === 'time' ? 1 : depth !== null ? depth + 1 : 1 }
    await navigate({ search: `?${writeState(searchParams, { ...next, step: nextStep })}` }, { state: entry })
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
    const onlyCombined = guestChooses && dayAvailability.data?.periods.flatMap((period) => period.times).find((option) => option.time === value)?.combined === true
    const next = { guests: partySize, date: day, time: value, tableId: value !== time || onlyCombined ? null : tableId }
    void go(next, onlyCombined ? 'details' : afterTime)
  }

  /** A time on another day in one step, e.g. one offered for a fully booked day; `onlyCombined` as the time's `combined`. */
  const chooseDayAndTime = (dayValue: string, value: string, onlyCombined: boolean) =>
    void go({ guests: partySize, date: dayValue, time: value, tableId: null }, guestChooses && onlyCombined ? 'details' : afterTime)

  const chooseTable = (value: string) => void go({ guests, date, time, tableId: value }, 'table')

  /** Moves to a step of the booking (e.g. from the summary in the dialog's head), keeping what is chosen. */
  const goToStep = (target: Step) => void go(state, target)

  /**
   * The Back button of the dialog: from the contact details to the table, through the history where the dialog's entries know
   * the way (the browser's back button does the same), otherwise in place.
   */
  const goBack = () => {
    const depth = dialogDepth(location.state)
    if (depth !== null && depth > 1) {
      void navigate(-1)
    } else {
      setSearchParams(writeState(searchParams, { ...state, step: 'table' }), { replace: true, state: location.state })
    }
  }

  // The idempotency key of the booking: one per opening of the dialog, so a repeated attempt (e.g. after a lost answer) does not
  // book twice, and a new booking after closing it gets a new one.
  const dialogOpen = step !== 'time' || booking.isSuccess
  const [idempotency, setIdempotency] = useState({ open: false, key: '' })
  if (dialogOpen !== idempotency.open) {
    setIdempotency({ open: dialogOpen, key: dialogOpen ? randomId() : '' })
  }

  /**
   * Closes the dialog and returns to the time: back through the history to the time step where the dialog's entries know
   * the way (DialogEntry), otherwise (e.g. after a correction) in place. After the booking it starts a new one.
   */
  const closeDialog = () => {
    if (booking.isSuccess) {
      booking.reset()
      return
    }
    const depth = dialogDepth(location.state)
    if (depth !== null) {
      void navigate(-depth)
    } else {
      setSearchParams(writeState(searchParams, { ...state, step: 'time' }), { replace: true })
    }
  }

  /** `values.phone` is the number in international form (GuestDetailsForm). */
  const submit = (values: GuestDetailsValues) => {
    if (date === null || time === null) {
      return
    }
    const optional = (value: string) => (value.trim() === '' ? null : value.trim())
    const holdToken = holdState?.hold?.holdToken ?? null
    bookingHold.current = holdToken
    booking.mutate(
      {
        booking: {
          date,
          time,
          guests: partySize,
          tableId: guestChooses ? tableId : null,
          name: values.name.trim(),
          phone: optional(values.phone),
          email: optional(values.email),
          notes: optional(values.notes),
          occasion: values.occasion,
          language,
          holdToken,
        },
        idempotencyKey: idempotency.key,
      },
      {
        onSuccess: (result) => {
          // So the guest finds it again on the restaurant's page, also without the link (where the browser allows storing it).
          rememberBooking({
            slug,
            code: result.referenceCode,
            token: result.manageToken,
            date: result.date,
            time: result.time,
            guests: result.guests,
            restaurantName: restaurant.name,
          })
          // The next booking starts with the remembered details, or empty.
          setDetails(initialDetails(restaurant.countryCode))
          // A reload after the booking starts a new one instead of showing the booked choices again.
          setSearchParams(writeState(searchParams, emptyState), { replace: true })
        },
        onError: (error) => {
          bookingHold.current = null
          const code = error instanceof ApiError ? error.code : null
          // A taken time or table (timeErrors) stays at the contact details: the dialog offers the nearest free times, loaded anew
          // (useCreateBooking), and keeps what the guest typed.
          if (code === 'table_required') {
            setSearchParams(writeState(searchParams, { ...state, step: 'table' }), { replace: true })
          } else if (code === 'invalid_party_size') {
            setSearchParams(writeState(searchParams, { ...state, step: 'time', time: null, tableId: null }), { replace: true })
          }
        },
      },
    )
  }

  return {
    step,
    date,
    time,
    tableId,
    partySize,
    tooLarge,
    /** The chosen day or the preset first free day; null while it is not known yet. */
    day,
    today,
    lastDay,
    guestChooses,
    /** Only a combination of tables is free at the chosen time, which the system assigns: there is no table step. */
    combined,
    request: restaurant.confirmationMode === 'Request',
    timeNotice,
    /** The chosen time and table are being checked; the step waits for it. */
    checking,
    /** The chosen table and its area, once loaded. */
    table,
    chosenArea,
    /** The dialog is open from the table or the contact details on, and with the confirmation. */
    dialogOpen,
    /** The table held for the guest at the contact details; null while it is being held, without and after a failed hold. */
    hold: holdState?.hold ?? null,
    /**
     * Why the guest has to choose another time at the contact details (the hold or the booking found the time or table taken);
     * `nearbyTimes` are the nearest free times of the day then, loaded anew.
     */
    unavailable,
    nearbyTimes: unavailable === null ? [] : nearbyTimes(freshTimes.data, time, guestChooses),
    nearbyTimesPending: unavailable !== null && freshTimes.isPending,
    details,
    setDetails,
    submitting: booking.isPending,
    result: booking.isSuccess ? booking.data : null,
    error: booking.isError ? bookingErrorMessage(booking.error, t) : null,
    chooseGuests,
    chooseDate,
    chooseTime,
    chooseDayAndTime,
    chooseTable,
    goToStep,
    goBack,
    closeDialog,
    submit,
  }
}

export type BookingFlowState = ReturnType<typeof useBookingFlow>
