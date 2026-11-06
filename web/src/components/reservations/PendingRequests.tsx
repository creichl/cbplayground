import { useTranslation } from 'react-i18next'
import type { Reservation } from '../../api/reservations.ts'
import { RequestError } from '../booking/RequestError.tsx'
import { ReservationRow } from './ReservationRow.tsx'

type PendingRequestsProps = {
  /** The open requests from today on, sorted by start; undefined while they load. */
  requests: Reservation[] | undefined
  /** Why they could not be loaded; a failed reload in the background keeps the last list. */
  error: Error | null
  onRetry: () => void
  onOpen: (reservation: Reservation) => void
  selectedId: string | null
  /** Shown when there are none, e.g. "No open requests" or that none matches the search. */
  emptyText: string
}

/** The online requests that wait for the restaurant's answer, of every day from today on, with accept and decline. */
export function PendingRequests({ requests, error, onRetry, onOpen, selectedId, emptyText }: PendingRequestsProps) {
  const { t } = useTranslation()

  if (requests === undefined) {
    return error !== null ? <RequestError error={error} onRetry={onRetry} /> : null
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('reservations.pending.text')}</p>
      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        requests.map((reservation) => (
          <ReservationRow key={reservation.id} reservation={reservation} onOpen={onOpen} selected={reservation.id === selectedId} withDate />
        ))
      )}
    </section>
  )
}
