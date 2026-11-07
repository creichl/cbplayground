import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { Reservation } from '../../api/reservations.ts'
import { cn } from '../../lib/utils.ts'
import { isActive } from './status.ts'

type DayStatsProps = {
  /** The reservations of the day or of the chosen service, all statuses. */
  reservations: Reservation[]
  /** The number of open requests from today on. */
  openRequests: number
  /** Shows the guests seated now, the finished reservations and the no-shows; the admin overview leaves them out. */
  withArrived?: boolean
  /** Where the open requests are answered, as a link (admin overview). */
  requestsTo?: string
  /** Shows the open requests, e.g. the tab "Requests" of the front desk; wins over `requestsTo`. */
  onOpenRequests?: () => void
  /** The parties on the waitlist and their guests (front desk); left out without it. */
  waiting?: { parties: number; guests: number }
  className?: string
}

const sum = (reservations: Reservation[]) => reservations.reduce((total, reservation) => total + reservation.guests, 0)

/**
 * The key figures of a day or a service: reservations and covers expected (without cancelled, declined and no-show ones),
 * guests seated now (arrived and not left yet), finished reservations (the guests left), no-shows, the parties waiting on the
 * waitlist and the open requests.
 */
export function DayStats({ reservations, openRequests, withArrived = true, requestsTo, onOpenRequests, waiting, className }: DayStatsProps) {
  const { t } = useTranslation()
  const active = reservations.filter(isActive)
  const arrived = reservations.filter((reservation) => reservation.status === 'Arrived')
  const completed = reservations.filter((reservation) => reservation.status === 'Completed')
  const noShows = reservations.filter((reservation) => reservation.status === 'NoShow')
  const requestsLabel = t('reservations.stats.openRequests')
  const highlight = openRequests > 0
  const requestsClass = cn(
    'flex min-w-28 flex-col rounded-xl border px-3 py-2 text-left transition-colors focus-ring touch:min-h-11',
    highlight ? 'border-status-requested bg-status-requested-surface hover:bg-status-requested-surface/70' : 'border-border bg-card hover:bg-accent',
  )
  const requestsContent = (
    <>
      <span className={cn('text-xs', highlight ? 'text-status-requested-text' : 'text-muted-foreground')}>{requestsLabel}</span>
      <span className={cn('text-2xl leading-tight font-semibold tabular-nums', highlight && 'text-status-requested-text')}>{openRequests}</span>
    </>
  )

  return (
    <dl className={cn('flex flex-wrap gap-2', className)}>
      <Stat label={t('reservations.stats.reservations')} value={active.length} detail={t('reservations.stats.covers', { count: sum(active) })} />
      {withArrived && (
        <>
          <Stat label={t('reservations.stats.seated')} value={sum(arrived)} detail={t('reservations.stats.tables', { count: arrived.length })} />
          <Stat label={t('reservations.stats.finished')} value={completed.length} detail={t('reservations.stats.covers', { count: sum(completed) })} />
          <Stat label={t('reservations.stats.noShows')} value={noShows.length} />
        </>
      )}
      {waiting !== undefined && (
        <Stat label={t('reservations.stats.waiting')} value={waiting.parties} detail={t('reservations.stats.covers', { count: waiting.guests })} />
      )}
      <div className="contents">
        <dt className="sr-only">{requestsLabel}</dt>
        <dd>
          {onOpenRequests !== undefined ? (
            <button type="button" className={cn(requestsClass, 'cursor-pointer')} onClick={onOpenRequests} aria-label={`${requestsLabel}: ${openRequests}`}>
              {requestsContent}
            </button>
          ) : requestsTo !== undefined ? (
            <Link to={requestsTo} className={requestsClass} aria-label={`${requestsLabel}: ${openRequests}`}>
              {requestsContent}
            </Link>
          ) : (
            <span className={requestsClass}>{requestsContent}</span>
          )}
        </dd>
      </div>
    </dl>
  )
}

function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return (
    <div className="flex min-w-28 flex-col rounded-xl border border-border bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="text-2xl leading-tight font-semibold tabular-nums">{value}</span>
        {detail !== undefined && <span className="text-xs whitespace-nowrap text-muted-foreground">{detail}</span>}
      </dd>
    </div>
  )
}
