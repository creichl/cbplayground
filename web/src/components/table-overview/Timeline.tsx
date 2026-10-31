import { Box, Text, UnstyledButton } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type FloorArea, formatMinutes, type OpenPeriod, type Reservation, toMinutes } from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
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
}

const hourWidth = 96
const labelWidth = 112
const rowHeight = 44
const headerHeight = 28

const gridLines = [
  `repeating-linear-gradient(to right, var(--mantine-color-gray-3) 0 1px, transparent 1px ${hourWidth}px)`,
  `repeating-linear-gradient(to right, var(--mantine-color-gray-1) 0 1px, transparent 1px ${hourWidth / 4}px)`,
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
 * an hour grid and a line at the current time. Scrolls horizontally; the table column stays in place.
 */
export function Timeline({ areas, reservations, openPeriods, start, end, nowMinutes }: TimelineProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const scrollRef = useRef<HTMLDivElement>(null)
  const x = (minutes: number) => ((minutes - start) / 60) * hourWidth
  const width = x(end)

  const hours: number[] = []
  for (let hour = start / 60; hour < end / 60; hour++) {
    hours.push(hour)
  }

  // Shows the current time when the timeline opens; afterwards the user scrolls freely, also when the clock moves on.
  const [initialScrollLeft] = useState(() => (nowMinutes === null ? 0 : Math.max(0, x(nowMinutes) - hourWidth)))
  useEffect(() => {
    if (scrollRef.current !== null) {
      scrollRef.current.scrollLeft = initialScrollLeft
    }
  }, [initialScrollLeft])

  // Cancelled, declined and no-show reservations go first, so the active reservations of the same table lie on top of them.
  const sorted = [...reservations].sort((a, b) => Number(isActive(a)) - Number(isActive(b)))

  const labelCell = {
    position: 'sticky',
    left: 0,
    zIndex: 3,
    width: labelWidth,
    flexShrink: 0,
    borderRight: '1px solid var(--mantine-color-gray-3)',
  } as const

  return (
    <Box
      ref={scrollRef}
      bg="white"
      style={{ overflowX: 'auto', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 'var(--mantine-radius-md)' }}
    >
      <Box pos="relative" style={{ width: labelWidth + width }}>
        {closedRanges(openPeriods, start, end).map((range) => (
          <Box
            key={range.from}
            bg="gray.1"
            style={{
              position: 'absolute',
              top: headerHeight,
              bottom: 0,
              left: labelWidth + x(range.from),
              width: x(range.to) - x(range.from),
              pointerEvents: 'none',
            }}
          />
        ))}

        <Box display="flex" h={headerHeight} style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
          <Box bg="white" px="xs" style={{ ...labelCell, display: 'flex', alignItems: 'center' }}>
            <Text size="xs" c="dimmed" truncate>
              {t('tableOverview.timeline.tableColumn')}
            </Text>
          </Box>
          <Box pos="relative" style={{ width, flexShrink: 0 }}>
            {hours.map((hour) => (
              <Text key={hour} size="xs" c="dimmed" style={{ position: 'absolute', left: x(hour * 60) + 4, top: 6 }}>
                {formatTime(formatMinutes(hour * 60), language)}
              </Text>
            ))}
          </Box>
        </Box>

        {areas
          .filter((area) => area.tables.length > 0)
          .map((area) => (
            <Box key={area.id}>
              <Box display="flex" h={28} bg="gray.0" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
                <Box bg="gray.0" px="xs" style={{ ...labelCell, display: 'flex', alignItems: 'center' }}>
                  <Text size="sm" fw={600} truncate>
                    {area.name}
                  </Text>
                </Box>
              </Box>
              {area.tables.map((table) => (
                <Box key={table.id} display="flex" h={rowHeight} style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
                  <Box
                    bg="white"
                    px="xs"
                    aria-label={t('areas.tableMarker', { number: table.number, seats: table.seats })}
                    style={{ ...labelCell, display: 'flex', alignItems: 'center' }}
                  >
                    <Text size="sm" fw={600} truncate>
                      {t('common.tableLabel', { number: table.number, seats: table.seats })}
                    </Text>
                  </Box>
                  <Box pos="relative" style={{ width, flexShrink: 0, backgroundImage: gridLines }}>
                    {sorted
                      .filter((reservation) => reservation.tableId === table.id)
                      .map((reservation) => {
                        const active = isActive(reservation)
                        const color = statusColors[reservation.status]
                        const left = x(toMinutes(reservation.time))
                        // A guest who left ends at the time they left.
                        const until = occupiedUntil(reservation)
                        const party = t('tableOverview.party', { name: guestName(reservation, t), guests: reservation.guests })
                        const times = t('common.timeRange', {
                          start: formatTime(reservation.time, language),
                          end: formatTime(until, language),
                        })
                        return (
                          <ReservationPopover key={reservation.id} reservation={reservation}>
                            <UnstyledButton
                              aria-label={`${party}, ${times}, ${t(statusLabels[reservation.status])}`}
                              px={6}
                              style={{
                                position: 'absolute',
                                top: 4,
                                bottom: 4,
                                left: left + 1,
                                width: Math.max(x(toMinutes(until)) - left - 2, 8),
                                zIndex: 1,
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                borderRadius: 'var(--mantine-radius-sm)',
                                backgroundColor: `var(--mantine-color-${color}-1)`,
                                border: `1px ${active ? 'solid' : 'dashed'} var(--mantine-color-${color}-6)`,
                                borderLeftWidth: 4,
                                opacity: active ? 1 : 0.5,
                              }}
                            >
                              <Text size="sm" truncate td={active ? undefined : 'line-through'}>
                                {party}
                              </Text>
                            </UnstyledButton>
                          </ReservationPopover>
                        )
                      })}
                  </Box>
                </Box>
              ))}
            </Box>
          ))}

        {nowMinutes !== null && nowMinutes >= start && nowMinutes <= end && (
          <Box
            bg="red.6"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: labelWidth + x(nowMinutes) - 1,
              width: 2,
              zIndex: 2,
              pointerEvents: 'none',
            }}
          />
        )}
      </Box>
    </Box>
  )
}
