import { useTranslation } from 'react-i18next'
import type { DayOfWeek } from '../../api/openingHours.ts'
import type { PublicRestaurant } from '../../api/publicBooking.ts'
import { formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Badge } from '../../ui/badge.tsx'
import { dayOfWeekOf, type Period } from './openingStatus.ts'

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
  /** Today in the restaurant's time zone, "YYYY-MM-DD". */
  today: string
  /** Today's actual opening windows (public holidays, closing days and special hours count). */
  todayPeriods: Period[]
}

/**
 * Opening windows as text, "Closed" without any: the windows on one line, separated by commas; a line break only falls
 * between two windows, never inside one.
 */
export function PeriodsText({ periods }: { periods: Period[] }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  if (periods.length === 0) {
    return t('openingHours.closed')
  }
  return periods.map((period, index) => (
    <span key={period.start}>
      {index > 0 && ', '}
      <span className="whitespace-nowrap">{t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) })}</span>
    </span>
  ))
}

/**
 * The regular opening hours of the week as a list, Monday first, one row per day (days with the same hours are not grouped,
 * so the list is easy to scan), today stressed. When today differs from the regular hours (a public holiday, a closing day,
 * special hours), today's row says so with today's actual hours.
 */
export function OpeningHoursList({ restaurant, today, todayPeriods }: OpeningHoursListProps) {
  const { t } = useTranslation()
  const todayOfWeek = dayOfWeekOf(today)

  return (
    <ul className="flex flex-col">
      {weekdays.map(({ dayOfWeek, key }) => {
        const regular = restaurant.openingHours.filter((period) => period.dayOfWeek === dayOfWeek).sort((a, b) => a.start.localeCompare(b.start))
        const isToday = dayOfWeek === todayOfWeek
        const differs =
          isToday &&
          (todayPeriods.length !== regular.length ||
            todayPeriods.some((period, index) => period.start !== regular[index].start || period.end !== regular[index].end))
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
            <span className="text-right tabular-nums">
              <PeriodsText periods={regular} />
            </span>
            {differs && (
              <span className="w-full text-sm font-medium">
                {t('booking.restaurant.todayDiffers')} <PeriodsText periods={todayPeriods} />
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
