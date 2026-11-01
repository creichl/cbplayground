import { CalendarXIcon, TriangleAlertIcon } from 'lucide-react'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { type Availability, useAvailability, useNextFreeDays } from '../../api/publicBooking.ts'
import { formatShortDate, formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Alert, AlertDescription } from '../../ui/alert.tsx'
import { Skeleton } from '../../ui/skeleton.tsx'
import { RequestError } from './RequestError.tsx'

type TimeSlotGridProps = {
  slug: string
  date: string
  guests: number
  value: string | null
  /** The last day that can be booked online, "YYYY-MM-DD", for the next free days. */
  maxDate: string
  /** A hint above the times, e.g. that the chosen time has just been taken. */
  notice: ParseKeys | null
  onChange: (time: string) => void
  onChangeDate: (date: string) => void
}

/** The attribute of a time chip, by which the focus finds it again when the booking dialog closes. */
export const timeChipAttribute = 'data-time-chip'

/** Name of an opening window after the time it starts. */
function periodLabel(start: string): ParseKeys {
  const hour = Number(start.slice(0, 2))
  return hour < 11 ? 'booking.time.morning' : hour < 16 ? 'booking.time.midday' : 'booking.time.evening'
}

/** The opening windows of a day with only their free start times; windows without one are left out. */
function freePeriods(availability: Availability | undefined) {
  return (availability?.periods ?? [])
    .map((period) => ({ ...period, times: period.times.filter((time) => time.available) }))
    .filter((period) => period.times.length > 0)
}

/** Chips of times and days: 44 px high, in a grid that keeps them the same width. */
const chipClassName =
  'inline-flex h-11 cursor-pointer items-center justify-center rounded-full border px-3 text-sm font-medium tabular-nums transition-colors focus-ring'

/**
 * The free start times of a day as chips, grouped by opening window ("Lunch 11:30–14:30"); times that are not available are
 * left out. A click on a time opens the booking dialog. A fully booked day offers the next free days instead.
 */
export function TimeSlotGrid({ slug, date, guests, value, maxDate, notice, onChange, onChangeDate }: TimeSlotGridProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const availability = useAvailability(slug, date, guests)
  const periods = freePeriods(availability.data)
  const full = availability.isSuccess && periods.length === 0
  const nextFreeDays = useNextFreeDays(slug, date, maxDate, guests, full)

  return (
    <div className="flex flex-col gap-5">
      {notice !== null && (
        <Alert variant="warning">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>{t(notice)}</AlertDescription>
        </Alert>
      )}

      {availability.isPending ? (
        // In the shape of the times, so nothing jumps when they arrive.
        <div className="flex flex-col gap-3" aria-hidden="true">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 rounded-full" />
            ))}
          </div>
        </div>
      ) : availability.isError ? (
        <RequestError error={availability.error} onRetry={() => void availability.refetch()} />
      ) : full ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 font-semibold">
            <CalendarXIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            {t('booking.time.noTables')}
          </p>
          {nextFreeDays.isPending ? (
            <div className="flex flex-wrap gap-2" aria-hidden="true">
              <Skeleton className="h-11 w-28 rounded-full" />
              <Skeleton className="h-11 w-28 rounded-full" />
              <Skeleton className="h-11 w-28 rounded-full" />
            </div>
          ) : nextFreeDays.days.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('booking.time.noFreeDays')}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {nextFreeDays.days.map((day) => (
                <li key={day}>
                  <button
                    type="button"
                    onClick={() => onChangeDate(day)}
                    className={cn(chipClassName, 'border-input bg-background px-4 hover:border-primary hover:bg-primary-50 dark:hover:bg-accent')}
                  >
                    {formatShortDate(day, language)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        periods.map((period) => (
          <section key={period.start} className="flex flex-col gap-2" aria-labelledby={`period-${period.start}`}>
            <h3 id={`period-${period.start}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-semibold">{periods.length > 1 ? t(periodLabel(period.start)) : t('booking.time.freeTimes')}</span>
              <span className="text-muted-foreground">
                {t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) })}
              </span>
            </h3>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {period.times.map(({ time }) => (
                <li key={time}>
                  <button
                    type="button"
                    {...{ [timeChipAttribute]: time }}
                    aria-pressed={value === time}
                    onClick={() => onChange(time)}
                    className={cn(
                      chipClassName,
                      'w-full',
                      value === time
                        ? 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover'
                        : 'border-input bg-background hover:border-primary hover:bg-primary-50 dark:hover:bg-accent',
                    )}
                  >
                    {formatTime(time, language)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
