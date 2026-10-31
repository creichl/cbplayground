import { Box, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { randomId } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client.ts'
import { reservationErrorMessage } from '../../api/reservationErrors.ts'
import {
  type Reservation,
  type ReservationStatus,
  setReservationStatus,
  useRestaurantNow,
  useSetReservationStatus,
} from '../../api/reservations.ts'
import { availableActions, guestName, type StatusAction, statusColors, statusLabels, undoStatus } from './status.ts'

type StatusActionsProps = {
  reservation: Reservation
  /** Short labels with icons on every screen, e.g. in the narrow popover of the table overview. */
  compact?: boolean
  /** Called after a successful change, e.g. to close the popover. */
  onDone?: () => void
  /** Called when the question before cancelling or a no-show opens or closes. */
  onConfirmingChange?: (confirming: boolean) => void
}

/** A failed status change in the user's language; a taken table means an undo came too late. */
function statusErrorMessage(error: unknown, t: TFunction) {
  return error instanceof ApiError && error.code === 'table_unavailable' ? t('reservations.errors.tableTaken') : reservationErrorMessage(error, t)
}

/**
 * The quick status changes of a reservation as large buttons for the tablet, the same in the lists and in the table overview
 * (see status.ts). Cancelling and no-show ask first. After every change a notification offers to undo it.
 */
export function StatusActions({ reservation, compact = false, onDone, onConfirmingChange }: StatusActionsProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const now = useRestaurantNow()
  const setStatus = useSetReservationStatus()
  const [confirming, setConfirming] = useState<StatusAction | null>(null)
  const actions = availableActions(reservation, now)

  const confirm = (action: StatusAction | null) => {
    setConfirming(action)
    onConfirmingChange?.(action !== null)
  }

  const showError = (error: unknown) =>
    notifications.show({ color: 'red', title: t('reservations.errors.statusTitle'), message: statusErrorMessage(error, t) })

  // Shown after every change, also after an undo; it stays when the row or popover that started it is gone.
  const showChanged = (previous: ReservationStatus, changed: Reservation) => {
    const undo = undoStatus(previous, changed.status)
    const id = randomId('status-')
    notifications.show({
      id,
      color: statusColors[changed.status],
      autoClose: 8000,
      message: (
        <Group justify="space-between" gap="sm" wrap="nowrap">
          <Text size="sm">
            {t('reservations.toast.changed', { name: guestName(changed, t), status: t(statusLabels[changed.status]) })}
          </Text>
          {undo !== null && (
            <Button
              size="compact-sm"
              variant="light"
              color="gray"
              style={{ flexShrink: 0 }}
              onClick={() => {
                notifications.hide(id)
                setReservationStatus(queryClient, changed.id, undo).then((undone) => showChanged(changed.status, undone), showError)
              }}
            >
              {t('reservations.actions.undo')}
            </Button>
          )}
        </Group>
      ),
    })
  }

  const change = (status: ReservationStatus) => {
    const previous = reservation.status
    // A promise instead of the callbacks of mutate(): the change may remove this row or popover (e.g. a status filter),
    // and the notification has to appear anyway.
    setStatus.mutateAsync({ id: reservation.id, status }).then((changed) => {
      confirm(null)
      showChanged(previous, changed)
      onDone?.()
    }, showError)
  }

  if (actions.length === 0) {
    return null
  }

  return (
    <>
      <Group gap="xs" wrap="wrap">
        {actions.map((action) => (
          <Button
            key={action.label}
            size={compact ? 'sm' : 'md'}
            variant={action.status === 'Confirmed' && reservation.status === 'Requested' ? 'filled' : action.color === 'gray' ? 'default' : 'light'}
            color={action.color}
            leftSection={<span aria-hidden="true">{action.icon}</span>}
            loading={setStatus.isPending && setStatus.variables.status === action.status}
            disabled={setStatus.isPending}
            onClick={() => (action.confirm ? confirm(action) : change(action.status))}
          >
            {compact ? (
              t(action.shortLabel)
            ) : (
              <>
                <Box component="span" visibleFrom="lg">
                  {t(action.label)}
                </Box>
                <Box component="span" hiddenFrom="lg">
                  {t(action.shortLabel)}
                </Box>
              </>
            )}
          </Button>
        ))}
      </Group>
      <Modal
        opened={confirming !== null}
        onClose={() => confirm(null)}
        title={t(confirming?.status === 'NoShow' ? 'reservations.noShowConfirm.title' : 'reservations.cancelConfirm.title')}
      >
        <Stack gap="md">
          <Text size="sm">
            {t(confirming?.status === 'NoShow' ? 'reservations.noShowConfirm.text' : 'reservations.cancelConfirm.text', {
              name: guestName(reservation, t),
              time: reservation.time,
              guests: reservation.guests,
            })}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => confirm(null)}>
              {t('reservations.cancelConfirm.back')}
            </Button>
            <Button
              color={confirming?.color}
              loading={setStatus.isPending}
              onClick={() => confirming !== null && change(confirming.status)}
            >
              {t(confirming?.status === 'NoShow' ? 'reservations.noShowConfirm.confirm' : 'reservations.cancelConfirm.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
