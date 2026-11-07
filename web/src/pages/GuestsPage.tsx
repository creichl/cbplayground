import { useDebouncedValue } from '@mantine/hooks'
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, LoaderCircleIcon, PencilIcon, SearchIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useCurrentUser } from '../api/auth.ts'
import { guestErrorMessage } from '../api/guestErrors.ts'
import { type GuestDetail, type GuestListItem, guestProfileMaxLengths, useDeleteGuest, useGuest, useGuests, useUpdateGuest } from '../api/guests.ts'
import type { GuestTag, Reservation } from '../api/reservations.ts'
import { RequestError } from '../components/booking/RequestError.tsx'
import { GuestMarkers } from '../components/guests/GuestMarkers.tsx'
import { guestTags, occasionLabels, tagLabels } from '../components/guests/labels.ts'
import { StatusBadge } from '../components/reservations/StatusBadge.tsx'
import { formatShortDate, formatTime } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'
import { cn } from '../lib/utils.ts'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.tsx'
import { Badge } from '../ui/badge.tsx'
import { Button } from '../ui/button.tsx'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog.tsx'
import { Input } from '../ui/input.tsx'
import { Label } from '../ui/label.tsx'
import { Skeleton } from '../ui/skeleton.tsx'
import { Textarea } from '../ui/textarea.tsx'

/** The colour of a tag's badge: VIP stands out, "difficult" warns. */
function tagVariant(tag: GuestTag) {
  return tag === 'Vip' ? 'warning' : tag === 'Difficult' ? 'destructive' : 'secondary'
}

/**
 * The guest directory of the front desk (`/frontdesk/guests`): the restaurant's guests sorted by name with a search over name,
 * email address and phone number, page by page; beside it the chosen guest (`/frontdesk/guests/:id`) with the figures, the tags,
 * notes and allergies (editable), and all their reservations. Tenant Admins can delete a guest's data. Phones show the list or the
 * guest.
 */
export function GuestsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('guests.title'))
  const { id } = useParams()
  const selectedId = id ?? null
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [debouncedSearch] = useDebouncedValue(search.trim(), 250)
  const guests = useGuests(debouncedSearch, page)
  const pages = guests.data === undefined ? 1 : Math.max(1, Math.ceil(guests.data.total / guests.data.pageSize))

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        aria-label={t('guests.listLabel')}
        className={cn('flex min-h-0 w-full flex-col border-border bg-background md:w-[400px] md:shrink-0 md:border-r', selectedId !== null && 'max-md:hidden')}
      >
        <div className="flex flex-col gap-3 border-b border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" aria-label={t('guests.backToService')}>
              <Link to="/frontdesk">
                <ArrowLeftIcon aria-hidden="true" />
              </Link>
            </Button>
            <h1 className="font-display text-xl font-semibold">{t('guests.title')}</h1>
            {guests.data !== undefined && <span className="ml-auto text-sm text-muted-foreground tabular-nums">{t('guests.count', { count: guests.data.total })}</span>}
          </div>
          <div className="relative">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label={t('guests.search')}
              placeholder={t('guests.searchPlaceholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value)
                setPage(1)
              }}
              className="pl-9"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {guests.data === undefined ? (
            guests.error !== null ? (
              <RequestError error={guests.error} onRetry={() => void guests.refetch()} />
            ) : (
              <ListSkeleton />
            )
          ) : guests.data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{debouncedSearch === '' ? t('guests.empty') : t('guests.noMatches')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {guests.data.items.map((guest) => (
                <li key={guest.id}>
                  <GuestRow guest={guest} selected={guest.id === selectedId} />
                </li>
              ))}
            </ul>
          )}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t('guests.previousPage')}>
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">{t('guests.page', { page, pages })}</span>
            <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label={t('guests.nextPage')}>
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        )}
      </aside>

      <main className={cn('min-h-0 min-w-0 flex-1 overflow-auto bg-secondary/50 p-3 sm:p-4', selectedId === null && 'max-md:hidden')}>
        {selectedId === null ? (
          <p className="py-12 text-center text-muted-foreground">{t('guests.chooseHint')}</p>
        ) : (
          <GuestDetailPane key={selectedId} id={selectedId} />
        )}
      </main>
    </div>
  )
}

/** A guest in the list: name, contact, markers (VIP, allergies), visits and the last visit. */
function GuestRow({ guest, selected }: { guest: GuestListItem; selected: boolean }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const contact = [guest.phone, guest.email].filter((part) => part !== null).join(' · ')

  return (
    <Link
      to={`/frontdesk/guests/${encodeURIComponent(guest.id)}`}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-card p-3 shadow-card transition-colors focus-ring hover:bg-accent/50',
        selected ? 'border-primary bg-primary-50 ring-2 ring-primary/40' : 'border-border',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-semibold">{guest.name}</span>
        <GuestMarkers reservation={{ guest, status: 'Confirmed', occasion: 'None' }} withFirstVisit={false} />
      </span>
      {contact !== '' && <span className="truncate text-sm text-muted-foreground">{contact}</span>}
      <span className="text-sm text-muted-foreground">
        {t('guests.row.visits', { count: guest.visits })}
        {guest.noShows > 0 && ` · ${t('guests.row.noShows', { count: guest.noShows })}`}
        {guest.lastVisit !== null && ` · ${t('guests.row.lastVisit', { date: formatShortDate(guest.lastVisit, language) })}`}
      </span>
    </Link>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((row) => (
        <Skeleton key={row} className="h-20 rounded-xl" />
      ))}
    </div>
  )
}

function GuestDetailPane({ id }: { id: string }) {
  const { t } = useTranslation()
  const guest = useGuest(id)

  if (guest.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }
  if (guest.isError) {
    return (
      <div className="flex flex-col gap-3">
        <BackToList />
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{t('errors.title')}</AlertTitle>
          <AlertDescription>
            <p>{guestErrorMessage(guest.error, t)}</p>
            <Button variant="outline" size="sm" className="self-start" onClick={() => void guest.refetch()}>
              {t('common.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }
  return <GuestProfile guest={guest.data} />
}

/** Phones: back from the guest to the list. */
function BackToList() {
  const { t } = useTranslation()
  return (
    <Button asChild variant="ghost" className="self-start md:hidden">
      <Link to="/frontdesk/guests">
        <ArrowLeftIcon aria-hidden="true" />
        {t('guests.backToList')}
      </Link>
    </Button>
  )
}

function GuestProfile({ guest }: { guest: GuestDetail }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const currentUser = useCurrentUser()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { figures } = guest
  const dateOrNever = (date: string | null) => (date === null ? t('guests.figures.never') : formatShortDate(date, language))

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <BackToList />
      <section aria-labelledby="guest-name" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="guest-name" className="font-display text-2xl font-semibold">
              {guest.name}
            </h2>
            <p className="text-sm text-muted-foreground">{[guest.phone, guest.email].filter((part) => part !== null).join(' · ') || t('guests.noContact')}</p>
          </div>
          {!editing && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon aria-hidden="true" />
                {t('guests.edit')}
              </Button>
              {currentUser.data?.role === 'TenantAdmin' && (
                <Button variant="outline" className="text-destructive" onClick={() => setDeleting(true)}>
                  <Trash2Icon aria-hidden="true" />
                  {t('guests.delete.button')}
                </Button>
              )}
            </div>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Figure label={t('guests.figures.visits')} value={String(figures.visits)} />
          <Figure label={t('guests.figures.noShows')} value={String(figures.noShows)} />
          <Figure label={t('guests.figures.cancellations')} value={String(figures.cancellations)} />
          <Figure label={t('guests.figures.lastVisit')} value={dateOrNever(figures.lastVisit)} />
          <Figure label={t('guests.figures.nextVisit')} value={figures.nextVisit === null ? t('guests.figures.none') : formatShortDate(figures.nextVisit, language)} />
        </dl>

        {editing ? (
          <ProfileForm guest={guest} onDone={() => setEditing(false)} />
        ) : (
          <>
            {guest.tags.length > 0 && (
              <ul aria-label={t('guests.fields.tags')} className="flex flex-wrap gap-1.5">
                {guest.tags.map((tag) => (
                  <li key={tag}>
                    <Badge variant={tagVariant(tag)}>{t(tagLabels[tag])}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {guest.allergyNotes !== null && (
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>{t('guests.fields.allergyNotes')}</AlertTitle>
                <AlertDescription>{guest.allergyNotes}</AlertDescription>
              </Alert>
            )}
            {guest.notes !== null && (
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">{t('guests.fields.notes')}</h3>
                <p className="text-sm whitespace-pre-line">{guest.notes}</p>
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="guest-visits" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
        <h2 id="guest-visits" className="font-display text-lg font-semibold">
          {t('guests.reservations.title')}
        </h2>
        {guest.reservations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('guests.reservations.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {guest.reservations.map((reservation) => (
              <VisitRow key={reservation.id} reservation={reservation} />
            ))}
          </ul>
        )}
      </section>

      {deleting && <DeleteDialog guest={guest} onClose={() => setDeleting(false)} />}
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-lg bg-secondary/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/** A reservation of the guest: day and time, party, table, occasion and status; it opens the day on the service screen. */
function VisitRow({ reservation }: { reservation: Reservation }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <Link to={`/frontdesk?date=${reservation.date}`} className="rounded-md font-medium tabular-nums focus-ring hover:underline">
        {t('guests.reservations.when', { date: formatShortDate(reservation.date, language), time: formatTime(reservation.time, language) })}
      </Link>
      <span className="text-sm text-muted-foreground">
        {t('guests.reservations.summary', { count: reservation.guests, table: reservation.tableNumber, area: reservation.areaName })}
      </span>
      {reservation.occasion !== 'None' && <Badge variant="outline">{t(occasionLabels[reservation.occasion])}</Badge>}
      <StatusBadge status={reservation.status} className="ml-auto" />
    </li>
  )
}

/** Name, contact, tags, allergies and notes of the profile. */
function ProfileForm({ guest, onDone }: { guest: GuestDetail; onDone: () => void }) {
  const { t } = useTranslation()
  const updateGuest = useUpdateGuest()
  const formId = useId()
  const [values, setValues] = useState({
    name: guest.name,
    phone: guest.phone ?? '',
    email: guest.email ?? '',
    notes: guest.notes ?? '',
    allergyNotes: guest.allergyNotes ?? '',
  })
  const [tags, setTags] = useState<GuestTag[]>(guest.tags)
  const [nameMissing, setNameMissing] = useState(false)
  const set = (field: keyof typeof values) => (event: { currentTarget: { value: string } }) => setValues({ ...values, [field]: event.currentTarget.value })
  const optional = (value: string) => value.trim() || null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (values.name.trim() === '') {
      setNameMissing(true)
      return
    }
    updateGuest.mutate(
      {
        id: guest.id,
        name: values.name.trim(),
        phone: optional(values.phone),
        email: optional(values.email),
        notes: optional(values.notes),
        allergyNotes: optional(values.allergyNotes),
        tags,
      },
      {
        onSuccess: (saved) => {
          toast.success(t('guests.saved', { name: saved.name }))
          onDone()
        },
      },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-name`}>{t('guests.fields.name')}</Label>
          <Input
            id={`${formId}-name`}
            value={values.name}
            onChange={set('name')}
            maxLength={guestProfileMaxLengths.name}
            required
            aria-invalid={nameMissing || undefined}
          />
          {nameMissing && <p className="text-sm font-medium text-destructive">{t('guests.errors.invalidName')}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-phone`}>{t('guests.fields.phone')}</Label>
          <Input id={`${formId}-phone`} type="tel" value={values.phone} onChange={set('phone')} maxLength={guestProfileMaxLengths.phone} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-email`}>{t('guests.fields.email')}</Label>
          <Input id={`${formId}-email`} type="email" value={values.email} onChange={set('email')} maxLength={guestProfileMaxLengths.email} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('guests.fields.tags')}</legend>
        <div className="flex flex-wrap gap-2">
          {guestTags.map((tag) => {
            const active = tags.includes(tag)
            return (
              <Button
                key={tag}
                type="button"
                size="sm"
                variant={active ? 'primary' : 'outline'}
                aria-pressed={active}
                onClick={() => setTags(active ? tags.filter((other) => other !== tag) : guestTags.filter((other) => other === tag || tags.includes(other)))}
              >
                {t(tagLabels[tag])}
              </Button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-allergies`}>{t('guests.fields.allergyNotes')}</Label>
        <Textarea id={`${formId}-allergies`} rows={2} value={values.allergyNotes} onChange={set('allergyNotes')} maxLength={guestProfileMaxLengths.allergyNotes} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-notes`}>{t('guests.fields.notes')}</Label>
        <Textarea id={`${formId}-notes`} rows={3} value={values.notes} onChange={set('notes')} maxLength={guestProfileMaxLengths.notes} />
      </div>

      {updateGuest.error !== null && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{t('guests.notSaved')}</AlertTitle>
          <AlertDescription>{guestErrorMessage(updateGuest.error, t)}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={updateGuest.isPending}>
          {updateGuest.isPending && <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

/** Asks before the guest's data is deleted; afterwards the directory shows the list. */
function DeleteDialog({ guest, onClose }: { guest: GuestDetail; onClose: () => void }) {
  const { t } = useTranslation()
  const deleteGuest = useDeleteGuest()
  const navigate = useNavigate()

  const confirm = () =>
    deleteGuest.mutate(guest.id, {
      onSuccess: () => {
        toast.success(t('guests.delete.done', { name: guest.name }))
        void navigate('/frontdesk/guests', { replace: true })
      },
    })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="font-sans">
        <DialogHeader>
          <DialogTitle>{t('guests.delete.title')}</DialogTitle>
          <DialogDescription>{t('guests.delete.text', { name: guest.name, count: guest.reservations.length })}</DialogDescription>
        </DialogHeader>
        {deleteGuest.error !== null && (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>{guestErrorMessage(deleteGuest.error, t)}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t('guests.delete.back')}</Button>
          </DialogClose>
          <Button className="bg-destructive text-background hover:bg-destructive/90" disabled={deleteGuest.isPending} onClick={confirm}>
            {deleteGuest.isPending && <LoaderCircleIcon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            {t('guests.delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
