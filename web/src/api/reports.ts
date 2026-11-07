import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client.ts'
import type { ReservationSource } from './reservations.ts'

/** The longest period of a report in days (ReportEndpoints.MaxDays on the server). */
export const maxReportDays = 366

/**
 * A report of the days `from` to `to` (both inclusive, "YYYY-MM-DD", the restaurant's days), as returned by GET /api/admin/reports.
 * Reservations and covers count every reservation except cancelled ones, declined requests and no-shows; `noShowRate` (0–1) is
 * the share of the no-shows among these and the no-shows. Every channel, weekday (1 Monday – 7 Sunday), hour (0–23) and day of
 * the period is listed, also without reservations.
 */
export type Report = {
  from: string
  to: string
  totals: {
    reservations: number
    covers: number
    averagePartySize: number
    noShows: number
    noShowRate: number
    cancellations: number
    cancelledByGuest: number
    cancelledByRestaurant: number
    declinedRequests: number
  }
  bySource: { source: ReservationSource; reservations: number; covers: number }[]
  byWeekday: { weekday: number; covers: number }[]
  byHour: { hour: number; covers: number }[]
  days: { date: string; reservations: number; covers: number }[]
}

/** The report of the period; waits while `from` or `to` is null. */
export function useReport(from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['admin', 'reports', from, to],
    queryFn: () => apiGet<Report>(`/admin/reports?from=${from}&to=${to}`),
    enabled: from !== null && to !== null,
  })
}
