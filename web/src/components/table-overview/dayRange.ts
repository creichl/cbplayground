import { type OpenPeriod, type Reservation, toMinutes } from '../../api/reservations.ts'

/** A time range of the day in minutes since midnight. */
export type MinuteRange = { start: number; end: number }

/**
 * The shown time range of the day in minutes, on full hours: the opening hours, widened to every reservation of the day.
 * Null when the restaurant is closed and has no reservations.
 */
export function dayRange(openPeriods: OpenPeriod[], reservations: Reservation[]): MinuteRange | null {
  const times = [
    ...openPeriods.flatMap((period) => [toMinutes(period.start), toMinutes(period.end)]),
    ...reservations.flatMap((reservation) => [toMinutes(reservation.time), toMinutes(reservation.endTime)]),
  ]
  if (times.length === 0) {
    return null
  }
  return { start: Math.floor(Math.min(...times) / 60) * 60, end: Math.ceil(Math.max(...times) / 60) * 60 }
}
