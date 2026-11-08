import { useMemo, useSyncExternalStore } from 'react'

/**
 * A booking remembered in this browser, so the guest finds it again on the restaurant's page without the link at hand: its
 * restaurant, reference code and token (for the link), and what was booked ("YYYY-MM-DD", "HH:mm").
 */
export type RememberedBooking = {
  slug: string
  code: string
  token: string
  date: string
  time: string
  guests: number
  restaurantName: string
}

const storageKey = 'cbplayground.bookings'

/** The event by which the pages of this tab hear of a change; other tabs hear the storage's own event. */
const changeEvent = 'cbplayground:bookings'

/** At most this many bookings are remembered; a new one pushes out the oldest. */
const maxBookings = 10

/** The device's today, "YYYY-MM-DD"; a booking is remembered until the end of its day. */
function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function isBooking(value: unknown): value is RememberedBooking {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const entry = value as Record<string, unknown>
  return (
    ['slug', 'code', 'token', 'date', 'time', 'restaurantName'].every((key) => typeof entry[key] === 'string') && typeof entry.guests === 'number'
  )
}

/** The bookings of a stored text whose day has not passed; none for an empty or broken one. */
function parse(stored: string | null): RememberedBooking[] {
  try {
    const list: unknown = JSON.parse(stored ?? '[]')
    return Array.isArray(list) ? list.filter(isBooking).filter((booking) => booking.date >= today()) : []
  } catch {
    return []
  }
}

/** The stored text; null where the storage is blocked (e.g. in an embed of another site). */
function read() {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

/** Stores the bookings (without those whose day has passed); fails silently where the storage is blocked. */
function write(bookings: RememberedBooking[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(bookings.slice(-maxBookings)))
    window.dispatchEvent(new Event(changeEvent))
  } catch {
    // Blocked storage: the booking is simply not remembered.
  }
}

/** Remembers a booking; booked again (the same code), it replaces the earlier entry. */
export function rememberBooking(booking: RememberedBooking) {
  write([...parse(read()).filter((entry) => !(entry.slug === booking.slug && entry.code === booking.code)), booking])
}

/** Takes the new day, time and party size of a remembered booking after the guest changed it; nothing when it is not remembered. */
export function updateRememberedBooking(slug: string, code: string, change: Pick<RememberedBooking, 'date' | 'time' | 'guests'>) {
  const bookings = parse(read())
  if (bookings.some((entry) => entry.slug === slug && entry.code === code)) {
    write(bookings.map((entry) => (entry.slug === slug && entry.code === code ? { ...entry, ...change } : entry)))
  }
}

/** Forgets a booking, e.g. a cancelled one or on the guest's "×". */
export function forgetBooking(slug: string, code: string) {
  const bookings = parse(read())
  if (bookings.some((entry) => entry.slug === slug && entry.code === code)) {
    write(bookings.filter((entry) => !(entry.slug === slug && entry.code === code)))
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(changeEvent, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(changeEvent, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** The remembered bookings of a restaurant whose day has not passed, the next first; kept up to date when they change. */
export function useRememberedBookings(slug: string) {
  const stored = useSyncExternalStore(subscribe, read)
  return useMemo(
    () => parse(stored).filter((booking) => booking.slug === slug).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [stored, slug],
  )
}
