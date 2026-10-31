import { Alert, Box, Button, Group, Paper, Radio, Skeleton, Stack, Tabs, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type PublicArea, type PublicTable, usePublicTables } from '../../api/publicBooking.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'

/** The chosen table, with what the summary shows of it. */
export type ChosenTable = { id: string; number: string; areaName: string }

type TablePickerProps = {
  slug: string
  date: string
  time: string
  guests: number
  value: ChosenTable | null
  onChange: (table: ChosenTable) => void
  onContinue: () => void
  onChangeTime: () => void
}

/**
 * The guest's choice of table: the floor plan of each area (tabs), with the free tables that fit the party highlighted and
 * the others greyed out, and next to it a list of the free tables, which also works with the keyboard.
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

  const choose = (area: PublicArea, table: PublicTable) => onChange({ id: table.id, number: table.number, areaName: area.name })
  // Starts at the area of the chosen table, otherwise at the first area with a free table.
  const defaultArea =
    areas.data.find((area) => area.tables.some((table) => table.id === value?.id)) ??
    areas.data.find((area) => area.tables.some((table) => table.available))!
  const current = activeArea ?? defaultArea.id

  const content = (area: PublicArea) => <AreaTables area={area} value={value?.id ?? null} onChoose={(table) => choose(area, table)} />

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

function AreaTables({ area, value, onChoose }: { area: PublicArea; value: string | null; onChoose: (table: PublicTable) => void }) {
  const { t } = useTranslation()
  const free = area.tables.filter((table) => table.available)

  return (
    <Stack gap="md">
      {area.floorPlanUrl !== null && (
        // The list below is the accessible way to choose; the plan repeats it for pointer and touch.
        <Box pos="relative" aria-hidden="true" style={{ userSelect: 'none', borderRadius: 'var(--mantine-radius-sm)', overflow: 'hidden' }}>
          <img src={area.floorPlanUrl} alt="" draggable={false} style={{ display: 'block', width: '100%' }} />
          {area.tables.map((table) => {
            const selected = table.id === value
            return (
              <Paper
                key={table.id}
                component="button"
                type="button"
                tabIndex={-1}
                disabled={!table.available}
                onClick={() => onChoose(table)}
                shadow={table.available ? 'xs' : undefined}
                radius="sm"
                px={6}
                py={1}
                withBorder
                bg={selected ? 'brand.8' : table.available ? 'white' : 'gray.2'}
                c={selected ? 'white' : table.available ? 'dark' : 'gray.6'}
                style={{
                  position: 'absolute',
                  left: `${table.posX * 100}%`,
                  top: `${table.posY * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: table.available ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                  zIndex: selected ? 2 : 1,
                  borderColor: table.available ? 'var(--mantine-color-brand-8)' : 'var(--mantine-color-gray-4)',
                  borderWidth: table.available ? 2 : 1,
                  font: 'inherit',
                }}
              >
                <Text size="xs" fw={600}>
                  {t('common.tableLabel', { number: table.number, seats: table.seats })}
                </Text>
              </Paper>
            )
          })}
        </Box>
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
