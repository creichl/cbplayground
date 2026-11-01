import { useTranslation } from 'react-i18next'
import { type PublicRestaurant, todayIn, useAvailability } from '../../api/publicBooking.ts'
import { formatTime } from '../../i18n/format.ts'

/**
 * Whether the restaurant is open today, as a short line for the chip on the cover image: "Open today · 17:00–24:00" (every
 * opening window of the day) or "Closed today". It takes today's opening windows from the availability, so public holidays,
 * closing days and special hours count (`periods` are today's windows); the party size is the booking's preset, so the booking loads the same. Null while
 * it loads and for a restaurant without location.
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
    return { open: false, text: t('booking.restaurant.closedToday'), periods }
  }
  const hours = periods
    .map((period) => t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) }))
    .join(', ')
  return { open: true, text: t('booking.restaurant.openToday', { hours }), periods }
}
