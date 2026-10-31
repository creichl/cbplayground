import { Badge, Group, Paper, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { Reservation } from '../../api/reservations.ts'
import { StatusActions } from './StatusActions.tsx'
import { StatusBadge } from './StatusBadge.tsx'

type ReservationRowProps = {
  reservation: Reservation
  /** Opens the reservation for editing; without it the row is not clickable. */
  onOpen?: (reservation: Reservation) => void
  /** Shows the date in front of the time, for lists over several days. */
  withDate?: boolean
}

/** One reservation: time, guest, party size, table, source, notes, status and the quick status actions. */
export function ReservationRow({ reservation, onOpen, withDate = false }: ReservationRowProps) {
  const { t, i18n } = useTranslation()
  const inactive = reservation.status === 'Cancelled' || reservation.status === 'Declined'

  const details = (
    <Group gap="md" wrap="nowrap" align="flex-start">
      <Stack gap={0} style={{ flexShrink: 0 }} miw={56}>
        {withDate && (
          <Text size="xs" c="dimmed">
            {new Intl.DateTimeFormat(i18n.resolvedLanguage, { weekday: 'short', day: 'numeric', month: 'short' }).format(
              new Date(`${reservation.date}T00:00`),
            )}
          </Text>
        )}
        <Text fw={700} size="lg">
          {reservation.time}
        </Text>
      </Stack>
      <Stack gap={2} miw={0} style={{ flex: 1 }}>
        <Group gap="xs" wrap="wrap">
          <Text fw={600} td={inactive ? 'line-through' : undefined} c={inactive ? 'dimmed' : undefined}>
            {reservation.name}
          </Text>
          <Badge size="sm" variant="outline" color="gray">
            {t(reservation.source === 'Online' ? 'reservations.source.online' : 'reservations.source.phone')}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {t('reservations.row.summary', {
            guests: reservation.guests,
            table: reservation.tableNumber,
            area: reservation.areaName,
            end: reservation.endTime,
          })}
        </Text>
        {reservation.notes !== null && (
          <Tooltip label={reservation.notes} multiline maw={320} withinPortal>
            <Text size="sm" truncate="end">
              <span aria-label={t('reservations.row.notes')} role="img">
                📝
              </span>{' '}
              {reservation.notes}
            </Text>
          </Tooltip>
        )}
      </Stack>
    </Group>
  )

  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" align="center" gap="sm" wrap="wrap">
        {onOpen !== undefined ? (
          <UnstyledButton
            onClick={() => onOpen(reservation)}
            aria-label={t('reservations.row.open', { name: reservation.name, time: reservation.time })}
            miw={0}
            style={{ flex: '1 1 260px' }}
          >
            {details}
          </UnstyledButton>
        ) : (
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>{details}</div>
        )}
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <StatusBadge status={reservation.status} />
          <StatusActions reservation={reservation} />
        </Group>
      </Group>
    </Paper>
  )
}
