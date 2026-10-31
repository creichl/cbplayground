import type { MantineColor } from '@mantine/core'
import type { ParseKeys, TFunction } from 'i18next'
import type { ComponentType } from 'react'
import { type Reservation, type ReservationSource, type ReservationStatus, type RestaurantNow, toMinutes } from '../../api/reservations.ts'
import { BanIcon, CheckIcon, ClockIcon, DoorExitIcon, type IconProps, UndoIcon, XIcon } from '../icons.tsx'

/**
 * The one place for the statuses of a reservation: their labels, colours and the status actions of the staff.
 * The reservation lists, the table overview and the key figures all take them from here.
 */

/** One colour per status, the same everywhere reservations are shown (lists, badges, table overview). */
export const statusColors: Record<ReservationStatus, MantineColor> = {
  Requested: 'yellow',
  Confirmed: 'blue',
  Late: 'orange',
  Arrived: 'green',
  Completed: 'teal',
  NoShow: 'grape',
  Cancelled: 'red',
  Declined: 'gray',
}

export const statusLabels: Record<ReservationStatus, ParseKeys> = {
  Requested: 'reservations.status.requested',
  Confirmed: 'reservations.status.confirmed',
  Late: 'reservations.status.late',
  Arrived: 'reservations.status.arrived',
  Completed: 'reservations.status.completed',
  NoShow: 'reservations.status.noShow',
  Cancelled: 'reservations.status.cancelled',
  Declined: 'reservations.status.declined',
}

/** The statuses that are listed in the filter, in the order of a reservation's life. */
export const statuses = Object.keys(statusColors) as ReservationStatus[]

export const sourceLabels: Record<ReservationSource, ParseKeys> = {
  Online: 'reservations.source.online',
  Staff: 'reservations.source.phone',
  WalkIn: 'reservations.source.walkIn',
}

/** Statuses in which a reservation occupies its table, as on the server (Reservations/ReservationRules.cs). */
export const blockingStatuses: readonly ReservationStatus[] = ['Requested', 'Confirmed', 'Arrived', 'Late']

/**
 * Whether the reservation still counts: cancelled, declined and no-show reservations do not occupy a table and are not
 * expected. They are shown faded.
 */
export function isActive(reservation: Pick<Reservation, 'status'>) {
  return reservation.status !== 'Cancelled' && reservation.status !== 'Declined' && reservation.status !== 'NoShow'
}

/** When the reservation frees its table, "HH:mm": when the guest left, if earlier than the end. */
export function occupiedUntil(reservation: Pick<Reservation, 'status' | 'endTime' | 'completedTime'>) {
  return reservation.status === 'Completed' && reservation.completedTime !== null && toMinutes(reservation.completedTime) < toMinutes(reservation.endTime)
    ? reservation.completedTime
    : reservation.endTime
}

/** Whether the reservation occupies its table at all: the blocking statuses and guests who have left (until they left). */
export function occupiesTable(reservation: Pick<Reservation, 'status'>) {
  return blockingStatuses.includes(reservation.status) || reservation.status === 'Completed'
}

/** The name of the guest; a walk-in without a name is shown as "Walk-in" in the user's language. */
export function guestName(reservation: Pick<Reservation, 'name' | 'source'>, t: TFunction) {
  return reservation.source === 'WalkIn' && reservation.name === 'Walk-in' ? t('reservations.walkIn.defaultName') : reservation.name
}

/** A quick status change of the staff. */
export type StatusAction = {
  /** The status the action sets. */
  status: ReservationStatus
  label: ParseKeys
  /** Shown with the icon on narrow screens such as tablets. */
  shortLabel: ParseKeys
  /** Decorative, next to the label. */
  icon: ComponentType<IconProps>
  color: MantineColor
  /** Asks first, because the guest is no longer expected: cancelling and no-show. */
  confirm: boolean
}

const actions = {
  accept: { status: 'Confirmed', label: 'reservations.actions.accept', shortLabel: 'reservations.actionsShort.accept', icon: CheckIcon, color: 'green', confirm: false },
  decline: { status: 'Declined', label: 'reservations.actions.decline', shortLabel: 'reservations.actionsShort.decline', icon: XIcon, color: 'gray', confirm: false },
  arrived: { status: 'Arrived', label: 'reservations.actions.arrived', shortLabel: 'reservations.actionsShort.arrived', icon: CheckIcon, color: 'green', confirm: false },
  late: { status: 'Late', label: 'reservations.actions.late', shortLabel: 'reservations.actionsShort.late', icon: ClockIcon, color: 'orange', confirm: false },
  noShow: { status: 'NoShow', label: 'reservations.actions.noShow', shortLabel: 'reservations.actionsShort.noShow', icon: BanIcon, color: 'grape', confirm: true },
  completed: { status: 'Completed', label: 'reservations.actions.completed', shortLabel: 'reservations.actionsShort.completed', icon: DoorExitIcon, color: 'teal', confirm: false },
  cancel: { status: 'Cancelled', label: 'reservations.actions.cancel', shortLabel: 'reservations.actionsShort.cancel', icon: XIcon, color: 'red', confirm: true },
  undoToConfirmed: { status: 'Confirmed', label: 'reservations.actions.undo', shortLabel: 'reservations.actionsShort.undo', icon: UndoIcon, color: 'gray', confirm: false },
  undoToArrived: { status: 'Arrived', label: 'reservations.actions.undo', shortLabel: 'reservations.actionsShort.undo', icon: UndoIcon, color: 'gray', confirm: false },
} as const satisfies Record<string, StatusAction>

/** The buttons of each status. The undo of "late" is offered in the notification after the change. */
const statusActions: Record<ReservationStatus, readonly StatusAction[]> = {
  Requested: [actions.accept, actions.decline],
  Confirmed: [actions.arrived, actions.late, actions.noShow, actions.cancel],
  Late: [actions.arrived, actions.noShow, actions.cancel],
  Arrived: [actions.completed, actions.undoToConfirmed],
  Completed: [actions.undoToArrived],
  NoShow: [actions.undoToConfirmed],
  Cancelled: [actions.undoToConfirmed],
  Declined: [],
}

/** The status changes the server allows (Reservations/ReservationRules.cs). */
const transitions: Record<ReservationStatus, readonly ReservationStatus[]> = {
  Requested: ['Confirmed', 'Declined'],
  Confirmed: ['Arrived', 'Late', 'NoShow', 'Cancelled'],
  Late: ['Arrived', 'NoShow', 'Cancelled', 'Confirmed'],
  Arrived: ['Completed', 'Confirmed'],
  Completed: ['Arrived'],
  NoShow: ['Confirmed'],
  Cancelled: ['Confirmed'],
  Declined: [],
}

/**
 * Whether the server allows the change now, as on the server: "arrived" and "late" only on the day of the reservation,
 * "no-show" only from its start. Without the current time (still loading) neither is offered.
 */
function isAllowedNow(status: ReservationStatus, reservation: Pick<Reservation, 'date' | 'time'>, now: RestaurantNow | null) {
  if (status === 'Arrived' || status === 'Late') {
    return now !== null && reservation.date === now.date
  }
  if (status === 'NoShow') {
    return now !== null && (reservation.date < now.date || (reservation.date === now.date && toMinutes(reservation.time) <= now.minutes))
  }
  return true
}

/** The status actions offered for the reservation now. */
export function availableActions(reservation: Pick<Reservation, 'status' | 'date' | 'time'>, now: RestaurantNow | null) {
  return statusActions[reservation.status].filter((action) => isAllowedNow(action.status, reservation, now))
}

/**
 * The status that undoes a change from `previous` to `current`: back to `previous` if the server allows it, otherwise back to
 * "confirmed" (e.g. after "arrived" of a late guest). Null when the change cannot be undone (accepting or declining a request).
 */
export function undoStatus(previous: ReservationStatus, current: ReservationStatus): ReservationStatus | null {
  if (transitions[current].includes(previous)) {
    return previous
  }
  return transitions[current].includes('Confirmed') ? 'Confirmed' : null
}
