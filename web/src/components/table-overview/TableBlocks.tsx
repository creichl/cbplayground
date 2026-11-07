import { type ReactElement, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ApiError } from '../../api/client.ts'
import { type FloorTable, formatMinutes, type OpenPeriod, type Reservation, toMinutes } from '../../api/reservations.ts'
import { maxBlockReasonLength, type TableBlock, tableBlockErrorMessage, useCreateTableBlock, useDeleteTableBlock } from '../../api/tableBlocks.ts'
import { formatTime } from '../../i18n/format.ts'
import { Alert, AlertDescription } from '../../ui/alert.tsx'
import { Button } from '../../ui/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog.tsx'
import { Input } from '../../ui/input.tsx'
import { Label } from '../../ui/label.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx'
import { guestName, occupiedUntil, occupiesTable } from '../reservations/status.ts'
import type { MinuteRange } from './dayRange.ts'

/** Blocks start and end on the quarter hour, like the reservations. */
const step = 15

/** The end of the opening window that `start` lies in, or of the next one after it; otherwise the end of the shown day. */
function closingAfter(start: number, openPeriods: OpenPeriod[], range: MinuteRange) {
  const period =
    openPeriods.find((candidate) => toMinutes(candidate.start) <= start && start < toMinutes(candidate.end)) ??
    openPeriods.find((candidate) => toMinutes(candidate.start) > start)
  return period === undefined ? range.end : toMinutes(period.end)
}

type BlockTableDialogProps = {
  table: FloorTable
  /** The day, "YYYY-MM-DD". */
  date: string
  /** The proposed start in minutes since midnight: now or the time of the slider. */
  start: number
  openPeriods: OpenPeriod[]
  /** The shown time range of the day, on full hours: the times offered. */
  range: MinuteRange
  /** The reservations of the day, to name those that refuse the block. */
  reservations: Reservation[]
  onClose: () => void
}

/**
 * Blocks a table for a time of the day: from (the proposed start), to (by default the closing time of that opening window) and
 * an optional reason. A reservation at the table in that time refuses it; the dialog says so and names the reservations.
 */
export function BlockTableDialog({ table, date, start, openPeriods, range, reservations, onClose }: BlockTableDialogProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const createBlock = useCreateTableBlock()
  const firstStart = Math.min(Math.max(Math.floor(start / step) * step, range.start), range.end - step)
  const [from, setFrom] = useState(firstStart)
  const [to, setTo] = useState(() => Math.max(closingAfter(firstStart, openPeriods, range), firstStart + step))
  const [reason, setReason] = useState('')

  const times: number[] = []
  for (let minutes = range.start; minutes <= range.end; minutes += step) {
    times.push(minutes)
  }
  const label = (minutes: number) => formatTime(formatMinutes(minutes), language)
  const valid = from < to
  const conflict = createBlock.error instanceof ApiError && createBlock.error.code === 'table_has_reservations'
  // The reservations at the table in that time, as the screen knows them.
  const conflicts = conflict
    ? reservations.filter(
        (reservation) =>
          reservation.tableIds.includes(table.id) &&
          occupiesTable(reservation) &&
          toMinutes(reservation.time) < to &&
          toMinutes(occupiedUntil(reservation)) > from,
      )
    : []

  const submit = () => {
    if (!valid) {
      return
    }
    createBlock.mutate(
      { tableId: table.id, date, start: formatMinutes(from), end: formatMinutes(to), reason: reason.trim() || null },
      {
        onSuccess: (block) => {
          toast(t('tableBlocks.created', { number: block.tableNumber, start: formatTime(block.start, language), end: formatTime(block.end, language) }))
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="font-sans">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('tableBlocks.dialog.title', { number: table.number })}</DialogTitle>
            <DialogDescription>{t('tableBlocks.dialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="block-from">{t('tableBlocks.dialog.from')}</Label>
              <Select value={String(from)} onValueChange={(value) => setFrom(Number(value))}>
                <SelectTrigger id="block-from" className="w-full tabular-nums">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {times.slice(0, -1).map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {label(minutes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="block-to">{t('tableBlocks.dialog.to')}</Label>
              <Select value={String(to)} onValueChange={(value) => setTo(Number(value))}>
                <SelectTrigger id="block-to" className="w-full tabular-nums" aria-invalid={!valid}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {times.slice(1).map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {label(minutes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!valid && <p className="text-sm text-destructive">{t('tableBlocks.errors.startNotBeforeEnd')}</p>}
          <div className="grid gap-1.5">
            <Label htmlFor="block-reason">{t('tableBlocks.dialog.reason')}</Label>
            <Input
              id="block-reason"
              value={reason}
              maxLength={maxBlockReasonLength}
              placeholder={t('tableBlocks.dialog.reasonPlaceholder')}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          </div>
          {createBlock.error !== null && (
            <Alert variant="destructive">
              <AlertDescription className="grid gap-1">
                <p className="font-semibold">{t('tableBlocks.errors.createTitle')}</p>
                <p>{tableBlockErrorMessage(createBlock.error, t)}</p>
                {conflicts.length > 0 && (
                  <>
                    <p>{t('tableBlocks.dialog.conflicts')}</p>
                    <ul className="list-disc pl-5">
                      {conflicts.map((reservation) => (
                        <li key={reservation.id}>
                          {t('common.timeRange', { start: formatTime(reservation.time, language), end: formatTime(occupiedUntil(reservation), language) })}{' '}
                          {t('tableOverview.party', { name: guestName(reservation, t), guests: reservation.guests })}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || createBlock.isPending}>
              {t('tableBlocks.dialog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** The details of a block, opened by a click on it (`children`), with "Remove block". */
export function BlockPopover({ block, children }: { block: TableBlock; children: ReactElement }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [open, setOpen] = useState(false)
  const deleteBlock = useDeleteTableBlock()

  // The promise, not the callbacks of mutate: the reloaded blocks no longer contain this one, which removes the popover, and
  // the callbacks of mutate do not run once it is gone.
  const remove = () =>
    deleteBlock.mutateAsync(block.id).then(
      () => {
        setOpen(false)
        toast(t('tableBlocks.removed', { number: block.tableNumber }))
      },
      (error: unknown) => toast.error(t('tableBlocks.errors.removeTitle'), { description: tableBlockErrorMessage(error, t) }),
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="bottom" className="flex w-64 flex-col gap-2 font-sans">
        <p className="font-semibold">{t('tableBlocks.details.title', { number: block.tableNumber })}</p>
        <p className="text-sm tabular-nums">{t('common.timeRange', { start: formatTime(block.start, language), end: formatTime(block.end, language) })}</p>
        {block.reason !== null && <p className="text-sm break-words">{block.reason}</p>}
        {block.createdBy !== null && <p className="text-xs text-muted-foreground">{t('tableBlocks.details.createdBy', { name: block.createdBy })}</p>}
        <Button variant="secondary" className="mt-1" onClick={remove} disabled={deleteBlock.isPending}>
          {t('tableBlocks.remove')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
