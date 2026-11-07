import { useQueryClient } from '@tanstack/react-query'
import { LoaderCircleIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  type Reservation,
  type ReservationStatus,
  setReservationStatus,
  useRestaurantNow,
  useSetReservationStatus,
} from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Button } from '../../ui/button.tsx'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog.tsx'
import { availableActions, guestName, type StatusAction, statusColors, statusLabels, undoStatus } from './status.ts'
import { removeWalkIn, removeWalkInQuestion, statusErrorMessage } from './walkInRemoval.ts'

type StatusActionsProps = {
  reservation: Reservation
  /** Short labels with icons on every screen, e.g. in the list panel of the front desk or the narrow popover of the plans. */
  compact?: boolean
  /** Called after a successful change, e.g. to close the popover. */
  onDone?: () => void
  /** Called when the question before cancelling, a no-show, declining or removing a walk-in opens or closes. */
  onConfirmingChange?: (confirming: boolean) => void
  className?: string
}

/** The texts of the question before a change that asks first (see status.ts), by the status it sets. */
const questions = {
  Cancelled: { title: 'reservations.cancelConfirm.title', text: 'reservations.cancelConfirm.text', confirm: 'reservations.cancelConfirm.confirm' },
  NoShow: { title: 'reservations.noShowConfirm.title', text: 'reservations.noShowConfirm.text', confirm: 'reservations.noShowConfirm.confirm' },
  Declined: { title: 'reservations.declineConfirm.title', text: 'reservations.declineConfirm.text', confirm: 'reservations.declineConfirm.confirm' },
} as const

/**
 * The quick status changes of a reservation as buttons, the same in the lists and on the plans (see status.ts). Cancelling,
 * no-show, declining and removing a walk-in ask first. After every change a toast offers to undo it where the server allows it.
 */
export function StatusActions({ reservation, compact = false, onDone, onConfirmingChange, className }: StatusActionsProps) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const now = useRestaurantNow()
  const setStatus = useSetReservationStatus()
  const [confirming, setConfirming] = useState<StatusAction | null>(null)
  const [removing, setRemoving] = useState(false)
  const actions = availableActions(reservation, now)
  const question =
    confirming?.status === null
      ? removeWalkInQuestion
      : questions[confirming?.status === 'NoShow' ? 'NoShow' : confirming?.status === 'Declined' ? 'Declined' : 'Cancelled']
  const pending = setStatus.isPending || removing

  const confirm = (action: StatusAction | null) => {
    setConfirming(action)
    onConfirmingChange?.(action !== null)
  }

  const showError = (error: unknown) => toast.error(t('reservations.errors.statusTitle'), { description: statusErrorMessage(error, t) })

  // Shown after every change, also after an undo; it stays when the row or popover that started it is gone.
  const showChanged = (previous: ReservationStatus, changed: Reservation) => {
    const undo = undoStatus(previous, changed, now)
    toast(t('reservations.toast.changed', { name: guestName(changed, t), status: t(statusLabels[changed.status]) }), {
      duration: 8000,
      icon: <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: statusColors[changed.status].color }} />,
      action:
        undo === null
          ? undefined
          : {
              label: t('reservations.actions.undo'),
              onClick: () => {
                setReservationStatus(queryClient, changed.id, undo).then((undone) => showChanged(changed.status, undone), showError)
              },
            },
    })
  }

  const remove = () => {
    setRemoving(true)
    // The walk-in leaves the lists, and with it this row or popover.
    removeWalkIn(queryClient, reservation, t).then(
      () => {
        setRemoving(false)
        confirm(null)
        onDone?.()
      },
      () => setRemoving(false),
    )
  }

  const change = (status: ReservationStatus | null) => {
    if (status === null) {
      remove()
      return
    }
    const previous = reservation.status
    // A promise instead of the callbacks of mutate(): the change may move this row to another tab or close the popover,
    // and the toast has to appear anyway.
    setStatus.mutateAsync({ id: reservation.id, status }).then((changed) => {
      confirm(null)
      showChanged(previous, changed)
      onDone?.()
    }, showError)
  }

  if (actions.length === 0) {
    return null
  }

  const isPending = (action: StatusAction) =>
    action.status === null ? removing : setStatus.isPending && setStatus.variables.status === action.status

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {actions.map((action) => {
          const primary = action.status === 'Confirmed' && reservation.status === 'Requested'
          return (
            <Button
              key={action.label}
              size="sm"
              variant={primary ? 'primary' : 'outline'}
              className={compact ? 'px-2.5' : undefined}
              disabled={pending}
              onClick={() => (action.confirm ? confirm(action) : change(action.status))}
            >
              {isPending(action) ? (
                <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <action.icon size={16} style={primary || action.color === null ? undefined : { color: action.color.text }} />
              )}
              {compact ? (
                t(action.shortLabel)
              ) : (
                <>
                  <span className="hidden xl:inline">{t(action.label)}</span>
                  <span className="xl:hidden">{t(action.shortLabel)}</span>
                </>
              )}
            </Button>
          )
        })}
      </div>
      <Dialog open={confirming !== null} onOpenChange={(open) => !open && confirm(null)}>
        <DialogContent className="font-sans">
          <DialogHeader>
            <DialogTitle>{t(question.title)}</DialogTitle>
            <DialogDescription>
              {t(question.text, {
                name: guestName(reservation, t),
                time: formatTime(reservation.time, i18n.resolvedLanguage ?? 'en'),
                table: reservation.tableNumber,
                count: reservation.guests,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('reservations.cancelConfirm.back')}</Button>
            </DialogClose>
            <Button
              className="bg-destructive text-background hover:bg-destructive/90"
              disabled={pending}
              onClick={() => confirming !== null && change(confirming.status)}
            >
              {pending && <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
              {t(question.confirm)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
