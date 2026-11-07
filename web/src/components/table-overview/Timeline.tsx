import { Link2Icon } from 'lucide-react'
import { type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type FloorArea,
  type FloorTable,
  type FreeTable,
  formatMinutes,
  type OpenPeriod,
  type Reservation,
  toMinutes,
  useReservationFreeTables,
  useStaffAvailability,
} from '../../api/reservations.ts'
import type { TableBlock } from '../../api/tableBlocks.ts'
import { formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { Button } from '../../ui/button.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.tsx'
import { closedStatuses, guestName, isActive, occupiedUntil, statusColors, statusLabels } from '../reservations/status.ts'
import { useReservationMoves } from '../reservations/useReservationMoves.ts'
import { dropTarget, sameTables } from './dropTargets.ts'
import { ReservationPopover } from './ReservationPopover.tsx'
import { blockHatch } from './blocks.ts'
import { BlockPopover } from './TableBlocks.tsx'

type TimelineProps = {
  /** The day shown, "YYYY-MM-DD". */
  date: string
  areas: FloorArea[]
  /** The reservations of the day. */
  reservations: Reservation[]
  openPeriods: OpenPeriod[]
  /** The shown time range in minutes since midnight, on full hours. */
  start: number
  end: number
  /** The current time in minutes since midnight when the day is today, otherwise null. */
  nowMinutes: number | null
  /** The time the timeline is scrolled to when it opens, e.g. now or the start of the chosen service. */
  initialTime: number
  /** The reservation selected on the screen: its block is highlighted and scrolled into view. */
  selectedId: string | null
  /** Called when a block is clicked: it becomes the selected reservation. */
  onSelect: (reservation: Reservation) => void
  /** The blocked tables of the day. */
  blocks: TableBlock[]
  /** Opens the dialog that blocks the table, from now or the start of the shown service. */
  onBlock: (table: FloorTable, start: number) => void
  /** Called when a free cell is tapped, with its table and quarter hour ("HH:mm"); without it (e.g. on past days) nothing is booked. */
  onBook?: (tableId: string, time: string) => void
}

const hourWidth = 96
const labelWidth = 112
const rowHeight = 44
const headerHeight = 28
/** Start times snap to quarter hours. */
const step = 15
/** A block moves only once the pointer has moved this far, so a click still opens its details. */
const dragThreshold = 5
/** Near the left and right edge, dragging scrolls the timeline. */
const scrollEdge = 40

const gridLines = [
  `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${hourWidth}px)`,
  `repeating-linear-gradient(to right, var(--muted) 0 1px, transparent 1px ${hourWidth / 4}px)`,
].join(', ')

/** The hatching of a row a dragged reservation does not fit. */
const unfitHatching = 'repeating-linear-gradient(135deg, color-mix(in oklab, var(--destructive) 14%, transparent) 0 6px, transparent 6px 12px)'

/** Why a dragged reservation does not fit a row. */
type Unfit = 'taken' | 'tooSmall' | 'closed' | 'past'

/** A reservation being dragged: where it was taken and where it would go. */
type Drag = {
  reservation: Reservation
  pointerId: number
  startX: number
  startY: number
  /** The pointer's distance from the reservation's start, in minutes. */
  grabMinutes: number
  moved: boolean
  /** The start it would get, in minutes; its own start while it stays in its quarter hour. */
  time: number
  /** The table row under the pointer. */
  rowId: string | null
}

/** The drawn copy of a moved reservation: while it is dragged, while it is saved, and while it springs back after a refusal. */
type Ghost = {
  reservation: Reservation
  time: number
  rowIds: string[]
  fits: boolean
  phase: 'dragging' | 'saving' | 'returning'
}

/** The parts of [start, end) in which the restaurant is closed, e.g. the afternoon break. */
function closedRanges(openPeriods: OpenPeriod[], start: number, end: number) {
  const ranges: { from: number; to: number }[] = []
  let cursor = start
  for (const period of openPeriods) {
    const from = toMinutes(period.start)
    if (from > cursor) {
      ranges.push({ from: cursor, to: Math.min(from, end) })
    }
    cursor = Math.max(cursor, toMinutes(period.end))
  }
  if (cursor < end) {
    ranges.push({ from: cursor, to: end })
  }
  return ranges
}

/**
 * Tables (grouped by area) × time of day: one row per table with its reservations as blocks in their status colour, its blocked
 * times hatched with their reason, an hour grid and a line at the current time. Archived tables with reservations on the day
 * follow in a group of their own. Scrolls horizontally; the table column stays in place. A click on a block selects the
 * reservation and shows its details with the status actions; a click on a blocked time offers to remove the block, and a click
 * on a table offers to block it. A reservation of several tables (a combination) has a block in each of their rows,
 * highlighted together.
 *
 * With pointer events (mouse, pen and touch), an open reservation is dragged to another table and/or time of the day, in
 * quarter hours; the rows where it does not fit (taken, too small, closed) are hatched meanwhile (GET /api/staff/availability
 * without the reservation, and its free tables for a move at its own time). The drop saves it with a toast that offers "Undo";
 * a refused drop springs back with the server's reason. A tap on a free cell books that table and time (`onBook`).
 */
export function Timeline({
  date,
  areas,
  reservations,
  openPeriods,
  start,
  end,
  nowMinutes,
  initialTime,
  selectedId,
  onSelect,
  onBook,
  blocks,
  onBlock,
}: TimelineProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const moves = useReservationMoves()
  const [drag, setDrag] = useState<Drag | null>(null)
  // The copy while the drop is saved or springs back; while dragging it follows the drag.
  const [dropped, setDropped] = useState<Ghost | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // A drop ends with a click on the block, which must not open its details.
  const suppressClick = useRef(false)
  const x = (minutes: number) => ((minutes - start) / 60) * hourWidth
  const width = x(end)

  // What a dragged reservation may get: at another time the availability without it, at its own time its free tables.
  const moving = drag?.moved === true ? drag.reservation : null
  const availability = useStaffAvailability(moving === null ? null : date, moving?.guests ?? null, moving?.durationMinutes ?? null, moving?.id ?? null)
  const ownFree = useReservationFreeTables(moving?.id ?? null)

  const hours: number[] = []
  for (let hour = start / 60; hour < end / 60; hour++) {
    hours.push(hour)
  }

  // Shows `initialTime` when the timeline opens; afterwards the user scrolls freely, also when the clock moves on.
  const [initialScrollLeft] = useState(() => Math.max(0, x(initialTime) - hourWidth / 2))
  useEffect(() => {
    if (scrollRef.current !== null) {
      scrollRef.current.scrollLeft = initialScrollLeft
    }
  }, [initialScrollLeft])

  // A reservation selected elsewhere (the list) is brought into view.
  useEffect(() => {
    if (selectedId === null) {
      return
    }
    scrollRef.current
      ?.querySelector(`[data-reservation-block="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [selectedId])

  // Cancelled, declined and no-show reservations go first, so the active reservations of the same table lie on top of them.
  const sorted = [...reservations].sort((a, b) => Number(isActive(a)) - Number(isActive(b)))
  const seatsOf = new Map(areas.flatMap((area) => area.tables.map((table) => [table.id, table.seats] as const)))

  const labelCell = 'sticky left-0 z-3 flex shrink-0 items-center border-r border-border px-2'

  // The top of every table row in the timeline: below the hour header, each area with its header row and its tables.
  const rowTops = new Map<string, number>()
  let nextTop = headerHeight
  for (const area of areas.filter((candidate) => candidate.tables.length > 0)) {
    nextTop += headerHeight
    for (const table of area.tables) {
      rowTops.set(table.id, nextTop)
      nextTop += rowHeight
    }
  }

  // Reservations on archived tables keep their table and area; their tables get a row each in a group of their own, only on
  // the days they have reservations.
  const archivedTables = [...new Map(reservations.filter((reservation) => reservation.tableArchived).map((reservation) => [reservation.tableId, reservation])).values()]
    .sort((a, b) => a.tableNumber.length - b.tableNumber.length || (a.tableNumber < b.tableNumber ? -1 : a.tableNumber > b.tableNumber ? 1 : 0))

  /** The free tables and combinations for the dragged reservation at `time`; undefined while they load. */
  const freeAt = (reservation: Reservation, time: number): readonly FreeTable[] | undefined => {
    if (time === toMinutes(reservation.time)) {
      return ownFree.data
    }
    return availability.data?.periods.flatMap((period) => period.times).find((slot) => toMinutes(slot.time) === time)?.tables ?? (availability.data === undefined ? undefined : [])
  }

  /** Why the dragged reservation does not fit the row of `tableId` at `time`; null when it fits or that is not known yet. */
  const unfitOf = (reservation: Reservation, time: number, tableId: string): Unfit | null => {
    const free = freeAt(reservation, time)
    if (free === undefined || free.some((candidate) => candidate.tableIds.includes(tableId))) {
      return null
    }
    if (time !== toMinutes(reservation.time)) {
      if (nowMinutes !== null && time <= nowMinutes) {
        return 'past'
      }
      if (!availability.data?.periods.some((period) => period.times.some((slot) => toMinutes(slot.time) === time))) {
        return 'closed'
      }
    }
    return (seatsOf.get(tableId) ?? 0) < reservation.guests ? 'tooSmall' : 'taken'
  }

  /** The rows a drop at `time` on the row of `rowId` takes: the target's tables, or only that row when nothing fits there. */
  const ghostOf = (reservation: Reservation, time: number, rowId: string, phase: Ghost['phase']): Ghost => {
    const free = freeAt(reservation, time)
    const target = free === undefined ? undefined : dropTarget(free, rowId, reservation)
    // While the free tables load, the copy is drawn as fitting; the server decides on the drop.
    return { reservation, time, rowIds: target?.tableIds ?? [rowId], fits: free === undefined || target !== undefined, phase }
  }

  /** The table row at the pointer's height, of the live tables (archived tables take no reservations). */
  const rowAt = (clientY: number) => {
    for (const element of contentRef.current?.querySelectorAll<HTMLElement>('[data-timeline-row]') ?? []) {
      const rect = element.getBoundingClientRect()
      if (clientY >= rect.top && clientY < rect.bottom) {
        return element.dataset.timelineRow ?? null
      }
    }
    return null
  }

  /** The minutes at the pointer's position. */
  const minutesAt = (clientX: number) => {
    const rect = contentRef.current?.getBoundingClientRect()
    return rect === undefined ? start : start + ((clientX - rect.left - labelWidth) / hourWidth) * 60
  }

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, reservation: Reservation) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    suppressClick.current = false
    setDrag({
      reservation,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabMinutes: minutesAt(event.clientX) - toMinutes(reservation.time),
      moved: false,
      time: toMinutes(reservation.time),
      rowId: null,
    })
  }

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag === null || event.pointerId !== drag.pointerId) {
      return
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < dragThreshold) {
      return
    }
    const scroller = scrollRef.current
    if (scroller !== null) {
      const rect = scroller.getBoundingClientRect()
      if (event.clientX < rect.left + labelWidth + scrollEdge) {
        scroller.scrollLeft -= 16
      } else if (event.clientX > rect.right - scrollEdge) {
        scroller.scrollLeft += 16
      }
    }
    const own = toMinutes(drag.reservation.time)
    const wanted = Math.round((minutesAt(event.clientX) - drag.grabMinutes) / step) * step
    const snapped = Math.min(end - step, Math.max(start, wanted))
    // Within its own quarter hour it keeps its start, e.g. a walk-in seated at 19:07 moved to another table.
    const time = snapped === Math.round(own / step) * step ? own : snapped
    setDrag({ ...drag, moved: true, time, rowId: rowAt(event.clientY) })
  }

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag === null || event.pointerId !== drag.pointerId) {
      return
    }
    setDrag(null)
    if (!drag.moved) {
      return
    }
    // The click that follows the drop is swallowed; a touch drag is followed by none, so the next click counts again.
    suppressClick.current = true
    setTimeout(() => {
      suppressClick.current = false
    }, 0)
    const { reservation, time, rowId } = drag
    if (rowId === null) {
      return
    }
    const drop = ghostOf(reservation, time, rowId, 'saving')
    if (time === toMinutes(reservation.time) && sameTables(drop.rowIds, reservation.tableIds)) {
      return
    }
    setDropped(drop)
    // A drop where it does not fit is sent too (on the table under the pointer): the server says why, and the copy springs back.
    moves.move(reservation, time === toMinutes(reservation.time) ? reservation.time : formatMinutes(time), drop.rowIds).then(
      () => setDropped(null),
      () => {
        setDropped({ reservation, time: toMinutes(reservation.time), rowIds: reservation.tableIds, fits: true, phase: 'returning' })
        setTimeout(() => setDropped(null), 300)
      },
    )
  }

  const handlePointerCancel = () => setDrag(null)

  const ghost = moving !== null && drag !== null && drag.rowId !== null ? ghostOf(moving, drag.time, drag.rowId, 'dragging') : dropped

  /** A tap on a free cell of a table books it at that quarter hour, while the restaurant is open and the time lies ahead. */
  const handleCellClick = (event: MouseEvent<HTMLDivElement>, tableId: string) => {
    if (onBook === undefined || event.target !== event.currentTarget) {
      return
    }
    const minutes = Math.floor(minutesAt(event.clientX) / step) * step
    const open = openPeriods.some((period) => toMinutes(period.start) <= minutes && minutes < toMinutes(period.end))
    if (open && (nowMinutes === null || minutes > nowMinutes)) {
      onBook(tableId, formatMinutes(minutes))
    }
  }

  /**
   * The header row of a group of tables: an area, or the archived tables. The row has no reservations, so its title may run
   * past the table column instead of being cut off.
   */
  const groupHeader = (title: string) => (
    <div className="flex h-7 border-b border-border bg-secondary">
      <div className="sticky left-0 z-3 flex items-center bg-secondary px-2">
        <span className="text-sm font-semibold whitespace-nowrap">{title}</span>
      </div>
    </div>
  )

  // A block proposed from the timeline starts now, when now lies in the shown time, otherwise where the timeline opened.
  const blockStart = nowMinutes !== null && nowMinutes >= start && nowMinutes < end ? Math.floor(nowMinutes / 15) * 15 : initialTime

  const reservationBlock = (reservation: Reservation) => {
    const active = isActive(reservation)
    const selected = reservation.id === selectedId
    const draggable = !closedStatuses.includes(reservation.status)
    const { color, surface } = statusColors[reservation.status]
    const left = x(toMinutes(reservation.time))
    // A guest who left ends at the time they left.
    const until = occupiedUntil(reservation)
    const party = t('tableOverview.party', { name: guestName(reservation, t), guests: reservation.guests })
    const times = t('common.timeRange', {
      start: formatTime(reservation.time, language),
      end: formatTime(until, language),
    })
    const combined = reservation.tableIds.length > 1
    const tables = combined ? `, ${t('frontdesk.moves.combined', { tables: reservation.tableNumber })}` : ''
    const style: CSSProperties = {
      left: left + 1,
      width: Math.max(x(toMinutes(until)) - left - 2, 8),
      backgroundColor: surface,
      borderColor: color,
      borderStyle: active ? 'solid' : 'dashed',
      // The moved reservation fades while its copy shows where it goes.
      opacity: !active ? 0.5 : ghost?.reservation.id === reservation.id ? 0.35 : 1,
    }
    return (
      <ReservationPopover key={reservation.id} reservation={reservation}>
        <button
          type="button"
          data-reservation-block={reservation.id}
          data-selected={selected ? '' : undefined}
          aria-label={`${party}, ${times}${tables}, ${t(statusLabels[reservation.status])}`}
          aria-current={selected ? 'true' : undefined}
          // The popover replaces the click handler; selecting happens before it. After a drop the click is swallowed.
          onClickCapture={(event) => {
            if (suppressClick.current) {
              suppressClick.current = false
              event.preventDefault()
              event.stopPropagation()
              return
            }
            onSelect(reservation)
          }}
          onPointerEnter={() => setHoveredId(reservation.id)}
          onPointerLeave={() => setHoveredId((current) => (current === reservation.id ? null : current))}
          onPointerDown={draggable ? (event) => handlePointerDown(event, reservation) : undefined}
          onPointerMove={draggable ? handlePointerMove : undefined}
          onPointerUp={draggable ? handlePointerUp : undefined}
          onPointerCancel={draggable ? handlePointerCancel : undefined}
          className={cn(
            'absolute top-1 bottom-1 flex items-center gap-1 overflow-hidden rounded-md border border-l-4 px-1.5 text-left text-foreground focus-ring',
            // Draggable blocks take the touch for themselves, so dragging does not scroll the timeline.
            draggable ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-pointer',
            selected ? 'z-2 ring-2 ring-foreground ring-offset-1' : hoveredId === reservation.id && combined ? 'z-2 ring-2 ring-ring' : 'z-1',
          )}
          style={style}
        >
          {combined && <Link2Icon aria-hidden="true" className="size-3.5 shrink-0" />}
          <span className={cn('truncate text-sm', !active && 'line-through')}>{party}</span>
        </button>
      </ReservationPopover>
    )
  }

  /**
   * The row of a table with its label, its blocked times and its reservations as blocks; `tableId` is null for an archived table,
   * which takes none.
   */
  const row = (key: string, tableId: string | null, label: ReactNode, ariaLabel: string, rowReservations: Reservation[], rowBlocks: TableBlock[] = []) => {
    const unfit = moving === null || tableId === null ? null : unfitOf(moving, drag!.time, tableId)
    const marked = moving !== null && (unfit !== null || tableId === null)
    return (
      <div
        key={key}
        data-timeline-row={tableId ?? undefined}
        data-drop={moving === null || tableId === null ? undefined : unfit === null ? 'fits' : 'unfit'}
        className="flex border-b border-border/60"
        style={{ height: rowHeight }}
      >
        <div className={cn(labelCell, 'flex-col items-start justify-center gap-0 bg-card')} style={{ width: labelWidth }} aria-label={ariaLabel}>
          {label}
          {unfit !== null && <span className="text-xs leading-tight font-medium text-destructive">{t(`frontdesk.moves.unfit.${unfit}`)}</span>}
        </div>
        <div
          className={cn('relative shrink-0', onBook !== undefined && tableId !== null && 'cursor-cell')}
          style={{ width, backgroundImage: marked ? `${unfitHatching}, ${gridLines}` : gridLines }}
          onClick={tableId === null ? undefined : (event) => handleCellClick(event, tableId)}
        >
          {rowBlocks.map((block) => {
            const left = x(toMinutes(block.start))
            const times = t('common.timeRange', { start: formatTime(block.start, language), end: formatTime(block.end, language) })
            return (
              <BlockPopover key={block.id} block={block}>
                <button
                  type="button"
                  data-table-block={block.id}
                  aria-label={[t('tableBlocks.blocked'), times, block.reason].filter((part) => part !== null).join(', ')}
                  className="absolute top-1 bottom-1 z-1 flex cursor-pointer items-center overflow-hidden rounded-md border border-dashed px-1.5 text-left text-foreground focus-ring"
                  style={{ ...blockHatch, left: left + 1, width: Math.max(x(toMinutes(block.end)) - left - 2, 8) }}
                >
                  <span className="truncate rounded-sm bg-card/85 px-1 text-sm">{block.reason ?? t('tableBlocks.blocked')}</span>
                </button>
              </BlockPopover>
            )
          })}
          {rowReservations.map(reservationBlock)}
        </div>
      </div>
    )
  }

  /** The copies of the moved reservation in the rows it would take, at their height in the timeline. */
  const ghosts = () => {
    if (ghost === null) {
      return null
    }
    const { color, surface } = statusColors[ghost.reservation.status]
    const left = labelWidth + x(ghost.time) + 1
    const blockWidth = Math.max(x(ghost.time + ghost.reservation.durationMinutes) - x(ghost.time) - 2, 8)
    return ghost.rowIds.map((rowId, index) => {
      const top = rowTops.get(rowId)
      if (top === undefined) {
        return null
      }
      return (
        <div
          key={index}
          aria-hidden="true"
          data-drag-ghost=""
          className={cn(
            'pointer-events-none absolute z-4 flex items-center overflow-hidden rounded-md border-2 border-dashed px-1.5 text-sm font-medium shadow-float',
            'transition-[left,top] duration-150 ease-out motion-reduce:transition-none',
            ghost.phase === 'saving' && 'animate-pulse motion-reduce:animate-none',
          )}
          style={{
            top: top + 4,
            height: rowHeight - 8,
            left,
            width: blockWidth,
            backgroundColor: ghost.fits ? surface : 'var(--card)',
            borderColor: ghost.fits ? color : 'var(--destructive)',
          }}
        >
          <span className="truncate">
            {formatTime(formatMinutes(ghost.time), language)} · {guestName(ghost.reservation, t)}
          </span>
        </div>
      )
    })
  }

  return (
    <div ref={scrollRef} className={cn('overflow-x-auto rounded-xl border border-border bg-card', drag?.moved && 'select-none')}>
      <div ref={contentRef} className="relative" style={{ width: labelWidth + width }}>
        {closedRanges(openPeriods, start, end).map((range) => (
          <div
            key={range.from}
            className="pointer-events-none absolute bottom-0 bg-muted"
            style={{ top: headerHeight, left: labelWidth + x(range.from), width: x(range.to) - x(range.from) }}
          />
        ))}

        <div className="flex border-b border-border" style={{ height: headerHeight }}>
          <div className={cn(labelCell, 'bg-card')} style={{ width: labelWidth }}>
            <span className="truncate text-xs text-muted-foreground">{t('tableOverview.timeline.tableColumn')}</span>
          </div>
          <div className="relative shrink-0" style={{ width }}>
            {hours.map((hour) => (
              <span key={hour} className="absolute top-1.5 text-xs text-muted-foreground tabular-nums" style={{ left: x(hour * 60) + 4 }}>
                {formatTime(formatMinutes(hour * 60), language)}
              </span>
            ))}
          </div>
        </div>

        {areas
          .filter((area) => area.tables.length > 0)
          .map((area) => (
            <div key={area.id}>
              {groupHeader(area.name)}
              {area.tables.map((table) =>
                row(
                  table.id,
                  table.id,
                  <TableMenu table={table} onBlock={() => onBlock(table, blockStart)} />,
                  t('areas.tableMarker', { number: table.number, seats: table.seats }),
                  // A reservation of several tables has a block in the row of each.
                  sorted.filter((reservation) => reservation.tableIds.includes(table.id)),
                  blocks.filter((block) => block.tableId === table.id),
                ),
              )}
            </div>
          ))}

        {archivedTables.length > 0 && (
          <div>
            {groupHeader(t('tableOverview.timeline.archivedTables'))}
            {archivedTables.map((table) =>
              row(
                table.tableId,
                null,
                // The number, and below it the area the table belonged to.
                <div className="min-w-0 max-w-full" title={`${table.tableNumber} · ${table.areaName}`}>
                  <div className="truncate text-sm font-semibold">{table.tableNumber}</div>
                  <div className="truncate text-xs text-muted-foreground">{table.areaName}</div>
                </div>,
                t('tableOverview.timeline.archivedTable', { number: table.tableNumber, area: table.areaName }),
                sorted.filter((reservation) => reservation.tableId === table.tableId),
              ),
            )}
          </div>
        )}

        {ghosts()}

        {nowMinutes !== null && nowMinutes >= start && nowMinutes <= end && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-2 w-0.5 bg-destructive"
            style={{ left: labelWidth + x(nowMinutes) - 1 }}
          />
        )}
      </div>
    </div>
  )
}

/** The label of a table's row; a click opens its menu, which offers to block the table. */
function TableMenu({ table, onBlock }: { table: FloorTable; onBlock: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('areas.tableMarker', { number: table.number, seats: table.seats })}
          className="-mx-1 min-w-0 cursor-pointer truncate rounded-md px-1 py-0.5 text-left text-sm font-semibold hover:bg-accent focus-ring"
        >
          {t('common.tableLabel', { number: table.number, seats: table.seats })}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="flex w-60 flex-col gap-3 font-sans">
        <p className="font-semibold">{t('areas.tableMarker', { number: table.number, seats: table.seats })}</p>
        <Button
          variant="outline"
          onClick={() => {
            setOpen(false)
            onBlock()
          }}
        >
          {t('tableBlocks.block')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
