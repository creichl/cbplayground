import { Badge, Button, Divider, Group, Popover, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { type ReactElement, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorCode, errorMessage } from '../../api/areaErrors.ts'
import { type Reservation, type ReservationStatus, statusActions, statusColors, useSetReservationStatus } from '../../api/reservations.ts'

type ReservationPopoverProps = {
  reservation: Reservation
  /** The following reservation at the same table, shown as a hint. */
  nextReservation?: Reservation
  /** The element that opens the popover on click; it must accept a ref. */
  children: ReactElement
}

/** Cancelling and declining are shown in red, the other actions in the colour of their status. */
const actionColors: Record<ReservationStatus, string> = { ...statusColors, Cancelled: 'red', Declined: 'red' }

/** Details of a reservation with the status changes that are possible from its current status. */
export function ReservationPopover({ reservation, nextReservation, children }: ReservationPopoverProps) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  const setStatus = useSetReservationStatus()

  function changeStatus(status: ReservationStatus) {
    setStatus.mutate(
      { id: reservation.id, status },
      {
        onSuccess: () => setOpened(false),
        onError: (error) =>
          notifications.show({
            color: 'red',
            title: t('tableOverview.errors.statusTitle'),
            message: errorCode(error) === 'invalid_status_transition' ? t('tableOverview.errors.statusChanged') : errorMessage(error, t),
          }),
      },
    )
  }

  const details: [string, string | null][] = [
    [t('tableOverview.details.time'), `${reservation.time}–${reservation.endTime}`],
    [t('tableOverview.details.guests'), String(reservation.guests)],
    [t('tableOverview.details.table'), t('tableOverview.details.tableValue', { number: reservation.tableNumber, area: reservation.areaName })],
    [t('tableOverview.details.phone'), reservation.phone],
    [t('tableOverview.details.email'), reservation.email],
    [t('tableOverview.details.notes'), reservation.notes],
    [t('tableOverview.details.source'), t(`tableOverview.details.sources.${reservation.source}`)],
    [t('tableOverview.details.reference'), reservation.referenceCode],
  ]

  return (
    <Popover opened={opened} onChange={setOpened} width={300} position="bottom" withArrow shadow="md">
      <Popover.Target>{children}</Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Text fw={600}>{reservation.name}</Text>
            <Badge color={statusColors[reservation.status]} variant="light" style={{ flexShrink: 0 }}>
              {t(`tableOverview.status.${reservation.status}`)}
            </Badge>
          </Group>
          <Stack gap={4}>
            {details
              .filter((detail): detail is [string, string] => detail[1] !== null)
              .map(([label, value]) => (
                <Group key={label} gap="xs" wrap="nowrap" align="flex-start">
                  <Text size="sm" c="dimmed" w={110} style={{ flexShrink: 0 }}>
                    {label}
                  </Text>
                  <Text size="sm" style={{ wordBreak: 'break-word' }}>
                    {value}
                  </Text>
                </Group>
              ))}
          </Stack>
          {statusActions[reservation.status].length > 0 && (
            <Group gap="xs">
              {statusActions[reservation.status].map((status) => (
                <Button
                  key={status}
                  size="sm"
                  variant="light"
                  color={actionColors[status]}
                  loading={setStatus.isPending && setStatus.variables?.status === status}
                  disabled={setStatus.isPending}
                  onClick={() => changeStatus(status)}
                >
                  {t(`tableOverview.actions.${status}`)}
                </Button>
              ))}
            </Group>
          )}
          {nextReservation !== undefined && (
            <>
              <Divider />
              <Text size="sm" c="dimmed">
                {t('tableOverview.details.next', { time: nextReservation.time, name: nextReservation.name, guests: nextReservation.guests })}
              </Text>
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
