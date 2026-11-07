import dayjs from 'dayjs'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon, PrinterIcon, SearchIcon, UserRoundPlusIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import {
  defaultWalkInGuests,
  type Reservation,
  toMinutes,
  useFloor,
  useOpenPeriods,
  useOpenRequests,
  useReservations,
  useRestaurantNow,
  useWalkInTables,
} from '../api/reservations.ts'
import { RequestError } from '../components/booking/RequestError.tsx'
import { CoversChart } from '../components/reservations/CoversChart.tsx'
import { DayStats } from '../components/reservations/DayStats.tsx'
import { ReservationFormDrawer } from '../components/reservations/ReservationFormDrawer.tsx'
import { ReservationListPanel } from '../components/reservations/ReservationListPanel.tsx'
import { type ListTab, listTabOf } from '../components/reservations/status.ts'
import { WalkInDrawer } from '../components/reservations/WalkInDrawer.tsx'
import { dayRange, type MinuteRange } from '../components/table-overview/dayRange.ts'
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

const dateFormat = 'YYYY-MM-DD'

/** The value of the service select for the whole day; a service is chosen by the start of its opening window ("HH:mm"). */
const wholeDay = 'day'

/** Whether the reservation matches the search: part of the name or reference code, or of the phone number's digits. */
function matches(reservation: Reservation, search: string) {
  const text = search.trim().toLowerCase()
  if (text.length === 0) {
    return true
  }
  const digits = text.replace(/\D/g, '')
  return (
    reservation.name.toLowerCase().includes(text) ||
    reservation.referenceCode.toLowerCase().includes(text) ||
    (digits.length > 0 && (reservation.phone ?? '').replace(/\D/g, '').includes(digits))
  )
}

/** "YYYY-MM-DD" as a local date for the calendar. */
function toDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * The service screen of the front desk: in the top bar the day, the service, the search and the main actions ("Print" opens the
 * day sheet of the day and service); below it the key figures of the service with the covers per quarter hour; then the list
 * panel (the day's reservations by where the guests are, and the open requests) beside the plan pane (floor plans or timeline).
 * Selecting a reservation in the list highlights its table and its block, and the other way round. Day, service and view are kept in the address
 * (`?date=YYYY-MM-DD`, `?service=HH:mm`, `?view=timeline`), so a reload or a shared link shows the same.
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
  // undefined: no walk-in drawer; null: walk-in at the suggested table; otherwise at this table.
  const [walkInTable, setWalkInTable] = useState<string | null | undefined>(undefined)
  // Phones show one pane at a time; tablets can collapse the list panel.
  const [phonePane, setPhonePane] = useState<'list' | 'plan'>('list')
  const [listCollapsed, setListCollapsed] = useState(false)

  const floor = useFloor()
  const reservations = useReservations(date)
  const openPeriods = useOpenPeriods(date)
  const openRequests = useOpenRequests(today)
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
  const closed = openPeriods.data !== undefined && openPeriods.data.length === 0
  const nowMinutes = isToday && now !== null ? now.minutes : null
  // Only today, and not from an earlier answer once the server refuses walk-ins (e.g. after closing time).
  const walkInTableIds = new Set(isToday && !walkInTables.isError ? walkInTables.data?.tables.map((table) => table.id) : [])
  const chartRange =
    service?.range ?? (openPeriods.data !== undefined && reservations.data !== undefined ? dayRange(openPeriods.data, reservations.data) : null)

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
      <div className="relative min-w-48 flex-1">
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
      {/* The day sheet of the shown day and service, in a tab of its own, where the print dialog opens. */}
      {date !== null && (
        <Button variant="outline" asChild>
          <Link
            to={`/frontdesk/print?date=${date}${service === null ? '' : `&service=${encodeURIComponent(service.value)}`}`}
            target="_blank"
            aria-label={t('frontdesk.print.button')}
          >
            <PrinterIcon aria-hidden="true" />
            <span className="max-sm:sr-only">{t('frontdesk.print.print')}</span>
          </Link>
        </Button>
      )}
      {/* A walk-in is seated now, so only on today. */}
      {isToday && (
        <Button variant="outline" onClick={() => setWalkInTable(null)} aria-label={t('reservations.walkIn.button')}>
          <UserRoundPlusIcon aria-hidden="true" />
          <span className="max-sm:sr-only">{t('reservations.walkIn.button')}</span>
        </Button>
      )}
      <Button onClick={() => setEditing(null)} disabled={today === null} aria-label={t('reservations.new')}>
        <PlusIcon aria-hidden="true" />
        <span className="max-sm:sr-only">{t('reservations.new')}</span>
      </Button>
    </>
  )

  const planReady = date !== null && floor.data !== undefined && reservations.data !== undefined && openPeriods.data !== undefined
  const planError = floor.error ?? reservations.error ?? openPeriods.error

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
            <DayStats reservations={ofService} openRequests={openRequests.data?.length ?? 0} onOpenRequests={() => setTab('requests')} className="flex-nowrap" />
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
              }}
            />
          ) : (
            <PlanSkeleton />
          )}
        </main>
      </div>

      {editing !== undefined && today !== null && date !== null && (
        <ReservationFormDrawer reservation={editing} defaultDate={date < today ? today : date} today={today} onClose={() => setEditing(undefined)} />
      )}
      {walkInTable !== undefined && <WalkInDrawer tableId={walkInTable ?? undefined} onClose={() => setWalkInTable(undefined)} />}
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
