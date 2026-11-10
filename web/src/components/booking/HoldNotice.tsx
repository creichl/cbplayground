import { HourglassIcon, LoaderCircleIcon, TimerOffIcon } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { Hold } from '../../api/publicBooking.ts'
import { cn } from '../../lib/utils.ts'
import { formatLeft, useTimeLeft } from './holdTime.ts'

/** How long a hold lasts (ReservationRules.HoldDuration in the API): the line under the head is full then. */
const holdDuration = 5 * 60_000

/** From here on (the last minute) the countdown is in the warning colour. */
const warningFrom = 60_000

/**
 * The calm line under the head of the contact details while the table is held: "We're holding table R6 for you · 4:59", counting
 * down every second (a changed digit slides up), and a thin line along the bottom edge of the head that drains from full to empty
 * over the hold. In the last minute both are in the warning colour, after one soft pulse. At 0:00 it says that the hold has ended,
 * with "Hold again" (`onHoldAgain`), which holds the table anew; booking still works without it. Only the last minute and the end
 * are announced to screen readers, not every second. The head it lies in needs a position, for the line.
 */
export function HoldNotice({ hold, onHoldAgain }: { hold: Hold; onHoldAgain: () => void }) {
  const { t } = useTranslation()
  const left = useTimeLeft(hold.expiresAtUtc)
  const ended = left <= 0
  const warning = !ended && left <= warningFrom
  // "Hold again" was pressed: the notice waits for the new hold, which replaces it, or for the message that the table is gone.
  const [renewing, setRenewing] = useState(false)

  const holdAgain = () => {
    if (!renewing) {
      setRenewing(true)
      onHoldAgain()
    }
  }

  const combined = hold.tableNumber.includes('+')
  return (
    <div
      data-hold-notice=""
      data-state={ended ? 'ended' : warning ? 'warning' : 'holding'}
      className={cn('flex min-h-6 flex-wrap items-center gap-x-2 text-sm', ended || warning ? 'text-warning' : 'text-muted-foreground')}
    >
      <span className={cn('flex items-center gap-2', warning && 'motion-safe:animate-hold-pulse')}>
        {ended ? <TimerOffIcon aria-hidden="true" className="size-4 shrink-0" /> : <HourglassIcon aria-hidden="true" className="size-4 shrink-0" />}
        {!ended && (
          <span className="tabular-nums">
            <Trans
              i18nKey={combined ? 'booking.hold.holdingTables' : 'booking.hold.holding'}
              values={{ table: hold.tableNumber }}
              components={{ left: <RollingTime text={formatLeft(left)} /> }}
            />
          </span>
        )}
      </span>
      <p aria-live="polite" className={cn(!ended && 'sr-only')}>
        {ended ? t('booking.hold.ended') : warning ? t('booking.hold.lastMinute') : ''}
      </p>
      {ended && (
        <button
          type="button"
          onClick={holdAgain}
          aria-disabled={renewing || undefined}
          className="inline-flex min-h-6 cursor-pointer items-center gap-1.5 rounded-sm font-medium text-primary-text underline underline-offset-4 focus-ring touch:min-h-11"
        >
          {renewing && <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
          {t('booking.hold.holdAgain')}
        </button>
      )}
      {/*
       * The line drains with the countdown: every second it glides to the next value, linearly, so it moves on without a stop. Only
       * its transform moves; the warning colour comes at once, with the pulse.
       */}
      <span
        aria-hidden="true"
        data-hold-line=""
        className={cn(
          'pointer-events-none absolute inset-x-0 -bottom-px h-0.5 origin-left transition-transform duration-1000 ease-linear',
          ended || warning ? 'bg-warning' : 'bg-primary',
        )}
        style={{ transform: `scaleX(${Math.min(1, Math.max(0, left) / holdDuration)})` }}
      />
    </div>
  )
}

/** The countdown's text with each digit in its own box, so a changed digit slides up into place (keyed by its value). */
function RollingTime({ text }: { text: string }) {
  return (
    <span className="inline-flex overflow-clip">
      {[...text].map((character, index) => (
        <span key={`${index}-${character}`} className={cn('inline-block', character !== ':' && 'motion-safe:animate-digit-roll')}>
          {character}
        </span>
      ))}
    </span>
  )
}
