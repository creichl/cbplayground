import type { TFunction } from 'i18next'
import { errorCode } from './areaErrors.ts'

/** The error codes of /api/superadmin that the user can run into, and their texts. */
const errorKeys = {
  invalid_name: 'superadmin.errors.invalidName',
  invalid_slug: 'superadmin.errors.invalidSlug',
  slug_taken: 'superadmin.errors.slugTaken',
  invalid_country: 'openingHours.location.invalid',
  region_required: 'openingHours.location.regionRequired',
  invalid_region: 'openingHours.location.invalid',
  region_not_allowed: 'openingHours.location.invalid',
  invalid_email: 'staff.errors.invalidEmail',
  email_taken: 'staff.errors.emailTaken',
  password_too_weak: 'staff.errors.passwordTooWeak',
} as const

/** The translated text for a known error code of the Superadmin API, otherwise null. */
export function superadminErrorMessage(error: unknown, t: TFunction) {
  const code = errorCode(error)
  return code !== null && code in errorKeys ? t(errorKeys[code as keyof typeof errorKeys]) : null
}
