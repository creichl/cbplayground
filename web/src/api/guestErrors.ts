import type { TFunction } from 'i18next'
import { ApiError, httpErrorMessage } from './client.ts'

/** The error codes of /api/staff/guests and their texts. */
const errorKeys = {
  invalid_name: 'guests.errors.invalidName',
  invalid_phone: 'guests.errors.invalidPhone',
  invalid_email: 'guests.errors.invalidEmail',
  invalid_notes: 'guests.errors.invalidNotes',
  invalid_allergy_notes: 'guests.errors.invalidAllergyNotes',
  invalid_tags: 'guests.errors.invalidTags',
  guest_contact_taken: 'guests.errors.contactTaken',
} as const

/** A failed guest request in the user's language. */
export function guestErrorMessage(error: unknown, t: TFunction) {
  if (error instanceof ApiError) {
    if (error.code !== null && error.code in errorKeys) {
      return t(errorKeys[error.code as keyof typeof errorKeys])
    }
    if (error.status === 404) {
      return t('guests.errors.notFound')
    }
    if (error.status === 403) {
      return t('guests.errors.forbidden')
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
