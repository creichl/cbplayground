import { Card, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { type Reservation, useOpenRequests } from '../../api/reservations.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'
import { ReservationRow } from './ReservationRow.tsx'

type PendingRequestsProps = {
  /** Today in the restaurant's time zone; requests from today on are listed. */
  today: string
  onOpen: (reservation: Reservation) => void
}

/** The online requests that wait for the restaurant's answer, of every day from today on. Hidden when there are none. */
export function PendingRequests({ today, onOpen }: PendingRequestsProps) {
  const { t } = useTranslation()
  const requests = useOpenRequests(today)

  // A failed reload in the background keeps the last list.
  if (requests.isError && requests.data === undefined) {
    return <ErrorAlert error={requests.error} onRetry={() => void requests.refetch()} />
  }
  if (requests.data === undefined || requests.data.length === 0) {
    return null
  }

  return (
    <Card bg="yellow.0" style={{ borderColor: 'var(--mantine-color-yellow-5)', borderWidth: 2 }} component="section">
      <Stack gap="sm">
        <Stack gap={2}>
          <Title order={3}>{t('reservations.pending.title', { number: requests.data.length })}</Title>
          <Text size="sm" c="dimmed">
            {t('reservations.pending.text')}
          </Text>
        </Stack>
        {requests.data.map((reservation) => (
          <ReservationRow key={reservation.id} reservation={reservation} onOpen={onOpen} withDate />
        ))}
      </Stack>
    </Card>
  )
}
