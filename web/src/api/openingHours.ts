import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type en from '../i18n/locales/en.json'
import { apiGet, apiPut } from './client.ts'

/** 0 = Sunday … 6 = Saturday, as in .NET's DayOfWeek. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** A time window on a day of the week. Times are "HH:mm"; the end may be "24:00". */
export type OpeningPeriod = { dayOfWeek: DayOfWeek; start: string; end: string }

export const countryCodes = ['DE', 'AT', 'RS'] as const
export type CountryCode = (typeof countryCodes)[number]

/** The German federal states; only Germany has regions. */
export const regionCodes = [
  'DE-BW',
  'DE-BY',
  'DE-BE',
  'DE-BB',
  'DE-HB',
  'DE-HH',
  'DE-HE',
  'DE-MV',
  'DE-NI',
  'DE-NW',
  'DE-RP',
  'DE-SL',
  'DE-SN',
  'DE-ST',
  'DE-SH',
  'DE-TH',
] as const
export type RegionCode = (typeof regionCodes)[number]

/** Country and region of the restaurant; all null until the Tenant Admin chooses them. */
export type RestaurantLocation = {
  countryCode: CountryCode | null
  regionCode: RegionCode | null
  timeZoneId: string | null
}

export type HolidayKey = keyof typeof en.openingHours.holidayNames

/** A day with one or more public holidays and whether the restaurant is open on it. */
export type Holiday = { date: string; keys: HolidayKey[]; isOpen: boolean }

const openingHoursKey = ['admin', 'opening-hours'] as const
const locationKey = ['admin', 'location'] as const
const holidaysKey = ['admin', 'holidays'] as const

export function useOpeningHours() {
  return useQuery({
    queryKey: openingHoursKey,
    queryFn: async () => (await apiGet<{ periods: OpeningPeriod[] }>('/admin/opening-hours')).periods,
  })
}

/** Replaces the opening hours of the whole week. */
export function useSaveOpeningHours() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (periods: OpeningPeriod[]) => apiPut<void>('/admin/opening-hours', { periods }),
    onSuccess: (_, periods) => queryClient.setQueryData(openingHoursKey, periods),
  })
}

export function useRestaurantLocation() {
  return useQuery({
    queryKey: locationKey,
    queryFn: () => apiGet<RestaurantLocation>('/admin/location'),
  })
}

/** Saves country and region; the holidays then follow the new location. */
export function useSaveRestaurantLocation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (location: { countryCode: CountryCode; regionCode: RegionCode | null }) =>
      apiPut<RestaurantLocation>('/admin/location', location),
    onSuccess: async (location) => {
      queryClient.setQueryData(locationKey, location)
      await queryClient.invalidateQueries({ queryKey: holidaysKey })
    },
  })
}

/** The public holidays of the next 12 months for the restaurant's location. */
export function useHolidays() {
  return useQuery({
    queryKey: holidaysKey,
    queryFn: () => apiGet<Holiday[]>('/admin/holidays'),
  })
}

/** Opens or closes the restaurant on a public holiday. */
export function useSetHolidayOpen() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ date, isOpen }: { date: string; isOpen: boolean }) => apiPut<void>(`/admin/holidays/${date}`, { isOpen }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: holidaysKey }),
  })
}
