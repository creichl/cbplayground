import { Alert, Button, Group, Loader, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useAvailability, useNextFreeDays } from '../../api/publicBooking.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'
import { formatShortDate, formatTime } from '../../i18n/format.ts'

type TimeSlotGridProps = {
  slug: string
  date: string
  guests: number
  value: string | null
  /** The last day that can be booked online, "YYYY-MM-DD", for the next free days. */
  maxDate: string
  /** A hint above the times, e.g. that the chosen time has just been taken. */
  notice: ParseKeys | null
  onChange: (time: string) => void
  onChangeDate: (date: string) => void
}

/** Name of an opening window after the time it starts. */
function periodLabel(start: string): ParseKeys {
  const hour = Number(start.slice(0, 2))
  return hour < 11 ? 'booking.time.morning' : hour < 16 ? 'booking.time.midday' : 'booking.time.evening'
}

/**
 * The free start times of a day as chips, grouped by opening window; times that are not available are left out.
 * A fully booked day offers the next free days instead.
 */
export function TimeSlotGrid({ slug, date, guests, value, maxDate, notice, onChange, onChangeDate }: TimeSlotGridProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const availability = useAvailability(slug, date, guests)
  const periods = (availability.data?.periods ?? [])
    .map((period) => ({ ...period, times: period.times.filter((time) => time.available) }))
    .filter((period) => period.times.length > 0)
  const full = availability.isSuccess && periods.length === 0
  const nextFreeDays = useNextFreeDays(slug, date, maxDate, guests, full)

  if (availability.isPending) {
    return (
      <Stack gap="sm">
        <Skeleton h={24} w="40%" />
        <Skeleton h={88} />
      </Stack>
    )
  }

  if (availability.isError) {
    return <ErrorAlert error={availability.error} onRetry={() => void availability.refetch()} />
  }

  return (
    <Stack gap="lg">
      {notice !== null && (
        <Alert color="yellow" variant="light" role="alert">
          {t(notice)}
        </Alert>
      )}

      {full ? (
        <Stack gap="sm">
          <Text fw={600}>{t('booking.time.noTables')}</Text>
          {nextFreeDays.isPending ? (
            <Loader size="sm" />
          ) : nextFreeDays.days.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t('booking.time.noFreeDays')}
            </Text>
          ) : (
            <Group gap="xs">
              {nextFreeDays.days.map((day) => (
                <Button key={day} variant="default" radius="xl" onClick={() => onChangeDate(day)}>
                  {formatShortDate(day, language)}
                </Button>
              ))}
            </Group>
          )}
        </Stack>
      ) : (
        periods.map((period) => (
          <Stack key={period.start} gap="xs">
            {periods.length > 1 && (
              <Group gap="xs" align="baseline">
                <Title order={3} size="h5">
                  {t(periodLabel(period.start))}
                </Title>
                <Text size="sm" c="dimmed">
                  {t('common.timeRange', { start: formatTime(period.start, language), end: formatTime(period.end, language) })}
                </Text>
              </Group>
            )}
            <SimpleGrid cols={{ base: 3, xs: 5 }} spacing="xs" verticalSpacing="xs">
              {period.times.map(({ time }) => (
                <Button
                  key={time}
                  radius="xl"
                  size="md"
                  px={0}
                  variant={value === time ? 'filled' : 'default'}
                  aria-pressed={value === time}
                  onClick={() => onChange(time)}
                >
                  {formatTime(time, language)}
                </Button>
              ))}
            </SimpleGrid>
          </Stack>
        ))
      )}
    </Stack>
  )
}
