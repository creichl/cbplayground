import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { reservationErrorMessage } from '../../api/reservationErrors.ts'
import { type Reservation, type ReservationStatus, useSetReservationStatus } from '../../api/reservations.ts'

/**
 * The quick status changes of a reservation as large buttons for the tablet: accept or decline a request;
 * arrived, late or cancelled for a confirmed one; undo of an arrival. Cancelling asks first.
 */
export function StatusActions({ reservation }: { reservation: Reservation }) {
  const { t } = useTranslation()
  const setStatus = useSetReservationStatus()
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const change = (status: ReservationStatus) =>
    setStatus.mutate(
      { id: reservation.id, status },
      {
        onSuccess: () => setConfirmingCancel(false),
        onError: (error) => notifications.show({ color: 'red', title: t('errors.title'), message: reservationErrorMessage(error, t) }),
      },
    )

  const button = (status: ReservationStatus, label: string, props: { color?: string; variant?: string; onClick?: () => void } = {}) => (
    <Button
      size="md"
      variant={props.variant ?? 'light'}
      color={props.color}
      loading={setStatus.isPending && setStatus.variables.status === status}
      disabled={setStatus.isPending}
      onClick={props.onClick ?? (() => change(status))}
    >
      {label}
    </Button>
  )

  let buttons
  switch (reservation.status) {
    case 'Requested':
      buttons = (
        <>
          {button('Confirmed', t('reservations.actions.accept'), { color: 'green', variant: 'filled' })}
          {button('Declined', t('reservations.actions.decline'), { color: 'gray' })}
        </>
      )
      break
    case 'Confirmed':
    case 'Late':
      buttons = (
        <>
          {button('Arrived', t('reservations.actions.arrived'), { color: 'green' })}
          {reservation.status === 'Confirmed' && button('Late', t('reservations.actions.late'), { color: 'orange' })}
          {button('Cancelled', t('reservations.actions.cancelled'), { color: 'red', onClick: () => setConfirmingCancel(true) })}
        </>
      )
      break
    case 'Arrived':
      buttons = button('Confirmed', t('reservations.actions.undoArrived'), { color: 'gray', variant: 'default' })
      break
    default:
      return null
  }

  return (
    <>
      <Group gap="xs" wrap="wrap">
        {buttons}
      </Group>
      <Modal opened={confirmingCancel} onClose={() => setConfirmingCancel(false)} title={t('reservations.cancelConfirm.title')}>
        <Stack gap="md">
          <Text size="sm">
            {t('reservations.cancelConfirm.text', { name: reservation.name, time: reservation.time, guests: reservation.guests })}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmingCancel(false)}>
              {t('reservations.cancelConfirm.back')}
            </Button>
            <Button color="red" loading={setStatus.isPending} onClick={() => change('Cancelled')}>
              {t('reservations.cancelConfirm.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
