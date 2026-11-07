import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPut } from './client.ts'
import { type GuestTag, type Reservation, reservationsKey } from './reservations.ts'

/** A guest in the directory, as listed by GET /api/staff/guests; `lastVisit` ("YYYY-MM-DD") is null when the guest has not come yet. */
export type GuestListItem = {
  id: string
  name: string
  phone: string | null
  email: string | null
  tags: GuestTag[]
  hasAllergies: boolean
  visits: number
  noShows: number
  lastVisit: string | null
}

/** A page of the directory, sorted by name; `total` counts all guests that match. */
export type GuestPage = { items: GuestListItem[]; total: number; page: number; pageSize: number }

/**
 * The guest's figures: visits (arrived or left), no-shows and cancellations, the day of the last visit and of the next reservation
 * ("YYYY-MM-DD", null when there is none).
 */
export type GuestFigures = { visits: number; noShows: number; cancellations: number; lastVisit: string | null; nextVisit: string | null }

/**
 * A guest's profile, as returned by GET /api/staff/guests/{id}, with all its reservations, the newest first. The phone number is stored
 * normalised: "+" with the country code and the digits, e.g. "+436601234567".
 */
export type GuestDetail = {
  id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  allergyNotes: string | null
  tags: GuestTag[]
  figures: GuestFigures
  reservations: Reservation[]
  createdAtUtc: string
  updatedAtUtc: string
}

/** The changed profile; every field is replaced, an empty one (null) is removed. */
export type GuestInput = {
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  allergyNotes: string | null
  tags: GuestTag[]
}

/** Maximum lengths of a profile's fields, as on the server (Data/Guest.cs); the phone number as a reservation takes it. */
export const guestProfileMaxLengths = { name: 100, phone: 30, email: 254, notes: 1000, allergyNotes: 500 } as const

export const guestsKey = ['staff', 'guests'] as const

/** A page of the directory; `search` is part of the name, the email address or the phone number's digits. Keeps the last page while the next loads. */
export function useGuests(search: string, page: number) {
  return useQuery({
    queryKey: [...guestsKey, 'list', search, page],
    queryFn: () => apiGet<GuestPage>(`/staff/guests?search=${encodeURIComponent(search)}&page=${page}`),
    placeholderData: keepPreviousData,
  })
}

/** A guest's profile with the figures and the reservations; nothing is loaded while `id` is null. */
export function useGuest(id: string | null) {
  return useQuery({
    queryKey: [...guestsKey, 'detail', id],
    queryFn: () => apiGet<GuestDetail>(`/staff/guests/${encodeURIComponent(id ?? '')}`),
    enabled: id !== null,
  })
}

/** Saves the profile and reloads the directory and the reservations, whose guest summaries (tags, allergies) change with it. */
export function useUpdateGuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...guest }: GuestInput & { id: string }) => apiPut<GuestDetail>(`/staff/guests/${encodeURIComponent(id)}`, guest),
    onSuccess: async (guest) => {
      queryClient.setQueryData([...guestsKey, 'detail', guest.id], guest)
      await Promise.all([queryClient.invalidateQueries({ queryKey: guestsKey }), queryClient.invalidateQueries({ queryKey: reservationsKey })])
    },
  })
}

/** Deletes the guest's data (Tenant Admins only): the profile goes, its reservations are anonymised. */
export function useDeleteGuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/staff/guests/${encodeURIComponent(id)}`),
    onSuccess: async (_, id) => {
      queryClient.removeQueries({ queryKey: [...guestsKey, 'detail', id] })
      await Promise.all([queryClient.invalidateQueries({ queryKey: guestsKey }), queryClient.invalidateQueries({ queryKey: reservationsKey })])
    },
  })
}
