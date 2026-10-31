import { Box, Button, Card, Group, Paper, SimpleGrid, Slider, Stack, Text, Title } from '@mantine/core'
import { type CSSProperties, type KeyboardEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  blockingStatuses,
  type FloorArea,
  type FloorTable,
  formatMinutes,
  type Reservation,
  toMinutes,
} from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { statusColors } from '../reservations/status.ts'
import { TableMarker } from '../TableMarker.tsx'
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
}

/** The slider moves in quarter hours, like the reservation start times. */
const step = 15

/**
 * The floor plan of every area with its tables in the colour of their status at the chosen time,
 * and the next reservation at each table. Areas without floor plan show their tables as a grid.
 */
export function FloorStatusView({ areas, reservations, start, end, initialTime, nowMinutes }: FloorStatusViewProps) {
  const { t, i18n } = useTranslation()
  const [time, setTime] = useState(initialTime)
  const active = reservations.filter((reservation) => blockingStatuses.includes(reservation.status))
  const label = (minutes: number) => formatTime(formatMinutes(minutes), i18n.resolvedLanguage ?? 'en')

  const marks: { value: number; label: string }[] = []
  for (let minutes = Math.ceil(start / 120) * 120; minutes <= end; minutes += 120) {
    marks.push({ value: minutes, label: label(minutes) })
  }

  return (
    <Stack gap="lg">
      <Card>
        <Group gap="lg" wrap="nowrap" align="center">
          <Stack gap={0} style={{ flexShrink: 0 }}>
            <Text size="xs" c="dimmed">
              {t('tableOverview.floor.time')}
            </Text>
            <Text size="xl" fw={650}>
              {label(time)}
            </Text>
          </Stack>
          <Slider
            style={{ flex: 1 }}
            mb="lg"
            size="lg"
            thumbSize={28}
            min={start}
            max={end}
            step={step}
            value={time}
            onChange={setTime}
            label={label}
            marks={marks}
            aria-label={t('tableOverview.floor.time')}
          />
          {nowMinutes !== null && (
            <Button
              variant="default"
              style={{ flexShrink: 0 }}
              onClick={() => setTime(Math.min(end, Math.max(start, Math.floor(nowMinutes / step) * step)))}
            >
              {t('tableOverview.floor.now')}
            </Button>
          )}
        </Group>
      </Card>

      {areas.map((area) => (
        <Card key={area.id}>
          <Stack gap="md">
            <Title order={4}>{area.name}</Title>
            {area.floorPlanUrl !== null ? (
              <Box pos="relative" style={{ userSelect: 'none', borderRadius: 'var(--mantine-radius-sm)', overflow: 'hidden' }}>
                <img src={area.floorPlanUrl} alt={t('areas.floorPlanAlt')} draggable={false} style={{ display: 'block', width: '100%' }} />
                {area.tables.map((table) => (
                  <TableStatus key={table.id} table={table} reservations={active} time={time} onPlan />
                ))}
              </Box>
            ) : area.tables.length === 0 ? (
              <Text c="dimmed">{t('tableOverview.noTables')}</Text>
            ) : (
              <>
                <Text size="sm" c="dimmed">
                  {t('tableOverview.floor.noFloorPlan')}
                </Text>
                <SimpleGrid cols={{ base: 3, sm: 5, lg: 8 }} spacing="sm">
                  {area.tables.map((table) => (
                    <TableStatus key={table.id} table={table} reservations={active} time={time} onPlan={false} />
                  ))}
                </SimpleGrid>
              </>
            )}
          </Stack>
        </Card>
      ))}
    </Stack>
  )
}

type TableStatusProps = {
  table: FloorTable
  /** The reservations of the day that occupy a table. */
  reservations: Reservation[]
  time: number
  /** On the floor plan at the table's position, otherwise as a card in a grid. */
  onPlan: boolean
}

/** A table in the colour of its status at `time`, with the end of the current or the start of the next reservation. */
function TableStatus({ table, reservations, time, onPlan }: TableStatusProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const atTable = reservations.filter((reservation) => reservation.tableId === table.id)
  const current = atTable.find((reservation) => toMinutes(reservation.time) <= time && time < toMinutes(reservation.endTime))
  const next = atTable.find((reservation) => toMinutes(reservation.time) > time)
  const shown = current ?? next
  const color = current === undefined ? null : statusColors[current.status]
  const status = t(`tableOverview.status.${current?.status ?? 'free'}`)

  const style: CSSProperties = {
    cursor: shown === undefined ? 'default' : 'pointer',
    backgroundColor: color === null ? 'white' : `var(--mantine-color-${color}-2)`,
    borderColor: color === null ? 'var(--mantine-color-gray-5)' : `var(--mantine-color-${color}-7)`,
    borderWidth: 2,
    textAlign: 'center',
  }

  const props = {
    role: shown === undefined ? undefined : 'button',
    tabIndex: shown === undefined ? undefined : 0,
    'aria-label': `${t('areas.tableMarker', { number: table.number, seats: table.seats })}, ${status}`,
    c: 'dark',
    shadow: 'xs',
    // The popover opens on click; Enter and Space do the same for keyboard users.
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.currentTarget.click()
      }
    },
    children: (
      <>
        <Text size="sm" fw={600} inherit>
          {t('common.tableLabel', { number: table.number, seats: table.seats })}
        </Text>
        {shown !== undefined && (
          <Text size="xs">
            {current !== undefined
              ? t('tableOverview.floor.until', { time: formatTime(current.endTime, language) })
              : t('tableOverview.floor.nextAt', { time: formatTime(shown.time, language) })}
          </Text>
        )}
      </>
    ),
  }

  const marker = onPlan ? (
    <TableMarker posX={table.posX} posY={table.posY} {...props} style={{ ...style, zIndex: 1 }} />
  ) : (
    <Paper withBorder radius="sm" p="xs" {...props} style={style} />
  )

  return shown === undefined ? (
    marker
  ) : (
    <ReservationPopover reservation={shown} nextReservation={current !== undefined ? next : undefined}>
      {marker}
    </ReservationPopover>
  )
}
