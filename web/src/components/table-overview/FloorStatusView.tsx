import { Box, Button, Card, Group, Paper, Popover, SimpleGrid, Slider, Stack, Text, Title } from '@mantine/core'
import { type CSSProperties, type KeyboardEvent, type ReactElement, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type FloorArea, type FloorTable, formatMinutes, type Reservation, toMinutes } from '../../api/reservations.ts'
import { formatTime } from '../../i18n/format.ts'
import { occupiedUntil, occupiesTable, statusColors, statusLabels } from '../reservations/status.ts'
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
  /** Seats a walk-in at a table that is free now (only today). */
  onWalkIn: (tableId: string) => void
}

/** The slider moves in quarter hours, like the reservation start times. */
const step = 15

/**
 * The floor plan of every area with its tables in the colour of their status at the chosen time,
 * and the next reservation at each table. Areas without floor plan show their tables as a grid.
 */
export function FloorStatusView({ areas, reservations, start, end, initialTime, nowMinutes, onWalkIn }: FloorStatusViewProps) {
  const { t, i18n } = useTranslation()
  const [time, setTime] = useState(initialTime)
  const active = reservations.filter(occupiesTable)
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
                  <TableStatus key={table.id} table={table} reservations={active} time={time} nowMinutes={nowMinutes} onWalkIn={onWalkIn} onPlan />
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
                    <TableStatus
                      key={table.id}
                      table={table}
                      reservations={active}
                      time={time}
                      nowMinutes={nowMinutes}
                      onWalkIn={onWalkIn}
                      onPlan={false}
                    />
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
  nowMinutes: number | null
  onWalkIn: (tableId: string) => void
  /** On the floor plan at the table's position, otherwise as a card in a grid. */
  onPlan: boolean
}

/** Whether the reservation occupies its table at `minutes`; a guest who left only until they left. */
function occupiesAt(reservation: Reservation, minutes: number) {
  return toMinutes(reservation.time) <= minutes && minutes < toMinutes(occupiedUntil(reservation))
}

/**
 * A table in the colour of its status at `time`, with the end of the current or the start of the next reservation.
 * A table that is free now offers to seat a walk-in.
 */
function TableStatus({ table, reservations, time, nowMinutes, onWalkIn, onPlan }: TableStatusProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const atTable = reservations.filter((reservation) => reservation.tableId === table.id)
  const current = atTable.find((reservation) => occupiesAt(reservation, time))
  const next = atTable.find((reservation) => toMinutes(reservation.time) > time)
  const shown = current ?? next
  const color = current === undefined ? null : statusColors[current.status]
  const status = current === undefined ? t('tableOverview.free') : t(statusLabels[current.status])
  const freeNow = nowMinutes !== null && !atTable.some((reservation) => occupiesAt(reservation, nowMinutes))
  const clickable = shown !== undefined || freeNow

  const style: CSSProperties = {
    cursor: clickable ? 'pointer' : 'default',
    backgroundColor: color === null ? 'white' : `var(--mantine-color-${color}-2)`,
    borderColor: color === null ? 'var(--mantine-color-gray-5)' : `var(--mantine-color-${color}-7)`,
    borderWidth: 2,
    textAlign: 'center',
  }

  const props = {
    role: clickable ? 'button' : undefined,
    tabIndex: clickable ? 0 : undefined,
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
              ? t('tableOverview.floor.until', { time: formatTime(occupiedUntil(current), language) })
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

  const walkIn = freeNow ? () => onWalkIn(table.id) : undefined
  if (shown !== undefined) {
    return (
      <ReservationPopover reservation={shown} nextReservation={current !== undefined ? next : undefined} onWalkIn={walkIn}>
        {marker}
      </ReservationPopover>
    )
  }
  return walkIn === undefined ? marker : <FreeTablePopover table={table} onWalkIn={walkIn}>{marker}</FreeTablePopover>
}

/** A free table without further reservations: offers to seat a walk-in there. */
function FreeTablePopover({ table, onWalkIn, children }: { table: FloorTable; onWalkIn: () => void; children: ReactElement }) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  return (
    <Popover opened={opened} onChange={setOpened} width={240} position="bottom" withArrow shadow="md">
      <Popover.Target>{children}</Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text fw={600}>{t('tableOverview.freeTable', { number: table.number, count: table.seats })}</Text>
          <Button
            variant="light"
            onClick={() => {
              setOpened(false)
              onWalkIn()
            }}
          >
            {t('tableOverview.walkInHere')}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
