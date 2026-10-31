import { ActionIcon, Alert, Box, Button, Card, Center, Group, Loader, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import {
  type OpenPeriod,
  type Reservation,
  toMinutes,
  useFloor,
  useOpenPeriods,
  useReservations,
  useRestaurantNow,
} from '../api/reservations.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons.tsx'
import { statusColors } from '../components/reservations/status.ts'
import { FloorStatusView } from '../components/table-overview/FloorStatusView.tsx'
import { Timeline } from '../components/table-overview/Timeline.tsx'
import { datePickerFormatter } from '../i18n/format.ts'
import { useDocumentTitle } from '../i18n/title.ts'

type View = 'timeline' | 'floor'

const dateFormat = 'YYYY-MM-DD'

/**
 * The shown time range of the day in minutes, on full hours: the opening hours, widened to every reservation of the day.
 * Null when the restaurant is closed and has no reservations.
 */
function dayRange(openPeriods: OpenPeriod[], reservations: Reservation[]) {
  const times = [
    ...openPeriods.flatMap((period) => [toMinutes(period.start), toMinutes(period.end)]),
    ...reservations.flatMap((reservation) => [toMinutes(reservation.time), toMinutes(reservation.endTime)]),
  ]
  if (times.length === 0) {
    return null
  }
  return { start: Math.floor(Math.min(...times) / 60) * 60, end: Math.ceil(Math.max(...times) / 60) * 60 }
}

/** Table overview for the front desk and the admin: all tables with their reservations of a day, as a timeline or on the floor plans. */
export function TableOverviewPage() {
  const { t, i18n } = useTranslation()
  useDocumentTitle(t('tableOverview.title'))
  // "Today" and the current time are those of the restaurant, not of the device.
  const now = useRestaurantNow()
  const today = now?.date ?? null
  const [searchParams, setSearchParams] = useSearchParams()
  // Day and view are kept in the address, so a reload or a shared link shows the same.
  const requested = searchParams.get('date')
  const date = requested !== null && dayjs(requested).format(dateFormat) === requested ? requested : today
  const view: View = searchParams.get('view') === 'floor' ? 'floor' : 'timeline'
  const floor = useFloor()
  const reservations = useReservations(date)
  const openPeriods = useOpenPeriods(date)

  const show = (day: string | null, shownView: View) => {
    const params: Record<string, string> = {}
    if (day !== null && day !== today) {
      params.date = day
    }
    if (shownView !== 'timeline') {
      params.view = shownView
    }
    setSearchParams(params)
  }
  const shiftDate = (days: number) => date !== null && show(dayjs(date).add(days, 'day').format(dateFormat), view)

  const header = (
    <Group justify="space-between" gap="md">
      <Title order={2}>{t('tableOverview.title')}</Title>
      <Group gap="sm">
        <SegmentedControl
          value={view}
          onChange={(value) => show(date, value as View)}
          data={[
            { value: 'timeline', label: t('tableOverview.views.timeline') },
            { value: 'floor', label: t('tableOverview.views.floor') },
          ]}
        />
        <Group gap={4} wrap="nowrap">
          <ActionIcon
            variant="default"
            size="input-sm"
            onClick={() => shiftDate(-1)}
            aria-label={t('tableOverview.date.previous')}
            disabled={date === null}
          >
            <ChevronLeftIcon />
          </ActionIcon>
          <Button variant="default" onClick={() => show(today, view)} disabled={date === today}>
            {t('tableOverview.date.today')}
          </Button>
          <ActionIcon variant="default" size="input-sm" onClick={() => shiftDate(1)} aria-label={t('tableOverview.date.next')} disabled={date === null}>
            <ChevronRightIcon />
          </ActionIcon>
        </Group>
        <DatePickerInput
          value={date}
          onChange={(value) => value !== null && show(value, view)}
          valueFormatter={datePickerFormatter(i18n.resolvedLanguage ?? 'en')}
          aria-label={t('tableOverview.date.label')}
          miw={170}
        />
      </Group>
    </Group>
  )

  if (date === null || now === null || floor.isPending || reservations.isPending || openPeriods.isPending) {
    return (
      <Stack gap="lg">
        {header}
        <Center py="xl">
          <Loader />
        </Center>
      </Stack>
    )
  }

  if (floor.isError || reservations.isError || openPeriods.isError) {
    return (
      <Stack gap="lg">
        {header}
        <ErrorAlert
          error={(floor.error ?? reservations.error ?? openPeriods.error)!}
          onRetry={() => {
            void floor.refetch()
            void reservations.refetch()
            void openPeriods.refetch()
          }}
        />
      </Stack>
    )
  }

  const hasTables = floor.data.some((area) => area.tables.length > 0)
  const range = dayRange(openPeriods.data, reservations.data)
  const closed = openPeriods.data.length === 0
  const nowMinutes = date === today ? now.minutes : null
  // The floor plan starts at the current time if it lies within the day's range, otherwise at the first opening time.
  const firstOpening = openPeriods.data.length > 0 ? toMinutes(openPeriods.data[0].start) : range?.start ?? 0
  const initialTime =
    range !== null && nowMinutes !== null && nowMinutes >= range.start && nowMinutes < range.end ? Math.floor(nowMinutes / 15) * 15 : firstOpening

  return (
    <Stack gap="lg">
      {header}
      {!hasTables ? (
        <Card>
          <Text c="dimmed">{t('tableOverview.noTables')}</Text>
        </Card>
      ) : (
        <>
          {closed && (
            <Alert color="gray" variant="light">
              {t('tableOverview.closed')}
            </Alert>
          )}
          {range !== null && (
            <>
              <StatusLegend />
              {view === 'timeline' ? (
                <Timeline
                  key={date}
                  areas={floor.data}
                  reservations={reservations.data}
                  openPeriods={openPeriods.data}
                  start={range.start}
                  end={range.end}
                  nowMinutes={nowMinutes}
                />
              ) : (
                <FloorStatusView
                  key={date}
                  areas={floor.data}
                  reservations={reservations.data}
                  start={range.start}
                  end={range.end}
                  initialTime={initialTime}
                  nowMinutes={nowMinutes}
                />
              )}
            </>
          )}
        </>
      )}
    </Stack>
  )
}

/** The status colours of the tables and reservations. */
function StatusLegend() {
  const { t } = useTranslation()
  const items = [
    { label: t('tableOverview.status.free'), color: null, inactive: false },
    ...(['Requested', 'Confirmed', 'Arrived', 'Late'] as const).map((status) => ({
      label: t(`tableOverview.status.${status}`),
      color: statusColors[status],
      inactive: false,
    })),
    { label: t('tableOverview.legendInactive'), color: statusColors.Cancelled, inactive: true },
  ]

  return (
    <Group gap="md">
      {items.map((item) => (
        <Group key={item.label} gap={6} wrap="nowrap">
          <Box
            w={16}
            h={16}
            style={{
              borderRadius: 4,
              backgroundColor: item.color === null ? 'white' : `var(--mantine-color-${item.color}-2)`,
              border: `2px ${item.inactive ? 'dashed' : 'solid'} ${item.color === null ? 'var(--mantine-color-gray-5)' : `var(--mantine-color-${item.color}-7)`}`,
              opacity: item.inactive ? 0.5 : 1,
            }}
          />
          <Text size="sm">{item.label}</Text>
        </Group>
      ))}
    </Group>
  )
}
