import type { DateFormatter } from '@mantine/dates'
import type { ParseKeys } from 'i18next'
import dayjs from 'dayjs'
import i18n from './index.ts'

// The one place where dates and times are formatted for the UI, so every page shows them alike in the user's language.
// Dates are local calendar dates "YYYY-MM-DD", times "HH:mm"; both are built in local time so the day does not shift.
// Moments of the API (UTC with "Z") are shown in the device's time zone.

function toDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** A date with weekday, without year, e.g. "Sa., 31. Okt." or "Sat, Oct 31". */
export function formatShortDate(date: string, language: string) {
  return new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short' }).format(toDate(date))
}

/** A date as day and month in figures, e.g. "31.10." or "10/31", for the axis of a chart. */
export function formatDayMonth(date: string, language: string) {
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'numeric' }).format(toDate(date))
}

/** The short name of a weekday, 1 (Monday) to 7 (Sunday) as in ISO 8601, e.g. "Mo" or "Mon". */
export function formatWeekday(weekday: number, language: string) {
  // 1 January 2024 was a Monday.
  return new Intl.DateTimeFormat(language, { weekday: 'short' }).format(new Date(2024, 0, weekday))
}

/** The weekday of a date written out, e.g. "Mittwoch" or "Wednesday" (in Serbian in lower case, as in a sentence). */
export function formatWeekdayName(date: string, language: string) {
  return new Intl.DateTimeFormat(language, { weekday: 'long' }).format(toDate(date))
}

/** Two dates of the same span as day and month, e.g. "24.–26. Dez." or "Dec 24 – 26"; one date when they are the same. */
export function formatDateRange(from: string, to: string, language: string) {
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).formatRange(toDate(from), toDate(to))
}

/** A date with weekday and year, e.g. "Sa., 31. Okt. 2026" or "Sat, Oct 31, 2026". Also the format of the date pickers. */
export function formatDate(date: string, language: string) {
  return new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(date))
}

/** A date written out, e.g. "Samstag, 31. Oktober 2026" or "Saturday, October 31, 2026". */
export function formatLongDate(date: string, language: string) {
  return new Intl.DateTimeFormat(language, { dateStyle: 'full' }).format(toDate(date))
}

/**
 * A day relative to today, both "YYYY-MM-DD" (today e.g. in the restaurant's time zone): "Today" and "Tomorrow" (in the user's
 * language), otherwise the weekday written out with day and month, e.g. "Saturday, Nov 15" or "Samstag, 15. Nov.", with a capital letter.
 */
export function formatRelativeDay(date: string, today: string, language: string) {
  const days = Math.round((toDate(date).getTime() - toDate(today).getTime()) / 86_400_000)
  if (days === 0) {
    return i18n.t('common.today', { lng: language })
  }
  if (days === 1) {
    return i18n.t('common.tomorrow', { lng: language })
  }
  const day = new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'short' }).format(toDate(date))
  // It starts a heading, so with a capital letter also in Serbian, which writes its weekdays in lower case.
  return day.charAt(0).toLocaleUpperCase(language) + day.slice(1)
}

/**
 * A moment with time zone (ISO 8601, e.g. a UTC time of the API) as date and time in the device's time zone,
 * e.g. "31. Okt. 2026, 19:05" or "Oct 31, 2026, 7:05 PM".
 */
export function formatDateTime(moment: string, language: string) {
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(moment))
}

/**
 * A time "HH:mm" in the user's language, e.g. "19:00" or "7:00 PM". The closing time "24:00" stays 24:00 on a 24-hour clock
 * (de, sr-Latn, sr-Cyrl) and is "midnight" on a 12-hour clock (en), never "12:00 AM".
 */
export function formatTime(time: string, language: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const format = new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' })
  if (hours === 24) {
    return format.resolvedOptions().hourCycle === 'h23'
      ? new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h24' }).format(new Date(2000, 0, 1, 0, 0))
      : i18n.t('common.midnight', { lng: language })
  }
  return format.format(new Date(2000, 0, 1, hours, minutes))
}

/**
 * A price in minor units (cents or para) in its currency, in the user's language, e.g. "14,90 €", "€14.90" or "1.250 RSD".
 * Euros always with their cents; dinars, which are priced in whole dinars, with para only when there are any.
 */
export function formatPrice(minorUnits: number, currency: 'EUR' | 'RSD', language: string) {
  const amount = minorUnits / 100
  const fractionDigits = currency === 'RSD' && Number.isInteger(amount) ? 0 : 2
  return new Intl.NumberFormat(language, { style: 'currency', currency, minimumFractionDigits: fractionDigits, maximumFractionDigits: 2 }).format(amount)
}

/**
 * The value of a Mantine date picker (a single date or a range) in the format of `formatDate`, for its `valueFormatter`.
 * Mantine's own `valueFormat` uses dayjs' locale data, whose abbreviations differ from the rest of the UI.
 */
export function datePickerFormatter(language: string): DateFormatter {
  const format = (date: Parameters<typeof dayjs>[0]) => formatDate(dayjs(date).format('YYYY-MM-DD'), language)
  return ({ date, labelSeparator }) => {
    if (Array.isArray(date)) {
      return date
        .filter((day) => day !== null)
        .map(format)
        .join(` ${labelSeparator} `)
    }
    return date === null ? '' : format(date)
  }
}

/**
 * The name of an opening window after the time it starts ("HH:mm"): morning, lunch or evening. The guest's booking names its
 * windows so, and the front desk its services, e.g. "Lunch 11:30–14:30".
 */
export function periodLabel(start: string): ParseKeys {
  const hour = Number(start.slice(0, 2))
  return hour < 11 ? 'booking.time.morning' : hour < 16 ? 'booking.time.midday' : 'booking.time.evening'
}
