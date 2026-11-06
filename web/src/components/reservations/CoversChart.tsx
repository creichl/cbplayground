import { useTranslation } from 'react-i18next'
import { formatMinutes, type Reservation, toMinutes } from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { isActive } from './status.ts'

type CoversChartProps = {
  /** The reservations of the day or of the chosen service, all statuses; only the expected ones count. */
  reservations: Reservation[]
  /** The shown range in minutes since midnight, on quarter hours. */
  start: number
  end: number
  /** The current time when the day is today, otherwise null; the quarter hours before it are faded. */
  nowMinutes: number | null
  className?: string
}

const step = 15

/**
 * A small bar per quarter hour with the covers starting then (without cancelled, declined and no-show reservations), so the
 * busy times show at a glance. The full hours are labelled below the bars.
 */
export function CoversChart({ reservations, start, end, nowMinutes, className }: CoversChartProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const slots: { minutes: number; covers: number }[] = []
  for (let minutes = start; minutes < end; minutes += step) {
    slots.push({ minutes, covers: 0 })
  }
  for (const reservation of reservations.filter(isActive)) {
    const slot = slots[Math.floor((toMinutes(reservation.time) - start) / step)]
    if (slot !== undefined) {
      slot.covers += reservation.guests
    }
  }
  if (slots.length === 0) {
    return null
  }
  const busiest = slots.reduce((top, slot) => (slot.covers > top.covers ? slot : top), slots[0])
  const label = (minutes: number) => formatTime(formatMinutes(minutes), language)
  const summary =
    busiest.covers === 0
      ? t('reservations.chart.empty')
      : t('reservations.chart.summary', { time: label(busiest.minutes), count: busiest.covers })

  return (
    <figure className={cn('flex min-w-0 flex-col gap-1', className)}>
      <figcaption className="text-xs text-muted-foreground">{t('reservations.chart.title')}</figcaption>
      <div role="img" aria-label={`${t('reservations.chart.title')}: ${summary}`} className="flex h-10 items-end gap-px">
        {slots.map((slot) => (
          <div
            key={slot.minutes}
            title={t('reservations.chart.bar', { time: label(slot.minutes), count: slot.covers })}
            className={cn(
              'min-w-0.5 flex-1 rounded-t-sm',
              slot.covers === 0 ? 'bg-border' : 'bg-primary',
              nowMinutes !== null && slot.minutes + step <= nowMinutes && 'opacity-40',
            )}
            style={{ height: slot.covers === 0 ? 2 : `${Math.max(12, (slot.covers / busiest.covers) * 100)}%` }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="relative h-4 text-[0.6875rem] text-muted-foreground tabular-nums">
        {slots
          // Every hour, or every other hour on a long day, so the labels do not run into each other.
          .filter((slot) => slot.minutes % (end - start > 6 * 60 ? 120 : 60) === 0)
          .map((slot) => (
            <span key={slot.minutes} className="absolute -translate-x-1/2" style={{ left: `${((slot.minutes - start) / (end - start)) * 100}%` }}>
              {label(slot.minutes)}
            </span>
          ))}
      </div>
    </figure>
  )
}
