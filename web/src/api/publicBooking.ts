import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Language } from '../i18n/index.ts'
import { ApiError, apiGet, apiPost } from './client.ts'
import type { RoomElement, RoomStyle, TableRotation, TableShape } from './areas.ts'
import type { Branding } from './branding.ts'
import type { OpeningPeriod } from './openingHours.ts'
import type { ConfirmationMode, TableSelectionMode } from './reservationSettings.ts'

/** A restaurant for the guest booking, as returned by GET /api/public/restaurants/{slug}. Empty profile fields are null. */
export type PublicRestaurant = {
  name: string
  street: string | null
  postalCode: string | null
  city: string | null
  phone: string | null
  email: string | null
  website: string | null
  description: string | null
  timeZoneId: string | null
  confirmationMode: ConfirmationMode
  tableSelectionMode: TableSelectionMode
  /** The largest party that can be booked online; larger parties have to call. */
  maxOnlinePartySize: number
  /** Online bookings reach at most this many days after today. */
  bookingHorizonDays: number
  openingHours: OpeningPeriod[]
  /** False without location, opening hours or tables that can be booked online. */
  bookable: boolean
  /** Colour, light or dark, fonts, logo and cover image of the restaurant's guest pages. */
  branding: Branding
}

/** A day of the date picker. "closed" also covers closing days, days in the past and days beyond the restaurant's booking horizon. */
export type CalendarDay = { date: string; status: 'closed' | 'full' | 'available' }

/** The start times of a day, per opening window. Times are "HH:mm". */
export type Availability = {
  date: string
  guests: number
  durationMinutes: number
  periods: { start: string; end: string; times: { time: string; available: boolean }[] }[]
}

/** A table on an area's floor plan; the position is relative to the plan (image or schematic plan), 0–1. */
export type PublicTable = {
  id: string
  number: string
  seats: number
  posX: number
  posY: number
  shape: TableShape
  rotation: TableRotation
  available: boolean
}

/**
 * An area open for online booking with all its tables; `tableScale` (50–200 %) scales the drawn tables. Without floor plan
 * image the plan is drawn as a room of `roomStyle` with `roomElements`. `description` and `photoUrl` (a photo of the area,
 * not its floor plan) are null when the restaurant has not given them.
 */
export type PublicArea = {
  id: string
  name: string
  floorPlanUrl: string | null
  description: string | null
  photoUrl: string | null
  tableScale: number
  tables: PublicTable[]
  roomStyle: RoomStyle
  roomElements: RoomElement[]
}

export type BookingRequest = {
  /** "YYYY-MM-DD" and "HH:mm". */
  date: string
  time: string
  guests: number
  /** Required when the guest chooses the table, ignored otherwise. */
  tableId: string | null
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  language: Language
}

/** A booked table: "Confirmed" in the instant mode, "Requested" in the request mode. */
export type BookingResult = {
  referenceCode: string
  status: 'Confirmed' | 'Requested'
  date: string
  time: string
  guests: number
  durationMinutes: number
  area: string
  tableNumber: string
  /** Belongs in the guest's link to view and cancel the reservation (managePath); only returned by the booking. */
  manageToken: string
}

/** A reservation as the guest sees it through the link, as returned by GET /api/public/restaurants/{slug}/reservations/{code}. */
export type GuestReservation = {
  referenceCode: string
  status: 'Requested' | 'Confirmed' | 'Arrived' | 'Late' | 'Cancelled' | 'Declined'
  /** "YYYY-MM-DD"; times "HH:mm" in the restaurant's local time, the end may be "24:00". */
  date: string
  time: string
  endTime: string
  guests: number
  durationMinutes: number
  area: string
  tableNumber: string
  name: string
  cancelledByGuest: boolean
  /** Whether the guest can still cancel online: an open reservation before its start. */
  canCancel: boolean
}

/** The path of the guest's page to view and cancel a reservation; the token stays in the link only. */
export function managePath(slug: string, referenceCode: string, token: string) {
  return `/r/${encodeURIComponent(slug)}/reservation/${encodeURIComponent(referenceCode)}?t=${encodeURIComponent(token)}`
}

/** Maximum lengths of the guest's details, as on the server. */
export const guestMaxLengths = { name: 100, phone: 30, email: 254, notes: 500 } as const

/** Same rule as on the server: at least 6 digits, an optional leading "+" and the usual separators. */
export function isValidPhone(value: string) {
  return value.replace(/[^0-9]/g, '').length >= 6 && /^\+?[0-9 ()./-]+$/.test(value)
}

/** The restaurant's local date "YYYY-MM-DD" today; "now" of the bookings is always the restaurant's time zone. */
export function todayIn(timeZoneId: string) {
  // The Canadian English format is "YYYY-MM-DD".
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZoneId, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** The restaurant's local time "HH:mm" now. */
export function nowIn(timeZoneId: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timeZoneId, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
}

/** Whether a request was refused because the restaurant does not exist. */
export function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

const publicKey = (slug: string) => ['public', slug] as const

function calendarQuery(slug: string, month: string, guests: number) {
  return {
    queryKey: [...publicKey(slug), 'calendar', month, guests],
    queryFn: () => apiGet<CalendarDay[]>(`/public/restaurants/${encodeURIComponent(slug)}/calendar?month=${month}&guests=${guests}`),
  }
}

export function usePublicRestaurant(slug: string) {
  return useQuery({
    queryKey: publicKey(slug),
    queryFn: () => apiGet<PublicRestaurant>(`/public/restaurants/${encodeURIComponent(slug)}`),
    // An unknown restaurant does not appear by asking again.
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
  })
}

/** The days of a month ("YYYY-MM") for a party size. */
export function useBookingCalendar(slug: string, month: string, guests: number) {
  return useQuery(calendarQuery(slug, month, guests))
}

/** The months "YYYY-MM" from the month of `date` to the month of `lastDate`. */
function monthsBetween(date: string, lastDate: string) {
  const months: string[] = []
  let [year, month] = date.split('-').map(Number)
  const [lastYear, lastMonth] = lastDate.split('-').map(Number)
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month = month === 12 ? 1 : month + 1
    year = month === 1 ? year + 1 : year
  }
  return months
}

/**
 * Up to three available days after `date`, up to the month of `lastDate`, for "next free days".
 * Only loads while `enabled`; `isPending` until all months are loaded.
 */
export function useNextFreeDays(slug: string, date: string, lastDate: string, guests: number, enabled: boolean) {
  const months = enabled ? monthsBetween(date, lastDate) : []
  const results = useQueries({ queries: months.map((month) => calendarQuery(slug, month, guests)) })
  return {
    days: results
      .flatMap((result) => result.data ?? [])
      .filter((day) => day.status === 'available' && day.date > date)
      .slice(0, 3)
      .map((day) => day.date),
    isPending: results.some((result) => result.isPending),
  }
}

/**
 * The first available day from `today` to `lastDate`, the booking's preset day; null when there is none. The months are
 * loaded one after the other, only as far as needed. `isPending` until the day is known.
 */
export function useFirstFreeDay(slug: string, today: string, lastDate: string, guests: number, enabled: boolean) {
  const queryClient = useQueryClient()
  const isFree = (day: CalendarDay) => day.status === 'available' && day.date >= today && day.date <= lastDate
  // A month is only loaded once the months before it are loaded and have no available day.
  const queries = []
  let load = true
  for (const month of enabled ? monthsBetween(today, lastDate) : []) {
    const query = calendarQuery(slug, month, guests)
    queries.push({ ...query, enabled: load })
    const days = queryClient.getQueryData<CalendarDay[]>(query.queryKey)
    load = load && days !== undefined && !days.some(isFree)
  }
  const results = useQueries({ queries })
  for (const result of results) {
    if (result.data === undefined) {
      // Still loading, or failed: then the booking starts at today.
      return { day: null, isPending: result.isPending && enabled }
    }
    const day = result.data.find(isFree)
    if (day !== undefined) {
      return { day: day.date, isPending: false }
    }
  }
  return { day: null, isPending: false }
}

/** The start times of a day; only loads while `enabled`. */
export function useAvailability(slug: string, date: string, guests: number, enabled = true) {
  return useQuery({
    queryKey: [...publicKey(slug), 'availability', date, guests],
    queryFn: () => apiGet<Availability>(`/public/restaurants/${encodeURIComponent(slug)}/availability?date=${date}&guests=${guests}`),
    enabled,
  })
}

/** The areas with their tables for a time; only for restaurants in which the guest chooses the table. Only loads while `enabled`. */
export function usePublicTables(slug: string, date: string, time: string, guests: number, enabled = true) {
  return useQuery({
    queryKey: [...publicKey(slug), 'tables', date, time, guests],
    queryFn: () =>
      apiGet<PublicArea[]>(`/public/restaurants/${encodeURIComponent(slug)}/tables?date=${date}&time=${time}&guests=${guests}`),
    enabled,
  })
}

const guestReservationKey = (slug: string, referenceCode: string, token: string) =>
  [...publicKey(slug), 'reservation', referenceCode, token] as const

const guestReservationPath = (slug: string, referenceCode: string) =>
  `/public/restaurants/${encodeURIComponent(slug)}/reservations/${encodeURIComponent(referenceCode)}`

/** The guest's reservation; a wrong code or token is 404 (isNotFound) without telling which one. */
export function useGuestReservation(slug: string, referenceCode: string, token: string) {
  return useQuery({
    queryKey: guestReservationKey(slug, referenceCode, token),
    queryFn: () => apiGet<GuestReservation>(`${guestReservationPath(slug, referenceCode)}?token=${encodeURIComponent(token)}`),
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
    // The link is rate limited like the booking; switching tabs should not use up the requests.
    refetchOnWindowFocus: false,
  })
}

/** Cancels the guest's reservation. Errors: 409 "cancellation_not_possible", 404 for a wrong code or token. */
export function useCancelGuestReservation(slug: string, referenceCode: string, token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<GuestReservation>(`${guestReservationPath(slug, referenceCode)}/cancel`, { token }),
    onSuccess: (reservation) => queryClient.setQueryData(guestReservationKey(slug, referenceCode, token), reservation),
    // The free times of the restaurant change with the cancellation.
    onSettled: () => queryClient.invalidateQueries({ queryKey: publicKey(slug) }),
  })
}

/** Books a table. Afterwards, and after a failed attempt, the free days, times and tables are loaded anew. */
export function useCreateBooking(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (booking: BookingRequest) =>
      apiPost<BookingResult>(`/public/restaurants/${encodeURIComponent(slug)}/reservations`, booking),
    onSettled: () => queryClient.invalidateQueries({ queryKey: publicKey(slug) }),
  })
}
