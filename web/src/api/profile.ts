import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut } from './client.ts'

/** The restaurant's profile, as returned by GET /api/admin/profile. Empty fields are null. */
export type Profile = {
  street: string | null
  postalCode: string | null
  city: string | null
  phone: string | null
  email: string | null
  website: string | null
  description: string | null
}

/** Maximum lengths of the profile fields, as on the server. */
export const profileMaxLengths: Record<keyof Profile, number> = {
  street: 200,
  postalCode: 10,
  city: 100,
  phone: 30,
  email: 254,
  website: 200,
  description: 500,
}

/** Error codes of PUT /api/admin/profile. */
export type ProfileError =
  | 'invalid_street'
  | 'invalid_postal_code'
  | 'invalid_city'
  | 'invalid_phone'
  | 'invalid_email'
  | 'invalid_website'
  | 'invalid_description'

/** Same rule as on the server: something@domain.tld without spaces. */
export function isValidEmail(value: string) {
  return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(value)
}

/** An absolute http or https URL, as on the server. */
export function isValidWebsite(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

/** Whether each step of the restaurant's setup is done, as returned by GET /api/admin/setup-status. */
export type SetupStatus = {
  profile: boolean
  location: boolean
  openingHours: boolean
  floorPlan: boolean
  tables: boolean
  reservationSettings: boolean
}

const profileKey = ['admin', 'profile'] as const
const setupStatusKey = ['admin', 'setup-status'] as const

export function useProfile() {
  return useQuery({
    queryKey: profileKey,
    queryFn: () => apiGet<Profile>('/admin/profile'),
  })
}

export function useSaveProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (profile: Profile) => apiPut<Profile>('/admin/profile', profile),
    onSuccess: async (profile) => {
      queryClient.setQueryData(profileKey, profile)
      // City and description are shown on the start page, the address and phone count for the setup.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: setupStatusKey }),
        queryClient.invalidateQueries({ queryKey: ['tenants'] }),
      ])
    },
  })
}

/** The setup checklist; read anew on every visit of the overview, so changes on the other pages show up. */
export function useSetupStatus() {
  return useQuery({
    queryKey: setupStatusKey,
    queryFn: () => apiGet<SetupStatus>('/admin/setup-status'),
  })
}
