import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { reservationErrorMessage } from '../../api/reservationErrors.ts'
import { moveReservation, type Reservation, setReservationStatus, useRestaurantNow } from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { sameTables } from '../table-overview/dropTargets.ts'
import { availableActions, guestName, undoStatus } from './status.ts'
import { statusErrorMessage } from './walkInRemoval.ts'

/**
 * Moving a reservation on the service screen: to another time or table (drag and drop on the timeline), and seating a guest at a
 * table (drag and drop onto the floor plan, "Arrived at another table…"). A toast says what changed and offers one "Undo" that
 * restores everything; a refused change shows the server's reason and rejects, so the caller can spring back.
 */
export function useReservationMoves() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const queryClient = useQueryClient()
  const now = useRestaurantNow()

  const showMoveError = (error: unknown) => toast.error(t('frontdesk.moves.notMoved'), { description: reservationErrorMessage(error, t) })
  const showStatusError = (error: unknown) => toast.error(t('reservations.errors.statusTitle'), { description: statusErrorMessage(error, t) })

  /** Back to the time and tables of `before`, after the status was set back (if it was changed). */
  const undo = (before: Reservation, changed: Reservation) => {
    const restore = async () => {
      let current = changed
      if (changed.status !== before.status) {
        const status = undoStatus(before.status, changed, now)
        if (status !== null) {
          try {
            current = await setReservationStatus(queryClient, changed.id, status)
          } catch (error) {
            showStatusError(error)
            return
          }
        }
      }
      if (current.time !== before.time || !sameTables(current.tableIds, before.tableIds)) {
        try {
          current = await moveReservation(queryClient, current, { time: before.time, tableIds: before.tableIds })
        } catch (error) {
          showMoveError(error)
          return
        }
      }
      toast(t('frontdesk.moves.undone', { name: guestName(current, t), table: current.tableNumber, time: formatTime(current.time, language) }))
    }
    void restore()
  }

  const showDone = (message: string, before: Reservation, changed: Reservation) =>
    toast(message, { duration: 8000, action: { label: t('reservations.actions.undo'), onClick: () => undo(before, changed) } })

  /** Moves the reservation to `time` ("HH:mm") at `tableIds` on its day. */
  const move = async (reservation: Reservation, time: string, tableIds: string[]) => {
    let moved: Reservation
    try {
      moved = await moveReservation(queryClient, reservation, { time, tableIds })
    } catch (error) {
      showMoveError(error)
      throw error
    }
    showDone(
      t('frontdesk.moves.moved', { name: guestName(moved, t), table: moved.tableNumber, time: formatTime(moved.time, language) }),
      reservation,
      moved,
    )
    return moved
  }

  /**
   * Seats the guest at `tableIds`: first changes the tables if they differ, then marks the reservation as arrived if that is allowed
   * now (on its day). When the arrival is refused after the tables were changed, the toast still offers to undo the change of tables.
   */
  const seat = async (reservation: Reservation, tableIds: string[]) => {
    let current = reservation
    if (!sameTables(tableIds, reservation.tableIds)) {
      try {
        current = await moveReservation(queryClient, reservation, { time: reservation.time, tableIds })
      } catch (error) {
        showMoveError(error)
        throw error
      }
    }
    const moved = current
    const arrive = availableActions(current, now).some((action) => action.status === 'Arrived')
    if (!arrive && moved === reservation) {
      // Its own tables on another day: nothing to change.
      return current
    }
    if (arrive) {
      try {
        current = await setReservationStatus(queryClient, current.id, 'Arrived')
      } catch (error) {
        showStatusError(error)
        if (moved !== reservation) {
          showDone(t('frontdesk.moves.tableChanged', { name: guestName(moved, t), table: moved.tableNumber }), reservation, moved)
        }
        throw error
      }
    }
    const values = { name: guestName(current, t), table: current.tableNumber }
    showDone(t(arrive ? 'frontdesk.moves.seated' : 'frontdesk.moves.tableChanged', values), reservation, current)
    return current
  }

  return { move, seat }
}
