import { CalendarOffIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type FloorArea, type FloorTable, type OpenPeriod, type Reservation, toMinutes } from '../../api/reservations.ts'
import type { TableBlock } from '../../api/tableBlocks.ts'
import { cn } from '../../lib/utils.ts'
import { Alert, AlertDescription } from '../../ui/alert.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.tsx'
import { statusColors, statusLabels } from '../reservations/status.ts'
import { dayRange, type MinuteRange } from './dayRange.ts'
import { type FloorDrop, FloorStatusView } from './FloorStatusView.tsx'
import { blockHatch } from './blocks.ts'
import { BlockTableDialog } from './TableBlocks.tsx'
import { Timeline } from './Timeline.tsx'

/** The two views of the plan pane: the floor plans of the areas or the timeline of the tables. */
export type PlanView = 'floor' | 'timeline'

type PlanPaneProps = {
  view: PlanView
  onViewChange: (view: PlanView) => void
  /** The day shown, "YYYY-MM-DD"; a new day starts the views anew. */
  date: string
  areas: FloorArea[]
  /** The reservations of the whole day. */
  reservations: Reservation[]
  /** The opening windows of the day; empty when the restaurant is closed. */
  openPeriods: OpenPeriod[]
  /** The chosen service (an opening window); null for the whole day. The views start at it. */
  service: MinuteRange | null
  /** The current time in minutes since midnight when the day is today, otherwise null. */
  nowMinutes: number | null
  /** The tables free now for a walk-in (only today). */
  walkInTableIds: ReadonlySet<string>
  onWalkIn: (tableId: string) => void
  selectedId: string | null
  onSelect: (reservation: Reservation) => void
  /** The blocked tables of the day. */
  blocks: TableBlock[]
  /** Books a free cell of the timeline (its table and time); without it, e.g. on past days, a tap books nothing. */
  onBook?: (tableId: string, time: string) => void
  /** While a guest is dragged from the list onto the floor plans: the tables it fits and those it would take. */
  drop: FloorDrop | null
  /** Shown before the switch, e.g. the button that shows the collapsed list panel again. */
  leading?: ReactNode
  className?: string
}

/**
 * The plan pane of the front desk: a switch between the floor plans (with the time slider and "Seat walk-in here") and the
 * timeline of all tables, the colours of the statuses, and the day's state (closed, no tables). Both views start at the
 * current time when it lies in the chosen service (or the day), otherwise at the service's start or the first opening.
 * Both offer to block a table, in the dialog this pane opens.
 * Reservations are moved on the timeline by drag and drop, a free cell of it books its table and time, and the floor plans
 * show where a guest dragged from the list fits.
 */
export function PlanPane({
  view,
  onViewChange,
  date,
  areas,
  reservations,
  openPeriods,
  service,
  nowMinutes,
  walkInTableIds,
  onWalkIn,
  selectedId,
  onSelect,
  blocks,
  onBook,
  drop,
  leading,
  className,
}: PlanPaneProps) {
  const { t } = useTranslation()
  // The table to block and the proposed start; null: no dialog.
  const [blocking, setBlocking] = useState<{ table: FloorTable; start: number } | null>(null)
  const block = (table: FloorTable, start: number) => setBlocking({ table, start })
  const hasTables = areas.some((area) => area.tables.length > 0)
  const range = dayRange(openPeriods, reservations)
  const closed = openPeriods.length === 0
  const within = service ?? range
  const firstOpening = openPeriods.length > 0 ? toMinutes(openPeriods[0].start) : (range?.start ?? 0)
  const initialTime =
    within !== null && nowMinutes !== null && nowMinutes >= within.start && nowMinutes < within.end
      ? Math.floor(nowMinutes / 15) * 15
      : (service?.start ?? firstOpening)
  // A new day or service starts the views at its time again.
  const key = `${date}-${service?.start ?? 'day'}`

  return (
    <Tabs value={view} onValueChange={(value) => onViewChange(value as PlanView)} className={cn('gap-3', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {leading}
        <TabsList className="max-md:hidden">
          <TabsTrigger value="floor">{t('tableOverview.views.floor')}</TabsTrigger>
          <TabsTrigger value="timeline">{t('tableOverview.views.timeline')}</TabsTrigger>
        </TabsList>
        {hasTables && range !== null && <StatusLegend />}
      </div>

      {!hasTables ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t('tableOverview.noTables')}</p>
      ) : range === null ? (
        <ClosedDay />
      ) : (
        <>
          {closed && (
            <Alert role="note">
              <CalendarOffIcon aria-hidden="true" />
              <AlertDescription>{t('tableOverview.closed')}</AlertDescription>
            </Alert>
          )}
          <TabsContent value="floor">
            <FloorStatusView
              key={key}
              areas={areas}
              reservations={reservations}
              start={range.start}
              end={range.end}
              initialTime={initialTime}
              nowMinutes={nowMinutes}
              walkInTableIds={walkInTableIds}
              onWalkIn={onWalkIn}
              selectedId={selectedId}
              onSelect={onSelect}
              blocks={blocks}
              onBlock={block}
              drop={drop}
            />
          </TabsContent>
          <TabsContent value="timeline">
            <Timeline
              key={key}
              date={date}
              areas={areas}
              reservations={reservations}
              openPeriods={openPeriods}
              start={range.start}
              end={range.end}
              nowMinutes={nowMinutes}
              initialTime={initialTime}
              selectedId={selectedId}
              onSelect={onSelect}
              blocks={blocks}
              onBlock={block}
              onBook={onBook}
            />
          </TabsContent>
        </>
      )}
      {blocking !== null && range !== null && (
        <BlockTableDialog
          table={blocking.table}
          date={date}
          start={blocking.start}
          openPeriods={openPeriods}
          range={range}
          reservations={reservations}
          onClose={() => setBlocking(null)}
        />
      )}
    </Tabs>
  )
}

/** A closed day without reservations: nothing to plan. */
function ClosedDay() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-12 text-center">
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CalendarOffIcon className="size-6" />
      </span>
      <p className="font-semibold">{t('tableOverview.closed')}</p>
    </div>
  )
}

/** The status colours of the tables and reservations, and how a blocked table looks. */
function StatusLegend() {
  const { t } = useTranslation()
  const items = [
    { label: t('tableOverview.free'), fill: 'var(--card)', stroke: 'var(--status-declined)', inactive: false },
    ...(['Requested', 'Confirmed', 'Late', 'Arrived', 'Completed'] as const).map((status) => ({
      label: t(statusLabels[status]),
      fill: statusColors[status].surface,
      stroke: statusColors[status].color,
      inactive: false,
    })),
    { label: t('tableOverview.legendInactive'), fill: statusColors.Cancelled.surface, stroke: statusColors.Cancelled.color, inactive: true },
  ]

  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={t('tableOverview.legend')}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn('size-3.5 rounded-sm border-2', item.inactive && 'border-dashed opacity-50')}
            style={{ backgroundColor: item.fill, borderColor: item.stroke }}
          />
          {item.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-3.5 rounded-sm border-2 border-dashed" style={blockHatch} />
        {t('tableBlocks.legend')}
      </li>
    </ul>
  )
}
