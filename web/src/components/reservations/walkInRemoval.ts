import { notifications } from '@mantine/notifications'
import type { QueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { ApiError } from '../../api/client.ts'
import { reservationErrorMessage } from '../../api/reservationErrors.ts'
import { deleteWalkIn, type Reservation } from '../../api/reservations.ts'
import { guestName } from './status.ts'

/** A failed status change in the user's language; a taken table means an undo came too late. */
export function statusErrorMessage(error: unknown, t: TFunction) {
  return error instanceof ApiError && error.code === 'table_unavailable' ? t('reservations.errors.tableTaken') : reservationErrorMessage(error, t)
}

/**
 * The question before removing an arrived walk-in, the undo of its arrival: asked by its "Undo" action and by the notification
 * after seating it.
 */
export const removeWalkInQuestion = {
  title: 'reservations.removeWalkInConfirm.title',
  text: 'reservations.removeWalkInConfirm.text',
  confirm: 'reservations.removeWalkInConfirm.confirm',
} as const

/** Removes the walk-in and says so in a notification, also after the component that asked is gone. Rejects when it failed. */
export function removeWalkIn(queryClient: QueryClient, walkIn: Reservation, t: TFunction) {
  return deleteWalkIn(queryClient, walkIn.id).then(
    () => {
      notifications.show({ color: 'gray', message: t('reservations.toast.walkInRemoved', { name: guestName(walkIn, t) }) })
    },
    (error: unknown) => {
      notifications.show({ color: 'red', title: t('reservations.errors.statusTitle'), message: statusErrorMessage(error, t) })
      throw error
    },
  )
}
