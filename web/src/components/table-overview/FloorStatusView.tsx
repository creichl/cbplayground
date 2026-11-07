import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type FloorArea, type FloorTable, formatMinutes, type Reservation, toMinutes } from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { Button } from '../../ui/button.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.tsx'
import { FloorPlan, type ZoomButtonProps } from '../floor-plan/FloorPlan.tsx'
import { TableShape } from '../floor-plan/TableShape.tsx'
import { occupiedUntil, occupiesTable, statusColors, statusLabels } from '../reservations/status.ts'
import { TimeAxis } from '../reservations/TimeAxis.tsx'
import { ReservationPopover } from './ReservationPopover.tsx'

type FloorStatusViewProps = {
  areas: FloorArea[]
  /** The reservations of the day. */
  reservations: Reservation[]
  /** The time range of the slider in minutes since midnight. */
  start: number
  end: number
  /** The time the slider starts at. */
  initialTime: number
  /** The current time in minutes since midnight when the day is today, otherwise null. */
  nowMinutes: number | null
  /** The tables the server lists as free now for a walk-in (GET /api/staff/walk-in-tables); empty on other days and while closed. */
  walkInTableIds: ReadonlySet<string>
  /** Seats a walk-in at a table that is free now (only today). */
  onWalkIn: (tableId: string) => void
  /** The reservation selected on the screen: its table is highlighted and brought into view. */
  selectedId: string | null
  /** Called when a table with a reservation is clicked: the reservation shown at it becomes the selected one. */
  onSelect: (reservation: Reservation) => void
}

/** The slider moves in quarter hours, like the reservation start times. */
const step = 15

/** The zoom buttons of the plans in the design system. */
function ZoomButton({ label, icon, disabled, onClick, placement }: ZoomButtonProps) {
  return (
    <Button variant="outline" size="icon" aria-label={label} disabled={disabled} onClick={onClick} className={placement === 'inside' ? 'size-11 bg-card shadow-card' : 'size-9 touch:size-11'}>
      {icon}
    </Button>
  )
}

/**
 * The plan of every area (floor plan image or drawn room) with its tables drawn in the colour of their status at the
 * chosen time, and the end of the current or the start of the next reservation at each table.
 */
export function FloorStatusView({
  areas,
  reservations,
  start,
  end,
  initialTime,
  nowMinutes,
  walkInTableIds,
  onWalkIn,
  selectedId,
  onSelect,
}: FloorStatusViewProps) {
  const { t, i18n } = useTranslation()
  const [time, setTime] = useState(initialTime)
  const plansRef = useRef<HTMLDivElement>(null)
  const active = reservations.filter(occupiesTable)
  const label = (minutes: number) => formatTime(formatMinutes(minutes), i18n.resolvedLanguage ?? 'en')
  const selectedTableId = reservations.find((reservation) => reservation.id === selectedId)?.tableId ?? null

  // A reservation selected elsewhere (the list) brings its table into view.
  useEffect(() => {
    if (selectedTableId === null) {
      return
    }
    plansRef.current
      ?.querySelector(`[data-table-id="${CSS.escape(selectedTableId)}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selectedTableId])

  return (
    <div className="flex flex-col gap-4">
      {/* On phones the slider takes a row of its own below the time and "Now", so it keeps the width of the pane. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 shadow-card">
        <div className="flex shrink-0 flex-col">
          <label htmlFor="floor-time" className="text-xs text-muted-foreground">
            {t('tableOverview.floor.time')}
          </label>
          <output htmlFor="floor-time" className="text-xl font-semibold tabular-nums">
            {label(time)}
          </output>
        </div>
        <div className="order-last flex min-w-0 basis-full flex-col gap-1 sm:order-none sm:basis-0 sm:flex-1">
          <input
            id="floor-time"
            type="range"
            min={start}
            max={end}
            step={step}
            value={time}
            onChange={(event) => setTime(Number(event.currentTarget.value))}
            aria-valuetext={label(time)}
            className="h-11 w-full cursor-pointer accent-primary focus-ring"
          />
          <TimeAxis start={start} end={end} />
        </div>
        {nowMinutes !== null && (
          <Button variant="outline" className="ml-auto shrink-0 sm:ml-0" onClick={() => setTime(Math.min(end, Math.max(start, Math.floor(nowMinutes / step) * step)))}>
            {t('tableOverview.floor.now')}
          </Button>
        )}
      </div>

      <div ref={plansRef} className="flex flex-col gap-4">
        {areas.map((area) => (
          <section key={area.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
            <h3 className="text-base font-semibold">{area.name}</h3>
            {area.tables.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('tableOverview.noTables')}</p>
            ) : (
              <FloorPlan
                imageUrl={area.floorPlanUrl}
                imageAlt={t('areas.floorPlanAlt')}
                roomStyle={area.roomStyle}
                roomElements={area.roomElements}
                tables={area.tables}
                tableScale={area.tableScale}
                zoomButton={ZoomButton}
              >
                {area.tables.map((table) => (
                  <TableStatus
                    key={table.id}
                    table={table}
                    tableScale={area.tableScale}
                    reservations={active}
                    time={time}
                    freeNow={walkInTableIds.has(table.id)}
                    onWalkIn={onWalkIn}
                    selected={table.id === selectedTableId}
                    onSelect={onSelect}
                  />
                ))}
              </FloorPlan>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

type TableStatusProps = {
  table: FloorTable
  tableScale: number
  /** The reservations of the day that occupy a table. */
  reservations: Reservation[]
  time: number
  /** Whether the server lists the table as free now for a walk-in, with the buffer and the walk-in's duration. */
  freeNow: boolean
  onWalkIn: (tableId: string) => void
  /** The table of the selected reservation. */
  selected: boolean
  onSelect: (reservation: Reservation) => void
}

/** Whether the reservation occupies its table at `minutes`; a guest who left only until they left. */
function occupiesAt(reservation: Reservation, minutes: number) {
  return toMinutes(reservation.time) <= minutes && minutes < toMinutes(occupiedUntil(reservation))
}

/**
 * A table in the colour of its status at `time`, with the end of the current or the start of the next reservation.
 * A table that is free now for a walk-in offers to seat one. The table of the selected reservation carries a thick outline.
 */
function TableStatus({ table, tableScale, reservations, time, freeNow, onWalkIn, selected, onSelect }: TableStatusProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const atTable = reservations.filter((reservation) => reservation.tableId === table.id)
  const current = atTable.find((reservation) => occupiesAt(reservation, time))
  const next = atTable.find((reservation) => toMinutes(reservation.time) > time)
  const shown = current ?? next
  const color = current === undefined ? null : statusColors[current.status]
  const status = current === undefined ? t('tableOverview.free') : t(statusLabels[current.status])
  const clickable = shown !== undefined || freeNow

  const marker = (
    <TableShape
      data-table-id={table.id}
      data-selected={selected ? '' : undefined}
      number={table.number}
      seats={table.seats}
      shape={table.shape}
      rotation={table.rotation}
      posX={table.posX}
      posY={table.posY}
      tableScale={tableScale}
      fill={color === null ? 'var(--card)' : color.surface}
      stroke={selected ? 'var(--foreground)' : color === null ? 'var(--status-declined)' : color.color}
      color="var(--foreground)"
      strokeWidth={selected ? 4 : 2}
      note={
        shown === undefined
          ? undefined
          : current !== undefined
            ? t('tableOverview.floor.until', { time: formatTime(occupiedUntil(current), language) })
            : t('tableOverview.floor.nextAt', { time: formatTime(shown.time, language) })
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={`${t('areas.tableMarker', { number: table.number, seats: table.seats })}, ${status}`}
      aria-current={selected ? 'true' : undefined}
      // The popover opens on click; Enter and Space do the same for keyboard users.
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.currentTarget.click()
        }
      }}
      // The popover replaces the click handler; selecting the reservation shown at the table happens before it.
      onClickCapture={shown === undefined ? undefined : () => onSelect(shown)}
      style={{ cursor: clickable ? 'pointer' : 'default', zIndex: selected ? 2 : 1 }}
    />
  )

  const walkIn = freeNow ? () => onWalkIn(table.id) : undefined
  if (shown !== undefined) {
    return (
      <ReservationPopover reservation={shown} nextReservation={current !== undefined ? next : undefined} onWalkIn={walkIn}>
        {marker}
      </ReservationPopover>
    )
  }
  return walkIn === undefined ? marker : <FreeTablePopover table={table} onWalkIn={walkIn} marker={marker} />
}

/** A free table without further reservations: offers to seat a walk-in there. */
function FreeTablePopover({ table, onWalkIn, marker }: { table: FloorTable; onWalkIn: () => void; marker: ReactElement }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{marker}</PopoverTrigger>
      <PopoverContent side="bottom" className="flex w-60 flex-col gap-3 font-sans">
        <p className="font-semibold">{t('tableOverview.freeTable', { number: table.number, count: table.seats })}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setOpen(false)
            onWalkIn()
          }}
        >
          {t('tableOverview.walkInHere')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
