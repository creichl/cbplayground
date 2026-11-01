import { useTranslation } from 'react-i18next'
import type { DayOfWeek } from '../../api/openingHours.ts'
import { type Availability, type PublicRestaurant, todayIn } from '../../api/publicBooking.ts'
import { formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Badge } from '../../ui/badge.tsx'

/** The week as shown, starting on Monday. */
const weekdays = [
  { dayOfWeek: 1, key: 'monday' },
  { dayOfWeek: 2, key: 'tuesday' },
  { dayOfWeek: 3, key: 'wednesday' },
  { dayOfWeek: 4, key: 'thursday' },
  { dayOfWeek: 5, key: 'friday' },
  { dayOfWeek: 6, key: 'saturday' },
  { dayOfWeek: 0, key: 'sunday' },
] as const satisfies readonly { dayOfWeek: DayOfWeek; key: string }[]

type OpeningHoursListProps = {
  restaurant: PublicRestaurant
  /** Today's actual opening windows (public holidays, closing days and special hours count); null while they load. */
  today: Availability['periods'] | null
}

/**
 * The regular opening hours of the week as a list, today stressed. When today differs from the regular hours (a public
 * holiday, a closing day, special hours), today's row says so with today's actual hours.
 */
export function OpeningHoursList({ restaurant, today }: OpeningHoursListProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  // Today's day of the week in the restaurant's time zone (0 = Sunday), noon UTC so the day does not shift.
  const todayOfWeek = restaurant.timeZoneId !== null ? new Date(`${todayIn(restaurant.timeZoneId)}T12:00:00Z`).getUTCDay() : null
  const hours = (periods: { start: string; end: string }[]) =>
    periods.length === 0
      ? t('openingHours.closed')
      : // A line break only falls between two windows, never inside one.
        periods.map((period, index) => (
          <span key={period.start}>
            {index > 0 && ', '}
            <span className="whitespace-nowrap">
              {t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) })}
            </span>
          </span>
        ))

  return (
    <ul className="flex flex-col">
      {weekdays.map(({ dayOfWeek, key }) => {
        const regular = restaurant.openingHours.filter((period) => period.dayOfWeek === dayOfWeek)
        const isToday = dayOfWeek === todayOfWeek
        const differs =
          isToday &&
          today !== null &&
          (today.length !== regular.length || today.some((period, index) => period.start !== regular[index].start || period.end !== regular[index].end))
        return (
          <li
            key={dayOfWeek}
            aria-current={isToday ? 'date' : undefined}
            className={cn('flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg px-3 py-2.5', isToday && 'bg-primary-50 font-semibold dark:bg-accent')}
          >
            <span className="flex items-center gap-2">
              {t(`openingHours.weekdays.${key}`)}
              {isToday && <Badge variant="primary">{t('booking.restaurant.todayBadge')}</Badge>}
            </span>
            <span className="text-right tabular-nums">{hours(regular)}</span>
            {differs && (
              <span className="w-full text-sm font-medium">
                {t('booking.restaurant.todayDiffers')} {hours(today)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
