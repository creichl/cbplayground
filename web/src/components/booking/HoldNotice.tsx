import { HourglassIcon, TimerOffIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Hold } from '../../api/publicBooking.ts'
import { cn } from '../../lib/utils.ts'

/** The time left as "4:59"; never below 0:00. */
function formatLeft(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * The calm line under the head of the contact details while the table is held: "We're holding table R6 for you · 4:59", counting
 * down every second, in the warning colour in the last minute. At 0:00 it says that the hold has expired and the table may still
 * be free (booking still works); only that is announced to screen readers, not every second.
 */
export function HoldNotice({ hold }: { hold: Hold }) {
  const { t } = useTranslation()
  const expiresAt = Date.parse(hold.expiresAtUtc)
  const [now, setNow] = useState(() => Date.now())
  const left = expiresAt - now
  const expired = left <= 0

  useEffect(() => {
    if (expired) {
      return
    }
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [expired])

  const combined = hold.tableNumber.includes('+')
  return (
    <div data-hold-notice="" className={cn('flex items-center gap-2 text-sm', expired || left <= 60_000 ? 'text-warning' : 'text-muted-foreground')}>
      {expired ? <TimerOffIcon aria-hidden="true" className="size-4 shrink-0" /> : <HourglassIcon aria-hidden="true" className="size-4 shrink-0" />}
      {!expired && (
        <p className="tabular-nums">
          {t(combined ? 'booking.hold.holdingTables' : 'booking.hold.holding', { table: hold.tableNumber, left: formatLeft(left) })}
        </p>
      )}
      <p aria-live="polite" className={cn(!expired && 'sr-only')}>
        {expired ? t('booking.hold.expired') : ''}
      </p>
    </div>
  )
}
