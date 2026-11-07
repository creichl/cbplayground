import { GripVerticalIcon } from 'lucide-react'
import type { PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Reservation } from '../../api/reservations.ts'
import { formatShortDate, formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Badge } from '../../ui/badge.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip.tsx'
import { NoteIcon } from '../icons.tsx'
import { StatusActions } from './StatusActions.tsx'
import { StatusBadge } from './StatusBadge.tsx'
import { guestName, isActive, occupiedUntil, sourceLabels } from './status.ts'

type ReservationRowProps = {
  reservation: Reservation
  /** Opens the reservation (front desk: selects it and opens the edit drawer). */
  onOpen: (reservation: Reservation) => void
  /** Shows the date above the time, for lists over several days such as the open requests. */
  withDate?: boolean
  /** The reservation selected on the screen; its table is highlighted on the plan and its block on the timeline. */
  selected?: boolean
  /**
   * Starts dragging the guest onto a table of the floor plan (pointer down on the row's grip). Without it the row has no grip;
   * the grip is left out on phones, which show the list and the plan one at a time.
   */
  onDragToTable?: (reservation: Reservation, event: PointerEvent<HTMLElement>) => void
}

/**
 * One reservation in the list panel: time, guest, party, table and area, source, who cancelled, a note marker, the status
 * and the quick status actions. A click on the row opens it.
 */
export function ReservationRow({ reservation, onOpen, withDate = false, selected = false, onDragToTable }: ReservationRowProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const time = formatTime(reservation.time, language)
  const inactive = !isActive(reservation)
  const name = guestName(reservation, t)

  return (
    // The button and the actions are siblings in the row, so a button never lies inside another one.
    <div
      data-reservation-id={reservation.id}
      data-selected={selected ? '' : undefined}
      className={cn(
        'grid scroll-my-12 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 rounded-xl border bg-card p-3 shadow-card transition-colors',
        onDragToTable !== undefined && 'md:grid-cols-[auto_minmax(0,1fr)_auto]',
        selected ? 'border-primary bg-primary-50 ring-2 ring-primary/40' : 'border-border',
      )}
    >
      {onDragToTable !== undefined && (
        // Only for the pointer: keyboard users seat a guest elsewhere with "Arrived at another table…" or in the drawer.
        <span
          aria-hidden="true"
          data-drag-handle=""
          title={t('frontdesk.moves.dragHandle')}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) {
              return
            }
            // No text selection while dragging.
            event.preventDefault()
            onDragToTable(reservation, event)
          }}
          className="-ml-1 flex h-10 w-6 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-secondary active:cursor-grabbing max-md:hidden"
        >
          <GripVerticalIcon className="size-4" />
        </span>
      )}
      <button
        type="button"
        onClick={() => onOpen(reservation)}
        aria-label={t('reservations.row.open', { name, time })}
        aria-current={selected ? 'true' : undefined}
        className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg text-left focus-ring"
      >
        <span className="flex w-[4.5rem] shrink-0 flex-col whitespace-nowrap">
          {withDate && <span className="text-xs text-muted-foreground">{formatShortDate(reservation.date, language)}</span>}
          <span className="text-sm font-semibold tabular-nums">{time}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('truncate font-semibold', inactive && 'text-muted-foreground line-through')}>{name}</span>
            {reservation.notes !== null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 text-muted-foreground">
                    <NoteIcon size={16} />
                    <span className="sr-only">{`${t('reservations.row.notes')}: ${reservation.notes}`}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{reservation.notes}</TooltipContent>
              </Tooltip>
            )}
          </span>
          <span className="text-sm text-muted-foreground">
            {t('reservations.row.summary', {
              count: reservation.guests,
              table: reservation.tableNumber,
              area: reservation.areaName,
              end: formatTime(occupiedUntil(reservation), language),
            })}
          </span>
          {reservation.cancelledByGuest && <span className="text-sm font-medium text-destructive">{t('reservations.cancelledByGuest')}</span>}
        </span>
      </button>
      <span className="flex flex-col items-end gap-1">
        <StatusBadge status={reservation.status} />
        <Badge variant="outline" className="text-muted-foreground">
          {t(sourceLabels[reservation.source])}
        </Badge>
      </span>
      <StatusActions reservation={reservation} compact className="col-span-full gap-1.5" />
    </div>
  )
}
