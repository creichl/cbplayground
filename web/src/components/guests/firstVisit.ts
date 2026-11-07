import type { Reservation } from '../../api/reservations.ts'

/** The statuses at which the guest came, as the server counts the visits. */
const visitStatuses: readonly Reservation['status'][] = ['Arrived', 'Completed']

/** Whether the guest comes for the first time: their profile has no visit apart from this reservation. */
export function isFirstVisit(reservation: Pick<Reservation, 'guest' | 'status'>) {
  if (reservation.guest === null) {
    return false
  }
  return reservation.guest.visits - (visitStatuses.includes(reservation.status) ? 1 : 0) === 0
}
