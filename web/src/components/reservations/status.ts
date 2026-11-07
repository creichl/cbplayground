import type { ParseKeys, TFunction } from 'i18next'
import type { ComponentType } from 'react'
import { type Reservation, type ReservationSource, type ReservationStatus, type RestaurantNow, toMinutes } from '../../api/reservations.ts'
import { BanIcon, CheckIcon, ClockIcon, DoorExitIcon, type IconProps, UndoIcon, XIcon } from '../icons.tsx'

/**
 * The one place for the statuses of a reservation: their labels, colours and the status actions of the staff.
 * The reservation lists, the table overview and the key figures all take them from here.
 */

/**
 * The colours of a status, as CSS colours of the design-system tokens (styles/app.css, "--status-*"): `color` for fills and
 * outlines (at least 3:1 on white), `surface` for a calm background, `text` for text on white and on the surface (4.5:1).
 */
export type StatusColor = { color: string; surface: string; text: string }

function statusColor(token: string): StatusColor {
  return { color: `var(--status-${token})`, surface: `var(--status-${token}-surface)`, text: `var(--status-${token}-text)` }
}

/** One colour per status, the same everywhere reservations are shown (lists, badges, timeline, floor plans, key figures). */
export const statusColors: Record<ReservationStatus, StatusColor> = {
  Requested: statusColor('requested'),
  Confirmed: statusColor('confirmed'),
  Late: statusColor('late'),
  Arrived: statusColor('arrived'),
  Completed: statusColor('completed'),
  NoShow: statusColor('no-show'),
  Cancelled: statusColor('cancelled'),
  Declined: statusColor('declined'),
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
 * Statuses of a closed reservation, as on the server (ReservationRules.ClosedStatuses): only the guest's details and the note can
 * still be changed, not its date, time, party size, table or duration.
 */
export const closedStatuses: readonly ReservationStatus[] = ['Cancelled', 'Declined', 'NoShow', 'Completed']

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

/**
 * The name of the guest; a walk-in without a name is shown as "Walk-in" in the user's language, a reservation whose guest's data was
 * deleted as "Deleted guest" (the names the server stores for them).
 */
export function guestName(reservation: Pick<Reservation, 'name' | 'source'>, t: TFunction) {
  if (reservation.name === 'Deleted guest') {
    return t('guests.deletedName')
  }
  return reservation.source === 'WalkIn' && reservation.name === 'Walk-in' ? t('reservations.walkIn.defaultName') : reservation.name
}

/** A quick status change of the staff. */
export type StatusAction = {
  /** The status the action sets; null: removes an arrived walk-in, the undo of its arrival (a walk-in was never expected). */
  status: ReservationStatus | null
  label: ParseKeys
  /** Shown with the icon on narrow screens such as tablets. */
  shortLabel: ParseKeys
  /** Decorative, next to the label. */
  icon: ComponentType<IconProps>
  /** The colour of its icon, the status it sets; null for the neutral ones (decline, undo). */
  color: StatusColor | null
  /** Asks first, because the guest is no longer expected: cancelling, no-show, declining a request and removing a walk-in. */
  confirm: boolean
}

const actions = {
  accept: { status: 'Confirmed', label: 'reservations.actions.accept', shortLabel: 'reservations.actionsShort.accept', icon: CheckIcon, color: statusColors.Confirmed, confirm: false },
  decline: { status: 'Declined', label: 'reservations.actions.decline', shortLabel: 'reservations.actionsShort.decline', icon: XIcon, color: null, confirm: true },
  arrived: { status: 'Arrived', label: 'reservations.actions.arrived', shortLabel: 'reservations.actionsShort.arrived', icon: CheckIcon, color: statusColors.Arrived, confirm: false },
  late: { status: 'Late', label: 'reservations.actions.late', shortLabel: 'reservations.actionsShort.late', icon: ClockIcon, color: statusColors.Late, confirm: false },
  noShow: { status: 'NoShow', label: 'reservations.actions.noShow', shortLabel: 'reservations.actionsShort.noShow', icon: BanIcon, color: statusColors.NoShow, confirm: true },
  completed: { status: 'Completed', label: 'reservations.actions.completed', shortLabel: 'reservations.actionsShort.completed', icon: DoorExitIcon, color: statusColors.Completed, confirm: false },
  cancel: { status: 'Cancelled', label: 'reservations.actions.cancel', shortLabel: 'reservations.actionsShort.cancel', icon: XIcon, color: statusColors.Cancelled, confirm: true },
  undoToConfirmed: { status: 'Confirmed', label: 'reservations.actions.undo', shortLabel: 'reservations.actionsShort.undo', icon: UndoIcon, color: null, confirm: false },
  undoToArrived: { status: 'Arrived', label: 'reservations.actions.undo', shortLabel: 'reservations.actionsShort.undo', icon: UndoIcon, color: null, confirm: false },
  removeWalkIn: { status: null, label: 'reservations.actions.undo', shortLabel: 'reservations.actionsShort.undo', icon: UndoIcon, color: null, confirm: true },
} as const satisfies Record<string, StatusAction>

/**
 * The buttons of each status. The undos of "late", of accepting and of declining a request are offered in the notification
 * after the change.
 */
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

/** The buttons of an arrived walk-in: its arrival is undone by removing it. */
const arrivedWalkInActions: readonly StatusAction[] = [actions.completed, actions.removeWalkIn]

/**
 * The status changes the server allows (Reservations/ReservationRules.cs); "late" from no-show and cancelled undoes them for a late
 * guest. "Requested" from "confirmed" is only allowed for a reservation that was a request, so only the undo after accepting sends it;
 * "confirmed" from "arrived" is refused for a walk-in, whose arrival is undone by removing it.
 */
const transitions: Record<ReservationStatus, readonly ReservationStatus[]> = {
  Requested: ['Confirmed', 'Declined'],
  Confirmed: ['Arrived', 'Late', 'NoShow', 'Cancelled', 'Requested'],
  Late: ['Arrived', 'NoShow', 'Cancelled', 'Confirmed'],
  Arrived: ['Completed', 'Confirmed'],
  Completed: ['Arrived'],
  NoShow: ['Confirmed', 'Late'],
  Cancelled: ['Confirmed', 'Late'],
  Declined: ['Requested'],
}

/** The fields of a reservation the status rules need. */
type StatusReservation = Pick<Reservation, 'status' | 'source' | 'date' | 'time' | 'endTime'>

/**
 * Whether the server allows the change of the reservation to `status` now, as on the server: "arrived" and "late" only on the
 * day of the reservation, "no-show" only from its start, the undo of a cancellation only until its end. Without the current
 * time (still loading) none of these is offered.
 */
function isAllowedNow(status: ReservationStatus | null, reservation: StatusReservation, now: RestaurantNow | null) {
  if (
    reservation.status === 'Cancelled' &&
    (now === null || reservation.date < now.date || (reservation.date === now.date && toMinutes(reservation.endTime) <= now.minutes))
  ) {
    return false
  }
  if (status === 'Arrived' || status === 'Late') {
    return now !== null && reservation.date === now.date
  }
  if (status === 'NoShow') {
    return now !== null && (reservation.date < now.date || (reservation.date === now.date && toMinutes(reservation.time) <= now.minutes))
  }
  return true
}

/** The status actions offered for the reservation now. */
export function availableActions(reservation: StatusReservation, now: RestaurantNow | null) {
  const offered = reservation.source === 'WalkIn' && reservation.status === 'Arrived' ? arrivedWalkInActions : statusActions[reservation.status]
  return offered.filter((action) => isAllowedNow(action.status, reservation, now))
}

/**
 * The status that undoes a change from `previous` to the reservation's current status: back to `previous` if the server allows it
 * (e.g. "late" again after the cancellation or no-show of a late guest, "requested" after accepting or declining a request),
 * otherwise back to "confirmed" (e.g. after "arrived" of a late guest). Null when the change cannot be undone (now).
 */
export function undoStatus(previous: ReservationStatus, reservation: StatusReservation, now: RestaurantNow | null): ReservationStatus | null {
  const allowed = transitions[reservation.status]
  const undo = allowed.includes(previous) ? previous : allowed.includes('Confirmed') ? 'Confirmed' : null
  if (undo === null || (undo === 'Confirmed' && reservation.status === 'Arrived' && reservation.source === 'WalkIn')) {
    return null
  }
  return isAllowedNow(undo, reservation, now) ? undo : null
}

/**
 * The tabs of the front desk's list panel: the day's reservations by where the guests are, the open requests from today on and
 * the day's waitlist of walk-ins.
 */
export type ListTab = 'upcoming' | 'seated' | 'finished' | 'requests' | 'waitlist'

/** The tab of the day's lists that holds a reservation in this status. */
const tabOfStatus: Record<ReservationStatus, Exclude<ListTab, 'requests' | 'waitlist'>> = {
  Requested: 'upcoming',
  Confirmed: 'upcoming',
  Late: 'upcoming',
  Arrived: 'seated',
  Completed: 'finished',
  NoShow: 'finished',
  Cancelled: 'finished',
  Declined: 'finished',
}

/** The tab of the day's lists that holds the reservation. */
export function listTabOf(reservation: Pick<Reservation, 'status'>) {
  return tabOfStatus[reservation.status]
}
