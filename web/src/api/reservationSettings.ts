import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut } from './client.ts'

export type ConfirmationMode = 'Instant' | 'Request'
export type TableSelectionMode = 'GuestChooses' | 'SystemAssigns'

/** Duration of a reservation for a range of party sizes. */
export type DurationRule = {
  minGuests: number
  maxGuests: number
  durationMinutes: number
}

/** The restaurant's reservation settings, as returned by GET /api/admin/reservation-settings. */
export type ReservationSettings = {
  confirmationMode: ConfirmationMode
  tableSelectionMode: TableSelectionMode
  defaultDurationMinutes: number
  durationRules: DurationRule[]
  /** Online, a reservation has to start at least this many minutes from now. */
  minLeadTimeMinutes: number
  /** Online, a reservation can start at most this many days after today. */
  bookingHorizonDays: number
  /** After every reservation its table stays occupied for this many minutes. */
  bufferMinutes: number
  /** The largest party that can book online; null: the largest table that can be booked online. */
  maxOnlinePartySize: number | null
}

/** Error codes of PUT /api/admin/reservation-settings. */
export type ReservationSettingsError =
  | 'invalid_mode'
  | 'invalid_duration'
  | 'invalid_min_guests'
  | 'min_greater_than_max'
  | 'overlapping_rules'
  | 'invalid_lead_time'
  | 'invalid_booking_horizon'
  | 'invalid_buffer'
  | 'invalid_max_party_size'

/** Durations are 15 to 480 minutes in steps of 15, as on the server. */
export const durationLimits = { min: 15, max: 480, step: 15 } as const

/** The limits of the booking rules, as on the server. */
export const leadTimeLimits = { min: 0, max: 1440 } as const
export const bookingHorizonLimits = { min: 1, max: 365 } as const
export const bufferLimits = { min: 0, max: 60, step: 5 } as const

export function isValidDuration(minutes: number) {
  return Number.isInteger(minutes) && minutes >= durationLimits.min && minutes <= durationLimits.max && minutes % durationLimits.step === 0
}

/** The rule whose range contains `guests`, or undefined; then the default duration applies. Same rule as GetDurationAsync on the server. */
export function matchingRule<T extends Pick<DurationRule, 'minGuests' | 'maxGuests'>>(rules: T[], guests: number) {
  return rules.find((rule) => rule.minGuests <= guests && guests <= rule.maxGuests)
}

const settingsKey = ['admin', 'reservation-settings'] as const

export function useReservationSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => apiGet<ReservationSettings>('/admin/reservation-settings'),
  })
}

/** Saves the settings together with all duration rules. */
export function useSaveReservationSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: ReservationSettings) => apiPut<ReservationSettings>('/admin/reservation-settings', settings),
    onSuccess: (settings) => queryClient.setQueryData(settingsKey, settings),
  })
}
