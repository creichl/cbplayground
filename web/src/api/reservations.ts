import type { MantineColor } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from './client.ts'

export type ReservationStatus = 'Requested' | 'Confirmed' | 'Arrived' | 'Late' | 'Cancelled' | 'Declined'

/** A reservation as returned by /api/staff/reservations. Date is "YYYY-MM-DD", times are "HH:mm" in the restaurant's local time; the end may be "24:00". */
export type Reservation = {
  id: string
  referenceCode: string
  date: string
  time: string
  endTime: string
  durationMinutes: number
  guests: number
  status: ReservationStatus
  source: 'Online' | 'Staff'
  tableId: string
  tableNumber: string
  areaId: string
  areaName: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  language: string
  createdAtUtc: string
  updatedAtUtc: string
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

/** The colour of every reservation status. The only place they are defined. */
export const statusColors: Record<ReservationStatus, MantineColor> = {
  Requested: 'yellow',
  Confirmed: 'blue',
  Arrived: 'green',
  Late: 'orange',
  Cancelled: 'gray',
  Declined: 'gray',
}

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

/** Staff data refreshes this often, so changes from other devices and new online bookings show up. */
const refreshInterval = 60_000

const reservationsKey = ['staff', 'reservations'] as const

/** The areas in their order with their tables. */
export function useFloor() {
  return useQuery({
    queryKey: ['staff', 'floor'],
    queryFn: () => apiGet<FloorArea[]>('/staff/floor'),
    refetchInterval: refreshInterval,
  })
}

/** The reservations starting on `date` ("YYYY-MM-DD"), sorted by start. */
export function useDayReservations(date: string) {
  return useQuery({
    queryKey: [...reservationsKey, date],
    queryFn: () => apiGet<Reservation[]>(`/staff/reservations?from=${date}&to=${date}`),
    refetchInterval: refreshInterval,
  })
}

/**
 * The opening windows of `date`, holidays included; empty when the restaurant is closed.
 * Taken from the staff availability, the only opening hours front desk users may read.
 */
export function useOpenPeriods(date: string) {
  return useQuery({
    queryKey: ['staff', 'open-periods', date],
    queryFn: async () => {
      const availability = await apiGet<{ periods: OpenPeriod[] }>(`/staff/availability?date=${date}&guests=1`)
      return availability.periods.map(({ start, end }) => ({ start, end }))
    },
  })
}

/** Changes the status of a reservation and puts the answer into the day's list right away. */
export function useSetReservationStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReservationStatus }) =>
      apiPost<Reservation>(`/staff/reservations/${id}/status`, { status }),
    onSuccess: (saved) =>
      queryClient.setQueryData<Reservation[]>([...reservationsKey, saved.date], (reservations) =>
        reservations?.map((reservation) => (reservation.id === saved.id ? saved : reservation)),
      ),
    // A failed change (e.g. changed on another device in the meantime) reloads the lists.
    onError: () => queryClient.invalidateQueries({ queryKey: reservationsKey }),
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
