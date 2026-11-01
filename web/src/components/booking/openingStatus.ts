import { useTranslation } from 'react-i18next'
import { nowIn, type PublicRestaurant, todayIn, useAvailability } from '../../api/publicBooking.ts'
import { formatTime } from '../../i18n/format.ts'

/**
 * Whether the restaurant is open today, in a short line such as "Open now until 24:00" or "Closed today". It takes today's
 * opening windows from the availability, so public holidays, closing days and special hours count; the party size is the
 * booking's preset, so the booking loads the same. Null while it loads and for a restaurant without location.
 */
export function useOpeningStatus(slug: string, restaurant: PublicRestaurant) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const timeZoneId = restaurant.timeZoneId
  const today = timeZoneId !== null ? todayIn(timeZoneId) : ''
  const availability = useAvailability(slug, today, Math.min(2, restaurant.maxOnlinePartySize), timeZoneId !== null)

  if (timeZoneId === null || availability.data === undefined) {
    return null
  }
  const periods = availability.data.periods
  if (periods.length === 0) {
    return { open: false, text: t('booking.restaurant.closedToday') }
  }
  // "HH:mm" compares as text; the end of the day is "24:00".
  const now = nowIn(timeZoneId)
  const current = periods.find((period) => period.start <= now && now < period.end)
  if (current !== undefined) {
    return { open: true, text: t('booking.restaurant.openUntil', { time: formatTime(current.end, language) }) }
  }
  const next = periods.find((period) => period.start > now)
  if (next !== undefined) {
    return { open: false, text: t('booking.restaurant.opensAt', { time: formatTime(next.start, language) }) }
  }
  return { open: false, text: t('booking.restaurant.closedNow') }
}
