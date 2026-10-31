import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useCurrentUser } from './auth.ts'
import { apiGet, apiPost, apiPut } from './client.ts'

export type ReservationStatus = 'Requested' | 'Confirmed' | 'Arrived' | 'Late' | 'Cancelled' | 'Declined' | 'NoShow' | 'Completed'

/** Online: booked by the guest; Staff: entered by the restaurant, e.g. on the phone; WalkIn: a guest without a reservation. */
export type ReservationSource = 'Online' | 'Staff' | 'WalkIn'

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
  /** When the guest left ("HH:mm", status Completed); null otherwise. */
  completedTime: string | null
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

/** The tables free for a walk-in now, as returned by GET /api/staff/walk-in-tables; the suggested table first. */
export type WalkInTables = {
  time: string
  durationMinutes: number
  tables: FreeTable[]
}

/** A guest without a reservation, seated now. Without `tableId` the system assigns a table; without `name` it is "Walk-in". */
export type WalkInInput = {
  guests: number
  tableId: string | null
  name: string | null
  phone: string | null
  notes: string | null
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
const walkInTablesKey = ['staff', 'walk-in-tables'] as const

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

/** The tables free for a walk-in of `guests` now, for the restaurant's duration. */
export function useWalkInTables(guests: number | null) {
  return useQuery({
    queryKey: [...walkInTablesKey, guests],
    queryFn: () => apiGet<WalkInTables>(`/staff/walk-in-tables?guests=${guests}`),
    enabled: guests !== null && guests >= 1,
  })
}

/**
 * Today's date ("YYYY-MM-DD") in the restaurant's time zone, as the server counts it; null while it loads.
 * Falls back to the device's date when the restaurant has no location yet or the restaurant could not be read.
 */
export function useRestaurantToday() {
  return useRestaurantNow()?.date ?? null
}

/** The current date and time in the restaurant's time zone: the date "YYYY-MM-DD" and the minutes since midnight. */
export type RestaurantNow = { date: string; minutes: number }

/**
 * The current date and time in the restaurant's time zone, as the server counts it, updated every minute; null while it loads.
 * Falls back to the device's time when the restaurant has no location yet or the restaurant could not be read.
 */
export function useRestaurantNow(): RestaurantNow | null {
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
    return { date: dayjs(now).format('YYYY-MM-DD'), minutes: now.getHours() * 60 + now.getMinutes() }
  }
  // Swedish formats dates as YYYY-MM-DD and times as HH:mm.
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return { date: `${part('year')}-${part('month')}-${part('day')}`, minutes: Number(part('hour')) * 60 + Number(part('minute')) }
}

/** Shows the changed reservation right away and reloads the lists and free times, which the change may affect. */
async function applyChange(queryClient: QueryClient, changed: Reservation) {
  queryClient.setQueriesData<Reservation[]>({ queryKey: reservationsKey }, (reservations) =>
    reservations?.map((reservation) => (reservation.id === changed.id ? changed : reservation)),
  )
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: reservationsKey }),
    queryClient.invalidateQueries({ queryKey: availabilityKey }),
    queryClient.invalidateQueries({ queryKey: walkInTablesKey }),
  ])
}

/**
 * Sets the status of a reservation and updates the lists. Also usable outside a component, e.g. from the "Undo" button of a
 * notification that outlives the component that showed it.
 */
export async function setReservationStatus(queryClient: QueryClient, id: string, status: ReservationStatus) {
  let changed: Reservation
  try {
    changed = await apiPost<Reservation>(`/staff/reservations/${encodeURIComponent(id)}/status`, { status })
  } catch (error) {
    // Usually someone else changed the reservation in the meantime: show its current status.
    void queryClient.invalidateQueries({ queryKey: reservationsKey })
    throw error
  }
  await applyChange(queryClient, changed)
  return changed
}

export function useSetReservationStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReservationStatus }) => setReservationStatus(queryClient, id, status),
  })
}

/** Seats a guest without a reservation now; the reservation starts as arrived. */
export function useCreateWalkIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (walkIn: WalkInInput) => apiPost<Reservation>('/staff/walk-ins', walkIn),
    onSuccess: (reservation) => applyChange(queryClient, reservation),
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
