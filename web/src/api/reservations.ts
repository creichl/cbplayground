import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import type { RoomElement, RoomStyle, TableRotation, TableShape } from './areas.ts'
import { useCurrentUser } from './auth.ts'
import { apiDelete, apiGet, apiPost, apiPut } from './client.ts'
import { guestsKey } from './guests.ts'
import { seatWaitlistEntry, updateWaitlistEntry, type WaitlistInput, waitlistKey } from './waitlist.ts'

export type ReservationStatus = 'Requested' | 'Confirmed' | 'Arrived' | 'Late' | 'Cancelled' | 'Declined' | 'NoShow' | 'Completed'

/** Online: booked by the guest; Staff: entered by the restaurant, e.g. on the phone; WalkIn: a guest without a reservation. */
export type ReservationSource = 'Online' | 'Staff' | 'WalkIn'

/** What the guests celebrate or why they come; "None" when nothing is given. The list is fixed, as on the server (Data/Reservation.cs). */
export type Occasion = 'None' | 'Birthday' | 'Anniversary' | 'Business' | 'Date' | 'Celebration' | 'Other'

/** A label the staff give a guest, from a fixed set (Data/Guest.cs). */
export type GuestTag = 'Vip' | 'Regular' | 'Press' | 'Staff' | 'Difficult'

/** What the front desk sees of the guest at a reservation; `visits` (arrived or left) includes this reservation. */
export type GuestSummary = {
  tags: GuestTag[]
  hasAllergies: boolean
  visits: number
  noShows: number
}

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
  /** The first of its tables. */
  tableId: string
  /** Its tables' numbers joined, e.g. "4 + 5" for a combination of tables. */
  tableNumber: string
  /** One of its tables was deleted after this reservation and is archived: it is on no floor plan any more, the reservation keeps it. */
  tableArchived: boolean
  /** All its tables in number order: one, or the tables of a combination. */
  tableIds: string[]
  tableNumbers: string[]
  areaId: string
  areaName: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  occasion: Occasion
  /** The guest's profile, found by the phone number or email address; null without either, e.g. for a walk-in without contact. */
  guestId: string | null
  guest: GuestSummary | null
  language: string
  /** When the guest left ("HH:mm", status Completed); null otherwise. */
  completedTime: string | null
  /** The guest cancelled through the link of their online booking. */
  cancelledByGuest: boolean
  createdAtUtc: string
  updatedAtUtc: string
}

/** Who changed a reservation: the guest (booking page or link), a staff user, or the system (e.g. the demo data). */
export type ReservationActor = 'Guest' | 'Staff' | 'System'

export type ReservationEventKind = 'Created' | 'Updated' | 'StatusChanged' | 'CancelledByGuest'

export type ReservationField = 'Date' | 'Time' | 'PartySize' | 'Table' | 'Duration' | 'Name' | 'Phone' | 'Email' | 'Notes' | 'Occasion' | 'Status'

/**
 * A changed field. The values are text: date "YYYY-MM-DD", time "HH:mm", party size and duration (minutes) as numbers, the table's
 * number, the occasion, the status; null when empty (also for no occasion).
 */
export type ReservationChange = { field: ReservationField; from: string | null; to: string | null }

/**
 * An entry of a reservation's history, as returned by GET /api/staff/reservations/{id}/history (newest first). Date and time are in the
 * restaurant's time zone; `userName` is the staff user's name at the time, null for the guest and the system.
 */
export type ReservationEvent = {
  date: string
  time: string
  actor: ReservationActor
  userName: string | null
  kind: ReservationEventKind
  changes: ReservationChange[]
}

/**
 * A table, or a combination of tables, that is free for the whole duration, in the order the system would assign them: the
 * tables first, then the combinations. `id` is the table's or the combination's, `tableIds` its tables in number order,
 * `label` (and `number`) their numbers, e.g. "4 + 5". Walk-ins only get tables.
 */
export type FreeTable = {
  kind: 'table' | 'combination'
  id: string
  tableIds: string[]
  label: string
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
  periods: { start: string; end: string; times: { time: string; tables: FreeTable[]; pacing: SlotPacing | null }[] }[]
}

/** The pacing of a 15-minute start slot: at most `max` guests may start in it, `booked` already do. */
export type SlotPacing = { max: number; booked: number }

/** A table on the staff floor; the position is relative to the plan (image or schematic plan), 0–1. */
export type FloorTable = {
  id: string
  number: string
  seats: number
  posX: number
  posY: number
  shape: TableShape
  rotation: TableRotation
}

/** An area with its tables, as returned by GET /api/staff/floor. */
export type FloorArea = {
  id: string
  name: string
  sortOrder: number
  floorPlanUrl: string | null
  description: string | null
  photoUrl: string | null
  /** Scales the drawn tables, 50–200 %. */
  tableScale: number
  tables: FloorTable[]
  /** The drawn room of an area without floor plan image. */
  roomStyle: RoomStyle
  roomElements: RoomElement[]
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
 * A new or changed reservation. `tableIds` are one table or the tables of one combination; without them the system assigns a
 * table (or, when none fits, a combination). Without `durationMinutes` the restaurant's duration for the party size applies.
 * The language is left to the server.
 */
export type ReservationInput = {
  date: string
  time: string
  guests: number
  tableIds: string[] | null
  durationMinutes: number | null
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  occasion: Occasion
}

/**
 * The longest range of GET /api/staff/reservations is 366 days (MaxListDays on the server): today and 365 days ahead, the longest
 * booking horizon a restaurant can set (MaxBookingHorizonDays), so no request lies further ahead.
 */
const maxRequestDaysAhead = 365

/** The front desk sees new online bookings without reloading the page. */
const refreshIntervalMs = 60_000

export const reservationsKey = ['staff', 'reservations'] as const
export const availabilityKey = ['staff', 'availability'] as const
export const walkInTablesKey = ['staff', 'walk-in-tables'] as const
const historyKey = ['staff', 'reservation-history'] as const

function reservationsQuery(from: string | null, to: string | null, status: ReservationStatus | null = null) {
  return queryOptions({
    queryKey: [...reservationsKey, from, to, status],
    queryFn: () => apiGet<Reservation[]>(`/staff/reservations?from=${from}&to=${to}${status === null ? '' : `&status=${status}`}`),
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
    ...reservationsQuery(today, to, 'Requested'),
    // The server sends only requests; a request answered here is updated in the list right away and leaves it before the reload.
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

/** Who changed what and when, newest first. */
export function useReservationHistory(id: string) {
  return useQuery({
    queryKey: [...historyKey, id],
    queryFn: () => apiGet<ReservationEvent[]>(`/staff/reservations/${encodeURIComponent(id)}/history`),
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
 * Taken from the staff availability, the only opening hours front desk users may read. Reloaded every minute.
 */
export function useOpenPeriods(date: string | null) {
  return useQuery({
    queryKey: [...availabilityKey, 'open-periods', date],
    queryFn: async () => {
      const availability = await apiGet<{ periods: OpenPeriod[] }>(`/staff/availability?date=${date}&guests=1`)
      return availability.periods.map(({ start, end }) => ({ start, end }))
    },
    enabled: date !== null,
    // Like the reservations and the floor, so a closing day or special hours entered meanwhile show.
    refetchInterval: refreshIntervalMs,
  })
}

/**
 * The party size a walk-in starts with in the walk-in drawer; the floor plans offer "Seat walk-in here" on the tables free now for
 * it, so the drawer opened there accepts the table.
 */
export const defaultWalkInGuests = 2

/** The tables free for a walk-in of `guests` now, for the restaurant's duration. Reloaded every minute, like the floor. */
export function useWalkInTables(guests: number | null) {
  return useQuery({
    queryKey: [...walkInTablesKey, guests],
    queryFn: () => apiGet<WalkInTables>(`/staff/walk-in-tables?guests=${guests}`),
    enabled: guests !== null && guests >= 1,
    refetchInterval: refreshIntervalMs,
  })
}

/** The current date and time in the restaurant's time zone: the date "YYYY-MM-DD" and the minutes since midnight. */
export type RestaurantNow = { date: string; minutes: number }

/**
 * The current date ("YYYY-MM-DD") and time of day (minutes since midnight) in the restaurant's time zone, as the server counts them;
 * null while it loads. Falls back to the device's clock when the restaurant has no location yet or the restaurant could not be read.
 * Updated every 30 seconds, so a page left open moves on to the new day and a line at the current time moves on.
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
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  if (slug !== null && restaurant.isPending) {
    return null
  }
  const timeZone = restaurant.data?.timeZoneId
  if (timeZone === undefined || timeZone === null) {
    return { date: dayjs(now).format('YYYY-MM-DD'), minutes: now.getHours() * 60 + now.getMinutes() }
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

/** Today's date ("YYYY-MM-DD") in the restaurant's time zone, as the server counts it; null while it loads. */
export function useRestaurantToday() {
  return useRestaurantNow()?.date ?? null
}

/** Shows the changed reservation right away and reloads the lists, free times and its history, which the change may affect. */
async function applyChange(queryClient: QueryClient, changed: Reservation) {
  queryClient.setQueriesData<Reservation[]>({ queryKey: reservationsKey }, (reservations) =>
    reservations?.map((reservation) => (reservation.id === changed.id ? changed : reservation)),
  )
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: reservationsKey }),
    queryClient.invalidateQueries({ queryKey: availabilityKey }),
    queryClient.invalidateQueries({ queryKey: walkInTablesKey }),
    queryClient.invalidateQueries({ queryKey: [...historyKey, changed.id] }),
    // The guest's figures, and the profile a change of the phone number or email address links it to.
    queryClient.invalidateQueries({ queryKey: guestsKey }),
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

/**
 * Removes an arrived walk-in, the undo of its arrival (a walk-in was never expected, so it does not become a confirmed
 * reservation), and updates the lists; a party seated from the waitlist is back on it. Also usable outside a component, e.g.
 * from the notification after seating it.
 */
export async function deleteWalkIn(queryClient: QueryClient, id: string) {
  try {
    await apiDelete(`/staff/reservations/${encodeURIComponent(id)}`)
  } catch (error) {
    // Usually someone else changed the walk-in in the meantime, e.g. the guest has left: show its current status.
    void queryClient.invalidateQueries({ queryKey: reservationsKey })
    throw error
  }
  queryClient.setQueriesData<Reservation[]>({ queryKey: reservationsKey }, (reservations) =>
    reservations?.filter((reservation) => reservation.id !== id),
  )
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: reservationsKey }),
    queryClient.invalidateQueries({ queryKey: availabilityKey }),
    queryClient.invalidateQueries({ queryKey: walkInTablesKey }),
    // A party seated from the waitlist waits again.
    queryClient.invalidateQueries({ queryKey: waitlistKey }),
  ])
}

/** Seats a guest without a reservation now; the reservation starts as arrived. */
export function useCreateWalkIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (walkIn: WalkInInput) => apiPost<Reservation>('/staff/walk-ins', walkIn),
    onSuccess: (reservation) => applyChange(queryClient, reservation),
    // Usually the table has been taken in the meantime: show the tables that are free now.
    onError: () => queryClient.invalidateQueries({ queryKey: walkInTablesKey }),
  })
}

/**
 * Seats a party of the waitlist now as a walk-in, like useCreateWalkIn; `changes` (e.g. the party size changed at the door) are
 * saved to the entry first. Returns the walk-in.
 */
export function useSeatFromWaitlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ entryId, changes, tableId }: { entryId: string; changes: WaitlistInput | null; tableId: string | null }) => {
      if (changes !== null) {
        await updateWaitlistEntry(queryClient, entryId, changes)
      }
      return (await seatWaitlistEntry(queryClient, entryId, tableId)).reservation
    },
    onSuccess: (reservation) => applyChange(queryClient, reservation),
    onError: () => queryClient.invalidateQueries({ queryKey: walkInTablesKey }),
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
