import dayjs from 'dayjs'
import {
  BookUserIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListPlusIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SearchIcon,
  UserRoundPlusIcon,
} from 'lucide-react'
import { type PointerEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import {
  defaultWalkInGuests,
  type Reservation,
  toMinutes,
  useFloor,
  useOpenPeriods,
  useOpenRequests,
  useReservationFreeTables,
  useReservations,
  useRestaurantNow,
  useWalkInTables,
} from '../api/reservations.ts'
import { useTableBlocks } from '../api/tableBlocks.ts'
import { useWaitlist, type WaitlistEntry, type WaitlistInput } from '../api/waitlist.ts'
import { RequestError } from '../components/booking/RequestError.tsx'
import { CoversChart } from '../components/reservations/CoversChart.tsx'
import { DayStats } from '../components/reservations/DayStats.tsx'
import { ReservationFormDrawer } from '../components/reservations/ReservationFormDrawer.tsx'
import { ReservationListPanel } from '../components/reservations/ReservationListPanel.tsx'
import { guestName, type ListTab, listTabOf } from '../components/reservations/status.ts'
import { useReservationMoves } from '../components/reservations/useReservationMoves.ts'
import { WaitlistDrawer } from '../components/reservations/WaitlistDrawer.tsx'
import { WalkInDrawer } from '../components/reservations/WalkInDrawer.tsx'
import { dayRange, type MinuteRange } from '../components/table-overview/dayRange.ts'
import { dropTarget } from '../components/table-overview/dropTargets.ts'
import type { FloorDrop } from '../components/table-overview/FloorStatusView.tsx'
import { PlanPane, type PlanView } from '../components/table-overview/PlanPane.tsx'
import { formatDate, formatTime, periodLabel } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'
import { FrontdeskHeader } from '../layouts/FrontdeskLayout.tsx'
import { cn } from '../lib/utils.ts'
import { Button } from '../ui/button.tsx'
import { Calendar } from '../ui/calendar.tsx'
import { Input } from '../ui/input.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx'
import { Skeleton } from '../ui/skeleton.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.tsx'

const dateFormat = 'YYYY-MM-DD'

/** The value of the service select for the whole day; a service is chosen by the start of its opening window ("HH:mm"). */
const wholeDay = 'day'

/**
 * Whether the reservation (or the party on the waitlist) matches the search: part of the name or reference code, or of the
 * phone number's digits.
 */
function matches(reservation: Pick<Reservation, 'name' | 'phone'> & { referenceCode?: string }, search: string) {
  const text = search.trim().toLowerCase()
  if (text.length === 0) {
    return true
  }
  const digits = text.replace(/\D/g, '')
  return (
    reservation.name.toLowerCase().includes(text) ||
    (reservation.referenceCode ?? '').toLowerCase().includes(text) ||
    (digits.length > 0 && (reservation.phone ?? '').replace(/\D/g, '').includes(digits))
  )
}

/** The table on the floor plans under the pointer, if any. */
function tableAt(x: number, y: number) {
  for (const element of document.elementsFromPoint(x, y)) {
    const table = element.closest<HTMLElement>('[data-table-id]')
    if (table !== null) {
      return table.dataset.tableId ?? null
    }
  }
  return null
}

/** A guest dragged from the list onto the floor plans: where the pointer is and the table under it. */
type GuestDrag = { reservation: Reservation; pointerId: number; x: number; y: number; tableId: string | null }

/** "YYYY-MM-DD" as a local date for the calendar. */
function toDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * The service screen of the front desk: in the top bar the day, the service, the search, the way to the guest directory and the
 * main actions; below it the key figures of the service with the covers per quarter hour; then the list panel (the day's
 * reservations by where the guests are, the open requests and the day's waitlist of walk-ins) beside the plan pane (floor plans
 * or timeline). Selecting a reservation in the list highlights its table and its block, and the other way round. Day, service
 * and view are kept in the address
 * (`?date=YYYY-MM-DD`, `?service=HH:mm`, `?view=timeline`), so a reload or a shared link shows the same.
 * A guest of "Upcoming" is dragged by the grip of its row onto a table of the floor plans to seat them there (see
 * useReservationMoves); a tap on a free cell of the timeline opens a new reservation at that table and time.
 */
export function FrontdeskPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  useDocumentTitle(t('frontdesk.label'))
  // "Today" and the current time are those of the restaurant, not of the device.
  const now = useRestaurantNow()
  const today = now?.date ?? null
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('date')
  const date = requested !== null && dayjs(requested).format(dateFormat) === requested ? requested : today
  const view: PlanView = searchParams.get('view') === 'timeline' ? 'timeline' : 'floor'
  const serviceParam = searchParams.get('service') ?? wholeDay

  const [search, setSearch] = useState('')
  // `?tab=requests` opens the open requests, e.g. from the admin overview's key figure; afterwards the tab is the screen's own.
  const [tab, setTab] = useState<ListTab>(() => (searchParams.get('tab') === 'requests' ? 'requests' : 'upcoming'))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // undefined: drawer closed, null: new reservation.
  const [editing, setEditing] = useState<Reservation | null | undefined>(undefined)
  // The time and table a new reservation starts with, from a tapped cell of the timeline.
  const [newAt, setNewAt] = useState<{ time: string; tableIds: string[] } | undefined>(undefined)
  const [draggedGuest, setDraggedGuest] = useState<GuestDrag | null>(null)
  const draggedGuestFree = useReservationFreeTables(draggedGuest?.reservation.id ?? null)
  const moves = useReservationMoves()
  // undefined: no walk-in drawer; null: walk-in at the suggested table; otherwise at this table.
  const [walkInTable, setWalkInTable] = useState<string | null | undefined>(undefined)
  // The waiting party being seated in the walk-in drawer.
  const [seating, setSeating] = useState<WaitlistEntry | undefined>(undefined)
  // undefined: no waitlist drawer; otherwise the entry to change, or what a new party starts with.
  const [waitlistForm, setWaitlistForm] = useState<{ entry?: WaitlistEntry; initial?: Partial<WaitlistInput> } | undefined>(undefined)
  // Phones show one pane at a time; tablets can collapse the list panel.
  const [phonePane, setPhonePane] = useState<'list' | 'plan'>('list')
  const [listCollapsed, setListCollapsed] = useState(false)

  const floor = useFloor()
  const reservations = useReservations(date)
  const openPeriods = useOpenPeriods(date)
  const blocks = useTableBlocks(date)
  const openRequests = useOpenRequests(today)
  const waitlist = useWaitlist(date)
  const isToday = today !== null && date === today
  // The floor plans offer "Seat walk-in here" only on the tables the server accepts for a walk-in now (with the buffer and the
  // walk-in's duration), for the party size the walk-in drawer starts with. Closed now: an error, so no table is offered.
  const walkInTables = useWalkInTables(isToday && view === 'floor' ? defaultWalkInGuests : null)

  /** Changes day, service or view in the address; the defaults (today, whole day, floor plan) are left out. */
  const show = (changes: { date?: string | null; service?: string; view?: PlanView }) => {
    const next = { date, service: serviceParam, view, ...changes }
    const params: Record<string, string> = {}
    if (next.date !== null && next.date !== today) {
      params.date = next.date
    }
    if (next.service !== wholeDay) {
      params.service = next.service
    }
    if (next.view !== 'floor') {
      params.view = next.view
    }
    setSearchParams(params)
  }
  const showDate = (day: string) => {
    setSelectedId(null)
    show({ date: day })
  }
  const shiftDate = (days: number) => date !== null && showDate(dayjs(date).add(days, 'day').format(dateFormat))

  // The services of the day are its opening windows, named as in the guest's booking ("Lunch 11:30–14:30").
  const services = (openPeriods.data ?? []).map((period) => ({
    value: period.start,
    label: t('frontdesk.service.option', {
      name: t(periodLabel(period.start)),
      time: t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) }),
    }),
    range: { start: toMinutes(period.start), end: toMinutes(period.end) } satisfies MinuteRange,
  }))
  const service = services.find((candidate) => candidate.value === serviceParam) ?? null
  const inService = (reservation: Reservation) =>
    service === null || (toMinutes(reservation.time) >= service.range.start && toMinutes(reservation.time) < service.range.end)

  const ofService = reservations.data?.filter(inService)
  const searched = ofService?.filter((reservation) => matches(reservation, search))
  const requests = openRequests.data?.filter((reservation) => matches(reservation, search))
  const waitlistEntries = waitlist.data?.filter((entry) => matches(entry, search))
  const waiting = waitlist.data?.filter((entry) => entry.status === 'Waiting')
  const closed = openPeriods.data !== undefined && openPeriods.data.length === 0
  const nowMinutes = isToday && now !== null ? now.minutes : null
  // Only today, and not from an earlier answer once the server refuses walk-ins (e.g. after closing time).
  const walkInTableIds = new Set(isToday && !walkInTables.isError ? walkInTables.data?.tables.map((table) => table.id) : [])
  const chartRange =
    service?.range ?? (openPeriods.data !== undefined && reservations.data !== undefined ? dayRange(openPeriods.data, reservations.data) : null)

  const book = (tableId: string, time: string) => {
    setNewAt({ time, tableIds: [tableId] })
    setEditing(null)
  }
  // Only from today on; earlier days cannot be booked.
  const canBook = date !== null && today !== null && date >= today

  // The table a dragged guest would take at the table under the pointer: one it fits, or the table itself (the server says why not).
  const guestDropTarget = (reservation: Reservation, tableId: string) => dropTarget(draggedGuestFree.data ?? [], tableId, reservation)?.tableIds ?? [tableId]
  const floorDrop: FloorDrop | null =
    draggedGuest === null
      ? null
      : {
          fitting: draggedGuestFree.data === undefined ? null : new Set(draggedGuestFree.data.flatMap((free) => free.tableIds)),
          target: draggedGuest.tableId === null ? [] : guestDropTarget(draggedGuest.reservation, draggedGuest.tableId),
        }

  const startGuestDrag = (reservation: Reservation, event: PointerEvent<HTMLElement>) =>
    setDraggedGuest({ reservation, pointerId: event.pointerId, x: event.clientX, y: event.clientY, tableId: null })

  // While a guest is dragged, the pointer is followed over the whole window; on release over a table they are seated there.
  useEffect(() => {
    if (draggedGuest === null) {
      return
    }
    const handleMove = (event: globalThis.PointerEvent) => {
      if (event.pointerId === draggedGuest.pointerId) {
        setDraggedGuest({ ...draggedGuest, x: event.clientX, y: event.clientY, tableId: tableAt(event.clientX, event.clientY) })
      }
    }
    const handleUp = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== draggedGuest.pointerId) {
        return
      }
      setDraggedGuest(null)
      const tableId = tableAt(event.clientX, event.clientY)
      if (tableId !== null) {
        setSelectedId(draggedGuest.reservation.id)
        // A refusal is shown by the toast; the guest stays where they were.
        moves.seat(draggedGuest.reservation, guestDropTarget(draggedGuest.reservation, tableId)).catch(() => undefined)
      }
    }
    const handleCancel = (event: globalThis.PointerEvent) => event.pointerId === draggedGuest.pointerId && setDraggedGuest(null)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleCancel)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleCancel)
    }
  })

  const open = (reservation: Reservation) => {
    setSelectedId(reservation.id)
    setEditing(reservation)
  }
  // Selected on the plan: the list shows the tab that holds it (the open requests keep their tab).
  const select = (reservation: Reservation) => {
    setSelectedId(reservation.id)
    if (!(tab === 'requests' && reservation.status === 'Requested')) {
      setTab(listTabOf(reservation))
    }
  }

  const controls = (
    <>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={() => shiftDate(-1)} disabled={date === null} aria-label={t('tableOverview.date.previous')}>
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button variant="outline" onClick={() => today !== null && showDate(today)} disabled={date === null || isToday}>
          {t('tableOverview.date.today')}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-0 justify-start tabular-nums sm:w-48" disabled={date === null} aria-label={t('tableOverview.date.label')}>
              <CalendarIcon aria-hidden="true" />
              <span className="truncate">{date === null ? '' : formatDate(date, language)}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2 font-sans">
            {date !== null && (
              <Calendar mode="single" selected={toDate(date)} defaultMonth={toDate(date)} onSelect={(day) => day !== undefined && showDate(dayjs(day).format(dateFormat))} />
            )}
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="icon" onClick={() => shiftDate(1)} disabled={date === null} aria-label={t('tableOverview.date.next')}>
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
      <Select value={service?.value ?? wholeDay} onValueChange={(value) => show({ service: value })} disabled={openPeriods.data === undefined}>
        <SelectTrigger aria-label={t('frontdesk.service.label')} className="w-auto min-w-40 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={wholeDay}>{t('frontdesk.service.wholeDay')}</SelectItem>
          {services.map((candidate) => (
            <SelectItem key={candidate.value} value={candidate.value}>
              {candidate.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative min-w-40 flex-1">
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={t('reservations.search')}
          placeholder={t('reservations.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          className="pl-9"
        />
      </div>
    </>
  )

  const actions = (
    <>
      {/* An icon below 1536 px, so the top bar keeps one row at 1440 px. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon" className="2xl:w-auto 2xl:px-4" aria-label={t('guests.title')}>
            <Link to="/frontdesk/guests">
              <BookUserIcon aria-hidden="true" />
              <span className="max-2xl:sr-only">{t('guests.title')}</span>
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent className="2xl:hidden">{t('guests.title')}</TooltipContent>
      </Tooltip>
      {/* A walk-in is seated now and the waitlist is today's, so only on today. */}
      {isToday && (
        <>
          <Button variant="outline" onClick={() => setWaitlistForm({})} aria-label={t('waitlist.add')}>
            <ListPlusIcon aria-hidden="true" />
            <span className="max-sm:sr-only">{t('waitlist.add')}</span>
          </Button>
          <Button variant="outline" onClick={() => setWalkInTable(null)} aria-label={t('reservations.walkIn.button')}>
            <UserRoundPlusIcon aria-hidden="true" />
            <span className="max-sm:sr-only">{t('reservations.walkIn.button')}</span>
          </Button>
        </>
      )}
      <Button
        onClick={() => {
          setNewAt(undefined)
          setEditing(null)
        }}
        disabled={today === null}
        aria-label={t('reservations.new')}
      >
        <PlusIcon aria-hidden="true" />
        <span className="max-sm:sr-only">{t('reservations.new')}</span>
      </Button>
    </>
  )

  const planReady =
    date !== null && floor.data !== undefined && reservations.data !== undefined && openPeriods.data !== undefined && blocks.data !== undefined
  const planError = floor.error ?? reservations.error ?? openPeriods.error ?? blocks.error

  return (
    <>
      <FrontdeskHeader controls={controls} actions={actions} />

      <section aria-label={t('frontdesk.keyFigures')} className="flex shrink-0 items-center gap-4 overflow-x-auto border-b border-border bg-card px-3 py-2 sm:px-4">
        {ofService === undefined ? (
          <div className="flex gap-2" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((tile) => (
              <Skeleton key={tile} className="h-15 w-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <DayStats
              reservations={ofService}
              openRequests={openRequests.data?.length ?? 0}
              onOpenRequests={() => setTab('requests')}
              waiting={waiting === undefined ? undefined : { parties: waiting.length, guests: waiting.reduce((sum, entry) => sum + entry.guests, 0) }}
              className="flex-nowrap"
            />
            {chartRange !== null && (
              <CoversChart
                reservations={ofService}
                start={Math.floor(chartRange.start / 15) * 15}
                end={Math.ceil(chartRange.end / 15) * 15}
                nowMinutes={nowMinutes}
                className="min-w-56 flex-1 xl:max-w-xl"
              />
            )}
          </>
        )}
      </section>

      {/* Phones: one pane at a time. */}
      <div role="group" aria-label={t('frontdesk.panes')} className="flex shrink-0 gap-1 border-b border-border bg-card p-2 md:hidden">
        {(
          [
            { pane: 'list', view: null, label: t('frontdesk.panesList') },
            { pane: 'plan', view: 'floor', label: t('tableOverview.views.floor') },
            { pane: 'plan', view: 'timeline', label: t('tableOverview.views.timeline') },
          ] as const
        ).map((option) => {
          const active = phonePane === option.pane && (option.view === null || option.view === view)
          return (
            <Button
              key={option.label}
              variant={active ? 'secondary' : 'ghost'}
              aria-pressed={active}
              className="flex-1"
              onClick={() => {
                setPhonePane(option.pane)
                if (option.view !== null) {
                  show({ view: option.view })
                }
              }}
            >
              {option.label}
            </Button>
          )
        })}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label={t('frontdesk.listPanel')}
          className={cn(
            'flex min-h-0 w-full flex-col border-border bg-background md:w-[400px] md:shrink-0 md:border-r',
            phonePane !== 'list' && 'max-md:hidden',
            listCollapsed && 'md:max-xl:hidden',
          )}
        >
          <ReservationListPanel
            className="flex-1"
            tab={tab}
            onTabChange={setTab}
            reservations={searched}
            error={reservations.error}
            onRetry={() => void reservations.refetch()}
            requests={requests}
            requestsError={openRequests.error}
            onRetryRequests={() => void openRequests.refetch()}
            emptyText={closed ? t('tableOverview.closed') : t(service === null ? 'reservations.list.empty' : 'frontdesk.empty.service')}
            searching={search.trim().length > 0}
            selectedId={selectedId}
            onOpen={open}
            waitlist={waitlistEntries}
            waitlistError={waitlist.error}
            onRetryWaitlist={() => void waitlist.refetch()}
            nowMinutes={nowMinutes}
            waitlistEmptyText={t(date !== null && today !== null && date > today ? 'waitlist.empty.future' : isToday ? 'waitlist.empty.today' : 'waitlist.empty.past')}
            onSeat={setSeating}
            onEditEntry={(entry) => setWaitlistForm({ entry })}
            onDragToTable={planReady && view === 'floor' ? startGuestDrag : undefined}
          />
        </aside>

        <main className={cn('relative min-h-0 min-w-0 flex-1 overflow-auto bg-secondary/50 p-3 sm:p-4', phonePane === 'list' && 'max-md:hidden')}>
          {planReady ? (
            <PlanPane
              view={view}
              onViewChange={(shown) => show({ view: shown })}
              date={date}
              areas={floor.data}
              reservations={reservations.data}
              openPeriods={openPeriods.data}
              service={service?.range ?? null}
              nowMinutes={nowMinutes}
              walkInTableIds={walkInTableIds}
              onWalkIn={setWalkInTable}
              selectedId={selectedId}
              onSelect={select}
              blocks={blocks.data}
              onBook={canBook ? book : undefined}
              drop={floorDrop}
              // Tablets: the list panel is hidden and shown again from the plan pane, so its tab row keeps the full width.
              leading={
                listCollapsed ? (
                  <Button variant="outline" className="hidden md:max-xl:inline-flex" onClick={() => setListCollapsed(false)}>
                    <PanelLeftOpenIcon aria-hidden="true" />
                    {t('frontdesk.showList')}
                  </Button>
                ) : (
                  <Button variant="outline" size="icon" className="hidden md:max-xl:inline-flex" onClick={() => setListCollapsed(true)} aria-label={t('frontdesk.hideList')}>
                    <PanelLeftCloseIcon aria-hidden="true" />
                  </Button>
                )
              }
            />
          ) : planError !== null ? (
            <RequestError
              error={planError}
              onRetry={() => {
                void floor.refetch()
                void reservations.refetch()
                void openPeriods.refetch()
                void blocks.refetch()
              }}
            />
          ) : (
            <PlanSkeleton />
          )}
        </main>
      </div>

      {editing !== undefined && today !== null && date !== null && (
        <ReservationFormDrawer
          reservation={editing}
          defaultDate={date < today ? today : date}
          today={today}
          initial={editing === null ? newAt : undefined}
          onClose={() => setEditing(undefined)}
        />
      )}
      {draggedGuest !== null && (
        // The guest under the pointer while they are dragged onto a table.
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded-lg border border-primary bg-card px-3 py-1.5 text-sm font-semibold shadow-float"
          style={{ left: draggedGuest.x + 12, top: draggedGuest.y + 12 }}
        >
          {t('tableOverview.party', { name: guestName(draggedGuest.reservation, t), guests: draggedGuest.reservation.guests })}
        </div>
      )}
      {walkInTable !== undefined && (
        <WalkInDrawer
          tableId={walkInTable ?? undefined}
          onAddToWaitlist={(initial) => {
            setWalkInTable(undefined)
            setWaitlistForm({ initial })
          }}
          onClose={() => setWalkInTable(undefined)}
        />
      )}
      {seating !== undefined && <WalkInDrawer waitlistEntry={seating} onClose={() => setSeating(undefined)} />}
      {waitlistForm !== undefined && (
        <WaitlistDrawer entry={waitlistForm.entry} initial={waitlistForm.initial} onAdded={() => setTab('waitlist')} onClose={() => setWaitlistForm(undefined)} />
      )}
    </>
  )
}

/** The plan pane while it loads: the switch, the slider and a plan in their shape. */
function PlanSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="aspect-3/2 w-full rounded-xl" />
    </div>
  )
}
