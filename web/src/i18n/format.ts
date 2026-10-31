import type { DateFormatter } from '@mantine/dates'
import dayjs from 'dayjs'

// The one place where dates and times are formatted for the UI, so every page shows them alike in the user's language.
// Dates are local calendar dates "YYYY-MM-DD", times "HH:mm"; both are built in local time so the day does not shift.

function toDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** A date with weekday, without year, e.g. "Sa., 31. Okt." or "Sat, Oct 31". */
export function formatShortDate(date: string, language: string) {
  return new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short' }).format(toDate(date))
}

/** A date with weekday and year, e.g. "Sa., 31. Okt. 2026" or "Sat, Oct 31, 2026". Also the format of the date pickers. */
export function formatDate(date: string, language: string) {
  return new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(date))
}

/** A date written out, e.g. "Samstag, 31. Oktober 2026" or "Saturday, October 31, 2026". */
export function formatLongDate(date: string, language: string) {
  return new Intl.DateTimeFormat(language, { dateStyle: 'full' }).format(toDate(date))
}

/** A time "HH:mm" in the user's language, e.g. "19:00" or "7:00 PM". The closing time "24:00" stays 24:00 on a 24-hour clock. */
export function formatTime(time: string, language: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const format = new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' })
  if (hours === 24 && format.resolvedOptions().hourCycle === 'h23') {
    return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h24' }).format(new Date(2000, 0, 1, 0, 0))
  }
  return format.format(new Date(2000, 0, 1, hours, minutes))
}

/**
 * The value of a Mantine date picker (single date) in the format of `formatDate`, for its `valueFormatter`.
 * Mantine's own `valueFormat` uses dayjs' locale data, whose abbreviations differ from the rest of the UI.
 */
export function datePickerFormatter(language: string): DateFormatter {
  return ({ date }) => (date === null || Array.isArray(date) ? '' : formatDate(dayjs(date).format('YYYY-MM-DD'), language))
}
