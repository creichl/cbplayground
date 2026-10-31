import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Language } from '../i18n/index.ts'
import { ApiError, apiGet, apiPost } from './client.ts'
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

/** A table on an area's floor plan; the position is relative to the image, 0–1. */
export type PublicTable = { id: string; number: string; seats: number; posX: number; posY: number; available: boolean }

/** An area open for online booking with all its tables. */
export type PublicArea = { id: string; name: string; floorPlanUrl: string | null; tables: PublicTable[] }

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

/**
 * Up to three available days after `date`, up to the month of `lastDate`, for "next free days".
 * Only loads while `enabled`; `isPending` until all months are loaded.
 */
export function useNextFreeDays(slug: string, date: string, lastDate: string, guests: number, enabled: boolean) {
  const months: string[] = []
  if (enabled) {
    let [year, month] = date.split('-').map(Number)
    const [lastYear, lastMonth] = lastDate.split('-').map(Number)
    while (year < lastYear || (year === lastYear && month <= lastMonth)) {
      months.push(`${year}-${String(month).padStart(2, '0')}`)
      month = month === 12 ? 1 : month + 1
      year = month === 1 ? year + 1 : year
    }
  }
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
