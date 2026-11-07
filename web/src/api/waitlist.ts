import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut } from './client.ts'
import type { Reservation } from './reservations.ts'

/** Waiting: waits for a table; Seated: seated as a walk-in; Left: left without a table. */
export type WaitlistStatus = 'Waiting' | 'Seated' | 'Left'

/**
 * A party on the waitlist of a day, as returned by /api/staff/waitlist. `addedTime` is "HH:mm" in the restaurant's local time,
 * the waiting time counts from it. `nextFreeAt` ("HH:mm"), only of today's waiting parties: the earliest time today a table for the
 * party is free for the restaurant's duration (now when one is free now); null when none is free today.
 */
export type WaitlistEntry = {
  id: string
  date: string
  addedTime: string
  name: string
  phone: string | null
  guests: number
  quotedWaitMinutes: number | null
  notes: string | null
  status: WaitlistStatus
  seatedReservationId: string | null
  nextFreeAt: string | null
}

/** A new or changed entry; without `quotedWaitMinutes` no waiting time was quoted. */
export type WaitlistInput = {
  name: string
  phone: string | null
  guests: number
  quotedWaitMinutes: number | null
  notes: string | null
}

/** The longest quoted waiting time the server accepts (WaitlistEntry.MaxQuotedWaitMinutes). */
export const maxQuotedWaitMinutes = 240

/** Reloaded every minute like the reservations, so a table freed meanwhile shows in "next table free at". */
const refreshIntervalMs = 60_000

export const waitlistKey = ['staff', 'waitlist'] as const

/** The waitlist of `date` ("YYYY-MM-DD") in the order of arrival. Reloaded every minute. */
export function useWaitlist(date: string | null) {
  return useQuery({
    queryKey: [...waitlistKey, date],
    queryFn: () => apiGet<WaitlistEntry[]>(`/staff/waitlist?date=${date}`),
    enabled: date !== null,
    refetchInterval: refreshIntervalMs,
  })
}

/** Shows the changed entry right away and reloads the waitlist, whose next free times the change may affect. */
async function applyChange(queryClient: QueryClient, changed: WaitlistEntry) {
  queryClient.setQueriesData<WaitlistEntry[]>({ queryKey: waitlistKey }, (entries) =>
    entries?.map((entry) => (entry.id === changed.id ? changed : entry)),
  )
  await queryClient.invalidateQueries({ queryKey: waitlistKey })
}

/** A request about an entry; when it fails, usually someone else changed the entry meanwhile: the waitlist is reloaded. */
async function changeEntry(queryClient: QueryClient, request: () => Promise<WaitlistEntry>) {
  let changed: WaitlistEntry
  try {
    changed = await request()
  } catch (error) {
    void queryClient.invalidateQueries({ queryKey: waitlistKey })
    throw error
  }
  await applyChange(queryClient, changed)
  return changed
}

export function useAddToWaitlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entry: WaitlistInput) => apiPost<WaitlistEntry>('/staff/waitlist', entry),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: waitlistKey }),
  })
}

/** Changes a waiting entry. */
export function updateWaitlistEntry(queryClient: QueryClient, id: string, entry: WaitlistInput) {
  return changeEntry(queryClient, () => apiPut<WaitlistEntry>(`/staff/waitlist/${encodeURIComponent(id)}`, entry))
}

export function useUpdateWaitlistEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...entry }: WaitlistInput & { id: string }) => updateWaitlistEntry(queryClient, id, entry),
  })
}

/**
 * The party has left without a table, or (`left` false, the undo) waits again. Also usable outside a component, e.g. from the
 * "Undo" of a toast that outlives the row that showed it.
 */
export function setWaitlistLeft(queryClient: QueryClient, id: string, left: boolean) {
  return changeEntry(queryClient, () => apiPost<WaitlistEntry>(`/staff/waitlist/${encodeURIComponent(id)}/${left ? 'left' : 'waiting'}`))
}

/** The seated entry and the walk-in it was seated as. */
export type SeatResult = { entry: WaitlistEntry; reservation: Reservation }

/**
 * Seats a waiting party now as a walk-in at `tableId` (without it at the suggested table) for the restaurant's duration; the
 * caller updates the reservation lists.
 */
export function seatWaitlistEntry(queryClient: QueryClient, id: string, tableId: string | null) {
  return apiPost<SeatResult>(`/staff/waitlist/${encodeURIComponent(id)}/seat`, { tableId, durationMinutes: null }).then(
    async (seated) => {
      await applyChange(queryClient, seated.entry)
      return seated
    },
    (error: unknown) => {
      void queryClient.invalidateQueries({ queryKey: waitlistKey })
      throw error
    },
  )
}
