import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type FloorArea, formatMinutes, type OpenPeriod, type Reservation, toMinutes } from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { cn } from '../../lib/utils.ts'
import { guestName, isActive, occupiedUntil, statusColors, statusLabels } from '../reservations/status.ts'
import { ReservationPopover } from './ReservationPopover.tsx'

type TimelineProps = {
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
}

const hourWidth = 96
const labelWidth = 112
const rowHeight = 44
const headerHeight = 28

const gridLines = [
  `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${hourWidth}px)`,
  `repeating-linear-gradient(to right, var(--muted) 0 1px, transparent 1px ${hourWidth / 4}px)`,
].join(', ')

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
 * Tables (grouped by area) × time of day: one row per table with its reservations as blocks in their status colour,
 * an hour grid and a line at the current time. Scrolls horizontally; the table column stays in place. A click on a block
 * selects the reservation and shows its details with the status actions.
 */
export function Timeline({ areas, reservations, openPeriods, start, end, nowMinutes, initialTime, selectedId, onSelect }: TimelineProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const scrollRef = useRef<HTMLDivElement>(null)
  const x = (minutes: number) => ((minutes - start) / 60) * hourWidth
  const width = x(end)

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

  const labelCell = 'sticky left-0 z-3 flex shrink-0 items-center border-r border-border px-2'

  return (
    <div ref={scrollRef} className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="relative" style={{ width: labelWidth + width }}>
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
              <div className="flex h-7 border-b border-border bg-secondary">
                <div className={cn(labelCell, 'bg-secondary')} style={{ width: labelWidth }}>
                  <span className="truncate text-sm font-semibold">{area.name}</span>
                </div>
              </div>
              {area.tables.map((table) => (
                <div key={table.id} className="flex border-b border-border/60" style={{ height: rowHeight }}>
                  <div
                    className={cn(labelCell, 'bg-card')}
                    style={{ width: labelWidth }}
                    aria-label={t('areas.tableMarker', { number: table.number, seats: table.seats })}
                  >
                    <span className="truncate text-sm font-semibold">{t('common.tableLabel', { number: table.number, seats: table.seats })}</span>
                  </div>
                  <div className="relative shrink-0" style={{ width, backgroundImage: gridLines }}>
                    {sorted
                      .filter((reservation) => reservation.tableId === table.id)
                      .map((reservation) => {
                        const active = isActive(reservation)
                        const selected = reservation.id === selectedId
                        const { color, surface } = statusColors[reservation.status]
                        const left = x(toMinutes(reservation.time))
                        // A guest who left ends at the time they left.
                        const until = occupiedUntil(reservation)
                        const party = t('tableOverview.party', { name: guestName(reservation, t), guests: reservation.guests })
                        const times = t('common.timeRange', {
                          start: formatTime(reservation.time, language),
                          end: formatTime(until, language),
                        })
                        const style: CSSProperties = {
                          left: left + 1,
                          width: Math.max(x(toMinutes(until)) - left - 2, 8),
                          backgroundColor: surface,
                          borderColor: color,
                          borderStyle: active ? 'solid' : 'dashed',
                          opacity: active ? 1 : 0.5,
                        }
                        return (
                          <ReservationPopover key={reservation.id} reservation={reservation}>
                            <button
                              type="button"
                              data-reservation-block={reservation.id}
                              data-selected={selected ? '' : undefined}
                              aria-label={`${party}, ${times}, ${t(statusLabels[reservation.status])}`}
                              aria-current={selected ? 'true' : undefined}
                              // The popover replaces the click handler; selecting happens before it.
                              onClickCapture={() => onSelect(reservation)}
                              className={cn(
                                'absolute top-1 bottom-1 flex cursor-pointer items-center overflow-hidden rounded-md border border-l-4 px-1.5 text-left text-foreground focus-ring',
                                selected ? 'z-2 ring-2 ring-foreground ring-offset-1' : 'z-1',
                              )}
                              style={style}
                            >
                              <span className={cn('truncate text-sm', !active && 'line-through')}>{party}</span>
                            </button>
                          </ReservationPopover>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
          ))}

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
