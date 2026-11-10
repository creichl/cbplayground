import { useEffect, useState } from 'react'

// The time left of the guest's hold, for its countdown (HoldNotice) and the question before the sheet closes (BookingFlow).

/** The time left as "4:59"; never below 0:00. */
export function formatLeft(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** The milliseconds left until `expiresAtUtc` (ISO 8601), updated every second until none are left. */
export function useTimeLeft(expiresAtUtc: string) {
  const expiresAt = Date.parse(expiresAtUtc)
  const [now, setNow] = useState(() => Date.now())
  const left = expiresAt - now
  const ended = left <= 0

  useEffect(() => {
    if (ended) {
      return
    }
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [ended])
  return left
}
