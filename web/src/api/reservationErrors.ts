import type { TFunction } from 'i18next'
import { ApiError, httpErrorMessage } from './client.ts'

/** The error codes of /api/staff/reservations and /api/staff/availability, and their texts. */
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
  outside_opening_hours: 'reservations.errors.outsideOpeningHours',
  in_the_past: 'reservations.errors.inThePast',
  slot_unavailable: 'reservations.errors.slotUnavailable',
  table_unavailable: 'reservations.errors.tableUnavailable',
  invalid_status: 'reservations.errors.invalidStatus',
  invalid_status_transition: 'reservations.errors.invalidStatusTransition',
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
