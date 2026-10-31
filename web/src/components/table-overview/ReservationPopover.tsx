import { Button, Divider, Group, Popover, Stack, Text } from '@mantine/core'
import { type ReactElement, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Reservation } from '../../api/reservations.ts'
import { StatusActions } from '../reservations/StatusActions.tsx'
import { StatusBadge } from '../reservations/StatusBadge.tsx'
import { guestName } from '../reservations/status.ts'

type ReservationPopoverProps = {
  reservation: Reservation
  /** The following reservation at the same table, shown as a hint. */
  nextReservation?: Reservation
  /** Offers to seat a walk-in at the reservation's table, which is free now. */
  onWalkIn?: () => void
  /** The element that opens the popover on click; it must accept a ref. */
  children: ReactElement
}

/** Details of a reservation with the status actions of the lists (see StatusActions). */
export function ReservationPopover({ reservation, nextReservation, onWalkIn, children }: ReservationPopoverProps) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  // While the question before cancelling is open, a click into it must not close the popover with the question.
  const [confirming, setConfirming] = useState(false)

  const details: [string, string | null][] = [
    [t('tableOverview.details.time'), `${reservation.time}–${reservation.endTime}`],
    [t('tableOverview.details.left'), reservation.status === 'Completed' ? reservation.completedTime : null],
    [t('tableOverview.details.guests'), String(reservation.guests)],
    [t('tableOverview.details.table'), t('tableOverview.details.tableValue', { number: reservation.tableNumber, area: reservation.areaName })],
    [t('tableOverview.details.phone'), reservation.phone],
    [t('tableOverview.details.email'), reservation.email],
    [t('tableOverview.details.notes'), reservation.notes],
    [t('tableOverview.details.source'), t(`tableOverview.details.sources.${reservation.source}`)],
    [t('tableOverview.details.reference'), reservation.referenceCode],
  ]

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      closeOnClickOutside={!confirming}
      closeOnEscape={!confirming}
      width={320}
      position="bottom"
      withArrow
      shadow="md"
    >
      <Popover.Target>{children}</Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Text fw={600}>{guestName(reservation, t)}</Text>
            <StatusBadge status={reservation.status} />
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
          <StatusActions reservation={reservation} compact onDone={() => setOpened(false)} onConfirmingChange={setConfirming} />
          {nextReservation !== undefined && (
            <>
              <Divider />
              <Text size="sm" c="dimmed">
                {t('tableOverview.details.next', { time: nextReservation.time, name: guestName(nextReservation, t), guests: nextReservation.guests })}
              </Text>
            </>
          )}
          {onWalkIn !== undefined && (
            <>
              <Divider />
              <Button
                variant="light"
                onClick={() => {
                  setOpened(false)
                  onWalkIn()
                }}
              >
                {t('tableOverview.walkInHere')}
              </Button>
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
