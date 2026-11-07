import { useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { LoaderCircleIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ApiError } from '../../api/client.ts'
import { reservationErrorMessage } from '../../api/reservationErrors.ts'
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

type StatusActionsProps = {
  reservation: Reservation
  /** Short labels with icons on every screen, e.g. in the list panel of the front desk or the narrow popover of the plans. */
  compact?: boolean
  /** Called after a successful change, e.g. to close the popover. */
  onDone?: () => void
  /** Called when the question before cancelling, a no-show or declining opens or closes. */
  onConfirmingChange?: (confirming: boolean) => void
  className?: string
}

/** A failed status change in the user's language; a taken table means an undo came too late. */
function statusErrorMessage(error: unknown, t: TFunction) {
  return error instanceof ApiError && error.code === 'table_unavailable' ? t('reservations.errors.tableTaken') : reservationErrorMessage(error, t)
}

/** The texts of the question before a change that asks first (see status.ts), by the status it sets. */
const questions = {
  Cancelled: { title: 'reservations.cancelConfirm.title', text: 'reservations.cancelConfirm.text', confirm: 'reservations.cancelConfirm.confirm' },
  NoShow: { title: 'reservations.noShowConfirm.title', text: 'reservations.noShowConfirm.text', confirm: 'reservations.noShowConfirm.confirm' },
  Declined: { title: 'reservations.declineConfirm.title', text: 'reservations.declineConfirm.text', confirm: 'reservations.declineConfirm.confirm' },
} as const

/**
 * The quick status changes of a reservation as buttons, the same in the lists and on the plans (see status.ts). Cancelling,
 * no-show and declining ask first. After every change a toast offers to undo it.
 */
export function StatusActions({ reservation, compact = false, onDone, onConfirmingChange, className }: StatusActionsProps) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const now = useRestaurantNow()
  const setStatus = useSetReservationStatus()
  const [confirming, setConfirming] = useState<StatusAction | null>(null)
  const actions = availableActions(reservation, now)
  const question = questions[confirming?.status === 'NoShow' ? 'NoShow' : confirming?.status === 'Declined' ? 'Declined' : 'Cancelled']

  const confirm = (action: StatusAction | null) => {
    setConfirming(action)
    onConfirmingChange?.(action !== null)
  }

  const showError = (error: unknown) => toast.error(t('reservations.errors.statusTitle'), { description: statusErrorMessage(error, t) })

  // Shown after every change, also after an undo; it stays when the row or popover that started it is gone.
  const showChanged = (previous: ReservationStatus, changed: Reservation) => {
    const undo = undoStatus(previous, changed.status)
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

  const change = (status: ReservationStatus) => {
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

  const pending = (action: StatusAction) => setStatus.isPending && setStatus.variables.status === action.status

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
              disabled={setStatus.isPending}
              onClick={() => (action.confirm ? confirm(action) : change(action.status))}
            >
              {pending(action) ? (
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
              disabled={setStatus.isPending}
              onClick={() => confirming !== null && change(confirming.status)}
            >
              {setStatus.isPending && <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
              {t(question.confirm)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
