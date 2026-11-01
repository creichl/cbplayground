import {
  Alert,
  AspectRatio,
  Box,
  Button,
  Card,
  Group,
  Radio,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type PublicArea, type PublicTable, usePublicTables } from '../../api/publicBooking.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'
import { FloorPlan } from '../floor-plan/FloorPlan.tsx'
import { TableShape } from '../floor-plan/TableShape.tsx'
import { ArmchairIcon, BanIcon, CheckIcon } from '../icons.tsx'
import { tableLooks, unavailableHatchId } from './tableLooks.ts'

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
  /** On phones the chosen table and "Continue" are in the booking's bar at the bottom of the screen instead of below the plan. */
  stickyBar: boolean
}

type Look = (typeof tableLooks)['light']

/**
 * The table the guest would pick if the system assigned it: the fewest seats; for equal sizes the order of the areas, then
 * the table number (the order in which the API lists them), as in the README's "Table assignment by the system".
 */
function smallestFreeTable(areas: PublicArea[]) {
  let best: PublicTable | null = null
  for (const table of areas.flatMap((area) => area.tables)) {
    if (table.available && (best === null || table.seats < best.seats)) {
      best = table
    }
  }
  return best
}

/**
 * The guest's choice of table. At the top the areas as cards with photo, description and the number of free tables (an area
 * without one is disabled), scrolling sideways on phones. Below, the legend and the plan of the chosen area (its floor plan image or its drawn room) with the
 * zoom buttons in its corner: free tables that fit the party outlined in the accent colour, the chosen one filled with a
 * check, the others muted and hatched. Under the plan the chosen table with "Continue" (on phones in the bar at the bottom),
 * "No preference" and the list of the free tables, which is the way to choose with the keyboard and screen readers.
 */
export function TablePicker({ slug, date, time, guests, value, onChange, onContinue, onChangeTime, stickyBar }: TablePickerProps) {
  const { t } = useTranslation()
  const dark = useMantineColorScheme().colorScheme === 'dark'
  const look = tableLooks[dark ? 'dark' : 'light']
  const areas = usePublicTables(slug, date, time, guests)
  const [activeArea, setActiveArea] = useState<string | null>(null)

  if (areas.isPending) {
    return (
      <Stack gap={16} aria-hidden="true">
        <Group gap={16} wrap="nowrap" style={{ overflow: 'hidden' }}>
          <Skeleton h={208} w={240} style={{ flexShrink: 0 }} />
          <Skeleton h={208} w={240} style={{ flexShrink: 0 }} />
        </Group>
        <Skeleton h={24} w="60%" />
        <AspectRatio ratio={3 / 2}>
          <Skeleton />
        </AspectRatio>
      </Stack>
    )
  }
  if (areas.isError) {
    return <ErrorAlert error={areas.error} onRetry={() => void areas.refetch()} />
  }

  const anyFree = areas.data.some((area) => area.tables.some((table) => table.available))
  if (!anyFree) {
    return (
      <Stack gap={16} align="flex-start">
        <Alert color="yellow" variant="light" w="100%">
          {t('booking.table.noneFree')}
        </Alert>
        <Button variant="default" h={44} onClick={onChangeTime}>
          {t('booking.table.otherTime')}
        </Button>
      </Stack>
    )
  }

  // Starts at the area of the chosen table, otherwise at the first area with a free table.
  const defaultArea =
    areas.data.find((area) => area.tables.some((table) => table.id === value)) ??
    areas.data.find((area) => area.tables.some((table) => table.available))!
  const area = areas.data.find((option) => option.id === activeArea) ?? defaultArea
  const chosen = areas.data.flatMap((option) => option.tables.map((table) => ({ table, area: option }))).find(({ table }) => table.id === value)
  const free = area.tables.filter((table) => table.available)

  const choose = (table: PublicTable) => {
    setActiveArea(areas.data.find((option) => option.tables.includes(table))?.id ?? null)
    onChange(table.id)
  }
  const noPreference = () => {
    const table = smallestFreeTable(areas.data)
    if (table !== null) {
      choose(table)
    }
  }

  return (
    <Stack gap={24}>
      <HatchPatterns />

      <Box
        role="group"
        aria-label={t('booking.table.areasLabel')}
        // Scrolls sideways when the cards do not fit, e.g. on phones; the page itself never does.
        style={{ display: 'flex', gap: 16, overflowX: 'auto', scrollSnapType: 'x mandatory', padding: 2, margin: -2 }}
      >
        {areas.data.map((option) => (
          <AreaCard key={option.id} area={option} selected={option.id === area.id} onSelect={() => setActiveArea(option.id)} />
        ))}
      </Box>

      <Stack gap={8}>
        <Group gap={16} aria-hidden="true">
          <LegendItem look={look.free} label={t('booking.table.legend.free')} />
          <LegendItem look={look.selected} label={t('booking.table.legend.selected')} check />
          <LegendItem look={look.unavailable} hatch={look.hatch} label={t('booking.table.legend.unavailable')} />
        </Group>
        {area.tables.length > 0 && (
          // The list below is the accessible way to choose; the plan repeats it for pointer and touch.
          <FloorPlan
            imageUrl={area.floorPlanUrl}
            imageAlt=""
            roomStyle={area.roomStyle}
            roomElements={area.roomElements}
            tables={area.tables}
            tableScale={area.tableScale}
            ariaHidden
            zoomControls="inside"
          >
            {area.tables.map((table) => {
              const selected = table.id === value
              const tableLook = selected ? look.selected : table.available ? look.free : look.unavailable
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
                  {...tableLook}
                  note={selected ? <CheckIcon size={12} strokeWidth={3} style={{ display: 'block', margin: '1px 0' }} /> : undefined}
                  onClick={table.available ? () => choose(table) : undefined}
                  style={{ cursor: table.available ? 'pointer' : 'not-allowed', zIndex: selected ? 2 : 1 }}
                />
              )
            })}
          </FloorPlan>
        )}
      </Stack>

      <Card withBorder shadow="none" padding={16} visibleFrom={stickyBar ? 'md' : undefined}>
        <Group justify="space-between" gap={16}>
          <Text fw={chosen !== undefined ? 600 : undefined} style={{ flex: '1 1 240px' }}>
            {chosen !== undefined
              ? t('booking.table.selection', { number: chosen.table.number, count: chosen.table.seats, area: chosen.area.name })
              : t('booking.table.hint')}
          </Text>
          <Group gap={8}>
            <Button variant="default" h={44} onClick={noPreference}>
              {t('booking.table.noPreference')}
            </Button>
            <Button h={44} disabled={value === null} onClick={onContinue}>
              {t('booking.continue')}
            </Button>
          </Group>
        </Group>
      </Card>
      {stickyBar && (
        <Group hiddenFrom="md">
          <Button variant="default" h={44} onClick={noPreference}>
            {t('booking.table.noPreference')}
          </Button>
        </Group>
      )}

      {free.length === 0 ? (
        <Text size="sm">{t('booking.table.noneFreeInArea')}</Text>
      ) : (
        <Radio.Group
          label={t('booking.table.listLabel', { area: area.name })}
          value={free.some((table) => table.id === value) ? value : null}
          onChange={(id) => choose(free.find((table) => table.id === id)!)}
          styles={{ label: { fontWeight: 600, marginBottom: 8 } }}
        >
          <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing={8} verticalSpacing={0}>
            {free.map((table) => (
              <Radio
                key={table.id}
                value={table.id}
                label={t('booking.table.option', { number: table.number, count: table.seats })}
                styles={{ body: { alignItems: 'center', minHeight: 44 }, labelWrapper: { justifyContent: 'center' } }}
              />
            ))}
          </SimpleGrid>
        </Radio.Group>
      )}
    </Stack>
  )
}

/**
 * An area as a card: its photo (or a calm surface with a chair), name, description and how many suitable tables are free.
 * Without a free table it is disabled and says "Fully booked". The chosen area has an accent border and a check.
 */
function AreaCard({ area, selected, onSelect }: { area: PublicArea; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  const dark = useMantineColorScheme().colorScheme === 'dark'
  const freeCount = area.tables.filter((table) => table.available).length
  const full = freeCount === 0

  return (
    <UnstyledButton
      onClick={onSelect}
      disabled={full}
      aria-pressed={selected}
      className="mantine-focus-auto"
      style={{
        flex: '1 0 240px',
        maxWidth: 360,
        scrollSnapAlign: 'start',
        borderRadius: 'var(--mantine-radius-md)',
        // Always 2 px, so choosing a card does not move anything.
        border: `2px solid ${selected ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-color-default-border)'}`,
        backgroundColor: dark ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-white)',
        overflow: 'hidden',
        cursor: full ? 'not-allowed' : 'pointer',
      }}
    >
      <Box pos="relative">
        <AspectRatio ratio={16 / 9}>
          {area.photoUrl !== null ? (
            // The name below says what it shows.
            <img src={area.photoUrl} alt="" loading="lazy" style={{ objectFit: 'cover', filter: full ? 'grayscale(1)' : undefined }} />
          ) : (
            <Box
              bg={dark ? 'dark.5' : 'gray.1'}
              c="dimmed"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ArmchairIcon size={40} strokeWidth={1.5} />
            </Box>
          )}
        </AspectRatio>
        {selected && (
          <Box
            pos="absolute"
            top={8}
            right={8}
            w={32}
            h={32}
            bg="var(--mantine-primary-color-filled)"
            c="var(--mantine-primary-color-contrast)"
            style={{ borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <CheckIcon size={20} strokeWidth={3} />
          </Box>
        )}
      </Box>
      <Stack gap={4} p={16}>
        <Text fw={600} lh={1.3}>
          {area.name}
        </Text>
        {area.description !== null && (
          <Text size="sm" c="dimmed" lineClamp={2}>
            {area.description}
          </Text>
        )}
        {full ? (
          <Group gap={4} wrap="nowrap">
            <BanIcon size={16} />
            <Text size="sm" fw={600}>
              {t('booking.table.fullyBooked')}
            </Text>
          </Group>
        ) : (
          <Text size="sm" fw={600}>
            {t('booking.table.freeCount', { count: freeCount })}
          </Text>
        )}
      </Stack>
    </UnstyledButton>
  )
}

/** The hatching of the tables that are not available, in both colour schemes; referred to by `tableLooks`. */
function HatchPatterns() {
  return (
    <svg width={0} height={0} aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <defs>
        {(['light', 'dark'] as const).map((scheme) => (
          // In the plan's units (plan widths), so the stripes are as dense as the tables are large.
          <pattern
            key={scheme}
            id={unavailableHatchId[scheme]}
            patternUnits="userSpaceOnUse"
            width={0.008}
            height={0.008}
            patternTransform="rotate(45)"
          >
            <rect width={0.008} height={0.008} style={{ fill: tableLooks[scheme].hatch.background }} />
            <rect width={0.003} height={0.008} style={{ fill: tableLooks[scheme].hatch.stripes }} />
          </pattern>
        ))}
      </defs>
    </svg>
  )
}

type LegendItemProps = {
  look: Look['free']
  hatch?: Look['hatch']
  check?: boolean
  label: string
}

function LegendItem({ look, hatch, check, label }: LegendItemProps) {
  return (
    <Group gap={8} wrap="nowrap">
      <Box
        w={20}
        h={20}
        c={look.color}
        style={{
          flexShrink: 0,
          // The hatching as a CSS stripe pattern, like the pattern on the tables.
          background:
            hatch !== undefined
              ? `repeating-linear-gradient(45deg, ${hatch.stripes} 0 2px, ${hatch.background} 2px 5px)`
              : look.fill,
          border: `${look.strokeWidth >= 2 ? 2 : 1}px solid ${look.stroke}`,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {check === true && <CheckIcon size={14} strokeWidth={3} />}
      </Box>
      <Text size="sm">{label}</Text>
    </Group>
  )
}
