import { Alert, Box, Button, Group, Radio, Skeleton, Stack, Tabs, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type PublicArea, type PublicTable, usePublicTables } from '../../api/publicBooking.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'
import { FloorPlan } from '../floor-plan/FloorPlan.tsx'
import { TableShape } from '../floor-plan/TableShape.tsx'

type TablePickerProps = {
  slug: string
  date: string
  time: string
  guests: number
  /** The id of the chosen table. */
  value: string | null
  onChange: (tableId: string) => void
  onContinue: () => void
  onChangeTime: () => void
}

/**
 * The guest's choice of table: the drawn plan of each area (tabs), on the floor plan image or on the schematic plan, with
 * the free tables that fit the party highlighted and the others greyed out, a legend, and below it a list of the free
 * tables, which also works with the keyboard.
 */
export function TablePicker({ slug, date, time, guests, value, onChange, onContinue, onChangeTime }: TablePickerProps) {
  const { t } = useTranslation()
  const areas = usePublicTables(slug, date, time, guests)
  const [activeArea, setActiveArea] = useState<string | null>(null)

  if (areas.isPending) {
    return <Skeleton h={240} />
  }
  if (areas.isError) {
    return <ErrorAlert error={areas.error} onRetry={() => void areas.refetch()} />
  }

  const anyFree = areas.data.some((area) => area.tables.some((table) => table.available))
  if (!anyFree) {
    return (
      <Stack gap="sm" align="flex-start">
        <Alert color="yellow" variant="light" w="100%">
          {t('booking.table.noneFree')}
        </Alert>
        <Button variant="default" onClick={onChangeTime}>
          {t('booking.table.otherTime')}
        </Button>
      </Stack>
    )
  }

  // Starts at the area of the chosen table, otherwise at the first area with a free table.
  const defaultArea =
    areas.data.find((area) => area.tables.some((table) => table.id === value)) ??
    areas.data.find((area) => area.tables.some((table) => table.available))!
  const current = activeArea ?? defaultArea.id

  const content = (area: PublicArea) => <AreaTables area={area} value={value} onChoose={(table) => onChange(table.id)} />

  return (
    <Stack gap="md">
      {areas.data.length > 1 ? (
        <Tabs value={current} onChange={setActiveArea} keepMounted={false}>
          <Tabs.List>
            {areas.data.map((area) => (
              <Tabs.Tab key={area.id} value={area.id}>
                {area.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {areas.data.map((area) => (
            <Tabs.Panel key={area.id} value={area.id} pt="md">
              {content(area)}
            </Tabs.Panel>
          ))}
        </Tabs>
      ) : (
        content(areas.data[0])
      )}

      <Group>
        <Button size="md" disabled={value === null} onClick={onContinue}>
          {t('booking.continue')}
        </Button>
      </Group>
    </Stack>
  )
}

/** The colours of a table the guest can choose, has chosen or cannot choose (taken or too small). */
const looks = {
  free: { fill: 'white', stroke: 'var(--mantine-color-brand-8)', color: 'var(--mantine-color-dark-7)', strokeWidth: 2.5 },
  selected: { fill: 'var(--mantine-color-brand-8)', stroke: 'var(--mantine-color-brand-9)', color: 'white', strokeWidth: 2.5 },
  unavailable: { fill: 'var(--mantine-color-gray-2)', stroke: 'var(--mantine-color-gray-4)', color: 'var(--mantine-color-gray-6)', strokeWidth: 1 },
}

function AreaTables({ area, value, onChoose }: { area: PublicArea; value: string | null; onChoose: (table: PublicTable) => void }) {
  const { t } = useTranslation()
  const free = area.tables.filter((table) => table.available)

  return (
    <Stack gap="md">
      {area.tables.length > 0 && (
        <Stack gap="xs">
          {/* The list below is the accessible way to choose; the plan repeats it for pointer and touch. */}
          <FloorPlan imageUrl={area.floorPlanUrl} imageAlt="" tables={area.tables} tableScale={area.tableScale} ariaHidden>
            {area.tables.map((table) => {
              const selected = table.id === value
              const look = selected ? looks.selected : table.available ? looks.free : looks.unavailable
              return (
                <TableShape
                  key={table.id}
                  number={table.number}
                  seats={table.seats}
                  shape={table.shape}
                  rotation={table.rotation}
                  posX={table.posX}
                  posY={table.posY}
                  tableScale={area.tableScale}
                  {...look}
                  onClick={table.available ? () => onChoose(table) : undefined}
                  style={{
                    cursor: table.available ? 'pointer' : 'not-allowed',
                    opacity: table.available ? 1 : 0.6,
                    zIndex: selected ? 2 : 1,
                  }}
                />
              )
            })}
          </FloorPlan>
          <Group gap="md" aria-hidden="true">
            <LegendItem {...looks.free} label={t('booking.table.legend.free')} />
            <LegendItem {...looks.selected} label={t('booking.table.legend.selected')} />
            <LegendItem {...looks.unavailable} label={t('booking.table.legend.unavailable')} />
          </Group>
        </Stack>
      )}

      {free.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('booking.table.noneFreeInArea')}
        </Text>
      ) : (
        <Radio.Group
          label={t('booking.table.listLabel', { area: area.name })}
          value={free.some((table) => table.id === value) ? value : null}
          onChange={(id) => onChoose(free.find((table) => table.id === id)!)}
        >
          <Stack gap="xs" mt="xs">
            {free.map((table) => (
              <Radio key={table.id} value={table.id} label={t('booking.table.option', { number: table.number, count: table.seats })} />
            ))}
          </Stack>
        </Radio.Group>
      )}
    </Stack>
  )
}

function LegendItem({ fill, stroke, strokeWidth, label }: { fill: string; stroke: string; strokeWidth: number; label: string }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Box w={14} h={14} style={{ backgroundColor: fill, border: `${Math.max(1, Math.round(strokeWidth))}px solid ${stroke}`, borderRadius: 3 }} />
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Group>
  )
}
