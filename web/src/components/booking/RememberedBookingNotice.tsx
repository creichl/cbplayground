import { ArrowRightIcon, CalendarCheckIcon, XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { managePath } from '../../api/publicBooking.ts'
import { formatShortDate, formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { forgetBooking, useRememberedBookings } from './rememberedBookings.ts'

type RememberedBookingNoticeProps = {
  slug: string
  /** The embed: the guest's page opens in a new tab, as the confirmation's "Manage reservation". */
  newTab?: boolean
  className?: string
}

/**
 * A calm notice above the reservation card when this browser remembers a booking of the restaurant (rememberedBookings): "You
 * have a reservation on Fri, Nov 14 at 7:30 PM for 4 · View", linking to the guest's page, and "×" to forget it. Of several
 * the next one. Nothing without one, also where the storage is blocked.
 */
export function RememberedBookingNotice({ slug, newTab = false, className }: RememberedBookingNoticeProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [booking] = useRememberedBookings(slug)

  if (booking === undefined) {
    return null
  }

  const path = managePath(slug, booking.code, booking.token)
  const linkClassName =
    'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 font-semibold text-primary-text underline-offset-4 hover:underline focus-ring'

  return (
    <div
      role="note"
      aria-label={t('booking.remembered.label')}
      className={cn('flex items-center gap-3 rounded-xl border border-border bg-card py-1 pr-1 pl-4 text-sm text-card-foreground shadow-card animate-fade-in', className)}
    >
      <CalendarCheckIcon aria-hidden="true" className="size-5 shrink-0 text-success" />
      <p className="min-w-0 flex-1 py-2">
        {t('booking.remembered.text', { date: formatShortDate(booking.date, language), time: formatTime(booking.time, language), guests: booking.guests })}
      </p>
      {newTab ? (
        <a href={path} target="_blank" rel="noopener noreferrer" className={linkClassName}>
          {t('booking.remembered.view')}
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </a>
      ) : (
        <Link to={path} viewTransition className={linkClassName}>
          {t('booking.remembered.view')}
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Link>
      )}
      <button
        type="button"
        aria-label={t('booking.remembered.forget')}
        onClick={() => forgetBooking(slug, booking.code)}
        className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground press hover:bg-accent hover:text-accent-foreground focus-ring"
      >
        <XIcon aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}
