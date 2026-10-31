import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost, apiPut } from './client.ts'
import type { ReservationStatus } from './reservations.ts'

export type SpecialDayKind = 'Closed' | 'SpecialHours'

/** A time window of a day with special hours. Times are "HH:mm"; the end may be "24:00". */
export type SpecialDayPeriod = { start: string; end: string }

/** Closing days or special hours from `from` to `to` ("YYYY-MM-DD", both inclusive). Closing days have no periods. */
export type SpecialDay = {
  id: string
  from: string
  to: string
  kind: SpecialDayKind
  note: string | null
  periods: SpecialDayPeriod[]
}

export type SpecialDayInput = Omit<SpecialDay, 'id'>

/** A reservation on a closing day or outside the special hours; it stays as it is. */
export type AffectedReservation = {
  id: string
  referenceCode: string
  date: string
  time: string
  guests: number
  name: string
  tableNumber: string
  status: ReservationStatus
}

/** The answer of saving an entry: the entry and the reservations it affects. */
export type SpecialDaySaveResult = {
  specialDay: SpecialDay
  affectedCount: number
  affectedReservations: AffectedReservation[]
}

/** Error codes of POST and PUT /api/admin/special-days. */
export type SpecialDayError =
  | 'invalid_date'
  | 'from_after_to'
  | 'range_too_long'
  | 'invalid_kind'
  | 'invalid_note'
  | 'periods_required'
  | 'invalid_time'
  | 'start_not_before_end'
  | 'overlapping_periods'
  | 'overlapping_special_days'

/** The longest note, as on the server. */
export const maxNoteLength = 100

/** The longest range of one entry in days, as on the server. */
export const maxSpecialDayDays = 366

const specialDaysKey = ['admin', 'special-days'] as const

/** The entries that have not ended yet, sorted by start. */
export function useSpecialDays() {
  return useQuery({
    queryKey: specialDaysKey,
    queryFn: () => apiGet<SpecialDay[]>('/admin/special-days'),
  })
}

/** Creates an entry (without `id`) or changes one (with `id`). */
export function useSaveSpecialDay() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: SpecialDayInput }) =>
      id === null
        ? apiPost<SpecialDaySaveResult>('/admin/special-days', input)
        : apiPut<SpecialDaySaveResult>(`/admin/special-days/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: specialDaysKey }),
  })
}

export function useDeleteSpecialDay() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/special-days/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: specialDaysKey }),
  })
}
