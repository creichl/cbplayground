import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useCurrentUser } from './auth.ts'
import { apiGet, apiPost, apiPut } from './client.ts'

export type ReservationStatus = 'Requested' | 'Confirmed' | 'Arrived' | 'Late' | 'Cancelled' | 'Declined'

/** Online: booked by the guest; Staff: entered by the restaurant, e.g. on the phone. */
export type ReservationSource = 'Online' | 'Staff'

/** A reservation, as returned by /api/staff/reservations. Dates are "YYYY-MM-DD", times "HH:mm" in the restaurant's local time; the end may be "24:00". */
export type Reservation = {
  id: string
  referenceCode: string
  date: string
  time: string
  endTime: string
  durationMinutes: number
  guests: number
  status: ReservationStatus
  source: ReservationSource
  tableId: string
  tableNumber: string
  areaId: string
  areaName: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  language: string
  /** The guest cancelled through the link of their online booking. */
  cancelledByGuest: boolean
  createdAtUtc: string
  updatedAtUtc: string
}

/** A table that is free for the whole duration, in the order the system would assign them. */
export type FreeTable = {
  id: string
  number: string
  seats: number
  areaId: string
  areaName: string
}

/** The start times of a day for the staff, as returned by GET /api/staff/availability. */
export type StaffAvailability = {
  date: string
  guests: number
  durationMinutes: number
  periods: { start: string; end: string; times: { time: string; tables: FreeTable[] }[] }[]
}

/** A table on the staff floor; the position is relative to the floor plan image, 0–1. */
export type FloorTable = {
  id: string
  number: string
  seats: number
  posX: number
  posY: number
}

/** An area with its tables, as returned by GET /api/staff/floor. */
export type FloorArea = {
  id: string
  name: string
  sortOrder: number
  floorPlanUrl: string | null
  tables: FloorTable[]
}

/** An opening window of a day, "HH:mm"; the end may be "24:00". */
export type OpenPeriod = { start: string; end: string }

/** Statuses in which a reservation occupies its table, as on the server. */
export const blockingStatuses: readonly ReservationStatus[] = ['Requested', 'Confirmed', 'Arrived', 'Late']

/** The status changes the server allows (Reservations/ReservationRules.cs), except the undo of "arrived". */
export const statusActions: Record<ReservationStatus, readonly Exclude<ReservationStatus, 'Requested'>[]> = {
  Requested: ['Confirmed', 'Declined'],
  Confirmed: ['Arrived', 'Late', 'Cancelled'],
  Late: ['Arrived', 'Cancelled'],
  Arrived: [],
  Cancelled: [],
  Declined: [],
}

/**
 * A new or changed reservation. Without `tableId` the system assigns a table, without `durationMinutes`
 * the restaurant's duration for the party size applies. The language is left to the server.
 */
export type ReservationInput = {
  date: string
  time: string
  guests: number
  tableId: string | null
  durationMinutes: number | null
  name: string
  phone: string | null
  email: string | null
  notes: string | null
}

/** Online bookings are possible at most this many days ahead (MaxOnlineDaysAhead on the server), so no request lies further ahead. */
const maxRequestDaysAhead = 90

/** The front desk sees new online bookings without reloading the page. */
const refreshIntervalMs = 60_000

const reservationsKey = ['staff', 'reservations'] as const
const availabilityKey = ['staff', 'availability'] as const

function reservationsQuery(from: string | null, to: string | null) {
  return queryOptions({
    queryKey: [...reservationsKey, from, to],
    queryFn: () => apiGet<Reservation[]>(`/staff/reservations?from=${from}&to=${to}`),
    enabled: from !== null && to !== null,
    refetchInterval: refreshIntervalMs,
  })
}

/** The reservations starting from `from` to `to` (inclusive), sorted by start. Reloaded every minute. */
export function useReservations(from: string | null, to: string | null = from) {
  return useQuery(reservationsQuery(from, to))
}

/** The requests from today on that wait for the restaurant's answer, sorted by start. Reloaded every minute. */
export function useOpenRequests(today: string | null) {
  const to = today === null ? null : dayjs(today).add(maxRequestDaysAhead, 'day').format('YYYY-MM-DD')
  return useQuery({
    ...reservationsQuery(today, to),
    select: (reservations) => reservations.filter((reservation) => reservation.status === 'Requested'),
  })
}

/** The free start times and tables of a day. Without `durationMinutes` the restaurant's duration for the party size applies. */
export function useStaffAvailability(date: string | null, guests: number | null, durationMinutes: number | null) {
  return useQuery({
    queryKey: [...availabilityKey, date, guests, durationMinutes],
    queryFn: () =>
      apiGet<StaffAvailability>(
        `/staff/availability?date=${date}&guests=${guests}${durationMinutes === null ? '' : `&durationMinutes=${durationMinutes}`}`,
      ),
    enabled: date !== null && guests !== null && guests >= 1,
  })
}

/** The areas in their order with their tables, for choosing a table and for the table overview. Reloaded every minute. */
export function useFloor() {
  return useQuery({
    queryKey: ['staff', 'floor'],
    queryFn: () => apiGet<FloorArea[]>('/staff/floor'),
    refetchInterval: refreshIntervalMs,
  })
}

/**
 * The opening windows of `date`, holidays included; empty when the restaurant is closed.
 * Taken from the staff availability, the only opening hours front desk users may read.
 */
export function useOpenPeriods(date: string) {
  return useQuery({
    queryKey: [...availabilityKey, 'open-periods', date],
    queryFn: async () => {
      const availability = await apiGet<{ periods: OpenPeriod[] }>(`/staff/availability?date=${date}&guests=1`)
      return availability.periods.map(({ start, end }) => ({ start, end }))
    },
  })
}

/**
 * Today's date ("YYYY-MM-DD") in the restaurant's time zone, as the server counts it; null while it loads.
 * Falls back to the device's date when the restaurant has no location yet or the restaurant could not be read.
 */
export function useRestaurantToday() {
  const currentUser = useCurrentUser()
  const slug = currentUser.data?.tenant?.slug ?? null
  const restaurant = useQuery({
    queryKey: ['public', 'restaurant', slug],
    queryFn: () => apiGet<{ timeZoneId: string | null }>(`/public/restaurants/${encodeURIComponent(slug ?? '')}`),
    enabled: slug !== null,
    staleTime: Infinity,
  })
  // Checked every minute, so a page left open over midnight moves on to the new day.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), refreshIntervalMs)
    return () => clearInterval(timer)
  }, [])

  if (slug !== null && restaurant.isPending) {
    return null
  }
  const timeZone = restaurant.data?.timeZoneId
  if (timeZone === undefined || timeZone === null) {
    return dayjs(now).format('YYYY-MM-DD')
  }
  // Swedish formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Shows the changed reservation right away and reloads the lists and free times, which the change may affect. */
async function applyChange(queryClient: QueryClient, changed: Reservation) {
  queryClient.setQueriesData<Reservation[]>({ queryKey: reservationsKey }, (reservations) =>
    reservations?.map((reservation) => (reservation.id === changed.id ? changed : reservation)),
  )
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: reservationsKey }),
    queryClient.invalidateQueries({ queryKey: availabilityKey }),
  ])
}

export function useSetReservationStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReservationStatus }) =>
      apiPost<Reservation>(`/staff/reservations/${encodeURIComponent(id)}/status`, { status }),
    onSuccess: (reservation) => applyChange(queryClient, reservation),
    // Usually someone else changed the reservation in the meantime: show its current status.
    onError: () => queryClient.invalidateQueries({ queryKey: reservationsKey }),
  })
}

/** A reservation entered by the staff, e.g. on the phone; it is always confirmed. */
export function useCreateReservation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reservation: ReservationInput) => apiPost<Reservation>('/staff/reservations', reservation),
    onSuccess: (reservation) => applyChange(queryClient, reservation),
  })
}

export function useUpdateReservation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...reservation }: ReservationInput & { id: string }) =>
      apiPut<Reservation>(`/staff/reservations/${encodeURIComponent(id)}`, reservation),
    onSuccess: (reservation) => applyChange(queryClient, reservation),
  })
}

/** Minutes since midnight of "HH:mm"; "24:00" is 1440. */
export function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** "HH:mm" of minutes since midnight. */
export function formatMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
