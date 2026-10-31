import { Card, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { Reservation } from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { ReservationRow } from './ReservationRow.tsx'
import { isActive } from './status.ts'

type ReservationListProps = {
  /** Sorted by start, as the API returns them. */
  reservations: Reservation[]
  onOpen: (reservation: Reservation) => void
  /** Shown when the list is empty. */
  emptyText: string
}

/** The reservations of a day, grouped by start time. */
export function ReservationList({ reservations, onOpen, emptyText }: ReservationListProps) {
  const { t, i18n } = useTranslation()

  if (reservations.length === 0) {
    return (
      <Card>
        <Text c="dimmed">{emptyText}</Text>
      </Card>
    )
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
    <Stack gap="lg">
      {groups.map((group) => (
        <Stack key={group.time} gap="xs" component="section">
          <Title order={4}>
            {formatTime(group.time, i18n.resolvedLanguage ?? 'en')}{' '}
            <Text span size="sm" c="dimmed" fw={400}>
              {t('reservations.list.groupGuests', {
                count: group.reservations.filter(isActive).reduce((sum, reservation) => sum + reservation.guests, 0),
              })}
            </Text>
          </Title>
          {group.reservations.map((reservation) => (
            <ReservationRow key={reservation.id} reservation={reservation} onOpen={onOpen} />
          ))}
        </Stack>
      ))}
    </Stack>
  )
}
