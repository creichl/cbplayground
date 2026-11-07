import { useTranslation } from 'react-i18next'
import type { Reservation } from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { ReservationRow } from './ReservationRow.tsx'
import { isActive } from './status.ts'

type ReservationListProps = {
  /** Sorted by start, as the API returns them. */
  reservations: Reservation[]
  onOpen: (reservation: Reservation) => void
  /** The reservation selected on the screen. */
  selectedId: string | null
  /** Shown when the list is empty. */
  emptyText: string
}

/** The reservations of a day, grouped by start time; the time of each group stays on top while its rows scroll. */
export function ReservationList({ reservations, onOpen, selectedId, emptyText }: ReservationListProps) {
  const { t, i18n } = useTranslation()

  if (reservations.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
  }

  const groups: { time: string; reservations: Reservation[] }[] = []
  for (const reservation of reservations) {
    const last = groups.at(-1)
    if (last?.time === reservation.time) {
      last.reservations.push(reservation)
    } else {
      groups.push({ time: reservation.time, reservations: [reservation] })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.time} className="flex flex-col gap-2">
          <h3 className="sticky top-0 z-10 flex items-baseline gap-2 bg-background/95 py-1 text-sm font-semibold backdrop-blur-sm">
            <span className="tabular-nums">{formatTime(group.time, i18n.resolvedLanguage ?? 'en')}</span>
            <span className="font-normal text-muted-foreground">
              {t('reservations.list.groupGuests', {
                count: group.reservations.filter(isActive).reduce((sum, reservation) => sum + reservation.guests, 0),
              })}
            </span>
          </h3>
          {group.reservations.map((reservation) => (
            <ReservationRow key={reservation.id} reservation={reservation} onOpen={onOpen} selected={reservation.id === selectedId} />
          ))}
        </section>
      ))}
    </div>
  )
}
