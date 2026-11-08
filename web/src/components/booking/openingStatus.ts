import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { OpeningPeriod } from '../../api/openingHours.ts'
import { nowIn, type PublicRestaurant, todayIn, type UpcomingChange } from '../../api/publicBooking.ts'
import { formatShortDate, formatTime, formatWeekdayName } from '../../i18n/format.ts'

/** An opening window, "HH:mm"; the end may be "24:00". */
export type Period = { start: string; end: string }

/** How many days from today the next opening is looked for, the days `upcomingChanges` covers. */
const lookAheadDays = 14

/** From how many minutes before the end of a window it is "Closes soon". */
const closingSoonMinutes = 30

/**
 * Whether the restaurant is open at a moment:
 * - `open`: in a window that ends at `until`; `closingSoon` within the last 30 minutes of it;
 * - `opensLater`: closed now, opens again today at `at`; `again` when it was already open today (between two windows);
 * - `closed`: closed for the rest of today; `next` is the next opening within 14 days (`inDays` from today, 1 = tomorrow),
 *   null without one.
 */
export type LiveStatus =
  | { state: 'open'; until: string; closingSoon: boolean }
  | { state: 'opensLater'; at: string; again: boolean }
  | { state: 'closed'; next: { date: string; start: string; inDays: number } | null }

/** The date `days` after a date, both "YYYY-MM-DD". */
export function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** The day of the week of a date "YYYY-MM-DD", 0 = Sunday, at noon UTC so the day does not shift. */
export function dayOfWeekOf(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

/**
 * The opening windows of a day, sorted by start: those of its entry in `changes` (a closing day, a closed public holiday,
 * special hours) if it has one, otherwise the regular hours of its day of the week.
 */
export function periodsOn(date: string, week: OpeningPeriod[], changes: UpcomingChange[]): Period[] {
  const change = changes.find((entry) => entry.date === date)
  const periods = change !== undefined ? change.periods : week.filter((period) => period.dayOfWeek === dayOfWeekOf(date))
  return periods.map(({ start, end }) => ({ start, end })).sort((a, b) => a.start.localeCompare(b.start))
}

function minutesOf(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * The live status at `now` ("HH:mm") on `today` ("YYYY-MM-DD"), both in the restaurant's time zone, from the regular week
 * and the days that differ from it. A pure function: the status line of the cover image and of the card "Hours &
 * location" (useOpeningStatus) words it.
 */
export function liveStatus(week: OpeningPeriod[], changes: UpcomingChange[], today: string, now: string): LiveStatus {
  const periods = periodsOn(today, week, changes)
  const current = minutesOf(now)
  const open = periods.find((period) => minutesOf(period.start) <= current && current < minutesOf(period.end))
  if (open !== undefined) {
    return { state: 'open', until: open.end, closingSoon: minutesOf(open.end) - current <= closingSoonMinutes }
  }
  const later = periods.find((period) => minutesOf(period.start) > current)
  if (later !== undefined) {
    return { state: 'opensLater', at: later.start, again: periods.some((period) => minutesOf(period.end) <= current) }
  }
  for (let inDays = 1; inDays < lookAheadDays; inDays++) {
    const date = addDays(today, inDays)
    const [first] = periodsOn(date, week, changes)
    if (first !== undefined) {
      return { state: 'closed', next: { date, start: first.start, inDays } }
    }
  }
  return { state: 'closed', next: null }
}

/** How the status looks: its dot (and, closing soon, its text) in the colour of open, closing soon or closed. */
export type StatusTone = 'open' | 'soon' | 'closed'

/** Today ("YYYY-MM-DD") and now ("HH:mm") in a time zone, again at every full minute. */
function useMinute(timeZoneId: string | null) {
  const read = () => (timeZoneId === null ? null : { today: todayIn(timeZoneId), now: nowIn(timeZoneId) })
  const [moment, setMoment] = useState(read)

  useEffect(() => {
    if (timeZoneId === null) {
      return
    }
    let timer: number
    const tick = () => {
      setMoment((previous) => {
        const next = { today: todayIn(timeZoneId), now: nowIn(timeZoneId) }
        return previous?.today === next.today && previous.now === next.now ? previous : next
      })
      // Just after the next full minute.
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
    }
    tick()
    return () => window.clearTimeout(timer)
  }, [timeZoneId])

  return timeZoneId === null ? null : moment
}

/**
 * The live status of a restaurant in its time zone, updated every minute while the page is open: `text` is the long form
 * of the card "Hours & location" ("Open now · until 10:00 PM", "Opens again at 5:30 PM", "Opens today at 11:30 AM",
 * "Closed · opens tomorrow at 11:30 AM", "Closed · opens Wednesday at 5:00 PM" (a date from a week ahead), "Closed today", "Closes soon · 10:00 PM"),
 * `shortText` the short one of the chip on the cover image ("Open now · until midnight", "Opens at 5:00 PM", "Closed today",
 * "Closes soon · 10:00 PM"). `today` is today's date and `todayPeriods` today's windows (public holidays, closing days and
 * special hours count). Null for a restaurant without location.
 */
export function useOpeningStatus(restaurant: PublicRestaurant) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const moment = useMinute(restaurant.timeZoneId)

  if (moment === null) {
    return null
  }
  const { today, now } = moment
  const status = liveStatus(restaurant.openingHours, restaurant.upcomingChanges, today, now)
  const time = (value: string) => formatTime(value, language)
  let text: string
  let shortText: string
  let tone: StatusTone
  switch (status.state) {
    case 'open':
      tone = status.closingSoon ? 'soon' : 'open'
      text = status.closingSoon
        ? t('booking.restaurant.status.closesSoon', { time: time(status.until) })
        : t('booking.restaurant.status.openUntil', { time: time(status.until) })
      shortText = text
      break
    case 'opensLater':
      tone = 'closed'
      text = status.again
        ? t('booking.restaurant.status.opensAgain', { time: time(status.at) })
        : t('booking.restaurant.status.opensToday', { time: time(status.at) })
      shortText = t('booking.restaurant.status.opensAt', { time: time(status.at) })
      break
    case 'closed':
      tone = 'closed'
      shortText = t('booking.restaurant.closedToday')
      text =
        status.next === null
          ? shortText
          : status.next.inDays === 1
            ? t('booking.restaurant.status.opensTomorrow', { time: time(status.next.start) })
            : t('booking.restaurant.status.opensOn', {
                // A weekday names the day only within the week ahead; further ahead the date does.
                day: status.next.inDays < 7 ? formatWeekdayName(status.next.date, language) : formatShortDate(status.next.date, language),
                time: time(status.next.start),
              })
      break
  }
  return { tone, text, shortText, today, todayPeriods: periodsOn(today, restaurant.openingHours, restaurant.upcomingChanges) }
}
