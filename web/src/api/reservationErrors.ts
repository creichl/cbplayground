import type { TFunction } from 'i18next'
import { ApiError, httpErrorMessage } from './client.ts'

/** The error codes of /api/staff/reservations, /api/staff/availability, the walk-in endpoints and the waitlist, and their texts. */
const errorKeys = {
  invalid_date: 'reservations.errors.invalidDate',
  invalid_time: 'reservations.errors.invalidTime',
  invalid_range: 'reservations.errors.invalidDate',
  invalid_party_size: 'reservations.errors.invalidPartySize',
  invalid_duration: 'reservations.errors.invalidDuration',
  invalid_name: 'reservations.errors.invalidName',
  invalid_phone: 'reservations.errors.invalidPhone',
  invalid_email: 'reservations.errors.invalidEmail',
  invalid_notes: 'reservations.errors.invalidNotes',
  invalid_language: 'reservations.errors.invalidLanguage',
  invalid_occasion: 'reservations.errors.invalidOccasion',
  outside_opening_hours: 'reservations.errors.outsideOpeningHours',
  in_the_past: 'reservations.errors.inThePast',
  slot_unavailable: 'reservations.errors.slotUnavailable',
  table_unavailable: 'reservations.errors.tableUnavailable',
  invalid_tables: 'reservations.errors.invalidTables',
  invalid_status: 'reservations.errors.invalidStatus',
  invalid_status_transition: 'reservations.errors.invalidStatusTransition',
  status_not_allowed_now: 'reservations.errors.statusNotAllowedNow',
  reservation_closed: 'reservations.errors.reservationClosed',
  cannot_delete_reservation: 'reservations.errors.cannotDeleteReservation',
  invalid_quoted_wait: 'waitlist.errors.invalidQuotedWait',
  entry_not_waiting: 'waitlist.errors.notWaiting',
  entry_not_left: 'waitlist.errors.notLeft',
  entry_not_today: 'waitlist.errors.notToday',
} as const

/** A failed reservation request in the user's language. */
export function reservationErrorMessage(error: unknown, t: TFunction) {
  if (error instanceof ApiError) {
    if (error.code !== null && error.code in errorKeys) {
      return t(errorKeys[error.code as keyof typeof errorKeys])
    }
    if (error.status === 404) {
      return t('reservations.errors.notFound')
    }
    if (error.kind === 'network') {
      return t('errors.network')
    }
    if (error.kind === 'http') {
      return httpErrorMessage(error, t)
    }
    return t('errors.invalidResponse')
  }
  return t('errors.unexpected')
}
