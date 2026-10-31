/** The offset of a time zone from UTC at an instant, in milliseconds (local − UTC). */
function timeZoneOffset(instant: number, timeZoneId: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZoneId,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant))
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  const local = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
  return local - Math.floor(instant / 1000) * 1000
}

/** The instant of a local date "YYYY-MM-DD" and time "HH:mm" in the restaurant's time zone. */
export function restaurantTimeToUtc(date: string, time: string, timeZoneId: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  const asUtc = Date.UTC(year, month - 1, day, hours, minutes)
  // The offset at the guessed instant may differ near a change of daylight saving time; the second pass corrects it.
  const first = asUtc - timeZoneOffset(asUtc, timeZoneId)
  return new Date(asUtc - timeZoneOffset(first, timeZoneId))
}

/** A UTC time in the iCalendar form, e.g. "20261114T170000Z". */
function icsTime(instant: Date) {
  return instant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Escapes a text value (RFC 5545, 3.3.11). */
function icsText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Folds a content line after 75 octets (RFC 5545, 3.1), without splitting a character. */
function fold(line: string) {
  const encoder = new TextEncoder()
  const lines: string[] = []
  let current = ''
  let octets = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // Continuation lines start with a space, which counts towards their 75 octets.
    if (octets + size > (lines.length === 0 ? 75 : 74)) {
      lines.push(current)
      current = ''
      octets = 0
    }
    current += char
    octets += size
  }
  lines.push(current)
  return lines.join('\r\n ')
}

export type CalendarEvent = {
  /** Unique and stable, so importing the file twice updates the event instead of adding a second one. */
  uid: string
  title: string
  /** "YYYY-MM-DD" and "HH:mm" in the restaurant's local time. */
  date: string
  time: string
  durationMinutes: number
  timeZoneId: string
  location: string
  description: string
  url: string
}

/**
 * An iCalendar file (.ics) with one event. Start and end are given in UTC, converted from the restaurant's time zone,
 * so every calendar shows the right time without needing a time zone definition.
 */
export function calendarFile(event: CalendarEvent) {
  const start = restaurantTimeToUtc(event.date, event.time, event.timeZoneId)
  const end = new Date(start.getTime() + event.durationMinutes * 60_000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//cbplayground//Reservation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${icsTime(new Date())}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(event.title)}`,
    ...(event.location !== '' ? [`LOCATION:${icsText(event.location)}`] : []),
    `DESCRIPTION:${icsText(event.description)}`,
    `URL:${event.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Lets the browser save the file, which the calendar app then opens. */
export function downloadCalendarFile(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Some browsers start the download only after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
