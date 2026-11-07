import type { TFunction } from 'i18next'

/** A waiting time of the waitlist in the user's language: "12 min", "1 h" or "1 h 5 min". */
export function waitDuration(minutes: number, t: TFunction) {
  const hours = Math.floor(minutes / 60)
  if (hours === 0) {
    return t('waitlist.minutes', { count: minutes })
  }
  return minutes % 60 === 0 ? t('waitlist.hours', { hours }) : t('waitlist.hoursMinutes', { hours, minutes: minutes % 60 })
}
