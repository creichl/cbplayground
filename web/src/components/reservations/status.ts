import type { MantineColor } from '@mantine/core'
import type { ParseKeys } from 'i18next'
import type { Reservation, ReservationStatus } from '../../api/reservations.ts'

/** One colour per status, the same everywhere reservations are shown (lists, badges, table overview). */
export const statusColors: Record<ReservationStatus, MantineColor> = {
  Requested: 'yellow',
  Confirmed: 'blue',
  Arrived: 'green',
  Late: 'orange',
  Cancelled: 'red',
  Declined: 'gray',
}

export const statusLabels: Record<ReservationStatus, ParseKeys> = {
  Requested: 'reservations.status.requested',
  Confirmed: 'reservations.status.confirmed',
  Arrived: 'reservations.status.arrived',
  Late: 'reservations.status.late',
  Cancelled: 'reservations.status.cancelled',
  Declined: 'reservations.status.declined',
}

/** The statuses that are listed in the filter, in the order of a reservation's life. */
export const statuses = Object.keys(statusColors) as ReservationStatus[]

/** Whether the reservation still counts: cancelled and declined ones do not occupy a table and are not expected. */
export function isActive(reservation: Pick<Reservation, 'status'>) {
  return reservation.status !== 'Cancelled' && reservation.status !== 'Declined'
}
