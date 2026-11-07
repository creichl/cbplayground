import { useQueryClient } from '@tanstack/react-query'
import { ArmchairIcon, LoaderCircleIcon, LogOutIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { reservationErrorMessage } from '../../api/reservationErrors.ts'
import { toMinutes } from '../../api/reservations.ts'
import { setWaitlistLeft, type WaitlistEntry, type WaitlistStatus } from '../../api/waitlist.ts'
import { formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Badge } from '../../ui/badge.tsx'
import { Button } from '../../ui/button.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip.tsx'
import { NoteIcon } from '../icons.tsx'
import { waitDuration } from './waitDuration.ts'

type WaitlistListProps = {
  /** The entries of the day (matching the search) in the order of arrival. */
  entries: WaitlistEntry[]
  /** The restaurant's time of day in minutes when the list is today's; null on other days, whose entries are read-only. */
  nowMinutes: number | null
  /** Opens the walk-in drawer for the waiting party, with the suggested table. */
  onSeat: (entry: WaitlistEntry) => void
  /** Opens a waiting entry to change it. */
  onEdit: (entry: WaitlistEntry) => void
  /** Shown when nobody is on the list. */
  emptyText: string
}

const statusLabels: Record<WaitlistStatus, 'waitlist.status.waiting' | 'waitlist.status.seated' | 'waitlist.status.left'> = {
  Waiting: 'waitlist.status.waiting',
  Seated: 'waitlist.status.seated',
  Left: 'waitlist.status.left',
}

/**
 * The waitlist of a day: the waiting parties in the order of arrival, then those seated or gone. Today a waiting party shows how
 * long it has waited (running), the quoted time (marked once it is exceeded) and when the next table for it is free, with the
 * actions "Seat" and "Left" (with Undo); a click on it opens it to change it. Other days are read-only.
 */
export function WaitlistList({ entries, nowMinutes, onSeat, onEdit, emptyText }: WaitlistListProps) {
  const { t } = useTranslation()

  if (entries.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
  }

  const waiting = entries.filter((entry) => entry.status === 'Waiting')
  const done = entries.filter((entry) => entry.status !== 'Waiting')
  const row = (entry: WaitlistEntry) => <WaitlistRow key={entry.id} entry={entry} nowMinutes={nowMinutes} onSeat={onSeat} onEdit={onEdit} />

  return (
    <div className="flex flex-col gap-4">
      {waiting.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="sticky top-0 z-10 flex items-baseline gap-2 bg-background/95 py-1 text-sm font-semibold backdrop-blur-sm">
            {t('waitlist.groupWaiting')}
            <span className="font-normal text-muted-foreground">
              {t('reservations.list.groupGuests', { count: waiting.reduce((sum, entry) => sum + entry.guests, 0) })}
            </span>
          </h3>
          {waiting.map(row)}
        </section>
      )}
      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="sticky top-0 z-10 bg-background/95 py-1 text-sm font-semibold backdrop-blur-sm">{t('waitlist.groupDone')}</h3>
          {done.map(row)}
        </section>
      )}
    </div>
  )
}

function WaitlistRow({ entry, nowMinutes, onSeat, onEdit }: { entry: WaitlistEntry } & Omit<WaitlistListProps, 'entries' | 'emptyText'>) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const queryClient = useQueryClient()
  const [leaving, setLeaving] = useState(false)
  const editable = nowMinutes !== null && entry.status === 'Waiting'
  const waited = editable ? Math.max(0, nowMinutes - toMinutes(entry.addedTime)) : null
  const exceeded = waited !== null && entry.quotedWaitMinutes !== null && waited > entry.quotedWaitMinutes
  const added = formatTime(entry.addedTime, language)

  const showError = (error: unknown) => toast.error(t('waitlist.errors.title'), { description: reservationErrorMessage(error, t) })

  // The toast stays when the row is gone, so its Undo works after the party has moved to "Seated or left".
  const leave = () => {
    setLeaving(true)
    setWaitlistLeft(queryClient, entry.id, true).then(
      (left) => {
        setLeaving(false)
        toast(t('waitlist.toast.left', { name: left.name }), {
          duration: 8000,
          action: {
            label: t('reservations.actions.undo'),
            onClick: () => {
              setWaitlistLeft(queryClient, left.id, false).then(
                (back) => toast(t('waitlist.toast.waitingAgain', { name: back.name }), { duration: 8000 }),
                showError,
              )
            },
          },
        })
      },
      (error: unknown) => {
        setLeaving(false)
        showError(error)
      },
    )
  }

  const details = (
    <>
      <span className="w-[4.5rem] shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums">{added}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn('truncate font-semibold', entry.status !== 'Waiting' && 'text-muted-foreground')}>
            {/* The name the server stores after the guest's data was deleted (a seated entry only), shown translated. */}
            {entry.name === 'Deleted guest' ? t('guests.deletedName') : entry.name}
          </span>
          {entry.notes !== null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0 text-muted-foreground">
                  <NoteIcon size={16} />
                  <span className="sr-only">{`${t('reservations.row.notes')}: ${entry.notes}`}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>{entry.notes}</TooltipContent>
            </Tooltip>
          )}
        </span>
        <span className="text-sm text-muted-foreground">
          {[t('waitlist.party', { count: entry.guests }), entry.phone].filter((part) => part !== null).join(' · ')}
        </span>
        {waited !== null && (
          <span className="text-sm">
            <span className="tabular-nums">{t('waitlist.waited', { duration: waitDuration(waited, t) })}</span>
            {entry.quotedWaitMinutes !== null && (
              <span className={cn('tabular-nums', exceeded ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                {' · '}
                {t(exceeded ? 'waitlist.quotedExceeded' : 'waitlist.quoted', { duration: waitDuration(entry.quotedWaitMinutes, t) })}
              </span>
            )}
          </span>
        )}
        {editable && (
          <span className="text-sm text-muted-foreground">
            {entry.nextFreeAt === null
              ? t('waitlist.noTableToday')
              : toMinutes(entry.nextFreeAt) <= nowMinutes
                ? t('waitlist.tableFreeNow')
                : t('waitlist.nextFreeAt', { time: formatTime(entry.nextFreeAt, language) })}
          </span>
        )}
      </span>
    </>
  )

  return (
    // The button and the actions are siblings in the row, so a button never lies inside another one.
    <div
      data-waitlist-entry-id={entry.id}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 rounded-xl border border-border bg-card p-3 shadow-card',
        exceeded && 'border-destructive/50',
      )}
    >
      {editable ? (
        <button
          type="button"
          onClick={() => onEdit(entry)}
          aria-label={t('waitlist.open', { name: entry.name, time: added })}
          className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg text-left focus-ring"
        >
          {details}
        </button>
      ) : (
        <div className="flex min-w-0 items-start gap-3">{details}</div>
      )}
      <Badge variant={entry.status === 'Seated' ? 'success' : entry.status === 'Left' ? 'secondary' : exceeded ? 'destructive' : 'warning'}>
        {t(statusLabels[entry.status])}
      </Badge>
      {editable && (
        <div className="col-span-2 flex flex-wrap gap-1.5">
          <Button size="sm" className="px-2.5" onClick={() => onSeat(entry)} disabled={leaving}>
            <ArmchairIcon aria-hidden="true" />
            {t('waitlist.seat')}
          </Button>
          <Button size="sm" variant="outline" className="px-2.5" onClick={leave} disabled={leaving}>
            {leaving ? <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <LogOutIcon aria-hidden="true" />}
            {t('waitlist.left')}
          </Button>
        </div>
      )}
    </div>
  )
}
