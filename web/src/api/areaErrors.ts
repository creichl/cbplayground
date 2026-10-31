import type { TFunction } from 'i18next'
import { ApiError } from './client.ts'

const errorKeys = {
  area_name_invalid: 'areas.errors.areaNameInvalid',
  area_not_found: 'areas.errors.areaNotFound',
  area_order_invalid: 'areas.errors.areaOrderInvalid',
  online_capacity_percent_invalid: 'areas.errors.percentInvalid',
  floor_plan_too_large: 'areas.errors.floorPlanTooLarge',
  floor_plan_type_invalid: 'areas.errors.floorPlanTypeInvalid',
  table_number_invalid: 'areas.errors.tableNumberInvalid',
  table_number_taken: 'areas.errors.tableNumberTaken',
  table_not_found: 'areas.errors.tableNotFound',
  seats_invalid: 'areas.errors.seatsInvalid',
  position_invalid: 'areas.errors.positionInvalid',
} as const

/** The error code of a failed request, e.g. "table_number_taken", or null. */
export function errorCode(error: unknown) {
  return error instanceof ApiError ? error.code : null
}

/** A failed request of the areas page in the user's language. */
export function errorMessage(error: unknown, t: TFunction) {
  const code = errorCode(error)
  if (code !== null && code in errorKeys) {
    return t(errorKeys[code as keyof typeof errorKeys])
  }
  if (error instanceof ApiError) {
    if (error.kind === 'network') {
      return t('errors.network')
    }
    if (error.kind === 'http') {
      return t('errors.http', { status: error.status })
    }
    return t('errors.invalidResponse')
  }
  return t('errors.unexpected')
}
